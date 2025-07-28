const app = getApp()

Page({
  data: {
    agreed: false,
    loading: false,  // 添加加载状态
    retryCount: 0   // 添加重试计数
  },

  // 同意协议变化
  onAgreementChange(e) {
    const agreed = e.detail.value && e.detail.value.length > 0
    this.setData({ agreed })
    console.log('协议同意状态:', agreed)
  },

  getUserProfile: function() {
    if (!this.data.agreed) {
      wx.showModal({
        title: '提示',
        content: '请先阅读并同意相关协议',
        showCancel: false
      })
      return
    }

    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    wx.showLoading({
      title: '获取用户信息中',
      mask: true
    })

    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        console.log('获取用户信息成功:', res.userInfo)
        this.setData({
          wxUserInfo: res.userInfo,
          loading: false
        })
      },
      fail: (err) => {
        console.log('获取用户信息失败:', err)
        this.setData({ 
          loading: false,
          retryCount: this.data.retryCount + 1
        })
        
        if (this.data.retryCount < 3) {
          wx.showToast({
            title: '获取用户信息失败，请重试',
            icon: 'none'
          })
        } else {
          wx.showToast({
            title: '授权失败次数过多，请稍后再试',
            icon: 'none'
          })
          this.setData({ retryCount: 0 })
        }
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  handleLogin: function(e) {
    if (!this.data.agreed) {
      wx.showModal({
        title: '提示',
        content: '请先阅读并同意相关协议',
        showCancel: false
      })
      return
    }

    if (this.data.loading) {
      return
    }

    // 检查手机号授权结果
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({
        title: '需要授权手机号才能登录',
        icon: 'none'
      })
      return
    }

    this.setData({ 
      loading: true,
      phoneCode: e.detail.code
    })

    // 执行登录
    this.doLogin()
  },

  doLogin() {
    const { wxUserInfo, phoneCode } = this.data

    wx.cloud.callFunction({
      name: 'login',
      data: {
        wxUserInfo,
        phoneCode
      },
      success: (res) => {
        if (res.result.code === 0) {
          const userInfo = res.result.data
          const token = res.result.token
          
          // 处理用户头像
          if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
            // 保存用户信息（包含cloud://路径）
            wx.setStorageSync('userInfo', userInfo)
            
            // 获取临时访问链接
            wx.cloud.getTempFileURL({
              fileList: [userInfo.avatarUrl],
              success: res => {
                if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
                  // 使用临时链接下载头像
                  wx.downloadFile({
                    url: res.fileList[0].tempFileURL,
                    success: downloadRes => {
                      if (downloadRes.statusCode === 200) {
                        // 仅更新页面显示，不更新Storage中的数据
                        this.setData({
                          'userInfo.tempAvatarUrl': downloadRes.tempFilePath
                        })
                      } else {
                        console.error('下载头像失败, 状态码:', downloadRes.statusCode)
                        this.setData({
                          'userInfo.tempAvatarUrl': '/images/女孩头像.png'
                        })
                      }
                    },
                    fail: err => {
                      console.error('下载头像失败:', err)
                      this.setData({
                        'userInfo.tempAvatarUrl': '/images/女孩头像.png'
                      })
                    }
                  })
                } else {
                  console.error('获取临时链接失败')
                  this.setData({
                    'userInfo.tempAvatarUrl': '/images/女孩头像.png'
                  })
                }
              },
              fail: err => {
                console.error('获取头像临时链接失败:', err)
                this.setData({
                  'userInfo.tempAvatarUrl': '/images/女孩头像.png'
                })
              }
            })
          } else {
            // 如果没有头像或不是云存储路径，直接保存用户信息
            wx.setStorageSync('userInfo', userInfo)
          }
          
          // 保存token信息（只保存一次）
          const tokenData = {
            value: token,
            expireTime: Date.now() + 180 * 24 * 60 * 60 * 1000, // token有效期180天
            openid: res.result.openid // 添加openid到token信息中
          }
          
          // 更新全局数据
          app.globalData.userInfo = userInfo
          app.globalData.userType = userInfo.userType
          app.globalData.isLogin = true
          app.globalData.openid = res.result.openid // 设置全局openid
          
          // 保存token并跳转页面
          wx.setStorage({
            key: 'token',
            data: tokenData,
            success: () => {
              // 所有用户类型都跳转到同一个用户页面
              wx.switchTab({
                url: '/pages/user/index',
                fail: (err) => {
                  console.error('跳转失败:', err)
                  // 如果跳转失败，尝试使用redirectTo
                  wx.redirectTo({
                    url: '/pages/user/index',
                    fail: (redirectErr) => {
                      console.error('重定向失败:', redirectErr)
                      wx.showToast({
                        title: '页面跳转失败',
                        icon: 'none'
                      })
                    }
                  })
                }
              })
            }
          })
        } else {
          wx.showToast({
            title: res.result.message || '登录失败，请重试',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        })
      },
      complete: () => {
        this.setData({ 
          loading: false,
          retryCount: 0
        })
      }
    })
  }
})