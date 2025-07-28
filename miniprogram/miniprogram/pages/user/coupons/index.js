const app = getApp()

Page({
  data: {
    coupons: [],
    loading: false,
    tabs: ['可使用', '已使用', '已过期'],
    activeTab: 0
  },

  onLoad() {
    this.loadCoupons()
  },

  async loadCoupons() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('coupons')
        .where({
          _openid: app.globalData.openid,
          status: this.getStatusByTab(this.data.activeTab)
        })
        .orderBy('expireDate', 'asc')
        .get()

      this.setData({
        coupons: data.map(coupon => ({
          ...coupon,
          expireDateFormatted: this.formatDate(coupon.expireDate)
        }))
      })
    } catch (error) {
      console.error('获取优惠券失败：', error)
      wx.showToast({
        title: '获取优惠券失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  getStatusByTab(tabIndex) {
    const statusMap = ['valid', 'used', 'expired']
    return statusMap[tabIndex]
  },

  formatDate(date) {
    const d = new Date(date)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  },

  handleTabChange(e) {
    const activeTab = e.currentTarget.dataset.index
    this.setData({ activeTab })
    this.loadCoupons()
  },

  useCoupon(e) {
    const { couponId } = e.currentTarget.dataset
    // 跳转到服务选择页面并传递优惠券ID
    wx.navigateTo({
      url: `/pages/index/index?couponId=${couponId}`
    })
  },

  onPullDownRefresh() {
    this.loadCoupons().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})