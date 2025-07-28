// pages/evaluation/list/index.js
const app = getApp();

Page({
  data: {
    serviceDetail: null,
    specs: [],
    showContact: false,
    evaluations: [],
    averageRating: 0,
    ratingDistribution: [],
    hasMoreEvaluations: false,
    evaluationPage: 1,
    evaluationPageSize: 10,
    hasAgreedToTerms: false,
    guarantees: [
      {
        id: 1,
        icon: '/images/专业.png',
        text: '专业'
      },
      {
        id: 2,
        icon: '/images/准时.png',
        text: '准时'
      },
      {
        id: 3,
        icon: '/images/陪护.png',
        text: '呵护'
      },
      {
        id: 4,
        icon: '/images/安全.png',
        text: '安全'
      },
      {
        id: 5,
        icon: '/images/隐私.png',
        text: '隐私'
      },
      {
        id: 6,
        icon: '/images/保障.png',
        text: '保障'
      },
    ],
    selectedSpec: '',
    quantity: 1,
    totalPrice: 0
  },

  onLoad(options) {
    if (options.serviceId) {
      this.loadServiceDetail(options.serviceId);
    }
  },

  // 加载评价数据
  async loadEvaluations(serviceId, page = 1) {
    try {
      const db = wx.cloud.database();
      
      // 获取服务详情以获取服务名称
      const serviceDetail = this.data.serviceDetail;
      if (!serviceDetail || !serviceDetail.name) {
        console.error('服务详情不存在或没有名称');
        return;
      }
      
      // 获取评价总数和评分分布，使用serviceName而不是serviceId
      const { total, list } = await db.collection('evaluations')
        .where({
          serviceName: serviceDetail.name // 使用服务名称查询而不是ID
        })
        .orderBy('createTime', 'desc')
        .skip((page - 1) * this.data.evaluationPageSize)
        .limit(this.data.evaluationPageSize)
        .get()
        .then(res => ({
          total: res.total || 0,
          list: res.data || []
        }));

      // 处理评价图片
      for (let evaluation of list) {
        if (evaluation.images && evaluation.images.length > 0) {
          const { fileList } = await wx.cloud.getTempFileURL({
            fileList: evaluation.images
          });
          evaluation.images = fileList.map(file => file.tempFileURL);
        }
      }

      // 计算评分分布
      // 计算评分分布和平均评分
      let ratingCounts = [0, 0, 0, 0, 0];
      let totalRating = 0;

      list.forEach(evaluation => {
        console.log('Original rating:', evaluation.rating); // 输出原始评分值
        let rating = parseInt(evaluation.rating); // 将字符串转换为整数
        console.log('评分类型:', typeof rating, '评分值:', rating);
        console.log('Parsed rating:', rating); // 输出转换后的评分值
        if (rating >= 1 && rating <= 5) {
          ratingCounts[rating - 1]++;
          totalRating += rating;
        }
      });

      const ratingDistribution = ratingCounts.map((count, index) => ({
        rating: index + 1,
        count: count,
        percentage: list.length > 0 ? ((count / list.length) * 100).toFixed(1) : 0 // 使用list.length代替total
      })).reverse();

      const averageRating = list.length > 0 ? (totalRating / list.length).toFixed(1) : 0.0; // 使用list.length作为除数

      this.setData({
        evaluations: page === 1 ? list : [...this.data.evaluations, ...list],
        ratingDistribution,
        averageRating,
        hasMoreEvaluations: list.length === this.data.evaluationPageSize,
        evaluationPage: page
      }, () => {
        console.log('Updated evaluations:', this.data.evaluations);
      });
    } catch (err) {
      console.error('获取评价数据失败:', err);
      wx.showToast({
        title: '获取评价数据失败',
        icon: 'none'
      });
    }
  },

  // 加载更多评价
  loadMoreEvaluations() {
    if (this.data.hasMoreEvaluations) {
      this.loadEvaluations(this.data.serviceDetail._id, this.data.evaluationPage + 1);
    }
  },

  // 预览评价图片
  previewImage(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({
      urls,
      current
    });
  },

  // 从ai_service集合获取服务详情
  loadServiceDetail(serviceId) {
    wx.cloud.database().collection('ai_service').doc(serviceId).get({
      success: async res => {
        const serviceDetail = res.data;
        // 处理服务图片，如果是云存储路径则获取临时访问链接
        if (serviceDetail.imageUrl && serviceDetail.imageUrl.startsWith('cloud://')) {
          try {
            const { fileList } = await wx.cloud.getTempFileURL({
              fileList: [serviceDetail.imageUrl]
            });
            if (fileList && fileList[0] && fileList[0].tempFileURL) {
              serviceDetail.imageUrl = fileList[0].tempFileURL;
            }
          } catch (err) {
            console.error('获取服务图片临时链接失败:', err);
            // 设置一个默认图片
            serviceDetail.imageUrl = '/images/logo.png';
          }
        }

        // 处理服务图片数组
        if (serviceDetail.images && Array.isArray(serviceDetail.images)) {
          try {
            const cloudFiles = serviceDetail.images.filter(url => url && url.startsWith('cloud://'));
            if (cloudFiles.length > 0) {
              const { fileList } = await wx.cloud.getTempFileURL({
                fileList: cloudFiles
              });
              if (fileList) {
                serviceDetail.images = serviceDetail.images.map(url => {
                  if (url && url.startsWith('cloud://')) {
                    const matchFile = fileList.find(file => file.fileID === url);
                    return matchFile ? matchFile.tempFileURL : url;
                  }
                  return url;
                });
              }
            }
          } catch (err) {
            console.error('获取服务图片数组临时链接失败:', err);
          }
        }

        // 将specs数组转换为对象数组格式
        const specs = (serviceDetail.specs || []).map(spec => ({
          name: spec[0],
          price: parseFloat(spec[1])
        }));
        // 设置默认选中的规格
        const defaultSpec = specs[0];
        this.setData({
          serviceDetail: {
            ...serviceDetail,
            specs: specs
          },
          specs,
          selectedSpec: defaultSpec ? defaultSpec.name : '',
          totalPrice: defaultSpec ? defaultSpec.price.toFixed(0) : '0'
        });

        // 加载评价数据
        this.loadEvaluations(serviceId);
      },
      fail: err => {
        console.error('获取服务详情失败:', err);
        wx.showToast({
          title: '获取服务详情失败',
          icon: 'none'
        });
      }
    });
  },

  // 选择规格
  handleSpecSelect(e) {
    const spec = e.currentTarget.dataset.spec;
    const selectedSpecData = this.data.specs.find(item => item.name === spec);
    if (selectedSpecData) {
      this.setData({
        selectedSpec: spec,
        totalPrice: (selectedSpecData.price * this.data.quantity).toFixed(0)
      });
    }
  },

  // 减少数量
  handleQuantityDecrease() {
    if (this.data.quantity <= 1) return;
    const newQuantity = this.data.quantity - 1;
    const selectedSpecData = this.data.serviceDetail.specs.find(item => item.name === this.data.selectedSpec);
    this.setData({
      quantity: newQuantity,
      totalPrice: (selectedSpecData.price * newQuantity).toFixed(2)
    });
  },

  // 增加数量
  handleQuantityIncrease() {
    const newQuantity = this.data.quantity + 1;
    const selectedSpecData = this.data.serviceDetail.specs.find(item => item.name === this.data.selectedSpec);
    this.setData({
      quantity: newQuantity,
      totalPrice: (selectedSpecData.price * newQuantity).toFixed(0)
    });
  },

  // 点击购买按钮
  handleBuy() {
    if (!this.data.hasAgreedToTerms) {
      wx.showModal({
        title: '提示',
        content: '请先阅读并同意服务条款',
        showCancel: false
      });
      return;
    }
    // 检查是否登录
    if (!app.globalData.isLogin) {
      wx.navigateTo({
        url: '/pages/login/index'
      });
      return;
    }

    // 检查服务详情是否存在
    if (!this.data.serviceDetail) {
      wx.showToast({
        title: '服务信息加载中，请稍后再试',
        icon: 'none'
      });
      return;
    }

    // 检查用户类型
    if (app.globalData.userType === 'escort') {
      wx.showToast({
        title: '陪诊员不能购买服务',
        icon: 'none'
      });
      return;
    }

    // 跳转到订单确认页面
    wx.navigateTo({
      url: `/pages/order-confirm/index?serviceId=${this.data.serviceDetail._id}&spec=${this.data.selectedSpec}&quantity=${this.data.quantity}&price=${this.data.totalPrice}`
    });
  },

  // 分享给朋友
  onShareAppMessage() {
    const app = getApp()
    // 如果有服务详情，则分享该服务的信息
    if (this.data.serviceDetail) {
      return {
        title: this.data.serviceDetail.name,
        path: `/pages/service-detail/index?serviceId=${this.data.serviceDetail._id}`,
        imageUrl: this.data.serviceDetail.imageUrl || '/images/logo.png'
      }
    }
    // 否则使用默认分享信息
    return app.globalData.shareInfo
  },

  // 分享到朋友圈
  onShareTimeline() {
    const app = getApp()
    // 如果有服务详情，则分享该服务的信息
    if (this.data.serviceDetail) {
      return {
        title: this.data.serviceDetail.name,
        query: `serviceId=${this.data.serviceDetail._id}`,
        imageUrl: this.data.serviceDetail.imageUrl || '/images/logo.png'
      }
    }
    // 否则使用默认分享信息
    return app.globalData.shareInfo
  },
  
  // 处理用户同意服务条款的状态变化
  onAgreementChange(e) {
    const hasAgreedToTerms = e.detail.value && e.detail.value.length > 0
    this.setData({ hasAgreedToTerms })
    console.log('服务条款同意状态:', hasAgreedToTerms)
  }
  
});


