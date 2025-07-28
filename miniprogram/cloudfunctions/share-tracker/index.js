const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, shareCode, shareType, newUserOpenid } = event

  try {
    switch (action) {
      case 'recordShare':
        return await recordShare(wxContext.OPENID, shareType)
      case 'trackSharedUser':
        return await trackSharedUser(shareCode, newUserOpenid || wxContext.OPENID)
      case 'getShareStats':
        return await getShareStats(wxContext.OPENID)
      default:
        return {
          code: 1,
          message: '无效的操作类型'
        }
    }
  } catch (error) {
    console.error('分享追踪错误:', error)
    return {
      code: 1,
      message: '分享追踪失败',
      error: error.message
    }
  }
}

// 记录分享行为
async function recordShare(sharerId, shareType) {
  try {
    // 检查今日分享次数
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    
    const todaySharesRes = await db.collection('share_records')
      .where({
        sharerId: sharerId,
        createTime: _.gte(todayStart).and(_.lt(todayEnd))
      })
      .count()
    
    const todayShareCount = todaySharesRes.total || 0
    
    // 生成分享码
    const shareCode = generateShareCode(sharerId)
    
    // 记录分享
    await db.collection('share_records').add({
      data: {
        shareCode: shareCode,
        sharerId: sharerId,
        shareType: shareType || 'app',
        isNewUser: false,
        pointsAwarded: 0,
        status: 'pending',
        createTime: db.serverDate(),
        todayShareCount: todayShareCount + 1
      }
    })
    
    return {
      code: 0,
      message: '分享记录成功',
      data: {
        shareCode: shareCode,
        todayShareCount: todayShareCount + 1,
        canEarnPoints: todayShareCount < 5 // 每日最多5次分享奖励
      }
    }
  } catch (error) {
    console.error('记录分享失败:', error)
    return {
      code: 1,
      message: '记录分享失败',
      error: error.message
    }
  }
}

// 追踪通过分享进入的用户
async function trackSharedUser(shareCode, newUserOpenid) {
  if (!shareCode) {
    return {
      code: 0,
      message: '无分享码，正常访问'
    }
  }
  
  try {
    // 查找分享记录
    const shareRes = await db.collection('share_records')
      .where({
        shareCode: shareCode,
        status: 'pending'
      })
      .get()
    
    if (shareRes.data.length === 0) {
      return {
        code: 1,
        message: '无效的分享码或已过期'
      }
    }
    
    const shareRecord = shareRes.data[0]
    
    // 检查是否为分享者本人
    if (shareRecord.sharerId === newUserOpenid) {
      return {
        code: 0,
        message: '分享者本人访问，不计入奖励'
      }
    }
    
    // 检查新用户是否已存在
    const existingUserRes = await db.collection('users')
      .where({
        openid: newUserOpenid
      })
      .get()
    
    const isNewUser = existingUserRes.data.length === 0
    
    // 检查该用户是否已经为此分享者贡献过积分
    const existingRewardRes = await db.collection('share_records')
      .where({
        sharerId: shareRecord.sharerId,
        sharedUserId: newUserOpenid,
        status: 'completed'
      })
      .get()
    
    if (existingRewardRes.data.length > 0) {
      return {
        code: 0,
        message: '该用户已为分享者贡献过积分'
      }
    }
    
    // 计算奖励积分
    let pointsToAward = 0
    if (isNewUser) {
      pointsToAward = 10 // 新用户首次使用奖励10积分
    } else {
      pointsToAward = 5 // 老用户通过分享进入也给少量积分
    }
    
    // 检查分享者今日获得的分享积分是否已达上限
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    
    const todayEarnedRes = await db.collection('share_records')
      .where({
        sharerId: shareRecord.sharerId,
        status: 'completed',
        completeTime: _.gte(todayStart).and(_.lt(todayEnd))
      })
      .get()
    
    const todayEarned = todayEarnedRes.data.reduce((sum, record) => sum + (record.pointsAwarded || 0), 0)
    
    if (todayEarned >= 100) {
      pointsToAward = 0 // 今日分享奖励已达上限
    } else if (todayEarned + pointsToAward > 100) {
      pointsToAward = 100 - todayEarned // 调整到不超过上限
    }
    
    // 更新分享记录
    await db.collection('share_records').doc(shareRecord._id).update({
      data: {
        sharedUserId: newUserOpenid,
        isNewUser: isNewUser,
        pointsAwarded: pointsToAward,
        status: pointsToAward > 0 ? 'completed' : 'no_reward',
        completeTime: db.serverDate()
      }
    })
    
    // 如果有积分奖励，调用积分管理云函数
    if (pointsToAward > 0) {
      try {
        await cloud.callFunction({
          name: 'points-manager',
          data: {
            action: 'addPoints',
            userId: shareRecord.sharerId,
            amount: pointsToAward,
            actionType: 'share',
            description: `分享奖励：${isNewUser ? '新用户' : '老用户'}通过分享进入`,
            relatedId: shareRecord._id
          }
        })
      } catch (pointsError) {
        console.error('发放分享积分失败:', pointsError)
        // 积分发放失败，但不影响分享追踪
      }
    }
    
    return {
      code: 0,
      message: '分享追踪成功',
      data: {
        isNewUser: isNewUser,
        pointsAwarded: pointsToAward,
        sharerId: shareRecord.sharerId
      }
    }
  } catch (error) {
    console.error('追踪分享用户失败:', error)
    return {
      code: 1,
      message: '追踪失败',
      error: error.message
    }
  }
}

// 获取分享统计
async function getShareStats(openid) {
  try {
    // 获取总分享次数
    const totalSharesRes = await db.collection('share_records')
      .where({
        sharerId: openid
      })
      .count()
    
    // 获取成功奖励次数
    const successfulSharesRes = await db.collection('share_records')
      .where({
        sharerId: openid,
        status: 'completed'
      })
      .get()
    
    // 计算总奖励积分
    const totalPoints = successfulSharesRes.data.reduce((sum, record) => sum + (record.pointsAwarded || 0), 0)
    
    // 获取今日分享统计
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    
    const todaySharesRes = await db.collection('share_records')
      .where({
        sharerId: openid,
        createTime: _.gte(todayStart).and(_.lt(todayEnd))
      })
      .get()
    
    const todayEarned = todaySharesRes.data
      .filter(record => record.status === 'completed')
      .reduce((sum, record) => sum + (record.pointsAwarded || 0), 0)
    
    return {
      code: 0,
      message: '查询成功',
      data: {
        totalShares: totalSharesRes.total || 0,
        successfulShares: successfulSharesRes.data.length,
        totalPointsEarned: totalPoints,
        todayShares: todaySharesRes.data.length,
        todayPointsEarned: todayEarned,
        todayRemaining: Math.max(0, 100 - todayEarned)
      }
    }
  } catch (error) {
    console.error('获取分享统计失败:', error)
    return {
      code: 1,
      message: '查询失败',
      error: error.message
    }
  }
}

// 生成分享码
function generateShareCode(sharerId) {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 5)
  const sharerHash = sharerId.substr(-4)
  return `${timestamp}${random}${sharerHash}`.toUpperCase()
}