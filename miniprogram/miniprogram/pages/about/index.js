Page({
  data: {
    companyInfo: {
      name: '健康管理服务平台',
      logo: '/images/logo.png',
      description: '我们是一家专注于提供高质量医疗陪护和健康服务的平台，致力于为您提供便捷、专业、贴心的健康管理服务。',
      vision: '让每一位贵宾都能获得专业、温暖的健康管理服务',
      mission: '通过科技创新，提升健康管理服务的质量和效率，为您提供更好的健康体验。'
    },
    teamInfo: {
      title: '我们的团队',
      description: '我们拥有一支专业、富有爱心的团队，包括医疗专家、护理人员和客服团队，为您提供全方位的服务支持。'
    },
    serviceFeatures: [
      {
        icon: '/images/专业.png',
        title: '专业服务',
        description: '所有陪护人员均经过专业培训和严格筛选'
      },
      {
        icon: '/images/准时.png',
        title: '准时可靠',
        description: '服务准时到达，全程专业陪护'
      },
      {
        icon: '/images/安全.png',
        title: '安全保障',
        description: '服务全程保险覆盖，保障您的权益'
      },
      {
        icon: '/images/隐私.png',
        title: '隐私保护',
        description: '严格保护用户隐私和个人信息'
      }
    ],
    contactInfo: {
      phone: '400-123-4567',
      email: 'service@h-care.com',
      address: '杭州市上城区健康大厦1001室',
      wechat: 'h-care-service'
    },
    version: '1.0.0'
  },

  onLoad() {
    // 页面加载时可以执行一些初始化操作
  },

  // 复制联系方式
  copyText(e) {
    const text = e.currentTarget.dataset.text;
    wx.setClipboardData({
      data: text,
      success() {
        wx.showToast({
          title: '复制成功',
          icon: 'success'
        });
      }
    });
  },

  // 拨打电话
  callPhone() {
    wx.makePhoneCall({
      phoneNumber: this.data.contactInfo.phone,
      fail() {
        wx.showToast({
          title: '拨打电话失败',
          icon: 'none'
        });
      }
    });
  },

  // 查看用户协议
  viewUserAgreement() {
    wx.navigateTo({
      url: '/pages/agreement/index'
    });
  },

  // 查看隐私政策
  viewPrivacyPolicy() {
    wx.navigateTo({
      url: '/pages/privacy/index'
    });
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
  }
});