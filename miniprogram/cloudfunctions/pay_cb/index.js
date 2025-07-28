const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 解析支付回调数据
    const { outTradeNo, resultCode, transactionId } = event

    // 支付成功
    if (resultCode === 'SUCCESS') {
      // 更新订单状态
      await db.collection('ai_orders').doc(outTradeNo).update({
        data: {
          status: 'PAID',
          transactionId,
          payTime: db.serverDate()
        }
      })

      return {
        errcode: 0,
        errmsg: 'OK'
      }
    }

    return {
      errcode: -1,
      errmsg: '支付失败'
    }

  } catch (err) {
    console.error('支付回调处理失败:', err)
    return {
      errcode: -1,
      errmsg: '支付回调处理失败'
    }
  }
}