// pages/admin/user-management/index.js
const app = getApp()

Page({
  data: {
    userList: [],
    userTypes: [
      { text: '患者', value: 'patient' },
      { text: '陪护', value: 'escort' },
      { text: '管理员', value: 'admin' }
    ],
    currentType: 'all',
    searchKeyword: '',
    loading: false,
    currentPage: 1,
    pageSize: 10,
    hasMore: true
  },

  onLoad() {
    this.loadUserList(true)
  },

  onShow() {
    // 页面显示时刷新用户列表
    this.loadUserList(true)
  },

  // 加载用户列表
  async loadUserList(refresh = false) {
    if (refresh) {
      this.setData({
        currentPage: 1,
        hasMore: true,
        userList: []
      })
    }

    if (!this.data.hasMore || this.data.loading) return

    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()
      const _ = db.command
      
      // 构建查询条件
      let query = {}
      
      // 按用户类型筛选
      if (this.data.currentType !== 'all') {
        query.userType = this.data.currentType
      }
      
      // 按关键词搜索
      if (this.data.searchKeyword) {
        // 支持按姓名或手机号搜索
        query = _.or([
          {
            realName: db.RegExp({
              regexp: this.data.searchKeyword,
              options: 'i'
            })
          },
          {
            phoneNumber: db.RegExp({
              regexp: this.data.searchKeyword,
              options: 'i'
            })
          }
        ])
      }

      const userRes = await db.collection('users')
        .where(query)
        .skip((this.data.currentPage - 1) * this.data.pageSize)
        .limit(this.data.pageSize)
        .orderBy('createTime', 'desc')
        .get()

      // 处理用户数据
      const newUsers = userRes.data.map(user => ({
        ...user,
        createTime: user.createTime ? new Date(user.createTime).toLocaleString() : '未知',
        userTypeText: user.userType === 'patient' ? '患者' : 
                      user.userType === 'escort' ? '陪护' : 
                      user.userType === 'admin' ? '管理员' : '未知',
        status: user.status || 'inactive'  // 确保status字段存在，默认为inactive
      }))

      this.setData({
        userList: [...this.data.userList, ...newUsers],
        currentPage: this.data.currentPage + 1,
        hasMore: newUsers.length === this.data.pageSize,
        loading: false
      })
    } catch (error) {
      console.error('获取用户列表失败：', error)
      wx.showToast({
        title: '获取用户列表失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 切换用户类型筛选
  changeUserType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ currentType: type })
    this.loadUserList(true)
  },

  // 搜索用户
  searchUser(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
    this.loadUserList(true)
  },

  // 清除搜索
  clearSearch() {
    this.setData({
      searchKeyword: ''
    })
    this.loadUserList(true)
  },

  // 查看用户详情
  viewUserDetail(e) {
    const userId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/admin/user-management/detail/index?id=${userId}`
    })
  },

  // 切换用户角色
  async changeUserRole(e) {
    const userId = e.currentTarget.dataset.id
    const index = e.detail.value
    const newUserType = this.data.userTypes[index].value

    try {
      const db = wx.cloud.database()
      await db.collection('users').doc(userId).update({
        data: {
          userType: newUserType,
          updateTime: db.serverDate()
        }
      })

      // 更新本地列表数据
      const userList = this.data.userList.map(user => {
        if (user._id === userId) {
          return {
            ...user,
            userType: newUserType,
            userTypeText: newUserType === 'patient' ? '患者' :
                         newUserType === 'escort' ? '陪护' :
                         newUserType === 'admin' ? '管理员' : '未知'
          }
        }
        return user
      })

      this.setData({ userList })
      wx.showToast({
        title: '角色更新成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('更新用户角色失败：', error)
      wx.showToast({
        title: '更新失败，请重试',
        icon: 'none'
      })
    }
  },

  // 切换用户状态
  async toggleUserStatus(e) {
    const userId = e.currentTarget.dataset.id
    const userName = e.currentTarget.dataset.name
    const newStatus = e.detail.value ? 'active' : 'inactive'

    try {
      const db = wx.cloud.database()
      await db.collection('users').doc(userId).update({
        data: {
          status: newStatus,
          updateTime: new Date()
        }
      })

      // 更新本地列表数据
      const userList = this.data.userList.map(user => {
        if (user._id === userId) {
          return {
            ...user,
            status: newStatus
          }
        }
        return user
      })

      this.setData({ userList })
      wx.showToast({
        title: newStatus === 'active' ? '已启用' : '已禁用',
        icon: 'success'
      })
    } catch (error) {
      console.error('更新用户状态失败：', error)
      wx.showToast({
        title: '更新失败，请重试',
        icon: 'none'
      })
    }
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})