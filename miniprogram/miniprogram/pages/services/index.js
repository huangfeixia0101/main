const app = getApp()

Page({
  data: {
    // 轮播图数据
    banners: [
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/1.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/介绍.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/价值.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/体验.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/方案.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/服务.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/案例1.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/案例2.png',
        linkUrl: ''
      },
      {
        imageUrl: 'cloud://h-care-5gggrsj59b495ec9.682d-h-care-5gggrsj59b495ec9-1329966020/首页/案例3.png',
        linkUrl: ''
      }
    ],
    // 服务列表数据
    services: [],
    searchKey: '',
    pageNum: 1,
    pageSize: 10,
    hasMore: true,
    loading: false
  },

  onLoad(options) {
    this.loadServices()
    
    // 处理从优惠券页面传递过来的couponId参数
    if (options && options.couponId) {
      // 存储优惠券ID到全局数据
      app.globalData.selectedCouponId = options.couponId
      
      // 提示用户已选择优惠券
      wx.showToast({
        title: '已选择优惠券，请选择服务',
        icon: 'none',
        duration: 2000
      })
    }
  },

  onShow() {
    // 设置tabBar选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      services: [],
      pageNum: 1,
      hasMore: true
    })
    this.loadServices().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 加载服务列表
  loadServices() {
    const { searchKey, pageNum, pageSize } = this.data
    this.setData({ loading: true })
    
    return wx.cloud.callFunction({
      name: 'getServices',
      data: { searchKey, pageNum, pageSize },
      success: res => {
        if (res.result.code === 0) {
          const { list, total } = res.result.data
          this.setData({
            services: pageNum === 1 ? list : this.data.services.concat(list),
            hasMore: this.data.services.length < total
          })
        }
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  // 搜索服务
  onSearch(e) {
    this.setData({
      searchKey: e.detail.value,
      services: [],
      pageNum: 1,
      hasMore: true
    })
    this.loadServices()
  },

  // 点击轮播图
  onBannerTap(e) {
    const index = e.currentTarget.dataset.index
    const banner = this.data.banners[index]
    if (banner && banner.linkUrl) {
      wx.navigateTo({
        url: banner.linkUrl
      })
    }
  },

  // 点击服务
  onServiceTap(e) {
    const serviceId = e.currentTarget.dataset.id
    console.log('跳转服务详情，serviceId:', serviceId)
    wx.navigateTo({
      url: `/pages/service-detail/index?serviceId=${serviceId}`,
      success: () => {
        console.log('跳转成功')
      },
      fail: (err) => {
        console.error('跳转失败:', err)
      }
    })
  },

  // 加载更多服务
  loadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.setData({
        pageNum: this.data.pageNum + 1
      })
      this.loadServices()
    }
  },

  navigateToServiceDetail(event) {
    const serviceId = event.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/service-detail/index?serviceId=${serviceId}`
    })
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
})