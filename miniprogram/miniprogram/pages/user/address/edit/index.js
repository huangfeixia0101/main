const app = getApp()

Page({
  data: {
    id: null,
    address: {
      name: '',
      phone: '',
      province: '',
      city: '',
      district: '',
      address: '',
      isDefault: false
    },
    regions: [],
    loading: false,
    isEdit: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        id: options.id,
        isEdit: true
      })
      this.loadAddressDetail(options.id)
    }
  },

  // 加载地址详情
  async loadAddressDetail(id) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'update-address',
        data: { 
          action: 'detail',
          data: { id }
        }
      })
      if (res.result.code === 0) {
        const address = res.result.data
        this.setData({
          address,
          regions: [address.province, address.city, address.district]
        })
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

  // 输入框内容变化
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    this.setData({
      [`address.${field}`]: value
    })
  },

  // 地区选择器变化
  bindRegionChange(e) {
    const regions = e.detail.value
    this.setData({
      regions,
      'address.province': regions[0],
      'address.city': regions[1],
      'address.district': regions[2]
    })
  },

  // 默认地址开关变化
  onSwitchChange(e) {
    this.setData({
      'address.isDefault': e.detail.value
    })
  },

  // 保存地址
  async saveAddress() {
    const { address, id, isEdit } = this.data

    // 表单验证
    if (!address.name) {
      wx.showToast({
        title: '请输入收货人姓名',
        icon: 'none'
      })
      return
    }

    if (!address.phone) {
      wx.showToast({
        title: '请输入手机号码',
        icon: 'none'
      })
      return
    }

    // 简单的手机号验证
    if (!/^1\d{10}$/.test(address.phone)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none'
      })
      return
    }

    if (!address.province || !address.city || !address.district) {
      wx.showToast({
        title: '请选择所在地区',
        icon: 'none'
      })
      return
    }

    if (!address.address) {
      wx.showToast({
        title: '请输入详细地址',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    try {
      const action = isEdit ? 'update' : 'add'
      const addressData = { ...address }
      
      // 如果是新增地址，生成唯一的addressId
      if (!isEdit) {
        addressData.addressId = `addr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      
      const actionData = isEdit ? { id, address: addressData } : addressData

      const res = await wx.cloud.callFunction({
        name: 'update-address',
        data: {
          action,
          data: actionData
        }
      })

      if (res.result.code === 0) {
        wx.showToast({
          title: isEdit ? '修改成功' : '添加成功',
          icon: 'success'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({
          title: res.result.message || '保存失败',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})