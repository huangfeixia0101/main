// pages/user/patient/index.js
Page({
  data: {
    userInfo: null,
    isLogin: false
  },

  onLoad(options) {
    this.getUserInfo()
  },

  onShow() {
    // 每次显示页面时检查登录状态
    this.getUserInfo()
  },

  getUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    console.log('从Storage获取的用户信息:', userInfo)
    if (userInfo) {
      console.log('用户头像URL:', userInfo.avatarUrl)
      // 格式化手机号
      if (userInfo.phoneNumber) {
        userInfo.maskedPhoneNumber = this.maskPhoneNumber(userInfo.phoneNumber)
      }
      // 处理头像URL
      if (userInfo.tempAvatarUrl) {
        // 如果有临时头像URL，优先使用
        this.setData({
          userInfo: userInfo
        })
      } else if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        // 如果是云存储文件，先获取临时访问链接
        wx.cloud.getTempFileURL({
          fileList: [userInfo.avatarUrl],
          success: res => {
            if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
              // 使用临时链接下载头像
              wx.downloadFile({
                url: res.fileList[0].tempFileURL,
                success: downloadRes => {
                  if (downloadRes.statusCode === 200) {
                    userInfo.tempAvatarUrl = downloadRes.tempFilePath
                    wx.setStorageSync('userInfo', userInfo)
                    this.setData({
                      userInfo: userInfo
                    })
                  } else {
                    console.error('下载头像失败, 状态码:', downloadRes.statusCode)
                    userInfo.tempAvatarUrl = '/images/女孩头像.png'
                    this.setData({
                      userInfo: userInfo
                    })
                  }
                },
                fail: err => {
                  console.error('下载头像失败:', err)
                  userInfo.tempAvatarUrl = '/images/女孩头像.png'
                  this.setData({
                    userInfo: userInfo
                  })
                }
              })
            } else {
              // 获取临时链接失败，使用默认头像
              userInfo.tempAvatarUrl = '/images/女孩头像.png'
              this.setData({
                userInfo: userInfo
              })
            }
          },
          fail: err => {
            console.error('获取头像临时链接失败:', err)
            // 使用默认头像
            userInfo.tempAvatarUrl = '/images/女孩头像.png'
            this.setData({
              userInfo: userInfo
            })
          }
        })
      }
      this.setData({
        userInfo: userInfo,
        isLogin: true
      })
      console.log('页面数据设置后的状态:', this.data)
    }
  },

  // 手机号码加密显示
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber) return ''
    return phoneNumber.replace(/(d{3})d{4}(d{4})/, '$1****$2')
  },

  // 跳转到登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/index'
    })
  },

  // 跳转到编辑资料页面
  goToEditProfile() {
    wx.navigateTo({
      url: '/pages/user/edit-profile/index'
    })
  },

  // 跳转到待支付订单
  goToUnpaidOrders() {
    wx.switchTab({
      url: '/pages/orders/list/index?status=UNPAID'
    })
  },

  // 跳转到进行中订单
  goToInServiceOrders() {
    wx.switchTab({
      url: '/pages/orders/list/index?status=IN_SERVICE'
    })
  },

  // 跳转到已完成订单
  goToCompletedOrders() {
    wx.switchTab({
      url: '/pages/orders/list/index?status=COMPLETED'
    })
  },

  // 跳转到全部订单
  goToAllOrders() {
    wx.switchTab({
      url: '/pages/orders/list/index'
    })
  },

  // 地址管理
  goToAddressManage() {
    wx.navigateTo({
      url: '/pages/user/address/index'
    })
  },

  // 服务对象管理
  goToPatientManage() {
    wx.navigateTo({
      url: '/pages/user/patient/list/index'
    })
  },

  // 客服咨询
  contactCustomerService() {
    wx.showToast({
      title: '正在连接客服...',
      icon: 'loading',
      duration: 1000
    })
  },

  // 关于我们
  goToAboutUs() {
    wx.navigateTo({
      url: '/pages/about/index'
    })
  },

  // 优惠券
  navigateToCoupons() {
    wx.navigateTo({
      url: '/pages/user/coupons/index'
    })
  },

  // 兑换
  navigateToExchange() {
    wx.navigateTo({
      url: '/pages/user/exchange/index'
    })
  },

  // 拨打客服电话
  callService() {
    wx.makePhoneCall({
      phoneNumber: '400-828-7222'
    })
  }
})