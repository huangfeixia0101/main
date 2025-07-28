// pages/admin/service-management/index.js
const app = getApp()

Page({
  data: {
    serviceList: [],
    searchKeyword: '',
    loading: false,
    currentPage: 1,
    pageSize: 10,
    hasMore: true,
    categories: [],
    statusOptions: [
      { value: 'active', text: '上线' },
      { value: 'inactive', text: '下线' }
    ]

  },

  onLoad() {
    this.loadCategories()
    this.loadServiceList(true)
  },

  onShow() {
    this.loadServiceList(true)
  },

  // 加载服务列表
  async loadServiceList(refresh = false) {
    if (refresh) {
      this.setData({
        currentPage: 1,
        hasMore: true,
        serviceList: []
      })
    }

    if (!this.data.hasMore || this.data.loading) return

    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 构建查询条件
      let query = {}
      
      // 按关键词搜索
      if (this.data.searchKeyword) {
        query = _.or([
          {
            name: db.RegExp({
              regexp: this.data.searchKeyword,
              options: 'i'
            })
          },
          {
            description: db.RegExp({
              regexp: this.data.searchKeyword,
              options: 'i'
            })
          }
        ])
      }

      const serviceRes = await db.collection('ai_service')
        .where(query)
        .skip((this.data.currentPage - 1) * this.data.pageSize)
        .limit(this.data.pageSize)
        .orderBy('createTime', 'desc')
        .get()

      // 处理服务数据
      const newServices = serviceRes.data.map(service => ({
        ...service,
        createTime: service.createTime ? this.formatTime(service.createTime) : '未知',
        updateTime: service.updateTime ? this.formatTime(service.updateTime) : '未知',
        priceDisplay: (service.price), // 转换为元
        categoryText: this.getCategoryText(service.category),
        statusText: service.status === 'active' ? '已上线' : '已下线',
        statusClass: service.status === 'active' ? 'status-active' : 'status-inactive'
      }))

      this.setData({
        serviceList: [...this.data.serviceList, ...newServices],
        currentPage: this.data.currentPage + 1,
        hasMore: newServices.length === this.data.pageSize,
        loading: false
      })
    } catch (error) {
      console.error('获取服务列表失败：', error)
      wx.showToast({
        title: '获取服务列表失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  },

  // 加载服务分类
  async loadCategories() {
    try {
      const db = wx.cloud.database()
      const serviceRes = await db.collection('ai_service').limit(1).get()
      if (serviceRes.data.length > 0 && serviceRes.data[0].specs) {
        const categories = serviceRes.data[0].specs.map((spec, index) => ({
          value: index.toString(),
          text: spec[0] || '未知分类'
        }))
        this.setData({ categories })
      }
    } catch (error) {
      console.error('获取服务分类失败：', error)
      wx.showToast({
        title: '获取服务分类失败',
        icon: 'none'
      })
    }
  },

  // 获取分类文本
  getCategoryText(category) {
    const foundCategory = this.data.categories.find(c => c.value === category)
    return foundCategory ? foundCategory.text : '未知分类'
  },

  // 搜索服务
  searchService(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadServiceList(true)
  },

  // 清除搜索
  clearSearch() {
    this.setData({
      searchKeyword: ''
    })
    this.loadServiceList(true)
  },

  // 切换服务状态
  async toggleServiceStatus(e) {
    const index = e.currentTarget.dataset.index
    const service = this.data.serviceList[index]
    const newStatus = service.status === 'active' ? 'inactive' : 'active'
    const statusText = newStatus === 'active' ? '上线' : '下线'
    
    wx.showModal({
      title: `${statusText}确认`,
      content: `确定要${statusText}服务 ${service.name} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database()
            await db.collection('ai_service').doc(service._id).update({
              data: {
                status: newStatus,
                updateTime: db.serverDate()
              }
            })
            
            wx.showToast({
              title: `服务已${statusText}`,
              icon: 'success'
            })
            
            // 刷新列表
            this.loadServiceList(true)
          } catch (error) {
            console.error(`${statusText}服务失败：`, error)
            wx.showToast({
              title: '操作失败，请重试',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadServiceList(true)
    wx.stopPullDownRefresh()
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadServiceList()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})