// pages/orders/list/index.js
const app = getApp()

Page({
  data: {
    orderList: [],
    filteredOrderList: [],
    currentStatus: '',
    userType: '',
    isLogin: false,
    orderStatus: {
      UNPAID: 'UNPAID',
      PAID: 'PAID',
      IN_SERVICE: 'IN_SERVICE',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED'
    },
    statusText: {
      UNPAID: '待支付',
      PAID: '已支付',
      IN_SERVICE: '服务中',
      COMPLETED: '已完成',
      CANCELLED: '已取消'
    }
  },
  onLoad(options) {
    // 检查登录状态
    const isLogin = app.globalData.isLogin
    this.setData({ isLogin })
    
    if (!isLogin) {
      // 不再直接跳转到登录页面，而是显示登录提示界面
      return
    }

    // 从URL参数获取状态（兼容旧版本）
    if (options && options.status) {
      this.setData({ currentStatus: options.status })
    }
    // 设置用户类型
    this.setData({
      userType: app.globalData.userType
    })
    this.getOrderList()
  },
  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      })
    }
    
    // 检查登录状态
    const isLogin = app.globalData.isLogin
    this.setData({ isLogin })
    
    if (!isLogin) {
      // 不再直接跳转到登录页面，而是显示登录提示界面
      return
    }

    // 从Storage中获取状态参数（适用于tabBar页面跳转）
    const orderListStatus = wx.getStorageSync('orderListStatus')
    if (orderListStatus) {
      this.setData({ currentStatus: orderListStatus })
      // 读取后清除，避免影响下次进入
      wx.removeStorageSync('orderListStatus')
    }

    // 每次显示页面时更新用户类型
    this.setData({
      userType: app.globalData.userType
    })
    this.getOrderList()
  },
  // 跳转到登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/index'
    })
  },
  async getOrderList() {
    try {
      const db = wx.cloud.database()
      const orderCollection = db.collection('ai_orders')
      const userType = app.globalData.userType
      
      // 构建查询条件
      let query = {}
      if (userType === 'patient') {
        // 患者只能查看自己的订单
        query._openid = app.globalData.openid
      } else if (userType === 'escort') {
        // 陪护人员可以查看两种订单：
        // 1. 已分配给自己的订单
        // 2. 已支付但未分配的订单（待接单）
        const db_command = db.command
        
        if (this.data.currentStatus === this.data.orderStatus.PAID) {
          // 查看待接单订单（已支付但未分配）
          query = {
            status: this.data.orderStatus.PAID,
            escortId: db_command.eq(null).or(db_command.eq(undefined))
          }
        } else if (this.data.currentStatus) {
          // 查看特定状态的自己的订单
          query = {
            status: this.data.currentStatus,
            escortId: app.globalData.openid
          }
        } else {
          // 查看全部自己的订单
          query.escortId = app.globalData.openid
        }
      }

      const { data: orders } = await orderCollection
        .where(query)
        .orderBy('createTime', 'desc')
        .get()

      const orderList = orders.map(order => ({
        ...order,
        createTime: new Date(order.createTime).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        price: (order.totalPrice || 0).toFixed(0)
      }))
      this.setData({
        orderList,
        filteredOrderList: this.filterOrders(orderList, this.data.currentStatus)
      })
    } catch (error) {
      console.error('获取订单列表失败：', error)
      wx.showToast({
        title: '获取订单列表失败',
        icon: 'none'
      })
    }
  },
  goToOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/orders/detail/index?id=${orderId}`
    })
  },
  filterOrders(orders, status) {
    if (!status) return orders
    return orders.filter(order => order.status === status)
  },
  switchStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({
      currentStatus: status
    }, () => {
      this.getOrderList() // 切换状态时重新获取订单列表
    })
  },
  onPullDownRefresh() {
    this.getOrderList().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})