// pages/orders/evaluation/index.js
Page({
  data: {
    orderId: '',
    serviceName: '',
    rating: 0,
    ratingText: ['非常差', '差', '一般', '好', '非常好'],
    comment: '',
    images: [],
    isAnonymous: false,
    submitting: false
  },

  onLoad(options) {
    if (options.id && options.serviceName) {
      this.setData({
        orderId: options.id,
        serviceName: options.serviceName
      })
    }
  },

  // 设置评分
  setRating(e) {
    const rating = e.currentTarget.dataset.rating
    this.setData({ rating })
  },

  // 处理评论输入
  handleCommentInput(e) {
    this.setData({
      comment: e.detail.value
    })
  },

  // 选择图片
  async chooseImage() {
    const res = await wx.chooseImage({
      count: 3 - this.data.images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera']
    })

    const tempFilePaths = res.tempFilePaths
    this.setData({
      images: [...this.data.images, ...tempFilePaths]
    })
  },

  // 预览图片
  previewImage(e) {
    const current = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.images[current],
      urls: this.data.images
    })
  },

  // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.images
    images.splice(index, 1)
    this.setData({ images })
  },

  // 切换匿名评价
  toggleAnonymous(e) {
    this.setData({
      isAnonymous: e.detail.value
    })
  },

  // 上传图片到云存储
  async uploadImages() {
    if (this.data.images.length === 0) return []

    const uploadTasks = this.data.images.map(filePath => {
      const cloudPath = `evaluation/${this.data.orderId}/${Date.now()}-${Math.random().toString(36).substr(2)}.${filePath.match(/\.\w+$/)[0]}`
      return wx.cloud.uploadFile({
        cloudPath,
        filePath
      })
    })

    const results = await Promise.all(uploadTasks)
    return results.map(res => res.fileID)
  },

  // 提交评价
  async submitEvaluation() {
    if (!this.data.rating) {
      wx.showToast({
        title: '请选择评分',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      // 上传图片
      const fileIDs = await this.uploadImages()

      // 创建评价记录
      const db = wx.cloud.database()
      await db.collection('evaluations').add({
        data: {
          orderId: this.data.orderId,
          serviceName: this.data.serviceName,
          rating: this.data.rating,
          comment: this.data.comment,
          images: fileIDs,
          isAnonymous: this.data.isAnonymous,
          createTime: db.serverDate()
        }
      })

      // 更新订单评价状态
      await db.collection('ai_orders').doc(this.data.orderId).update({
        data: {
          hasEvaluated: true
        }
      })

      wx.showToast({
        title: '评价提交成功',
        icon: 'success'
      })

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (error) {
      console.error('提交评价失败：', error)
      wx.showToast({
        title: '提交评价失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})