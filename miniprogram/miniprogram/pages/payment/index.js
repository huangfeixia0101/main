const app = getApp()

Page({
  data: {
    orderId: '',
    orderInfo: null,
    loading: false
  },

  onLoad(options) {
    if (options.orderId) {
      this.setData({
        orderId: options.orderId
      })
      this.getOrderInfo()
    }
  },

  async getOrderInfo() {
    try {
      const db = wx.cloud.database()
      const order = await db.collection('ai_orders').doc(this.data.orderId).get()
      if (!order || !order.data) {
        wx.showToast({
          title: '订单不存在或已被删除',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }
      this.setData({
        orderInfo: order.data
      })
    } catch (err) {
      console.error('获取订单信息失败:', err)
      wx.showToast({
        title: '获取订单信息失败，请重试',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async handlePayment() {
    if (this.data.loading) return

    this.setData({ loading: true })
    try {
      // 调用云函数进行支付
      const { result } = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          orderId: this.data.orderId
        }
      })

      if (result.code === 0) {
        // 调用微信支付
        wx.requestPayment({
          ...result.payment,
          success: async () => {
            // 支付成功后更新订单状态
            try {
              await wx.cloud.callFunction({
                name: 'updateOrderStatus',
                data: {
                  orderId: this.data.orderId,
                  status: 'PAID'
                }
              })
              wx.showToast({
                title: '支付成功',
                icon: 'success'
              })
              // 跳转到订单详情页
              wx.redirectTo({
                url: `/pages/orders/detail/index?id=${this.data.orderId}&status=PAID`
              })
            } catch (error) {
              console.error('更新订单状态失败:', error)
              wx.showToast({
                title: '支付成功，但状态更新失败',
                icon: 'none'
              })
              // 即使状态更新失败，也跳转到订单详情页
              wx.redirectTo({
                url: `/pages/orders/detail/index?id=${this.data.orderId}`
              })
            }
          },
          fail: (err) => {
            console.error('支付失败:', err)
            wx.showToast({
              title: '支付失败，请重试',
              icon: 'none'
            })
          }
        })
      } else {
        wx.showToast({
          title: result.message || '发起支付失败',
          icon: 'none'
        })
      }
    } catch (err) {
      console.error('支付失败:', err)
      wx.showToast({
        title: '支付失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})