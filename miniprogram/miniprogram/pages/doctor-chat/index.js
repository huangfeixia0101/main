Page({
  data: {
    messages: [
      {
        role: 'ai',
        content: '您好！我是您的智能医疗助手。请告诉我，您想咨询什么问题，我会为您匹配最合适的医生。'
      }
    ],
    inputText: '',
    loading: false,
    loadingStatus: '',
    conversationHistory: [],
    scrollTop: 0,
    showProgress: false,
    progressPercent: 0,
    countdown: 0,
    showCountdown: false,
    isPro: false
  },

  onLoad(options) {
    // 页面加载时的初始化
    const isPro = options.isPro === 'true';
    this.setData({
      isPro: isPro
    });
    
    wx.setNavigationBarTitle({
      title: isPro ? '智能医生匹配Pro' : '智能医生匹配'
    });
    
    // 更新欢迎消息
    if (isPro) {
      this.setData({
        messages: [
          {
            role: 'ai',
            content: '您好！我是您的智能医疗助手Pro版。请告诉我，您想咨询什么问题，我会为您匹配最合适的医生，并提供详细的多维度研究报告信息（包括了医生的教育背景，手术背景，家庭背景，工作态度，个性等）。'
          }
        ]
      });
    }
  },

  onInput(e) {
    this.setData({
      inputText: e.detail.value
    });
  },

  async sendMessage() {
    const { inputText, messages, conversationHistory } = this.data;
    if (!inputText.trim() || this.data.loading) return;

    // 添加用户消息
    const userMessage = { role: 'user', content: inputText };
    const newMessages = [...messages, userMessage];
    
    this.setData({
      messages: newMessages,
      inputText: '',
      loading: true,
      loadingStatus: '正在连接医疗分析系统...'
    });

    // 移除自动滚动到底部，让用户可以从头查看回复内容
    // this.scrollToBottom();

    // 模拟不同阶段的状态更新
    const statusUpdates = [
      { status: '正在分析您的症状描述...', delay: 2000 },
      { status: '正在查询专属医生数据库...', delay: 4000 },
      { status: '正在进行智能匹配分析...', delay: 6000 },
      { status: '正在筛选合适的医生...', delay: 8000 },
      { status: '正在评估医生专业度...', delay: 10000 },
      { status: '正在生成个性化匹配(整个过程预计会耗时20秒)...', delay: 15000 }
    ];

    // 启动状态更新定时器
    let currentStatusIndex = 0;
    let progressTimer = null;
    const statusTimer = setInterval(() => {
      if (currentStatusIndex < statusUpdates.length && this.data.loading) {
        this.setData({
          loadingStatus: statusUpdates[currentStatusIndex].status
        });
        
        // 如果是最后一个状态，启动倒计时
        if (currentStatusIndex === statusUpdates.length - 1) {
          this.setData({
            showCountdown: true,
            countdown: 20
          });
          
          // 启动倒计时更新
          let timeLeft = 20;
          progressTimer = setInterval(() => {
            if (timeLeft > 0 && this.data.loading) {
              timeLeft--;
              this.setData({
                countdown: timeLeft,
                loadingStatus: `正在生成个性化匹配(预估剩余${timeLeft}秒)...`
              });
            }
          }, 1000);
        }
        
        currentStatusIndex++;
      }
    }, 2000);

    try {
      // 获取用户信息
      const app = getApp();
      const userInfo = app.globalData.userInfo;
      const openid = app.globalData.openid;
      
      // 根据isPro参数调用不同的云函数
      const cloudFunctionName = this.data.isPro ? 'doctor-matching-pro' : 'doctor-matching';
      const result = await wx.cloud.callFunction({
        name: cloudFunctionName,
        data: {
          userInput: inputText,
          conversationHistory: conversationHistory,
          userInfo: userInfo,
          openid: openid
        },
        timeout: 150000 // 设置超时时间为150秒，给云函数留出充足的执行时间
      });

      // 清除状态更新定时器和进度条定时器
      clearInterval(statusTimer);
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      
      // 重置状态
      this.setData({
        showCountdown: false,
        countdown: 0
      });

      if (result.result.success) {
        // 调试：打印返回的数据结构
        console.log('=== 云函数返回数据调试 ===');
        console.log('完整结果:', JSON.stringify(result.result.data, null, 2));
        console.log('医生数据:', result.result.data.doctors || result.result.data.recommendedDoctors);
        
        const doctors = result.result.data.doctors || result.result.data.recommendedDoctors || [];
        console.log(`找到 ${doctors.length} 位医生`);
        

        
        const aiMessage = {
          role: 'ai',
          content: result.result.data.response,
          doctors: doctors
        };

        this.setData({
          messages: [...this.data.messages, aiMessage],
          conversationHistory: [...conversationHistory, userMessage, {
            role: 'ai',
            content: result.result.data.response
          }]
        });
      } else {
        // 检查是否是使用次数限制错误
        if (result.result.needLogin) {
          // 需要登录的情况
          wx.showModal({
            title: '使用限制',
            content: result.result.data.response,
            confirmText: '去登录',
            cancelText: '知道了',
            success: (res) => {
              if (res.confirm) {
                // 跳转到登录页面
                wx.navigateTo({
                  url: '/pages/login/index'
                });
              }
            }
          });
        } else if (result.result.canUsePoints) {
          // 可以使用积分抵扣的情况
          wx.showModal({
            title: '使用积分继续',
            content: `${result.result.data.response}\n\n是否使用${result.result.pointsRequired}积分继续使用？`,
            confirmText: '使用积分',
            cancelText: '取消',
            success: (res) => {
              if (res.confirm) {
                this.usePointsAndRetry(inputText, conversationHistory, result.result.pointsRequired);
              }
            }
          });
        } else if (result.result.needPurchase) {
          // 需要购买Pro服务的情况
          wx.showModal({
            title: '需要购买Pro服务',
            content: result.result.data.response,
            confirmText: '去购买',
            cancelText: '知道了',
            success: (res) => {
              if (res.confirm) {
                // 跳转到匹配医生Pro服务详情页面
                wx.navigateTo({
                  url: `/pages/service-detail/index?serviceId=7258032d67ba9699031ad8a6793d9f43`
                });
              }
            }
          });
        } else {
          // 其他错误情况
          wx.showModal({
            title: '提示',
            content: result.result.data.response || result.result.error,
            showCancel: false,
            confirmText: '知道了'
          });
        }
        
        // 添加错误消息到聊天记录
        this.setData({
          messages: [...this.data.messages, {
            role: 'ai',
            content: result.result.data.response || '抱歉，服务暂时不可用，请稍后重试。'
          }]
        });
        return; // 直接返回，不抛出错误
      }
    } catch (error) {
      console.error('Send message error:', error);
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      });
      
      // 添加错误消息
      this.setData({
        messages: [...this.data.messages, {
          role: 'ai',
          content: '抱歉，服务暂时不可用，请稍后重试。您也可以直接浏览我们的医生列表。'
        }]
      });
    } finally {
      // 清除状态更新定时器和进度条定时器
      clearInterval(statusTimer);
      if (progressTimer) {
        clearInterval(progressTimer);
      }
      
      // 重置状态
      this.setData({
        showCountdown: false,
        countdown: 0
      });
      this.setData({ 
          loading: false,
          loadingStatus: '',
          showProgress: false,
          progressPercent: 0
        });
      // 移除自动滚动到底部，让用户可以查看完整的回复内容
      // this.scrollToBottom();
    }
  },

  toggleMatchDetails(e) {
    const doctorId = e.currentTarget.dataset.doctorId;
    const messages = this.data.messages;
    
    // 找到包含该医生的消息并切换详情显示状态
    const updatedMessages = messages.map(message => {
      if (message.doctors && message.doctors.length > 0) {
        const updatedDoctors = message.doctors.map(doctor => {
          if (doctor._id === doctorId) {
            return {
              ...doctor,
              showDetails: !doctor.showDetails
            };
          }
          return doctor;
        });
        return {
          ...message,
          doctors: updatedDoctors
        };
      }
      return message;
    });
    
    this.setData({
      messages: updatedMessages
    });
  },

  selectDoctor(e) {
    const doctor = e.currentTarget.dataset.doctor;
    
    // 显示医生详情或跳转到预约页面
    wx.showModal({
      title: doctor.name,
      content: `${doctor.hospital} ${doctor.department}\n擅长：${doctor.specialties}\n\n是否要帮您预约这位医生？`,
      confirmText: '预约',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 跳转到预约挂号的服务页面
          wx.navigateTo({
            url: `/pages/service-detail/index?serviceId=cc3a417967baa6690693ae5b5fe6c019`
          });
        }
      }
    });
  },

  selectService(e) {
    // 显示服务详情或直接跳转到服务页面
    wx.showModal({
      title: '医生匹配服务',
      content: `专业的医生匹配服务，为您精准匹配合适的医生\n\n是否要使用这个服务？`,
      confirmText: '使用服务',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 跳转到匹配医生的服务页面
          wx.navigateTo({
            url: `/pages/service-detail/index?serviceId=7258032d67ba9699031ad8a6793d9f43`
          });
        }
      }
    });
  },

  scrollToBottom() {
    // 延迟滚动到底部，确保DOM更新完成
    setTimeout(() => {
      this.setData({
        scrollTop: 999999
      });
    }, 100);
  },

  // 清空对话
  clearChat() {
    wx.showModal({
      title: '确认清空',
      content: '是否要清空当前对话记录？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            messages: [
              {
                role: 'ai',
                content: '您好！我是您的智能医疗助手。请告诉我您想咨询什么问题，我会为您匹配最合适的医生。'
              }
            ],
            conversationHistory: []
          });
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '智能医生匹配 - 找到最适合您的医生',
      path: '/pages/doctor-chat/index'
    };
  },

  // 使用积分并重试
  async usePointsAndRetry(inputText, conversationHistory, pointsRequired) {
    try {
      // 显示加载状态
      this.setData({
        loading: true,
        loadingStatus: '正在使用积分...'
      });

      // 调用积分抵扣云函数
      const deductResult = await wx.cloud.callFunction({
        name: 'points-manager',
        data: {
          action: 'deductPoints',
          amount: pointsRequired,
          actionType: this.data.isPro ? 'doctor_matching_pro' : 'doctor_matching',
          description: this.data.isPro ? '智能医生匹配Pro服务' : '智能医生匹配服务'
        }
      });

      if (deductResult.result.code === 0) {
        // 积分抵扣成功，重新调用医生匹配服务
        // 显示进度状态
        const statusUpdates = [
          { status: '正在分析您的需求...' },
          { status: '正在匹配合适的医生...' },
          { status: '正在生成个性化匹配...' }
        ];
        
        let currentStatusIndex = 0;
        let progressTimer = null;
        const statusTimer = setInterval(() => {
          if (currentStatusIndex < statusUpdates.length && this.data.loading) {
            this.setData({
              loadingStatus: statusUpdates[currentStatusIndex].status
            });
            
            // 如果是最后一个状态，启动倒计时
            if (currentStatusIndex === statusUpdates.length - 1) {
              this.setData({
                showCountdown: true,
                countdown: 20
              });
              
              // 启动倒计时更新
              let timeLeft = 20;
              progressTimer = setInterval(() => {
                if (timeLeft > 0 && this.data.loading) {
                  timeLeft--;
                  this.setData({
                    countdown: timeLeft,
                    loadingStatus: `正在生成个性化匹配(预估剩余${timeLeft}秒)...`
                  });
                }
              }, 1000);
            }
            
            currentStatusIndex++;
          }
        }, 2000);
        
        const app = getApp();
        const userInfo = app.globalData.userInfo;
        const openid = app.globalData.openid;
        
        const cloudFunctionName = this.data.isPro ? 'doctor-matching-pro' : 'doctor-matching';
        const result = await wx.cloud.callFunction({
          name: cloudFunctionName,
          data: {
            userInput: inputText,
            conversationHistory: conversationHistory,
            userInfo: userInfo,
            openid: openid,
            usePoints: true // 标记使用积分
          },
          timeout: 150000
        });
        
        // 清除状态更新定时器和进度条定时器
        clearInterval(statusTimer);
        if (progressTimer) {
          clearInterval(progressTimer);
        }
        
        // 重置状态
        this.setData({
          showCountdown: false,
          countdown: 0
        });

        if (result.result.success) {
          const aiMessage = {
            role: 'ai',
            content: result.result.data.response,
            doctors: result.result.data.recommendedDoctors
          };

          this.setData({
            messages: [...this.data.messages, aiMessage],
            conversationHistory: [...conversationHistory, {
              role: 'user',
              content: inputText
            }, {
              role: 'ai',
              content: result.result.data.response
            }]
          });

          wx.showToast({
            title: `已使用${pointsRequired}积分`,
            icon: 'success'
          });
        } else {
          wx.showModal({
            title: '服务异常',
            content: result.result.error || '服务暂时不可用，请稍后重试',
            showCancel: false
          });
        }
      } else {
        wx.showModal({
          title: '积分不足',
          content: deductResult.result.message || '积分余额不足，请先获取积分',
          confirmText: '去获取',
          cancelText: '知道了',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/points/index'
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('积分抵扣失败:', error);
      wx.showModal({
        title: '操作失败',
        content: '积分抵扣失败，请稍后重试',
        showCancel: false
      });
    } finally {
      this.setData({
        loading: false,
        loadingStatus: ''
      });
    }
  }
});