// app.js
App({
  async onLaunch() {
    console.log('小程序启动');
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      await wx.cloud.init({
        env: 'h-care-5gggrsj59b495ec9', 
        traceUser: true
      })
    }

    // 检查登录状态和token有效性
    await this.checkLoginStatus()

    // 使用兼容性更好的API获取系统信息
    try {
      // 使用新的API获取系统信息
      const systemInfo = {
        ...wx.getAppBaseInfo(),
        ...wx.getSystemSetting(),
        ...wx.getDeviceInfo(),
        ...wx.getWindowInfo()
      };
      this.globalData.systemInfo = systemInfo;
    } catch (error) {
      console.error('获取系统信息失败：', error);
    }
  },
  
  async checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    const tokenInfo = wx.getStorageSync('token')

    // 先设置默认状态
    this.globalData.userInfo = null
    this.globalData.isLogin = false
    this.globalData.userType = null
    this.globalData.openid = null
    this.globalData.accessToken = null

    if (userInfo && tokenInfo) {
      // 检查token是否过期
      const now = Date.now()
      if (now < tokenInfo.expireTime && tokenInfo.value) {
        // 添加微信登录态检查
        return new Promise((resolve) => {
          wx.checkSession({
            success: () => {
              // 微信登录态有效，设置登录状态
              console.log('微信登录态有效，设置登录状态')
              this.globalData.userInfo = userInfo
              this.globalData.isLogin = true
              this.globalData.userType = userInfo.userType
              this.globalData.openid = tokenInfo.openid
              this.globalData.accessToken = tokenInfo.value
              
              // 根据登录状态设置tabBar
              const isAdmin = this.globalData.userType === 'admin' ? true : false
              this.setTabBarByUserType(this.globalData.userType, isAdmin)
              resolve()
            },
            fail: () => {
              // 微信登录态失效，清除登录信息
              console.log('微信登录态失效，清除登录信息')
              wx.removeStorageSync('userInfo')
              wx.removeStorageSync('token')
              
              // 根据登录状态设置tabBar
              this.setTabBarByUserType(null, false)
              resolve()
            }
          })
        })
      } else {
        // token已过期或无效，清除登录信息
        console.log('自定义token已过期，清除登录信息')
        wx.removeStorageSync('userInfo')
        wx.removeStorageSync('token')
      }
    }

    // 根据登录状态设置tabBar
    const isAdmin = this.globalData.userType === 'admin' ? true : false
    this.setTabBarByUserType(this.globalData.userType, isAdmin)
  },

  globalData: {
    userInfo: null,
    isLogin: false,
    userType: null,
    openid: null,
    shareInfo: {
      title: 'AI医探 - 您的专业健康服务管家',
      path: '/pages/index/index',
      imageUrl: '/images/logo.png'
    }
  },

  setTabBarByUserType(userType, isAdmin) {
    // 由于微信小程序tabBar的限制，我们不能直接修改tabBar项的可见性
    // 现在我们使用同一个页面，根据用户角色显示不同内容
    
    // 显示更新后的tabBar
    wx.showTabBar();

    // 直接进行页面跳转，移除不必要的延时
    wx.switchTab({
      url: '/pages/user/index',
      fail: (err) => {
        console.error('跳转到用户页面失败:', err)
        // 如果跳转失败，尝试使用redirectTo
        wx.redirectTo({
          url: '/pages/user/index'
        })
      }
    });
  },

  // 全局分享配置
  onShareAppMessage() {
    return this.globalData.shareInfo
  },

  onShareTimeline() {
    return this.globalData.shareInfo
  }
})