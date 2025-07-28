// pages/user/earnings/index.js
const app = getApp()

Page({
  data: {
    earningsList: [],
    extraEarningsList: [],
    totalEarnings: 0,
    orderEarnings: 0,
    extraEarnings: 0,
    dateRange: 'all', // 'today', 'week', 'month', 'all'
    loading: true,
    isEmpty: false,
    activeTab: 'all' // 'all', 'order', 'extra'
  },

  onLoad() {
    this.loadEarningsData()
  },

  onShow() {
    // 每次显示页面时重新加载收益数据
    this.loadEarningsData()
  },

  onPullDownRefresh() {
    this.loadEarningsData()
  },

  // 切换收益类型标签
  changeTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      activeTab: tab
    })
  },

  // 加载收益数据
  async loadEarningsData() {
    if (!app.globalData.isLogin) {
      wx.navigateTo({
        url: '/pages/login/index'
      })
      return
    }

    // 检查是否为陪护人员
    if (app.globalData.userType !== 'escort') {
      wx.showToast({
        title: '仅陪护人员可查看收益',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 根据日期范围构建查询条件
      let timeQuery = {}
      const now = new Date()
      
      if (this.data.dateRange === 'today') {
        // 今日：当天0点到现在
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        timeQuery = {
          completeTime: _.gte(todayStart).and(_.lte(todayEnd))
        }
      } else if (this.data.dateRange === 'week') {
        // 本周：本周一0点到现在
        const day = now.getDay() || 7 // 周日为0，转换为7
        const mondayOffset = day - 1 // 周一偏移量
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset, 0, 0, 0)
        const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        timeQuery = {
          completeTime: _.gte(weekStart).and(_.lte(weekEnd))
        }
      } else if (this.data.dateRange === 'month') {
        // 本月：本月1日0点到月末最后一天的23:59:59
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) // 当月最后一天
        timeQuery = {
          completeTime: _.gte(monthStart).and(_.lte(monthEnd))
        }
      }
      // 'all'不需要时间筛选
      
      // 查询陪护人员已完成的订单
      const orderRes = await db.collection('ai_orders')
        .where({
          escortId: app.globalData.openid,
          status: 'COMPLETED',
          ...timeQuery
        })
        .orderBy('completeTime', 'desc')
        .get()
      
      // 查询陪护人员的额外收益
      let extraTimeQuery = {}
      if (this.data.dateRange === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        extraTimeQuery = {
          createTime: _.gte(todayStart).and(_.lte(todayEnd))
        }
      } else if (this.data.dateRange === 'week') {
        const day = now.getDay() || 7
        const mondayOffset = day - 1
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset, 0, 0, 0)
        const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
        extraTimeQuery = {
          createTime: _.gte(weekStart).and(_.lte(weekEnd))
        }
      } else if (this.data.dateRange === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        extraTimeQuery = {
          createTime: _.gte(monthStart).and(_.lte(monthEnd))
        }
      }
      
      const extraRes = await db.collection('ai_extra_earnings')
        .where({
          escortId: app.globalData.openid,
          ...extraTimeQuery
        })
        .orderBy('createTime', 'desc')
        .get()
      
      if (orderRes.data.length === 0 && extraRes.data.length === 0) {
        this.setData({
          earningsList: [],
          extraEarningsList: [],
          orderEarnings: 0,
          extraEarnings: 0,
          totalEarnings: 0,
          loading: false,
          isEmpty: true
        })
        wx.stopPullDownRefresh()
        return
      }
      
      // 计算订单收益
      let orderAmount = 0
      const formattedEarnings = orderRes.data.map(order => {
        // 计算订单收益（使用totalPrice字段计算收益）
        const earnings = order.totalPrice*0.5 || 0
        orderAmount += earnings
        
        // 格式化时间
        let formattedTime = ''
        if (order.completeTime) {
          const date = new Date(order.completeTime)
          formattedTime = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        }
        
        return {
          ...order,
          earnings: earnings,
          formattedTime: formattedTime,
          type: 'order'
        }
      })
      
      // 计算额外收益
      let extraAmount = 0
      const formattedExtraEarnings = extraRes.data.map(extra => {
        const earnings = extra.amount || 0
        extraAmount += earnings
        
        // 格式化时间
        let formattedTime = ''
        if (extra.createTime) {
          const date = new Date(extra.createTime)
          formattedTime = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
        }
        
        // 格式化类型
        let typeText = '其他'
        if (extra.reasonType === 'bonus') {
          typeText = '奖金'
        } else if (extra.reasonType === 'subsidy') {
          typeText = '补贴'
        }
        
        return {
          ...extra,
          earnings: earnings,
          formattedTime: formattedTime,
          typeText: typeText,
          type: 'extra'
        }
      })
      
      // 计算总收益
      const totalAmount = orderAmount + extraAmount
      
      this.setData({
        earningsList: formattedEarnings,
        extraEarningsList: formattedExtraEarnings,
        orderEarnings: orderAmount,
        extraEarnings: extraAmount,
        totalEarnings: totalAmount,
        loading: false,
        isEmpty: formattedEarnings.length === 0 && formattedExtraEarnings.length === 0
      })
    } catch (error) {
      console.error('获取收益数据失败：', error)
      wx.showToast({
        title: '获取收益数据失败',
        icon: 'none'
      })
      this.setData({
        loading: false,
        isEmpty: true
      })
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  // 切换日期范围
  changeDateRange(e) {
    const range = e.currentTarget.dataset.range
    this.setData({
      dateRange: range
    }, () => {
      this.loadEarningsData()
    })
  },




  // 查看订单详情
  viewOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id
    const type = e.currentTarget.dataset.type
    
    if (type === 'order') {
      wx.navigateTo({
        url: `/pages/orders/detail/index?id=${orderId}`
      })
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})