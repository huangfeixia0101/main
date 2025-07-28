const app = getApp()

Page({
  data: {
    patients: [],
    loading: false
  },

  onShow() {
    this.loadPatients()
  },

  // 加载服务对象列表
  async loadPatients() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'update-patient',
        data: {
          action: 'list'
        }
      })
      if (res.result.code === 0) {
        this.setData({ patients: res.result.data })
      } else {
        wx.showToast({
          title: res.result.message || '加载失败',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 跳转到添加服务对象页面
  goToAddPatient() {
    wx.navigateTo({
      url: '/pages/user/patient/edit/index'
    })
  },

  // 跳转到编辑服务对象页面
  goToEditPatient(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/user/patient/edit/index?id=${id}`
    })
  },

  // 删除服务对象
  async deletePatient(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '提示',
      content: '确定要删除这个服务对象吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const res = await wx.cloud.callFunction({
              name: 'update-patient',
              data: { 
                action: 'delete',
                data: { id }
              }
            })
            if (res.result.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              })
              this.loadPatients()
            } else {
              wx.showToast({
                title: res.result.message || '删除失败',
                icon: 'none'
              })
            }
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 设置默认服务对象
  async setDefaultPatient(e) {
    const { id } = e.currentTarget.dataset
    try {
      const res = await wx.cloud.callFunction({
        name: 'update-patient',
        data: { 
          action: 'setDefault',
          data: { id }
        }
      })
      if (res.result.code === 0) {
        wx.showToast({
          title: '设置成功',
          icon: 'success'
        })
        this.loadPatients()
      } else {
        wx.showToast({
          title: res.result.message || '设置失败',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      })
    }
  }
})