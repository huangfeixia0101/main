const app = getApp()

Page({
  data: {
    redeemCode: '',
    redeemHistory: [],
    loading: false
  },

  onLoad() {
    this.loadRedeemHistory()
  },

  // 输入兑换码
  onInputRedeemCode(e) {
    this.setData({
      redeemCode: e.detail.value
    })
  },

  // 加载兑换记录
  async loadRedeemHistory() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'redeem-code',
        data: { action: 'getHistory' }
      })
      
      if (result.result.code === 0 && result.result.data) {
        // 格式化时间
        const history = result.result.data.history || []
        history.forEach(item => {
          if (item.createTime) {
            const date = new Date(item.createTime)
            item.createTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
          }
        })
        
        this.setData({ redeemHistory: history })
      }
    } catch (error) {
      console.error('加载兑换记录失败:', error)
      wx.showToast({
        title: '加载兑换记录失败',
        icon: 'none'
      })
    }
  },

  // 提交兑换
  async submitRedeem() {
    if (!this.data.redeemCode) {
      wx.showToast({
        title: '请输入兑换码',
        icon: 'none'
      })
      return
    }

    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      const result = await wx.cloud.callFunction({
        name: 'redeem-code',
        data: { code: this.data.redeemCode }
      })
      
      if (result.result.code === 0) {
        wx.showToast({
          title: result.result.message || '兑换成功',
          icon: 'success'
        })
        this.setData({ redeemCode: '' })
        this.loadRedeemHistory()
      } else {
        wx.showToast({
          title: result.result.message || '兑换失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('兑换失败:', error)
      wx.showToast({
        title: error.message || '兑换失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})