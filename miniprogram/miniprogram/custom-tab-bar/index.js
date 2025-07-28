Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/index/index",
        text: "首页",
        iconPath: "/images/home.png",
        selectedIconPath: "/images/home-active.png"
      },
      {
        pagePath: "/pages/services/index",
        text: "服务",
        iconPath: "/images/services.png",
        selectedIconPath: "/images/services-active.png"
      },
      {
        pagePath: "/pages/orders/list/index",
        text: "订单",
        iconPath: "/images/order.png",
        selectedIconPath: "/images/order-active.png"
      },
      {
        pagePath: "/pages/user/index",
        text: "我的",
        iconPath: "/images/user.png",
        selectedIconPath: "/images/user-active.png"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = this.data.list[data.index].pagePath
      wx.switchTab({url})
      this.setData({
        selected: data.index
      })
    }
  }
})