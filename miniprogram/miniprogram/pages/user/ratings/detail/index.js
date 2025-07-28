// pages/user/ratings/detail/index.js
Page({
  data: {
    evaluation: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.loadEvaluationDetail(options.id)
    } else {
      wx.showToast({
        title: '评价ID不存在',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 加载评价详情
  async loadEvaluationDetail(id) {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('evaluations').doc(id).get()
      
      if (res.data) {
        // 格式化时间
        if (res.data.createTime) {
          const date = new Date(res.data.createTime)
          res.data.formattedTime = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        }
        
        this.setData({
          evaluation: res.data,
          loading: false
        })
      } else {
        wx.showToast({
          title: '评价不存在',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    } catch (error) {
      console.error('获取评价详情失败：', error)
      wx.showToast({
        title: '获取评价详情失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 预览图片
  previewImage(e) {
    const { current, urls } = e.currentTarget.dataset
    wx.previewImage({
      current,
      urls
    })
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})