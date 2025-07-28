const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { serviceId, price, spec, quantity, patientId, addressId } = event
  const wxContext = cloud.getWXContext()

  try {
    // 验证patientId是否存在
    if (!patientId) {
      return {
        code: 1,
        message: '请选择就诊人'
      }
    }

    // 验证addressId是否存在
    if (!addressId) {
      return {
        code: 1,
        message: '请选择收货地址'
      }
    }

    // 获取服务信息
    const service = await db.collection('ai_service').doc(serviceId).get()
    if (!service.data) {
      return {
        code: 1,
        message: '服务不存在'
      }
    }

    // 创建订单
    const orderResult = await db.collection('ai_orders').add({
      data: {
        serviceId,
        serviceName: service.data.name,
        totalPrice: price,
        spec: spec || '',  // 添加规格字段
        quantity: quantity || 1,  // 添加数量字段，默认为1
        patientId,  // 使用传入的patientId
        addressId,  // 添加地址ID
        _openid: wxContext.OPENID,  // 添加用户openid
        status: 'UNPAID', // UNPAID-待支付, PAID-已支付, IN_SERVICE-服务中, COMPLETED-已完成, CANCELLED-已取消
        createTime: new Date(),
        updateTime: new Date()
      }
    })

    return {
      code: 0,
      message: '创建成功',
      data: {
        _id: orderResult._id
      }
    }

  } catch (err) {
    console.error(err)
    return {
      code: -1,
      message: '创建失败',
      error: err
    }
  }
}