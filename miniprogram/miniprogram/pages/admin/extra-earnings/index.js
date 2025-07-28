// pages/admin/extra-earnings/index.js
const app = getApp()

Page({
  data: {
    escortList: [],
    selectedEscortId: '',
    selectedEscortName: '',
    amount: '',
    reason: '',
    reasonType: 'bonus', // 'bonus', 'subsidy', 'other'
    loading: false,
    submitting: false
  },

  onLoad() {
    this.loadEscortList()
  },

  onShow() {
    this.loadEscortList()
  },

  // 加载陪护人员列表
  async loadEscortList() {
    this.setData({ loading: true })
    try {
      const db = wx.cloud.database()
      const userRes = await db.collection('users')
        .where({
          userType: "escort"
        })
        .field({
          _id: true,
          openid: true,
          realName: true,
          phoneNumber: true
        })
        .get()

      // 转换字段名以匹配现有代码
      const formattedData = userRes.data.map(user => ({
        ...user,
        name: user.realName,
        phone: user.phoneNumber
      }))

      this.setData({
        escortList: formattedData,
        loading: false
      })
    } catch (error) {
      console.error('获取陪护人员列表失败：', error)
      wx.showToast({
        title: '获取陪护人员列表失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 选择陪护人员
  selectEscort(e) {
    const index = e.detail.value
    const escort = this.data.escortList[index]
    this.setData({
      selectedEscortId: escort.openid,
      selectedEscortName: escort.name
    })
  },

  // 输入金额
  inputAmount(e) {
    this.setData({
      amount: e.detail.value
    })
  },

  // 选择原因类型
  selectReasonType(e) {
    this.setData({
      reasonType: e.detail.value
    })
  },

  // 输入原因
  inputReason(e) {
    this.setData({
      reason: e.detail.value
    })
  },

  // 提交额外收益
  async submitExtraEarning() {
    // 表单验证
    if (!this.data.selectedEscortId) {
      wx.showToast({
        title: '请选择陪护人员',
        icon: 'none'
      })
      return
    }

    if (!this.data.amount || isNaN(Number(this.data.amount)) || Number(this.data.amount) <= 0) {
      wx.showToast({
        title: '请输入有效金额',
        icon: 'none'
      })
      return
    }

    if (!this.data.reason) {
      wx.showToast({
        title: '请输入原因说明',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      const db = wx.cloud.database()
      
      // 创建额外收益记录
      await db.collection('ai_extra_earnings').add({
        data: {
          escortId: this.data.selectedEscortId,
          escortName: this.data.selectedEscortName,
          amount: Number(this.data.amount),
          reasonType: this.data.reasonType,
          reason: this.data.reason,
          createTime: db.serverDate(),
          createdBy: app.globalData.openid
        }
      })

      wx.showToast({
        title: '添加成功',
        icon: 'success'
      })

      // 重置表单
      this.setData({
        selectedEscortId: '',
        selectedEscortName: '',
        amount: '',
        reason: '',
        reasonType: 'bonus',
        submitting: false
      })
    } catch (error) {
      console.error('添加额外收益失败：', error)
      wx.showToast({
        title: '添加失败，请重试',
        icon: 'none'
      })
      this.setData({ submitting: false })
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})