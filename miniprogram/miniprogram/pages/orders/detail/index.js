// pages/orders/detail/index.js
const app = getApp()

Page({
  data: {
    orderId: '',
    orderInfo: null,
    userType: '',
    orderStatus: {
      UNPAID: 'UNPAID',
      PAID: 'PAID',
      IN_SERVICE: 'IN_SERVICE',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED'
    },
    statusText: {
      UNPAID: '待支付',
      PAID: '待接单',
      IN_SERVICE: '服务中',
      COMPLETED: '已完成',
      CANCELLED: '已取消'
    },
    isPatient: false,
    isEscort: false,
    evaluation: null
  },

  onLoad(options) {
    // 检查登录状态
    if (!app.globalData.isLogin) {
      wx.navigateTo({
        url: '/pages/login/index'
      })
      return
    }

    if (options.id) {
      this.setData({
        orderId: options.id
      })
      // 设置用户类型
      this.setData({
        userType: app.globalData.userType,
        isPatient: app.globalData.userType === 'patient',
        isEscort: app.globalData.userType === 'escort'
      })
      this.getOrderDetail()
    }
  },
  onShow() {
    // 检查登录状态
    if (!app.globalData.isLogin) {
      wx.navigateTo({
        url: '/pages/login/index'
      })
      return
    }

    // 每次显示页面时更新用户类型
    this.setData({
      userType: app.globalData.userType,
      isPatient: app.globalData.userType === 'patient',
      isEscort: app.globalData.userType === 'escort'
    })
    if (this.data.orderId) {
      this.getOrderDetail()
    }
  },
  async getOrderDetail() {
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('ai_orders').doc(this.data.orderId).get()
      
      if (data) {
        // 转换时间格式
        const formatTime = (timestamp) => {
          if (!timestamp) return '';
          return new Date(timestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        };

        data.createTime = formatTime(data.createTime);
        data.payTime = formatTime(data.payTime);
        data.completeTime = formatTime(data.completeTime);

        // 获取患者信息
        if (data.patientId) {
          try {
            const patientResult = await db.collection('patients').where({patientId:data.patientId}).get();
            if (patientResult.data) {
              data.patientInfo = patientResult.data;
            }
          } catch (error) {
            console.error('获取患者信息失败：', error);
          }
        }

        // 获取地址信息
        if (data.addressId) {
          try {
            const addressResult = await db.collection('addresses').where({addressId:data.addressId}).get();
            if (addressResult.data) {
              data.addressInfo = addressResult.data;
            }
          } catch (error) {
            console.error('获取地址信息失败：', error);
          }
        }
        this.setData({
          orderInfo: data
        });
        
        // 如果订单已完成，获取评价信息，无论是否已评价
        if (data.status === 'COMPLETED') {
          this.getEvaluation();
        }
      }
    } catch (error) {
      console.error('获取订单详情失败：', error)
      wx.showToast({
        title: '获取订单详情失败',
        icon: 'none'
      })
    }
  },

  async getEvaluation() {
    try {
      const db = wx.cloud.database()
      const { data } = await db.collection('evaluations').where({
        orderId: this.data.orderId
      }).get()
      
      if (data && data.length > 0) {
        const evaluation = data[0];
        
        // 格式化评价时间
        if (evaluation.createTime) {
          evaluation.createTime = new Date(evaluation.createTime).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
        
        this.setData({
          evaluation: evaluation,
          'orderInfo.hasEvaluated': true
        });
      }
    } catch (error) {
      console.error('获取评价信息失败：', error);
    }
  },

  async updateOrderStatus(newStatus) {
    try {
      const db = wx.cloud.database()
      await wx.cloud.callFunction({
        name: 'updateOrderStatus',
        data: {
          orderId: this.data.orderId,
          status: newStatus
        }
      })

      // 更新本地数据
      const updateData = { 'orderInfo.status': newStatus };
      
      // 如果是陪护人员接单，更新本地escortId
      if (this.data.isEscort && newStatus === 'IN_SERVICE' && !this.data.orderInfo.escortId) {
        updateData['orderInfo.escortId'] = app.globalData.openid;
      }
      
      // 如果订单完成，记录完成时间
      if (newStatus === 'COMPLETED') {
        updateData['orderInfo.completeTime'] = new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      this.setData(updateData);

      wx.showToast({
        title: '状态更新成功',
        icon: 'success'
      })
      
      // 如果是接单操作，刷新页面获取最新数据
      if (newStatus === 'IN_SERVICE' && this.data.isEscort) {
        this.getOrderDetail();
      }
    } catch (error) {
      console.error('更新订单状态失败：', error)
      wx.showToast({
        title: '更新订单状态失败',
        icon: 'none'
      })
    }
  },

  handleStatusChange(e) {
    const newStatus = e.currentTarget.dataset.status
    if (newStatus && newStatus !== this.data.orderInfo.status) {
      this.updateOrderStatus(newStatus)
    }
  },

  onPullDownRefresh() {
    this.getOrderDetail().then(() => {
      wx.stopPullDownRefresh()
    })
  },
  
  // 跳转到评价页面
  goToEvaluation() {
    wx.navigateTo({
      url: `/pages/orders/evaluation/index?id=${this.data.orderId}&serviceName=${this.data.orderInfo.serviceName}`
    })
  },
  
  // 处理支付
  handlePayment() {
    wx.navigateTo({
      url: `/pages/payment/index?orderId=${this.data.orderId}`
    })
  },
  
  // 返回首页
  goToHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },
  
  // 预览评价图片
  previewEvaluationImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.evaluation.images
    });
  }
})