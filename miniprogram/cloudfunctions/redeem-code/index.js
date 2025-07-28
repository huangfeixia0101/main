// 兑换码云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 兑换码云函数
 * @param {object} event - 云函数调用参数
 * @param {string} event.code - 兑换码
 * @param {object} context - 云函数上下文
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  if (!openid) {
    return {
      code: 1,
      message: '用户未登录'
    }
  }

  if (!event.code) {
    return {
      code: 1,
      message: '请输入兑换码'
    }
  }

  try {
    // 查询兑换码
    const codeResult = await db.collection('redeem_codes').doc(event.code).get()
    const codeData = codeResult.data

    // 检查兑换码是否存在
    if (!codeData) {
      return {
        code: 1,
        message: '无效的兑换码'
      }
    }

    // 检查兑换码是否已过期
    if (codeData.expireTime && new Date(codeData.expireTime) < new Date()) {
      return {
        code: 1,
        message: '兑换码已过期'
      }
    }

    // 检查兑换码是否已被使用
    if (codeData.isUsed) {
      return {
        code: 1,
        message: '兑换码已被使用'
      }
    }

    // 检查是否是通用码或者是否被当前用户领取
    if (!codeData.isPublic && codeData.assignedTo !== openid) {
      return {
        code: 1,
        message: '该兑换码不属于您'
      }
    }

    // 开始事务
    const transaction = await db.startTransaction()

    try {
      // 标记兑换码为已使用
      await transaction.collection('redeem_codes').doc(event.code).update({
        data: {
          isUsed: true,
          usedBy: openid,
          usedTime: db.serverDate()
        }
      })

      // 根据兑换码类型处理不同的奖励
      let rewardMessage = ''
      
      if (codeData.type === 'coupon') {
        // 添加优惠券到用户账户
        await transaction.collection('coupons').add({
          data: {
            userId: openid,
            couponId: codeData.couponId,
            couponName: codeData.name,
            value: codeData.value,
            minSpend: codeData.minSpend || 0,
            expireTime: codeData.couponExpireTime,
            isUsed: false,
            createTime: db.serverDate()
          }
        })
        rewardMessage = `获得${codeData.value}元优惠券`
      } else if (codeData.type === 'points') {
        // 添加积分到用户账户
        await transaction.collection('users').where({
          openid: openid
        }).update({
          data: {
            points: _.inc(codeData.value)
          }
        })
        rewardMessage = `获得${codeData.value}积分`
      }

      // 添加兑换记录
      await transaction.collection('redeem_history').add({
        data: {
          userId: openid,
          code: event.code,
          name: codeData.name,
          type: codeData.type,
          value: rewardMessage,
          createTime: db.serverDate()
        }
      })

      // 提交事务
      await transaction.commit()

      // 查询用户的兑换记录
      const historyResult = await db.collection('redeem_history')
        .where({
          userId: openid
        })
        .orderBy('createTime', 'desc')
        .get()

      return {
        code: 0,
        message: '兑换成功',
        data: {
          reward: rewardMessage,
          history: historyResult.data
        }
      }
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('兑换码处理失败:', error)
    return {
      code: 1,
      message: '兑换失败，请稍后再试'
    }
  }
}