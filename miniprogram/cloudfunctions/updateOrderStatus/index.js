const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { orderId, status, escortId } = event
  const wxContext = cloud.getWXContext()

  if (!orderId || !status) {
    return {
      code: 1,
      message: '缺少必要参数'
    }
  }

  try {
    // 获取订单信息
    console.log('[更新订单状态] 开始获取订单信息:', orderId)
    const order = await db.collection('ai_orders').doc(orderId).get()
    
    if (!order.data) {
      console.log('[更新订单状态] 订单不存在:', orderId)
      return {
        code: 1,
        message: '订单不存在'
      }
    }

    // 验证订单所属权
    // 患者可以更新自己的订单，陪护人员可以更新分配给自己的订单
    const isPatient = order.data.patientId === wxContext.OPENID;
    const isEscort = order.data.escortId === wxContext.OPENID;
    
    // 如果是陪护人员首次接单，需要验证当前用户是否为陪护人员
    const isAcceptingOrder = status === 'IN_SERVICE' && !order.data.escortId;
    
    if (!isPatient && !isEscort && !isAcceptingOrder) {
      console.log('[更新订单状态] 无权限更新订单:', orderId)
      return {
        code: 1,
        message: '无权限更新该订单'
      }
    }

    // 更新订单状态
    console.log('[更新订单状态] 开始更新状态:', { orderId, status })
    
    // 准备更新数据
    const updateData = {
      status,
      updateTime: new Date()
    };
    
    // 如果是陪护人员接单，添加escortId
    if (isAcceptingOrder) {
      updateData.escortId = wxContext.OPENID;
      console.log('[更新订单状态] 陪护人员接单:', wxContext.OPENID);
    }
    
    // 如果订单完成，记录完成时间
    if (status === 'COMPLETED') {
      updateData.completeTime = new Date();
    }
    
    await db.collection('ai_orders').doc(orderId).update({
      data: updateData
    })

    console.log('[更新订单状态] 更新成功')
    return {
      code: 0,
      message: '更新成功'
    }

  } catch (err) {
    console.error('[更新订单状态] 更新失败:', err)
    return {
      code: 1,
      message: err.message || '更新失败'
    }
  }
}