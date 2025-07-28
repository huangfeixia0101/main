const app = getApp()

Page({
  data: {
    userInfo: null,
    isLogin: false,
    userType: null,
    isAdmin: false
  },

  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      })
    }
    
    // 每次页面显示时获取最新的用户信息
    const userInfo = wx.getStorageSync('userInfo')
    const isLogin = app.globalData.isLogin
    const userType = app.globalData.userType
    const isAdmin = userType === 'admin' ? true : false

    if (userInfo) {
      // 格式化手机号
      if (userInfo.phoneNumber) {
        userInfo.maskedPhoneNumber = this.maskPhoneNumber(userInfo.phoneNumber)
      }
      // 处理头像URL
      if (userInfo.tempAvatarUrl) {
        this.setData({ userInfo })
      } else if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        this.processAvatarUrl(userInfo)
      }
    }

    this.setData({
      userInfo,
      isLogin,
      userType,
      isAdmin
    })
  },

  // 处理云存储头像URL
  processAvatarUrl(userInfo) {
    wx.cloud.getTempFileURL({
      fileList: [userInfo.avatarUrl],
      success: res => {
        if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {  // 替换了可选链操作符
          wx.downloadFile({
            url: res.fileList[0].tempFileURL,
            success: downloadRes => {
              if (downloadRes.statusCode === 200) {
                userInfo.tempAvatarUrl = downloadRes.tempFilePath
                wx.setStorageSync('userInfo', userInfo)
                this.setData({ userInfo })
              } else {
                this.setDefaultAvatar(userInfo)
              }
            },
            fail: () => this.setDefaultAvatar(userInfo)
          })
        } else {
          this.setDefaultAvatar(userInfo)
        }
      },
      fail: () => this.setDefaultAvatar(userInfo)
    })
  },

  // 设置默认头像
  setDefaultAvatar(userInfo) {
    userInfo.tempAvatarUrl = '/images/avatar.png'
    this.setData({ userInfo })
  },

  // 手机号码加密显示
  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber) return ''
    return phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
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

  // 跳转到全部订单页面
  goToAllOrders() {
    if (this.data.userType === 'escort') {
      // 由于switchTab不支持直接传参，先保存状态
      wx.setStorageSync('orderListStatus', 'IN_SERVICE')
      wx.switchTab({
        url: '/pages/orders/list/index'
      })
    } else {
      // 清除可能存在的状态
      wx.removeStorageSync('orderListStatus')
      wx.switchTab({
        url: '/pages/orders/list/index'
      })
    }
  },

  // 跳转到待支付订单页面
  goToUnpaidOrders() {
    // 由于switchTab不支持直接传参，先保存状态
    wx.setStorageSync('orderListStatus', 'UNPAID')
    wx.switchTab({
      url: '/pages/orders/list/index'
    })
  },

  // 跳转到进行中订单页面
  goToInServiceOrders() {
    // 由于switchTab不支持直接传参，先保存状态
    wx.setStorageSync('orderListStatus', 'IN_SERVICE')
    wx.switchTab({
      url: '/pages/orders/list/index'
    })
  },

  // 跳转到已完成订单页面
  goToCompletedOrders() {
    // 由于switchTab不支持直接传参，先保存状态
    wx.setStorageSync('orderListStatus', 'COMPLETED')
    wx.switchTab({
      url: '/pages/orders/list/index'
    })
  },

  // 陪护人员跳转到新订单（待接单）页面
  goToNewOrders() {
    // 由于switchTab不支持直接传参，先保存状态
    wx.setStorageSync('orderListStatus', 'PAID')
    wx.switchTab({
      url: '/pages/orders/list/index'
    })
  },

  // 联系客服
  contactCustomerService() {
    // 微信开放能力会处理
  },

  // 跳转到优惠券页面
  navigateToCoupons() {
    wx.navigateTo({
      url: '/pages/user/coupons/index'
    })
  },
  
  // 跳转到积分中心页面
  navigateToPoints() {
    wx.navigateTo({
      url: '/pages/points/index'
    })
  },
  
  // 跳转到兑换页面
  navigateToRedeem() {
    wx.navigateTo({
      url: '/pages/user/redeem/index'
    })
  },
  
  // 跳转到地址管理页面
  goToAddressManage() {
    wx.navigateTo({
      url: '/pages/user/address/index'
    })
  },
  
  // 跳转到服务对象管理页面
  goToPatientManage() {
    wx.navigateTo({
      url: '/pages/user/patient/list/index'
    })
  },
  
  // 跳转到关于我们页面
  goToAboutUs() {
    wx.navigateTo({
      url: '/pages/about/index'
    })
  },
  
  // 跳转到服务评价页面
  navigateToRatings() {
    wx.navigateTo({
      url: '/pages/user/ratings/index'
    })
  },
  
  // 跳转到收益统计页面
  navigateToEarnings() {
    wx.navigateTo({
      url: '/pages/user/earnings/index'
    })
  },
  
  // 管理员功能 - 跳转到用户管理页面
  goToUserManagement() {
    wx.navigateTo({
      url: '/pages/admin/user-management/index'
    })
  },
  
  // 管理员功能 - 跳转到订单管理页面
  goToOrderManagement() {
    wx.navigateTo({
      url: '/pages/admin/order-management/index'
    })
  },
  
  // 管理员功能 - 跳转到服务管理页面
  goToServiceManagement() {
    wx.navigateTo({
      url: '/pages/admin/service-management/index'
    })
  },
  
  // 管理员功能 - 跳转到数据统计页面
  goToStatistics() {
    wx.navigateTo({
      url: '/pages/admin/statistics/index'
    })
  },
  
  // 管理员功能 - 跳转到额外薪酬管理页面
  goToExtraEarnings() {
    wx.navigateTo({
      url: '/pages/admin/extra-earnings/index'
    })
  },
  
  // 退出登录
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除用户信息和登录状态
          wx.removeStorageSync('userInfo')
          wx.removeStorageSync('token')
          app.globalData.isLogin = false
          app.globalData.userInfo = null
          app.globalData.userType = null
          
          // 更新页面状态
          this.setData({
            userInfo: null,
            isLogin: false,
            userType: null,
            isAdmin: false
          })
          
          // 提示用户
          wx.showToast({
            title: '已退出登录',
            icon: 'success',
            duration: 2000
          })
          
          // 跳转到登录页面
          setTimeout(() => {
            wx.navigateTo({
              url: '/pages/login/index'
            })
          }, 1000)
        }
      }
    })
  }
})