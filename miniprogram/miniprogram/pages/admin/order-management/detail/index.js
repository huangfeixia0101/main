// pages/admin/order-management/detail/index.js
const app = getApp()

Page({
  data: {
    orderId: '',
    orderDetail: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ orderId: options.id })
      this.loadOrderDetail()
    } else {
      wx.showToast({
        title: '订单ID不存在',
        icon: 'error'
      })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  // 加载订单详情
  async loadOrderDetail() {
    try {
      const db = wx.cloud.database()
      const orderRes = await db.collection('ai_orders').doc(this.data.orderId).get()
      
      if (orderRes.data) {
        // 获取患者信息
        const patientRes = await db.collection('patients').where({ patientId: orderRes.data.patientId }).get()
        
        // 获取地址信息
        let addressInfo = null
        if (orderRes.data.addressId) {
          const addressRes = await db.collection('addresses').where({addressId: orderRes.data.addressId}).get()
          addressInfo = addressRes.data
        }
        
        const orderDetail = {
          ...orderRes.data,
          createTime: orderRes.data.createTime ? new Date(orderRes.data.createTime).toLocaleString() : '未知',
          updateTime: orderRes.data.updateTime ? new Date(orderRes.data.updateTime).toLocaleString() : '未知',
          statusText: this.getStatusText(orderRes.data.status),
          totalAmount: (orderRes.data.totalAmount / 100).toFixed(2),
          patientInfo: patientRes.data || null,
          addressInfo: addressInfo
        }

        this.setData({
          orderDetail,
          loading: false
        })
      } else {
        throw new Error('订单不存在')
      }
    } catch (error) {
      console.error('获取订单详情失败：', error)
      wx.showToast({
        title: '获取订单详情失败',
        icon: 'none'
      })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      'UNPAID': '待支付',
      'PAID': '待接单',
      'ACCEPTED': '已接单',
      'IN_SERVICE': '服务中',
      'COMPLETED': '已完成',
      'CANCELLED': '已取消'
    }
    return statusMap[status] || '未知状态'
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})