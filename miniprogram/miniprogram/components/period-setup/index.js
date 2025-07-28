// components/period-setup/index.js
Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: function(newVal) {
        if (newVal) {
          this.initOptions(); // 确保选项是最新的
          this.loadExistingSettings(); // 加载已有设置
        }
      }
    },
    isUpdate: {
      type: Boolean,
      value: false
    }
  },
  
  data: {
    lastPeriodDate: '', // 末次月经来潮日
    periodDuration: 5, // 默认值
    periodCycle: 28, // 默认值
    birthYear: 1990, // 默认值
    periodDurationOptions: [],
    periodCycleOptions: [],
    birthYearOptions: [],
    setupTitle: '月经设置' // 默认标题
  },
  
  lifetimes: {
    attached() {
      // 初始化选项数据和加载设置移至 visible observer 或在初始可见时执行
      if (this.data.visible) {
        this.initOptions();
        this.loadExistingSettings();
      }
    }
  },
  
  methods: {
    // 加载已有设置
    loadExistingSettings() {
      const settings = wx.getStorageSync('periodSettings');
      if (settings && settings.setupCompleted) {
        this.setData({
          lastPeriodDate: settings.lastPeriodDate || '',
          periodDuration: settings.periodDuration || 5,
          periodCycle: settings.periodCycle || 28,
          birthYear: settings.birthYear || 1990,
          setupTitle: this.properties.isUpdate ? '更新设置' : '月经设置'
        });
      }
    },
    
    // 初始化所有选项数据
    initOptions() {
      // 生成月经持续天数选项 (2-14天)
      const durationOptions = [];
      for (let i = 2; i <= 14; i++) {
        durationOptions.push({
          value: i,
          text: `${i}天`
        });
      }
      
      // 生成月经周期选项 (15-60天)
      const cycleOptions = [];
      for (let i = 15; i <= 60; i++) {
        cycleOptions.push({
          value: i,
          text: `${i}天`
        });
      }
      
      // 生成出生年份选项 (1950-当前年份)
      const birthYearOptions = [];
      const currentYear = new Date().getFullYear();
      for (let i = 1950; i <= currentYear; i++) {
        birthYearOptions.push({
          value: i,
          text: `${i}年`
        });
      }
      
      this.setData({
        periodDurationOptions: durationOptions,
        periodCycleOptions: cycleOptions,
        birthYearOptions: birthYearOptions
      });
    },
    
    // 处理选择器变更
    onPickerChange(e) {
      const type = e.currentTarget.dataset.type;
      
      if (type === 'lastPeriod') {
        this.setData({ lastPeriodDate: e.detail.value });
      } else if (type === 'duration') {
        this.setData({ periodDuration: this.data.periodDurationOptions[e.detail.value].value });
      } else if (type === 'cycle') {
        this.setData({ periodCycle: this.data.periodCycleOptions[e.detail.value].value });
      } else if (type === 'birthYear') {
        this.setData({ birthYear: this.data.birthYearOptions[e.detail.value].value });
      }
    },
    
    // 关闭设置窗口
    onClose() {
      this.triggerEvent('close');
    },

    // 点击遮罩关闭
    onMaskTap() {
      this.onClose();
    },

    // 保存设置
    onSave() {
      this.saveSettings();
    },
    
    // 保存设置
    saveSettings() {
      // 验证必填项
      if (!this.data.lastPeriodDate) {
        wx.showToast({
          title: '请选择末次月经日期',
          icon: 'none'
        });
        return;
      }
      
      // 获取现有设置，保持其他数据不变
      const existingSettings = wx.getStorageSync('periodSettings') || {};
      const settings = {
        ...existingSettings, // 保留现有设置
        lastPeriodDate: this.data.lastPeriodDate,
        periodDuration: this.data.periodDuration,
        periodCycle: this.data.periodCycle,
        birthYear: this.data.birthYear,
        setupCompleted: true,
        setupTime: new Date().getTime(), // 更新设置时间
        firstUseDate: existingSettings.firstUseDate || new Date().toISOString().split('T')[0] // 记录首次使用日期
      };
      
      // 保存到本地存储
      wx.setStorageSync('periodSettings', settings);
      
      // 触发设置完成事件
      this.triggerEvent('setupComplete', settings);
    }
  }
});