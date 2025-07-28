// pages/admin/order-management/index.js
const app = getApp()

Page({
  data: {
    orderList: [],
    statusOptions: [
      { value: 'all', text: '全部' },
      { value: 'UNPAID', text: '待支付' },
      { value: 'PAID', text: '待接单' },
      { value: 'ACCEPTED', text: '已接单' },
      { value: 'IN_SERVICE', text: '服务中' },
      { value: 'COMPLETED', text: '已完成' },
      { value: 'CANCELLED', text: '已取消' }
    ],
    currentStatus: 'all',
    searchKeyword: '',
    loading: false,
    currentPage: 1,
    pageSize: 10,
    hasMore: true
  },

  onLoad() {
    this.loadOrderList(true)
  },

  onShow() {
    this.loadOrderList(true)
  },

  // 加载订单列表
  async loadOrderList(refresh = false) {
    if (refresh) {
      this.setData({
        currentPage: 1,
        hasMore: true,
        orderList: []
      })
    }

    if (!this.data.hasMore || this.data.loading) return

    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 构建查询条件
      let query = {}
      
      // 按订单状态筛选
      if (this.data.currentStatus !== 'all') {
        query.status = this.data.currentStatus
      }
      
      // 按关键词搜索
      if (this.data.searchKeyword) {
        // 支持按订单号、患者姓名或陪护人员姓名搜索
        query = _.or([
          {
            orderNo: db.RegExp({
              regexp: this.data.searchKeyword,
              options: 'i'
            })
          },
          {
            'patientInfo.name': db.RegExp({
              regexp: this.data.searchKeyword,
              options: 'i'
            })
          },
          {
            'escortInfo.name': db.RegExp({
              regexp: this.data.searchKeyword,
              options: 'i'
            })
          }
        ])
      }

      const orderRes = await db.collection('ai_orders')
        .where(query)
        .skip((this.data.currentPage - 1) * this.data.pageSize)
        .limit(this.data.pageSize)
        .orderBy('createTime', 'desc')
        .get()

      // 处理订单数据
      const newOrders = orderRes.data.map(order => ({
        ...order,
        createTime: order.createTime ? new Date(order.createTime).toLocaleString() : '未知',
        statusText: this.getStatusText(order.status),
        statusClass: this.getStatusClass(order.status),
        totalAmount: (order.totalAmount / 100).toFixed(2) // 转换为元
      }))

      this.setData({
        orderList: [...this.data.orderList, ...newOrders],
        currentPage: this.data.currentPage + 1,
        hasMore: newOrders.length === this.data.pageSize,
        loading: false
      })
    } catch (error) {
      console.error('获取订单列表失败：', error)
      wx.showToast({
        title: '获取订单列表失败',
        icon: 'none'
      })
      this.setData({ loading: false })
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

  // 获取状态样式类
  getStatusClass(status) {
    const statusClassMap = {
      'UNPAID': 'status-unpaid',
      'PAID': 'status-paid',
      'ACCEPTED': 'status-accepted',
      'IN_SERVICE': 'status-in-service',
      'COMPLETED': 'status-completed',
      'CANCELLED': 'status-cancelled'
    }
    return statusClassMap[status] || ''
  },

  // 切换订单状态筛选
  changeOrderStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({ currentStatus: status })
    this.loadOrderList(true)
  },

  // 搜索订单
  searchOrder(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadOrderList(true)
  },

  // 清除搜索
  clearSearch() {
    this.setData({
      searchKeyword: ''
    })
    this.loadOrderList(true)
  },

  // 查看订单详情
  viewOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/admin/order-management/detail/index?id=${orderId}`
    })
  },

  // 取消订单
  cancelOrder(e) {
    const orderId = e.currentTarget.dataset.id
    const orderNo = e.currentTarget.dataset.no
    
    wx.showModal({
      title: '取消确认',
      content: `确定要取消订单 ${orderNo} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database()
            await db.collection('ai_orders').doc(orderId).update({
              data: {
                status: 'CANCELLED',
                updateTime: db.serverDate()
              }
            })
            
            wx.showToast({
              title: '订单已取消',
              icon: 'success'
            })
            
            // 刷新列表
            this.loadOrderList(true)
          } catch (error) {
            console.error('取消订单失败：', error)
            wx.showToast({
              title: '操作失败，请重试',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 完成订单
  completeOrder(e) {
    const orderId = e.currentTarget.dataset.id
    const orderNo = e.currentTarget.dataset.no
    
    wx.showModal({
      title: '完成确认',
      content: `确定将订单 ${orderNo} 标记为已完成吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database()
            await db.collection('ai_orders').doc(orderId).update({
              data: {
                status: 'COMPLETED',
                updateTime: db.serverDate(),
                completeTime: db.serverDate()
              }
            })
            
            wx.showToast({
              title: '订单已完成',
              icon: 'success'
            })
            
            // 刷新列表
            this.loadOrderList(true)
          } catch (error) {
            console.error('完成订单失败：', error)
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
    this.loadOrderList(true)
    wx.stopPullDownRefresh()
  },

  // 上拉加载更多
  onReachBottom() {
    this.loadOrderList()
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})