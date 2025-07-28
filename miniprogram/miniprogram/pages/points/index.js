// 积分中心页面
const app = getApp();

Page({
  data: {
    pointsBalance: 0,
    pointsHistory: [],
    showShareModal: false,
    loading: true,
    shareStats: {
      todayShares: 0,
      todayRemaining: 5,
      todayPointsEarned: 0
    }
  },

  onLoad() {
    this.loadPointsData();
  },

  onShow() {
    // 每次显示页面时刷新积分数据
    // 清除缓存，强制刷新
    this.setData({
      loading: true
    });
    this.loadPointsData();
  },

  // 加载积分数据
  async loadPointsData() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      // 获取积分余额
      const balanceResult = await wx.cloud.callFunction({
        name: 'points-manager',
        data: {
          action: 'getBalance'
        }
      });

      console.log('积分余额查询结果:', balanceResult.result);

      if (balanceResult.result.code === 0) {
        this.setData({
          pointsBalance: balanceResult.result.data.balance
        });
      } else {
        console.error('获取积分余额失败:', balanceResult.result.message);
      }

      // 获取积分历史（最近10条）
      const historyResult = await wx.cloud.callFunction({
        name: 'points-manager',
        data: {
          action: 'getHistory',
          limit: 10
        }
      });

      // 获取分享统计
      const shareStatsResult = await wx.cloud.callFunction({
        name: 'share-tracker',
        data: {
          action: 'getShareStats'
        }
      });

      console.log('积分历史查询结果:', historyResult.result);
      console.log('分享统计查询结果:', shareStatsResult.result);

      if (historyResult.result.code === 0) {
        const formattedHistory = historyResult.result.data.records.map(item => ({
          ...item,
          points: item.amount, // 将amount字段映射为points字段用于显示
          createTime: this.formatTime(item.createTime)
        }));
        
        this.setData({
          pointsHistory: formattedHistory
        });
      } else {
        console.error('获取积分历史失败:', historyResult.result.message);
      }

      // 处理分享统计数据
      if (shareStatsResult.result && shareStatsResult.result.code === 0) {
        const shareData = shareStatsResult.result.data || {};
        const todayShares = shareData.todayShares || 0;
        const todayPointsEarned = shareData.todayPointsEarned || 0;
        const todayRemaining = Math.max(0, 5 - todayShares); // 每日最多5次分享

        this.setData({
          shareStats: {
            todayShares: todayShares,
            todayRemaining: todayRemaining,
            todayPointsEarned: todayPointsEarned
          }
        });
        
        console.log('分享统计更新:', {
          todayShares,
          todayRemaining,
          todayPointsEarned
        });
      } else {
        console.error('获取分享统计失败:', shareStatsResult.result);
      }

    } catch (error) {
      console.error('加载积分数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  // 分享小程序
  onShareApp() {
    this.setData({ showShareModal: true });
  },

  // 邀请好友
  onInviteFriend() {
    wx.showModal({
      title: '邀请好友',
      content: '分享小程序给好友，好友首次使用后您将获得10积分奖励！',
      confirmText: '立即分享',
      success: (res) => {
        if (res.confirm) {
          this.onShareApp();
        }
      }
    });
  },

  // 查看全部历史
  viewAllHistory() {
    wx.navigateTo({
      url: '/pages/points/history/index'
    });
  },

  // 显示分享弹窗
  showShareModal() {
    // 检查分享次数限制
    if (this.data.shareStats.todayRemaining <= 0) {
      wx.showToast({
        title: '今日分享次数已达上限（5次）',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    this.setData({
      showShareModal: true
    });
  },

  // 隐藏分享弹窗
  hideShareModal() {
    this.setData({ showShareModal: false });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  // 分享到朋友圈
  shareToTimeline() {
    wx.showModal({
      title: '提示',
      content: '请使用右上角菜单分享到朋友圈',
      showCancel: false
    });
    this.hideShareModal();
  },

  // 记录分享行为并奖励积分
  async recordShare() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'share-tracker',
        data: {
          action: 'recordShare',
          shareType: 'app'
        }
      });
  
      console.log('分享记录结果:', result.result);
  
      // 检查分享记录是否成功且可以获得积分
      if (result.result.code === 0 && result.result.data && result.result.data.canEarnPoints) {
        // 分享成功，奖励积分
        const pointsResult = await wx.cloud.callFunction({
          name: 'points-manager',
          data: {
            action: 'addPoints',
            amount: 5,
            actionType: 'share',
            description: '分享小程序'
          }
        });
  
        console.log('积分奖励结果:', pointsResult.result);
  
        if (pointsResult.result.code === 0) {
          wx.showToast({
            title: '分享成功，获得5积分！',
            icon: 'success',
            duration: 2000
          });
          // 立即刷新一次，然后延迟再刷新一次确保数据同步
          this.loadPointsData();
          setTimeout(() => {
            this.loadPointsData();
          }, 2000);
        } else {
          wx.showToast({
            title: '积分奖励失败',
            icon: 'none'
          });
        }
      } else if (result.result.code === 0 && result.result.data && !result.result.data.canEarnPoints) {
        wx.showToast({
          title: `今日分享次数已达上限(${result.result.data.todayShareCount}/5)`,
          icon: 'none',
          duration: 2000
        });
      } else {
        console.error('分享记录失败:', result.result);
        wx.showToast({
          title: '分享记录失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('记录分享失败:', error);
      wx.showToast({
        title: '分享功能异常',
        icon: 'none'
      });
    }
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
    
    // 超过7天显示具体日期
    const year = target.getFullYear();
    const month = (target.getMonth() + 1).toString().padStart(2, '0');
    const day = target.getDate().toString().padStart(2, '0');
    
    if (year === now.getFullYear()) {
      return `${month}-${day}`;
    } else {
      return `${year}-${month}-${day}`;
    }
  },

  // 页面分享配置
  onShareAppMessage() {
    // 记录分享行为
    this.recordShare();
    
    return {
      title: 'AI医探- 找到最适合你的医生',
      path: '/pages/index/index?from=share',
      imageUrl: '/images/share-cover.jpg'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    // 记录分享行为
    this.recordShare();
    
    return {
      title: '腾讯健康问医生 - 智能医生匹配',
      imageUrl: '/images/share-cover.jpg'
    };
  }
});