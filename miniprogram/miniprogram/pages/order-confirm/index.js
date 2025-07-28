const app = getApp();

Page({
  data: {
    serviceDetail: null,
    selectedSpec: '',
    quantity: 1,
    totalPrice: 0,
    patients: [],
    addresses: [],
    selectedPatient: null,
    selectedAddress: null,
    remark: '',
    loading: false
  },

  onLoad(options) {
    const { serviceId, spec, quantity, price } = options;
    this.setData({
      selectedSpec: spec,
      quantity: parseInt(quantity),
      totalPrice: price
    });
    this.loadServiceDetail(serviceId);
    this.loadPatients();
    this.loadAddresses();
  },

  onShow() {
    // 每次显示页面时重新加载地址和服务对象列表，确保数据最新
    this.loadPatients();
    this.loadAddresses();
  },

  // 加载服务详情
  async loadServiceDetail(serviceId) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getServiceDetail',
        data: { serviceId }
      });
      if (result.code === 200) {
        this.setData({ serviceDetail: result.data });
      } else {
        console.error('获取服务详情失败:', result.message);
        wx.showToast({
          title: result.message || '获取服务详情失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('获取服务详情失败:', error);
      wx.showToast({
        title: '获取服务详情失败',
        icon: 'none'
      });
    }
  },

  // 加载服务对象列表
  async loadPatients() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'update-patient',
        data: { action: 'list' }
      });
      if (result.code === 0) {
        this.setData({
          patients: result.data,
          selectedPatient: result.data.find(p => p.isDefault) || null
        });
      }
    } catch (error) {
      console.error('获取服务对象列表失败:', error);
      wx.showToast({
        title: '获取服务对象列表失败',
        icon: 'none'
      });
    }
  },

  // 加载地址列表
  async loadAddresses() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'update-address',
        data: { action: 'list' }
      });
      if (result.code === 0) {
        this.setData({
          addresses: result.data,
          selectedAddress: result.data.find(a => a.isDefault) || null
        });
      }
    } catch (error) {
      console.error('获取地址列表失败:', error);
      wx.showToast({
        title: '获取地址列表失败',
        icon: 'none'
      });
    }
  },

  // 选择服务对象
  handleSelectPatient(e) {
    const { patient } = e.currentTarget.dataset;
    this.setData({ selectedPatient: patient });
  },

  // 选择地址
  handleSelectAddress(e) {
    const { address } = e.currentTarget.dataset;
    this.setData({ selectedAddress: address });
  },

  // 添加服务对象
  handleAddPatient() {
    wx.navigateTo({
      url: '/pages/user/patient/edit/index'
    });
  },

  // 添加地址
  handleAddAddress() {
    wx.navigateTo({
      url: '/pages/user/address/edit/index'
    });
  },

  // 更新备注
  handleRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 提交订单
  async handleSubmit() {
    if (!this.data.selectedPatient) {
      wx.showToast({
        title: '请选择服务对象',
        icon: 'none'
      });
      return;
    }

    if (!this.data.selectedAddress) {
      wx.showToast({
        title: '请选择地址',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'createOrder',
        data: {
          serviceId: this.data.serviceDetail._id,
          serviceName: this.data.serviceDetail.name,
          price: parseFloat(this.data.totalPrice),
          spec: this.data.selectedSpec,
          quantity: this.data.quantity,
          patientId: this.data.selectedPatient.patientId,
          addressId: this.data.selectedAddress.addressId,
          remark: this.data.remark
        }
      });

      if (result.code === 0 && result.data._id) {
        wx.navigateTo({
          url: `/pages/payment/index?orderId=${result.data._id}`
        });
      } else {
        wx.showToast({
          title: result.message || '创建订单失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('创建订单失败:', error);
      wx.showToast({
        title: '创建订单失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});