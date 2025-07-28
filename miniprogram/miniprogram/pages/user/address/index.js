const app = getApp()

Page({
  data: {
    addresses: [],
    loading: false
  },

  onShow() {
    this.loadAddresses()
  },

  // 加载地址列表
  async loadAddresses() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'update-address',
        data: {
          action: 'list'
        }
      })
      if (res.result.code === 0) {
        this.setData({ addresses: res.result.data })
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

  // 跳转到添加地址页面
  goToAddAddress() {
    wx.navigateTo({
      url: '/pages/user/address/edit/index'
    })
  },

  // 跳转到编辑地址页面
  goToEditAddress(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/user/address/edit/index?id=${id}`
    })
  },

  // 删除地址
  async deleteAddress(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '提示',
      content: '确定要删除这个地址吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const res = await wx.cloud.callFunction({
              name: 'update-address',
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
              this.loadAddresses()
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

  // 设置默认地址
  async setDefaultAddress(e) {
    const { id } = e.currentTarget.dataset
    try {
      const res = await wx.cloud.callFunction({
        name: 'update-address',
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
        this.loadAddresses()
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