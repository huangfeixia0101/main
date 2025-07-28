const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, userId, openid, amount, actionType, description, relatedId } = event

  try {
    switch (action) {
      case 'addPoints':
        return await addPoints(userId || wxContext.OPENID, amount, actionType, description, relatedId)
      case 'deductPoints':
        return await deductPoints(userId || wxContext.OPENID, amount, actionType, description, relatedId)
      case 'getBalance':
        return await getPointsBalance(userId || wxContext.OPENID)
      case 'getHistory':
        return await getPointsHistory(userId || wxContext.OPENID, event.limit, event.skip)
      case 'checkBalance':
        return await checkSufficientBalance(userId || wxContext.OPENID, amount)
      default:
        return {
          code: 1,
          message: '无效的操作类型'
        }
    }
  } catch (error) {
    console.error('积分管理错误:', error)
    return {
      code: 1,
      message: '积分操作失败',
      error: error.message
    }
  }
}

// 增加积分
async function addPoints(openid, amount, actionType, description, relatedId) {
  if (!amount || amount <= 0) {
    return {
      code: 1,
      message: '积分数量必须大于0'
    }
  }

  try {
    // 开始事务
    const transaction = await db.startTransaction()
    
    try {
      // 获取用户当前积分
      const userRes = await transaction.collection('users').where({
        openid: openid
      }).get()
      
      if (userRes.data.length === 0) {
        await transaction.rollback()
        return {
          code: 1,
          message: '用户不存在'
        }
      }
      
      const user = userRes.data[0]
      const currentPoints = user.points || 0
      const totalEarned = user.totalEarnedPoints || 0
      const newBalance = currentPoints + amount
      
      // 更新用户积分
      await transaction.collection('users').doc(user._id).update({
        data: {
          points: newBalance,
          totalEarnedPoints: totalEarned + amount,
          updateTime: db.serverDate()
        }
      })
      
      // 记录积分变动
      await transaction.collection('points_records').add({
        data: {
          userId: user._id,
          openid: openid,
          type: 'earn',
          action: actionType,
          amount: amount,
          balance: newBalance,
          description: description || `获得${amount}积分`,
          relatedId: relatedId || null,
          createTime: db.serverDate()
        }
      })
      
      await transaction.commit()
      
      return {
        code: 0,
        message: '积分增加成功',
        data: {
          amount: amount,
          balance: newBalance,
          totalEarned: totalEarned + amount
        }
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('增加积分失败:', error)
    return {
      code: 1,
      message: '积分增加失败',
      error: error.message
    }
  }
}

// 扣除积分
async function deductPoints(openid, amount, actionType, description, relatedId) {
  if (!amount || amount <= 0) {
    return {
      code: 1,
      message: '积分数量必须大于0'
    }
  }

  try {
    // 开始事务
    const transaction = await db.startTransaction()
    
    try {
      // 获取用户当前积分
      const userRes = await transaction.collection('users').where({
        openid: openid
      }).get()
      
      if (userRes.data.length === 0) {
        await transaction.rollback()
        return {
          code: 1,
          message: '用户不存在'
        }
      }
      
      const user = userRes.data[0]
      const currentPoints = user.points || 0
      const totalSpent = user.totalSpentPoints || 0
      
      // 检查积分是否足够
      if (currentPoints < amount) {
        await transaction.rollback()
        return {
          code: 1,
          message: '积分余额不足',
          data: {
            required: amount,
            current: currentPoints,
            shortage: amount - currentPoints
          }
        }
      }
      
      const newBalance = currentPoints - amount
      
      // 更新用户积分
      await transaction.collection('users').doc(user._id).update({
        data: {
          points: newBalance,
          totalSpentPoints: totalSpent + amount,
          updateTime: db.serverDate()
        }
      })
      
      // 记录积分变动
      await transaction.collection('points_records').add({
        data: {
          userId: user._id,
          openid: openid,
          type: 'spend',
          action: actionType,
          amount: amount,
          balance: newBalance,
          description: description || `消费${amount}积分`,
          relatedId: relatedId || null,
          createTime: db.serverDate()
        }
      })
      
      await transaction.commit()
      
      return {
        code: 0,
        message: '积分扣除成功',
        data: {
          amount: amount,
          balance: newBalance,
          totalSpent: totalSpent + amount
        }
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('扣除积分失败:', error)
    return {
      code: 1,
      message: '积分扣除失败',
      error: error.message
    }
  }
}

// 获取积分余额
async function getPointsBalance(openid) {
  try {
    const userRes = await db.collection('users').where({
      openid: openid
    }).field({
      points: true,
      totalEarnedPoints: true,
      totalSpentPoints: true
    }).get()
    
    if (userRes.data.length === 0) {
      return {
        code: 1,
        message: '用户不存在'
      }
    }
    
    const user = userRes.data[0]
    return {
      code: 0,
      message: '查询成功',
      data: {
        balance: user.points || 0,
        totalEarned: user.totalEarnedPoints || 0,
        totalSpent: user.totalSpentPoints || 0
      }
    }
  } catch (error) {
    console.error('查询积分余额失败:', error)
    return {
      code: 1,
      message: '查询失败',
      error: error.message
    }
  }
}

// 获取积分历史记录
async function getPointsHistory(openid, limit = 20, skip = 0) {
  try {
    const recordsRes = await db.collection('points_records')
      .where({
        openid: openid
      })
      .orderBy('createTime', 'desc')
      .limit(limit)
      .skip(skip)
      .get()
    
    return {
      code: 0,
      message: '查询成功',
      data: {
        records: recordsRes.data,
        total: recordsRes.data.length
      }
    }
  } catch (error) {
    console.error('查询积分历史失败:', error)
    return {
      code: 1,
      message: '查询失败',
      error: error.message
    }
  }
}

// 检查积分余额是否足够
async function checkSufficientBalance(openid, requiredAmount) {
  try {
    const balanceResult = await getPointsBalance(openid)
    
    if (balanceResult.code !== 0) {
      return balanceResult
    }
    
    const currentBalance = balanceResult.data.balance
    const sufficient = currentBalance >= requiredAmount
    
    return {
      code: 0,
      message: '检查完成',
      data: {
        sufficient: sufficient,
        current: currentBalance,
        required: requiredAmount,
        shortage: sufficient ? 0 : requiredAmount - currentBalance
      }
    }
  } catch (error) {
    console.error('检查积分余额失败:', error)
    return {
      code: 1,
      message: '检查失败',
      error: error.message
    }
  }
}