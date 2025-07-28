Page({
  data: {
    // 页面的初始数据
  },

  onLoad: function(options) {
    // 页面加载时执行的初始化操作
  },

  onAgree: function() {
    // 用户点击同意按钮时的处理
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2]; // 获取上一个页面

    // 设置上一个页面的状态，标记用户已同意协议
    if (prevPage) {
      prevPage.setData({
        hasAgreedToTerms: true
      });
    }

    // 返回上一页
    wx.navigateBack({
      delta: 1
    });
  }
})