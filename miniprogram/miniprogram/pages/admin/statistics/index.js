// pages/admin/statistics/index.js
const app = getApp()

Page({
  data: {
    loading: false,
    stats: {
      userCount: {
        total: 0,
        patient: 0,
        escort: 0
      },
      orderCount: {
        total: 0,
        unpaid: 0,
        paid: 0,
        inService: 0,
        completed: 0,
        cancelled: 0
      },
      serviceCount: {
        total: 0,
        active: 0,
        inactive: 0
      },
      revenue: {
        total: 0,
        today: 0,
        thisWeek: 0,
        thisMonth: 0
      }
    },
    recentOrders: [],
    topServices: [],
    chartData: {
      orderTrend: [],
      revenueTrend: []
    },
    dateRange: 'week', // 'week', 'month', 'year'
    currentDate: new Date()
  },

  onLoad() {
    this.loadStatistics()
  },

  onShow() {
    this.loadStatistics()
  },
  
  // 切换日期范围
  changeDateRange(e) {
    const range = e.currentTarget.dataset.range
    this.setData({ dateRange: range })
    this.loadStatistics()
  },
  
  // 获取订单状态文本
  getOrderStatusText(status) {
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

  // 加载统计数据
  async loadStatistics() {
    this.setData({ loading: true })

    try {
      await Promise.all([
        this.loadUserStats(),
        this.loadOrderStats(),
        this.loadServiceStats(),
        this.loadRevenueStats(),
        this.loadRecentOrders(),
        this.loadTopServices(),
        this.loadTrendData()
      ])

      this.setData({ loading: false })
    } catch (error) {
      console.error('加载统计数据失败：', error)
      wx.showToast({
        title: '加载统计数据失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 加载用户统计
  async loadUserStats() {
    try {
      const db = wx.cloud.database()
      const $ = db.command.aggregate
      
      const userStatsRes = await db.collection('users')
        .aggregate()
        .group({
          _id: '$userType',
          count: $.sum(1)
        })
        .end()
      
      let userStats = {
        total: 0,
        patient: 0,
        escort: 0
      }
      
      userStatsRes.list.forEach(item => {
        if (item._id === 'patient') {
          userStats.patient = item.count
        } else if (item._id === 'escort') {
          userStats.escort = item.count
        }
        userStats.total += item.count
      })
      
      this.setData({
        'stats.userCount': userStats
      })
    } catch (error) {
      console.error('加载用户统计失败：', error)
    }
  },

  // 加载订单统计
  async loadOrderStats() {
    try {
      const db = wx.cloud.database()
      const $ = db.command.aggregate
      
      const orderStatsRes = await db.collection('orders')
        .aggregate()
        .group({
          _id: '$status',
          count: $.sum(1)
        })
        .end()
      
      let orderStats = {
        total: 0,
        unpaid: 0,
        paid: 0,
        inService: 0,
        completed: 0,
        cancelled: 0
      }
      
      orderStatsRes.list.forEach(item => {
        if (item._id === 'UNPAID') {
          orderStats.unpaid = item.count
        } else if (item._id === 'PAID') {
          orderStats.paid = item.count
        } else if (item._id === 'IN_SERVICE') {
          orderStats.inService = item.count
        } else if (item._id === 'COMPLETED') {
          orderStats.completed = item.count
        } else if (item._id === 'CANCELLED') {
          orderStats.cancelled = item.count
        }
        orderStats.total += item.count
      })
      
      this.setData({
        'stats.orderCount': orderStats
      })
    } catch (error) {
      console.error('加载订单统计失败：', error)
    }
  },

  // 加载服务统计
  async loadServiceStats() {
    try {
      const db = wx.cloud.database()
      const $ = db.command.aggregate
      
      const serviceStatsRes = await db.collection('services')
        .aggregate()
        .group({
          _id: '$status',
          count: $.sum(1)
        })
        .end()
      
      let serviceStats = {
        total: 0,
        active: 0,
        inactive: 0
      }
      
      serviceStatsRes.list.forEach(item => {
        if (item._id === 'active') {
          serviceStats.active = item.count
        } else if (item._id === 'inactive') {
          serviceStats.inactive = item.count
        }
        serviceStats.total += item.count
      })
      
      this.setData({
        'stats.serviceCount': serviceStats
      })
    } catch (error) {
      console.error('加载服务统计失败：', error)
    }
  },

  // 加载收入统计
  async loadRevenueStats() {
    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 获取总收入
      const totalRevenueRes = await db.collection('orders')
        .where({
          status: 'COMPLETED'
        })
        .field({
          totalAmount: true
        })
        .get()
      
      let totalRevenue = 0
      totalRevenueRes.data.forEach(order => {
        totalRevenue += order.totalAmount || 0
      })
      
      // 获取今日收入
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const todayRevenueRes = await db.collection('orders')
        .where({
          status: 'COMPLETED',
          completeTime: _.gte(today)
        })
        .field({
          totalAmount: true
        })
        .get()
      
      let todayRevenue = 0
      todayRevenueRes.data.forEach(order => {
        todayRevenue += order.totalAmount || 0
      })
      
      // 获取本周收入
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      weekStart.setHours(0, 0, 0, 0)
      
      const weekRevenueRes = await db.collection('orders')
        .where({
          status: 'COMPLETED',
          completeTime: _.gte(weekStart)
        })
        .field({
          totalAmount: true
        })
        .get()
      
      let weekRevenue = 0
      weekRevenueRes.data.forEach(order => {
        weekRevenue += order.totalAmount || 0
      })
      
      // 获取本月收入
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      
      const monthRevenueRes = await db.collection('orders')
        .where({
          status: 'COMPLETED',
          completeTime: _.gte(monthStart)
        })
        .field({
          totalAmount: true
        })
        .get()
      
      let monthRevenue = 0
      monthRevenueRes.data.forEach(order => {
        monthRevenue += order.totalAmount || 0
      })
      
      this.setData({
        'stats.revenue': {
          total: (totalRevenue / 100).toFixed(2),
          today: (todayRevenue / 100).toFixed(2),
          thisWeek: (weekRevenue / 100).toFixed(2),
          thisMonth: (monthRevenue / 100).toFixed(2)
        }
      })
    } catch (error) {
      console.error('加载收入统计失败：', error)
    }
  },

  // 加载最近订单
  async loadRecentOrders() {
    try {
      const db = wx.cloud.database()
      
      const recentOrdersRes = await db.collection('orders')
        .orderBy('createTime', 'desc')
        .limit(5)
        .get()
      
      const recentOrders = recentOrdersRes.data.map(order => ({
        ...order,
        createTime: order.createTime ? new Date(order.createTime).toLocaleString() : '未知',
        statusText: this.getOrderStatusText(order.status),
        totalAmount: (order.totalAmount / 100).toFixed(2) // 转换为元
      }))
      
      this.setData({ recentOrders })
    } catch (error) {
      console.error('加载最近订单失败：', error)
    }
  },

  // 加载热门服务
  async loadTopServices() {
    try {
      const db = wx.cloud.database()
      const $ = db.command.aggregate
      
      const topServicesRes = await db.collection('orders')
        .aggregate()
        .match({
          status: 'COMPLETED'
        })
        .group({
          _id: '$serviceId',
          serviceName: $.first('$serviceName'),
          count: $.sum(1),
          totalAmount: $.sum('$totalAmount')
        })
        .sort({
          count: -1
        })
        .limit(5)
        .end()
      
      const topServices = topServicesRes.list.map(service => ({
        ...service,
        totalAmount: (service.totalAmount / 100).toFixed(2) // 转换为元
      }))
      
      this.setData({ topServices })
    } catch (error) {
      console.error('加载热门服务失败：', error)
    }
  },
  
  // 下拉刷新
  onPullDownRefresh() {
    this.loadStatistics()
    wx.stopPullDownRefresh()
  },
  
  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 加载趋势数据
  async loadTrendData() {
    try {
      // 根据选择的日期范围获取不同的趋势数据
      let datePoints = []
      let startDate = new Date()
      
      if (this.data.dateRange === 'week') {
        // 获取过去7天的数据
        startDate.setDate(startDate.getDate() - 6)
        for (let i = 0; i < 7; i++) {
          const date = new Date(startDate)
          date.setDate(date.getDate() + i)
          datePoints.push(date)
        }
      } else if (this.data.dateRange === 'month') {
        // 获取过去30天的数据
        startDate.setDate(startDate.getDate() - 29)
        for (let i = 0; i < 30; i++) {
          const date = new Date(startDate)
          date.setDate(date.getDate() + i)
          datePoints.push(date)
        }
      } else if (this.data.dateRange === 'year') {
        // 获取过去12个月的数据
        startDate = new Date(startDate.getFullYear(), startDate.getMonth() - 11, 1)
        for (let i = 0; i < 12; i++) {
          const date = new Date(startDate)
          date.setMonth(date.getMonth() + i)
          datePoints.push(date)
        }
      }
      
      // 初始化趋势数据
      let orderTrend = []
      let revenueTrend = []
      
      const db = wx.cloud.database()
      const _ = db.command
      
      // 获取每个日期点的订单数和收入
      for (let i = 0; i < datePoints.length; i++) {
        const currentDate = datePoints[i]
        let nextDate
        
        if (this.data.dateRange === 'year') {
          // 如果是按年，则下一个日期点是下个月的第一天
          nextDate = new Date(currentDate)
          nextDate.setMonth(nextDate.getMonth() + 1)
        } else {
          // 如果是按周或按月，则下一个日期点是第二天
          nextDate = new Date(currentDate)
          nextDate.setDate(nextDate.getDate() + 1)
        }
        
        // 设置时间为当天的开始和结束
        currentDate.setHours(0, 0, 0, 0)
        nextDate.setHours(0, 0, 0, 0)
        
        // 获取该时间段的订单数
        const orderCountRes = await db.collection('orders')
          .where({
            createTime: _.gte(currentDate).and(_.lt(nextDate))
          })
          .count()
        
        // 获取该时间段的收入
        const revenueRes = await db.collection('orders')
          .where({
            status: 'COMPLETED',
            completeTime: _.gte(currentDate).and(_.lt(nextDate))
          })
          .field({
            totalAmount: true
          })
          .get()
        
        let revenue = 0
        revenueRes.data.forEach(order => {
          revenue += order.totalAmount || 0
        })
        
        // 格式化日期标签
        let dateLabel
        if (this.data.dateRange === 'year') {
          dateLabel = `${currentDate.getMonth() + 1}月`
        } else {
          dateLabel = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`
        }
        
        orderTrend.push({
          date: dateLabel,
          count: orderCountRes.total
        })
        
        revenueTrend.push({
          date: dateLabel,
          amount: (revenue / 100).toFixed(2)
        })
      }
      
      this.setData({
        'chartData.orderTrend': orderTrend,
        'chartData.revenueTrend': revenueTrend
      })
    } catch (error) {
      console.error('加载趋势数据失败：', error)
    }
  }
})