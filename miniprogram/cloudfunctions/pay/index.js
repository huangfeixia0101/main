const cloud = require('wx-server-sdk')
const config = require('./config.json')

// 获取环境ID
const envId = 'h-care-5gggrsj59b495ec9' // 设置为具体的云环境ID
console.log('当前环境ID:', envId)

cloud.init({
  env: envId // 使用具体的环境ID
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { orderId } = event
  const wxContext = cloud.getWXContext()

  try {
    // 获取订单信息
    console.log('[支付函数] 开始获取订单信息:', orderId)
    const order = await db.collection('ai_orders').doc(orderId).get()
    console.log('[支付函数] 订单信息:', order.data)

    if (!order.data) {
      console.log('[支付函数] 订单不存在:', orderId)
      return {
        code: 1,
        message: '订单不存在'
      }
    }

    // 检查订单状态
    console.log('[支付函数] 检查订单状态:', order.data.status)
    if (order.data.status === 'PAID') {
      console.log('[支付函数] 订单已支付:', orderId)
      return {
        code: 1,
        message: '订单已支付'
      }
    }

    // 生成随机字符串
    const nonceStr = Math.random().toString(36).substr(2)
    console.log('[支付函数] 生成随机字符串:', nonceStr)
    
    console.log('[支付函数] 开始统一下单，订单信息:', {
      orderId,
      serviceName: order.data.serviceName,
      totalPrice: order.data.totalPrice,
      openid: wxContext.OPENID
    })

    // 调用微信支付统一下单接口
    const unifiedOrderParams = {
      body: order.data.serviceName,
      outTradeNo: orderId,
      spbillCreateIp: '127.0.0.1',
      subMchId: config.SUB_MCH_ID,
      totalFee: Math.round(order.data.totalPrice * 100),
      envId,
      functionName: 'pay_cb',
      nonceStr: nonceStr,
      tradeType: 'JSAPI',
      openid: wxContext.OPENID,
      key: config.API_KEY
    }
    console.log('[支付函数] 统一下单请求参数:', { ...unifiedOrderParams, key: '已隐藏' })

    const res = await cloud.cloudPay.unifiedOrder(unifiedOrderParams)
    console.log('[支付函数] 统一下单接口返回:', res)

    // 检查统一下单接口返回结果
    if (!res || !res.payment) {
      console.error('[支付函数] 统一下单接口返回异常:', res)
      throw new Error('支付参数获取失败')
    }

    // 确保返回完整的支付参数
    const payment = {
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: res.payment.nonceStr || nonceStr,
      package: res.payment.package,
      signType: 'MD5',
      paySign: res.payment.paySign
    }
    console.log('[支付函数] 生成支付参数:', { ...payment, paySign: '已隐藏' })

    // 验证支付参数完整性
    if (!payment.package || !payment.paySign) {
      console.error('[支付函数] 支付参数不完整:', { ...payment, paySign: '已隐藏' })
      throw new Error('支付参数不完整')
    }

    // 更新订单状态为支付中
    console.log('[支付函数] 更新订单状态为支付中:', orderId)
    await db.collection('ai_orders').doc(orderId).update({
      data: {
        status: 'UNPAID',
        updatedAt: db.serverDate()
      }
    })
    console.log('[支付函数] 订单状态更新成功')

    return {
      code: 0,
      message: '发起支付成功',
      payment
    }

  } catch (err) {
    console.error('[支付函数] 支付失败:', err)
    console.error('[支付函数] 错误详情:', {
      message: err.message,
      stack: err.stack
    })
    return {
      code: 1,
      message: err.message || '支付失败，请重试'
    }
  }
}