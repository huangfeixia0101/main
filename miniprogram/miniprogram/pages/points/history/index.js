// 积分历史详情页面
Page({
  data: {
    allHistory: [], // 所有历史记录
    filteredHistory: [], // 筛选后的历史记录
    filterType: 'all', // 筛选类型：all, earn, spend
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20
  },

  onLoad() {
    this.loadHistoryData();
  },

  // 加载历史数据
  async loadHistoryData(loadMore = false) {
    if (this.data.loading) return;
    
    try {
      this.setData({ loading: true });
      
      const result = await wx.cloud.callFunction({
        name: 'points-manager',
        data: {
          action: 'getHistory',
          page: loadMore ? this.data.page : 1,
          limit: this.data.pageSize
        }
      });

      console.log('积分历史查询结果:', result.result);

      if (result.result.code === 0) {
        const newHistory = result.result.data.records.map(item => ({
          ...item,
          points: item.amount, // 将amount字段映射为points字段用于显示
          createTime: this.formatTime(item.createTime)
        }));

        let allHistory;
        if (loadMore) {
          allHistory = [...this.data.allHistory, ...newHistory];
        } else {
          allHistory = newHistory;
        }

        this.setData({
          allHistory,
          hasMore: newHistory.length === this.data.pageSize,
          page: loadMore ? this.data.page + 1 : 2
        });

        // 应用当前筛选
        this.applyFilter();
      } else {
        console.error('获取积分历史失败:', result.result.message);
        wx.showToast({
          title: '获取数据失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('加载积分历史失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 设置筛选类型
  setFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type });
    this.applyFilter();
  },

  // 应用筛选
  applyFilter() {
    const { allHistory, filterType } = this.data;
    let filteredHistory;

    if (filterType === 'all') {
      filteredHistory = allHistory;
    } else {
      filteredHistory = allHistory.filter(item => item.type === filterType);
    }

    this.setData({ filteredHistory });
  },

  // 加载更多
  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.loadHistoryData(true);
  },

  // 返回积分中心
  goToPoints() {
    wx.navigateBack();
  },

  // 获取来源名称
  getSourceName(source) {
    const sourceMap = {
      'share': '分享奖励',
      'invite': '邀请奖励',
      'doctor-matching': '智能匹配',
      'doctor-matching-pro': '智能匹配Pro',
      'system': '系统奖励',
      'manual': '手动调整'
    };
    return sourceMap[source] || source;
  },

  // 格式化时间
  formatTime(date) {
    if (!date) return '';
    
    const now = new Date();
    const target = new Date(date);
    const diff = now - target;
    
    // 小于1分钟
    if (diff < 60000) {
      return '刚刚';
    }
    
    // 小于1小时
    if (diff < 3600000) {
      return Math.floor(diff / 60000) + '分钟前';
    }
    
    // 小于1天
    if (diff < 86400000) {
      return Math.floor(diff / 3600000) + '小时前';
    }
    
    // 小于7天
    if (diff < 604800000) {
      return Math.floor(diff / 86400000) + '天前';
    }
    
    // 超过7天显示具体日期时间
    const year = target.getFullYear();
    const month = (target.getMonth() + 1).toString().padStart(2, '0');
    const day = target.getDate().toString().padStart(2, '0');
    const hour = target.getHours().toString().padStart(2, '0');
    const minute = target.getMinutes().toString().padStart(2, '0');
    
    if (year === now.getFullYear()) {
      return `${month}-${day} ${hour}:${minute}`;
    } else {
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true
    });
    this.loadHistoryData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 触底加载更多
  onReachBottom() {
    this.loadMore();
  }
});