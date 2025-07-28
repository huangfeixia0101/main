// pages/user/edit-profile/index.js
Page({
  data: {
    userInfo: null,
    genderOptions: ['男', '女'],
    selectedDate: ''
  },

  onLoad(options) {
    console.log('页面加载参数:', options)
    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo')
    console.log('从Storage获取的用户信息:', userInfo)
    if (userInfo) {
      console.log('用户头像URL:', userInfo.avatarUrl)
      // 处理头像URL
      if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        // 如果是云存储文件，则下载到本地
        wx.cloud.downloadFile({
          fileID: userInfo.avatarUrl,
          success: res => {
            userInfo.avatarUrl = res.tempFilePath
            this.setData({
              userInfo: userInfo,
              selectedDate: userInfo.birthday || ''
            })
          }
        })
      } else {
        this.setData({
          userInfo: userInfo,
          selectedDate: userInfo.birthday || ''
        })
      }
    }
  },
  onGenderChange(e) {
    this.setData({
      'userInfo.gender': this.data.genderOptions[e.detail.value]
    })
  },

  // 选择生日
  onDateChange(e) {
    this.setData({
      selectedDate: e.detail.value,
      'userInfo.birthday': e.detail.value
    })
  },

  // 选择头像
  chooseAvatar(e) {
    console.log('选择头像返回结果:', e.detail)
    const { avatarUrl } = e.detail
    if (!avatarUrl) {
      wx.showToast({
        title: '获取头像失败',
        icon: 'none'
      })
      return
    }

    // 先将临时头像显示在页面上
    this.setData({
      'userInfo.tempAvatarUrl': avatarUrl
    })
    
    // 将临时文件上传到云存储
    wx.cloud.uploadFile({
      cloudPath: `avatars/${Date.now()}.png`,
      filePath: avatarUrl,
      success: res => {
        console.log('头像上传成功，fileID:', res.fileID)
        // 更新用户信息中的头像URL为云存储fileID
        this.setData({
          'userInfo.avatarUrl': res.fileID
        })
      },
      fail: err => {
        console.error('头像上传失败:', err)
        // 上传失败时仍然使用临时路径
        this.setData({
          'userInfo.avatarUrl': avatarUrl
        })
      }
    })
  },
  // 保存信息
  async saveProfile() {
    const { userInfo } = this.data
    console.log('准备保存的用户信息:', userInfo)
    if (!userInfo.realName) {
      wx.showToast({
        title: '请输入姓名',
        icon: 'none'
      })
      return
    }

    try {
      // 调用云函数更新用户信息
      const result = await wx.cloud.callFunction({
        name: 'update-user-profile',
        data: {
          userInfo: {
            avatarUrl: userInfo.avatarUrl,
            realName: userInfo.realName,
            gender: userInfo.gender,
            birthday: userInfo.birthday
          }
        }
      })

      if (result.result.code === 0) {
        console.log('云函数返回结果:', result.result)
        // 更新本地存储
        wx.setStorageSync('userInfo', userInfo)
        console.log('更新Storage后的用户信息:', userInfo)
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        // 返回上一页
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(result.result.message)
      }
    } catch (error) {
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      })
    }
  },
  onNameInput(e) {
    this.setData({
      'userInfo.realName': e.detail.value
    })
  }
})