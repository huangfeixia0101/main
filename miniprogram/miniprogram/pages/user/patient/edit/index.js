const app = getApp()

Page({
  data: {
    id: null,
    patient: {
      name: '',
      gender: 'male',
      age: '',
      idCard: '',
      phone: '',
      relation: '',
      isDefault: false
    },
    loading: false,
    isEdit: false,
    relations: ['本人', '父母', '子女', '配偶', '其他']
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        id: options.id,
        isEdit: true
      })
      this.loadPatientDetail(options.id)
    }
  },

  // 加载服务对象详情
  async loadPatientDetail(id) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'update-patient',
        data: { 
          action: 'detail',
          data: { id }
        }
      })
      if (res.result.code === 0) {
        this.setData({
          patient: res.result.data
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
      [`patient.${field}`]: value
    })
  },

  // 性别选择变化
  onGenderChange(e) {
    this.setData({
      'patient.gender': e.detail.value
    })
  },

  // 关系选择变化
  onRelationChange(e) {
    this.setData({
      'patient.relation': this.data.relations[e.detail.value]
    })
  },

  // 默认服务对象开关变化
  onSwitchChange(e) {
    this.setData({
      'patient.isDefault': e.detail.value
    })
  },

  // 验证身份证号
  validateIdCard(idCard) {
    const idCardReg = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/
    return idCardReg.test(idCard)
  },

  // 验证手机号
  validatePhone(phone) {
    const phoneReg = /^1[3-9]\d{9}$/
    return phoneReg.test(phone)
  },

  // 保存服务对象
  async savePatient() {
    const { patient, id, isEdit } = this.data

    // 表单验证
    if (!patient.name) {
      wx.showToast({
        title: '请输入服务对象姓名',
        icon: 'none'
      })
      return
    }

    if (!patient.relation) {
      wx.showToast({
        title: '请选择与服务对象关系',
        icon: 'none'
      })
      return
    }

    if (patient.idCard && !this.validateIdCard(patient.idCard)) {
      wx.showToast({
        title: '请输入正确的身份证号',
        icon: 'none'
      })
      return
    }

    if (patient.phone && !this.validatePhone(patient.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'update-patient',
        data: {
          action: isEdit ? 'update' : 'add',
          data: isEdit ? { id, patient } : patient
        }
      })

      if (res.result.code === 0) {
        wx.showToast({
          title: isEdit ? '更新成功' : '添加成功',
          icon: 'success'
        })
        wx.navigateBack()
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