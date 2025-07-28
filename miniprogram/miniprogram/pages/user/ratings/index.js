// pages/user/ratings/index.js
const app = getApp()

Page({
  data: {
    evaluationList: [],
    loading: true,
    isEmpty: false
  },

  onLoad() {
    this.loadEvaluations()
  },

  onShow() {
    // 每次显示页面时重新加载评价列表
    this.loadEvaluations()
  },

  onPullDownRefresh() {
    this.loadEvaluations()
  },

  // 加载用户的评价列表
  async loadEvaluations() {
    if (!app.globalData.isLogin) {
      wx.navigateTo({
        url: '/pages/login/index'
      })
      return
    }

    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 根据用户类型获取不同的订单ID列表
      let orderRes
      if (app.globalData.userType === 'escort') {
        // 陪护人员查看自己被评价的订单
        orderRes = await db.collection('ai_orders')
          .where({
            escortId: app.globalData.openid,
            status: 'COMPLETED'
          })
          .field({
            _id: true
          })
          .get()
      } else {
        // 患者查看自己评价过的订单
        orderRes = await db.collection('ai_orders')
          .where({
            patientId: app.globalData.openid,
            status: 'COMPLETED'
          })
          .field({
            _id: true
          })
          .get()
      }
      
      const orderIds = orderRes.data.map(order => order._id)
      
      if (orderIds.length === 0) {
        this.setData({
          evaluationList: [],
          loading: false,
          isEmpty: true
        })
        wx.stopPullDownRefresh()
        return
      }
      
      // 获取这些订单的评价
      const evalRes = await db.collection('evaluations')
        .where({
          orderId: _.in(orderIds)
        })
        .orderBy('createTime', 'desc')
        .get()
      
      // 格式化评价时间
      const formattedEvaluations = evalRes.data.map(item => {
        if (item.createTime) {
          // 将时间戳转换为日期对象
          const date = new Date(item.createTime);
          // 格式化为年月日 时分
          item.createTime = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        return item;
      });
      
      this.setData({
        evaluationList: formattedEvaluations,
        loading: false,
        isEmpty: evalRes.data.length === 0
      })
    } catch (error) {
      console.error('获取评价列表失败：', error)
      wx.showToast({
        title: '获取评价列表失败',
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

  // 查看评价详情
  viewEvaluationDetail(e) {
    const evaluation = e.currentTarget.dataset.evaluation
    wx.navigateTo({
      url: `/pages/user/ratings/detail/index?id=${evaluation._id}`
    })
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})