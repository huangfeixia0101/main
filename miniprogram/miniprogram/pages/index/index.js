const app = getApp()

Page({
  data: {
    // 用户信息
    userInfo: null,
    hasUserInfo: false
  },

  onLoad(options) {
    // 检查用户是否已登录
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
    }
    
    // 处理从优惠券页面传递过来的couponId参数
    if (options && options.couponId) {
      // 存储优惠券ID到全局数据
      app.globalData.selectedCouponId = options.couponId
      
      // 提示用户已选择优惠券
      wx.showToast({
        title: '已选择优惠券',
        icon: 'none',
        duration: 2000
      })
    }
  },

  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      })
    }
  },

  // 功能模块点击处理
  onFeatureTap(e) {
    const feature = e.currentTarget.dataset.feature
    
    // 根据不同功能模块进行不同处理
    switch (feature) {
      case 'period': // 月经记录
        wx.navigateTo({
          url: '/pages/period-tracker/index'
        })
        break
        

      case 'doctor': // 腾讯健康问医生
        this.onDoctorConsultation()
        break
        
      case 'female': // 女性专栏
        wx.showToast({
          title: '女性专栏功能即将上线',
          icon: 'none'
        })
        break
        
      case 'mall': // 健康商城
        wx.navigateTo({
          url: '/pages/services/index'
        })
        break
        
      case 'services': // 更多功能 - 跳转到服务页
        wx.switchTab({
          url: '/pages/services/index'
        })
        break
        
      default:
        break
    }
  },
  
  // 获取用户信息
  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        app.globalData.userInfo = res.userInfo
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
      }
    })
  },

  // 分享给朋友
  onShareAppMessage() {
    const app = getApp()
    return app.globalData.shareInfo
  },

  // 分享到朋友圈
  onShareTimeline() {
    const app = getApp()
    return app.globalData.shareInfo
  },

  // 智能医生匹配
  openDoctorMatching() {
    wx.navigateTo({
      url: '/pages/doctor-chat/index'
    })
  },

  // 智能医生匹配Pro
  openDoctorMatchingPro() {
    wx.navigateTo({
      url: '/pages/doctor-chat/index?isPro=true'
    })
  },

  // 咨询医生点击处理
  onDoctorConsultation: function() {
    // 获取用户提供的腾讯健康小程序链接
    const miniProgramLink = '#小程序://腾讯健康/4yU7SfdqKK2AuIv';
    
    // 尝试直接跳转到腾讯健康小程序
    wx.navigateToMiniProgram({ 
      appId: 'wxb032bc789053daf4', // 确认腾讯健康的正确AppID
      path: 'wenzhen/pages/doctor/index/main?adtag=10030015&doctorId=1617559963&th_share_src=13923835&partnerId=100000058', // 目标页面路径 
      // 可选参数： 
      extraData: { 
        from: 'h-care', // 自定义参数，供腾讯健康小程序接收处理 
        userId: this.data.userInfo ? this.data.userInfo._id : ''
      },
      // 打开正式版本
      envVersion: 'release',
      success: function(res) { 
        console.log('跳转成功'); 
        // 跳转成功后的逻辑（如记录用户行为） 
      }, 
      fail: function(res) { 
        console.error('跳转失败:', res.errMsg); 
        // 如果跳转失败，使用小程序链接方式
        wx.setClipboardData({
          data: miniProgramLink,
          success: function() {
            wx.showModal({
              title: '咨询医生',
              content: '已为您复制腾讯健康小程序链接！\n\n请在微信聊天窗口粘贴发送，点击链接即可打开腾讯健康小程序进行医生咨询。',
              showCancel: false,
              confirmText: '知道了'
            });
          },
          fail: function() {
            wx.showModal({
              title: '咨询医生',
              content: '请手动复制以下小程序链接：\n\n' + miniProgramLink + '\n\n在微信聊天窗口粘贴发送，点击即可打开腾讯健康小程序。',
              showCancel: false,
              confirmText: '知道了'
            });
          }
        });
      }
    });
  }
})