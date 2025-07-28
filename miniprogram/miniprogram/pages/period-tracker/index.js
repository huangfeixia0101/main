// 经期追踪页面 - 完全重构版本
const app = getApp();

// 经期计算核心模块
const PeriodCalculator = {
  // 计算包含目标日期的周期开始日
  getCycleStartDate: function(targetDate, lastPeriodDate, cycleLength) {
    const normalizedTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const normalizedLastPeriod = new Date(lastPeriodDate.getFullYear(), lastPeriodDate.getMonth(), lastPeriodDate.getDate());
    
    console.log('getCycleStartDate debug:', {
      targetDate: normalizedTarget.toDateString(),
      lastPeriodDate: normalizedLastPeriod.toDateString(),
      cycleLength
    });
    
    // 如果目标日期就是末次月经日期，直接返回
    if (normalizedTarget.getTime() === normalizedLastPeriod.getTime()) {
      console.log('Target date equals last period date, returning:', normalizedLastPeriod.toDateString());
      return normalizedLastPeriod;
    }
    
    let cycleStart = new Date(normalizedLastPeriod);
    
    // 向前调整到最近的周期开始日
    while (normalizedTarget < cycleStart) {
      cycleStart.setDate(cycleStart.getDate() - cycleLength);
    }
    
    // 向后调整到正确的周期开始日
    while (true) {
      const nextCycleStart = new Date(cycleStart);
      nextCycleStart.setDate(nextCycleStart.getDate() + cycleLength);
      if (nextCycleStart > normalizedTarget) break;
      cycleStart = nextCycleStart;
    }
    
    console.log('Final cycle start:', cycleStart.toDateString());
    return cycleStart;
  },
  
  // 计算生理状态
  calculateStatus: function(targetDate, cycleStart, settings) {
    const daysIntoCycle = Math.floor((targetDate - cycleStart) / (1000 * 60 * 60 * 24));
    const cycleLength = settings.periodCycle || settings.cycleLength || 28; // 兼容两种字段名
    const ovulationDay = cycleLength - 14;
    const fertileStart = ovulationDay - 5;
    const fertileEnd = ovulationDay + 4;
    
    // 判断是否在月经期 - 修复：包含第0天（月经第一天）
    const isPeriod = daysIntoCycle >= 0 && daysIntoCycle < settings.periodDuration;
    
    // 判断是否是排卵日
    const isOvulationDay = daysIntoCycle === ovulationDay;
    
    // 判断是否在易孕期
    const isFertile = daysIntoCycle >= fertileStart && daysIntoCycle <= fertileEnd && !isPeriod;
    
    // 判断是否在安全期（非月经期且非易孕期）
    const isSafe = !isPeriod && !isFertile && !isOvulationDay;
    
    console.log('calculateStatus debug:', {
      targetDate: targetDate.toDateString(),
      cycleStart: cycleStart.toDateString(),
      daysIntoCycle,
      periodDuration: settings.periodDuration,
      isPeriod,
      isOvulationDay,
      isFertile,
      isSafe
    });
    
    return {
      isPeriod: isPeriod,
      isOvulationDay: isOvulationDay,
      isFertile: isFertile,
      isSafe: isSafe
    };
  }
};

// UI交互管理器
const UIManager = {
  // 构建信息面板内容
  buildInfoItems: function(dayItem, settings) {
    if (!dayItem || dayItem.isOtherMonth) return [];

    const notesKey = `notes_${dayItem.fullDate}`;
    const noteContent = wx.getStorageSync(notesKey) || '';
    const hasNotes = !!noteContent;
    let pregnancyRateText = '较低';
    let statusText = '';
    let cervicalMucusText = '';

    // 确定状态文本和怀孕率（基于最新医学研究数据）
    if (dayItem.isOvulationDay) {
      pregnancyRateText = '30%';
      statusText = '排卵日';
      cervicalMucusText = '透明、水润、弹性高，类似生蛋清，拉丝度高，量明显增多';
    } else if (dayItem.isFertile) {
      // 易孕期根据距离排卵日的远近确定概率
      const settings = StorageManager.getPeriodSettings();
      const cycleLength = settings.periodCycle || 28;
      const ovulationDay = cycleLength - 14;
      const cycleStartDate = dayItem.cycleStartDateForThisDay ? new Date(dayItem.cycleStartDateForThisDay) : new Date();
      const daysIntoCycle = Math.floor((new Date(dayItem.fullDate) - cycleStartDate) / (1000 * 60 * 60 * 24)) + 1;
      const daysFromOvulation = Math.abs(daysIntoCycle - ovulationDay);
      
      if (daysFromOvulation <= 1) {
        pregnancyRateText = '35%'; // 排卵日前后1天
        cervicalMucusText = '透明、水润、弹性高，类似生蛋清，拉丝度高';
      } else if (daysFromOvulation <= 2) {
        pregnancyRateText = '15%'; // 排卵日前后2天
        cervicalMucusText = '透明、水润、弹性较高，拉丝度较高';
      } else if (daysFromOvulation <= 3) {
        pregnancyRateText = '8%';  // 排卵日前后3天
        cervicalMucusText = '透明、水润、有一定弹性，拉丝度中等';
      } else {
        pregnancyRateText = '5%';  // 易孕期其他时间
        cervicalMucusText = '透明或半透明，湿润，拉丝度较低';
      }
      statusText = '易孕期';
    } else if (dayItem.isPeriod) {
      pregnancyRateText = '1%';
      statusText = '月经期';
      cervicalMucusText = '与经血混合，难以观察，可能呈红色或暗红色';
    } else if (dayItem.isSafe) {
      pregnancyRateText = '2%';
      statusText = '安全期';
      
      // 区分前半个安全期和后半个安全期
      const cycleStartDate = dayItem.cycleStartDateForThisDay ? new Date(dayItem.cycleStartDateForThisDay) : new Date();
      const daysIntoCycle = Math.floor((new Date(dayItem.fullDate) - cycleStartDate) / (1000 * 60 * 60 * 24));
      const cycleLength = (settings && (settings.periodCycle || settings.cycleLength)) || 28;
      const ovulationDay = cycleLength - 14;
      
      if (daysIntoCycle < ovulationDay - 5) { // 前半个安全期（卵泡期）
        if (daysIntoCycle <= 2) { // 经期刚结束
          cervicalMucusText = '可能呈褐色，量少，是经血残留';
        } else { // 卵泡期
          cervicalMucusText = '乳白色或透明，量少，质地黏稠';
        }
      } else { // 后半个安全期（黄体期）
        if (daysIntoCycle >= ovulationDay + 5 && daysIntoCycle <= ovulationDay + 10) { // 黄体期早期
          cervicalMucusText = '量减少，质地变黏稠，呈乳白色或淡黄色';
        } else { // 黄体期后期
          cervicalMucusText = '量少，可能再次变稀，部分女性出现少量乳酪状分泌物';
        }
      }
    }

    let infoItems = [];
    
    // 根据不同状态构建不同的信息项
    if (dayItem.isPeriod) {
      infoItems = [
        // 当前状态已在头部显示，不再在信息项中重复
        { type: 'love_warning', text: '爱爱不宜', isCheckbox: false },
        { type: 'cervical_mucus', text: `白带变化: ${cervicalMucusText}`, isCheckbox: false },
      ];
      // 添加备注相关信息项
      if (hasNotes) {
        infoItems.push({ type: 'note_content', text: `备注: ${noteContent}`, isCheckbox: false });
        infoItems.push({ type: 'note', text: '编辑备注', isCheckbox: false, isButton: true });
      } else {
        infoItems.push({ type: 'note', text: '添加备注', isCheckbox: false, isButton: true });
      }
    } else if (dayItem.isOvulationDay) {
      infoItems = [
        // 当前状态已在头部显示，不再在信息项中重复
        { type: 'pregnancy_rate', text: `预测孕率: ${pregnancyRateText}`, isCheckbox: false },
        { type: 'cervical_mucus', text: `白带变化: ${cervicalMucusText}`, isCheckbox: false },
      ];
      // 添加备注相关信息项
      if (hasNotes) {
        infoItems.push({ type: 'note_content', text: `备注: ${noteContent}`, isCheckbox: false });
        infoItems.push({ type: 'note', text: '编辑备注', isCheckbox: false, isButton: true });
      } else {
        infoItems.push({ type: 'note', text: '添加备注', isCheckbox: false, isButton: true });
      }
    } else if (dayItem.isFertile) {
      infoItems = [
        // 当前状态已在头部显示，不再在信息项中重复
        { type: 'pregnancy_rate', text: `预测孕率: ${pregnancyRateText}`, isCheckbox: false },
        { type: 'cervical_mucus', text: `白带变化: ${cervicalMucusText}`, isCheckbox: false },
      ];
      // 添加备注相关信息项
      if (hasNotes) {
        infoItems.push({ type: 'note_content', text: `备注: ${noteContent}`, isCheckbox: false });
        infoItems.push({ type: 'note', text: '编辑备注', isCheckbox: false, isButton: true });
      } else {
        infoItems.push({ type: 'note', text: '添加备注', isCheckbox: false, isButton: true });
      }
    } else { // 安全期
      infoItems = [
        // 当前状态已在头部显示，不再在信息项中重复
        { type: 'pregnancy_rate', text: `预测孕率: ${pregnancyRateText}`, isCheckbox: false },
        { type: 'cervical_mucus', text: `白带变化: ${cervicalMucusText}`, isCheckbox: false },
      ];
      // 添加备注相关信息项
      if (hasNotes) {
        infoItems.push({ type: 'note_content', text: `备注: ${noteContent}`, isCheckbox: false });
        infoItems.push({ type: 'note', text: '编辑备注', isCheckbox: false, isButton: true });
      } else {
        infoItems.push({ type: 'note', text: '添加备注', isCheckbox: false, isButton: true });
      }
    }

    return infoItems;
  },

  // 添加点击动画
  addClickAnimation: function(selector) {
    try {
      wx.createSelectorQuery()
        .select(selector)
        .boundingClientRect(rect => {
          if (rect) {
            // 简单的缩放动画效果
            console.log('添加点击动画效果');
          }
        })
        .exec();
    } catch (error) {
      console.warn('动画效果添加失败:', error);
    }
  }
};

// 数据存储管理器
const StorageManager = {
  // 获取经期设置
  getPeriodSettings: function() {
    return wx.getStorageSync('periodSettings') || {};
  },

  // 保存经期设置
  savePeriodSettings: function(settings) {
    wx.setStorageSync('periodSettings', settings);
  },

  // 获取备注
  getNote: function(dateString) {
    return wx.getStorageSync(`notes_${dateString}`) || '';
  },

  // 保存备注
  saveNote: function(dateString, note) {
    if (note) {
      wx.setStorageSync(`notes_${dateString}`, note);
    } else {
      wx.removeStorageSync(`notes_${dateString}`);
    }
  }
};

Page({
  data: {
    currentDateForCalendar: new Date(),
    currentYear: '',
    currentMonthNumber: '',
    calendarRows: [],
    selectedDateInfo: null,
    showSetupWizard: false,
    isUpdateSetup: false,
    periodSettings: {},
    activeTab: 'home',
    // 备注编辑器相关
    showNoteEditor: false,
    noteEditorDate: '',
    noteEditorExistingNote: '',
    // 同步相关状态
    syncStatus: '', // 同步状态：'', 'syncing', 'success', 'error'
    showSyncOptions: false, // 是否显示同步选项面板
    showSyncProgress: false, // 是否显示同步进度条
    syncProgress: 0, // 同步进度，0-100
    syncProgressTitle: '', // 同步进度标题
    showSyncTip: false, // 是否显示同步提示
    syncTipText: '', // 同步提示文本
    syncTipType: 'success', // 同步提示类型：'success', 'error', 'warning'
    showDownloadConfirm: false, // 是否显示下载确认对话框
  },

  onLoad: function () {
    this.initPage();
  },

  onShow: function () {
    const storedSettings = StorageManager.getPeriodSettings();
    const showSetup = !storedSettings || !storedSettings.setupCompleted;
    
    console.log('onShow - storedSettings:', storedSettings);
    console.log('onShow - showSetup:', showSetup);

    if (showSetup !== this.data.showSetupWizard || 
        JSON.stringify(storedSettings) !== JSON.stringify(this.data.periodSettings)) {
      this.setData({
        periodSettings: storedSettings || {},
        showSetupWizard: showSetup,
      });
    }
    this.refreshCalendar();
  },

  initPage: function() {
    const today = new Date();
    const storedSettings = StorageManager.getPeriodSettings();
    const showSetup = !storedSettings || !storedSettings.setupCompleted;

    this.setData({
      currentDateForCalendar: today,
      currentYear: today.getFullYear(),
      currentMonthNumber: today.getMonth() + 1,
      periodSettings: storedSettings,
      showSetupWizard: showSetup,
      activeTab: 'home',
    });

    this.refreshCalendar();
  },

  // 设置完成回调
  onSetupComplete: function (e) {
    const newSettings = e.detail;
    console.log('onSetupComplete called with settings:', newSettings);
    
    // 统一保存设置到同一个数据源
    StorageManager.savePeriodSettings(newSettings);
    this.setData({
      periodSettings: newSettings,
      showSetupWizard: false,
      isUpdateSetup: false
    });
    this.refreshCalendar();
    wx.showToast({
      title: '设置已保存',
      icon: 'success',
    });
  },

  // 设置窗口关闭回调
  onSetupClose: function () {
    this.setData({
      showSetupWizard: false,
      isUpdateSetup: false
    });
  },

  // 刷新日历
  refreshCalendar: function (selectedFullDate = null) {
    const newCalendarRows = this._generateCalendarRows(
      this.data.currentDateForCalendar,
      this.data.periodSettings,
      selectedFullDate || (this.data.selectedDateInfo ? this.data.selectedDateInfo.fullDate : null)
    );
    
    this.setData({
      calendarRows: newCalendarRows,
      currentYear: this.data.currentDateForCalendar.getFullYear(),
      currentMonthNumber: this.data.currentDateForCalendar.getMonth() + 1,
    });

    const finalSelectedDate = selectedFullDate || 
      (this.data.selectedDateInfo ? this.data.selectedDateInfo.fullDate : null);
    
    if (finalSelectedDate) {
      this._updateSelectedDatePanel(finalSelectedDate);
    } else {
      this.setData({ selectedDateInfo: null });
    }
  },

  // 生成日历行数据
  _generateCalendarRows: function (dateForMonth, settings, selectedFullDateStr) {
    const year = dateForMonth.getFullYear();
    const month = dateForMonth.getMonth();
    const today = new Date();
    const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = firstDayOfMonth.getDay();
  
    let calendarDays = [];
  
    // 填充上个月的尾巴
    const prevMonthLastDay = new Date(year, month, 0);
    for (let i = 0; i < startDayOfWeek; i++) {
      const day = prevMonthLastDay.getDate() - startDayOfWeek + 1 + i;
      const fullDate = `${prevMonthLastDay.getFullYear()}-${String(prevMonthLastDay.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDays.push({ day, fullDate, isOtherMonth: true });
    }
  
    // 填充当月日期
    for (let i = 1; i <= daysInMonth; i++) {
      const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      let dayData = {
        day: i,
        fullDate: fullDate,
        isToday: fullDate === todayDateString,
        isSelected: fullDate === selectedFullDateStr,
        isPeriod: false,
        isPredictedOvulation: false,
        isFertile: false,
        isSafe: false,
        isOvulationDay: false,
        cycleStartDateForThisDay: null,
      };
  
      if (settings && settings.setupCompleted) {
        const dayDateObj = new Date(year, month, i);
        const periodInfo = this._getPeriodInfoForDay(dayDateObj, settings);
        
        // 确保所有状态都被正确设置
        dayData = { 
          ...dayData, 
          isPeriod: periodInfo.isPeriod || false,
          isOvulationDay: periodInfo.isOvulationDay || false,
          isFertile: periodInfo.isFertile || false,
          isSafe: periodInfo.isSafe || false,
          cycleStartDateForThisDay: periodInfo.cycleStartDateForThisDay || null
        };
      }
      calendarDays.push(dayData);
    }
  
    // 填充下个月的开头
    const totalCells = Math.ceil(calendarDays.length / 7) * 7;
    let nextMonthDay = 1;
    const nextMonthDate = new Date(year, month + 1, 1);
    while (calendarDays.length < totalCells) {
      const fullDate = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthDay).padStart(2, '0')}`;
      calendarDays.push({ day: nextMonthDay, fullDate, isOtherMonth: true });
      nextMonthDay++;
    }
  
    let newRows = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      newRows.push(calendarDays.slice(i, i + 7));
    }
    return newRows;
  },

  // 获取指定日期的经期信息
  _getPeriodInfoForDay: function(targetDate, settings) {
    console.log('_getPeriodInfoForDay called with:', { targetDate, settings });
    
    const cycleLength = settings.periodCycle || settings.cycleLength;
    if (!settings || !settings.lastPeriodDate || !settings.periodDuration || !cycleLength) {
      console.log('Settings incomplete, returning safe period');
      return { isSafe: true, isPeriod: false, isOvulationDay: false, isFertile: false };
    }
    
    const cycleStart = PeriodCalculator.getCycleStartDate(
      targetDate, 
      new Date(settings.lastPeriodDate),
      cycleLength
    );
    
    const status = PeriodCalculator.calculateStatus(targetDate, cycleStart, settings);
    console.log('Calculated status for', targetDate, ':', status);
    
    return {
      ...status,
      cycleStartDateForThisDay: `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, '0')}-${String(cycleStart.getDate()).padStart(2, '0')}`
    };
  },

  // 月份切换
  changeMonth: function (e) {
    const direction = e.currentTarget.dataset.direction;
    const newDate = new Date(this.data.currentDateForCalendar);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    this.setData({ 
      currentDateForCalendar: newDate, 
      selectedDateInfo: null 
    });
    this.refreshCalendar();
  },

  // 日期点击处理 - 重构版本
  handleDayClick: function (e) {
    const dayItem = e.currentTarget.dataset.day;
    console.log('handleDayClick called with dayItem:', dayItem);
    
    if (!dayItem || dayItem.isOtherMonth) {
      // 如果点击的是其他月份的日期或无效日期，不执行任何操作
      return;
    }
  
    const clickedFullDate = dayItem.fullDate;
    
    // 验证日期是否有效
    if (!clickedFullDate) {
      console.warn('Invalid date clicked:', dayItem);
      return;
    }
  
    // 如果点击的是已选中的日期，则取消选中
    if (this.data.selectedDateInfo && this.data.selectedDateInfo.fullDate === clickedFullDate) {
      this.setData({ selectedDateInfo: null });
      this.refreshCalendar();
      return;
    }
  
    // 获取经期信息
    const periodInfo = this._getPeriodInfoForDay(new Date(clickedFullDate), this.data.periodSettings);
    console.log('Period info for clicked date:', periodInfo);
    
    // 合并日期项和期间信息
    const mergedDayInfo = { ...dayItem, ...periodInfo };
    console.log('Merged day info:', mergedDayInfo);
    
    // 构建信息面板内容
    const infoItems = UIManager.buildInfoItems(mergedDayInfo, this.data.periodSettings);
    console.log('Generated infoItems:', infoItems);
    
    // 获取状态文本
    let statusText = '';
    if (periodInfo.isOvulationDay) {
      statusText = '排卵日';
    } else if (periodInfo.isFertile) {
      statusText = '易孕期';
    } else if (periodInfo.isPeriod) {
      statusText = '月经期';
    } else if (periodInfo.isSafe) {
      statusText = '安全期';
    }
    
    // 格式化日期显示
    const date = new Date(clickedFullDate);
    const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = `星期${weekdays[date.getDay()]}`;
    const year = date.getFullYear();
    
    // 更新UI
    const selectedDateInfo = {
      ...dayItem,
      ...periodInfo,
      monthDay: monthDay,
      weekday: weekday,
      year: year,
      statusText: statusText,
      infoItems: infoItems,
      pregnancyRateDisplay: this._getPregnancyRateText(periodInfo),
      hasNotes: !!StorageManager.getNote(clickedFullDate)
    };
    
    console.log('Setting selectedDateInfo:', selectedDateInfo);
    
    this.setData({
      selectedDateInfo: selectedDateInfo
    });
  
    // 添加点击动画效果
    UIManager.addClickAnimation(`.day-${clickedFullDate}`);
    
    // 刷新日历以更新选中状态
    this.refreshCalendar(clickedFullDate);
  },

  // 原有的日期点击处理（保持兼容性）
  onDayClick: function (e) {
    this.handleDayClick(e);
  },

  // 获取怀孕率文本
  _getPregnancyRateText: function(periodInfo) {
    if (periodInfo.isOvulationDay) return '很高';
    if (periodInfo.isFertile) return '较高';
    if (periodInfo.isPeriod) return '极低';
    return '较低';
  },

  // 更新选中日期面板
  _updateSelectedDatePanel: function(fullDateStr) {
    let selectedDayItem = null;
    for (const row of this.data.calendarRows) {
      for (const day of row) {
        if (day.fullDate === fullDateStr && !day.isOtherMonth) {
          selectedDayItem = day;
          break;
        }
      }
      if (selectedDayItem) break;
    }

    if (selectedDayItem) {
      const newSelectedInfo = this._buildSelectedDateInfo(selectedDayItem, this.data.periodSettings);
      this.setData({ selectedDateInfo: newSelectedInfo });
    } else {
      this.setData({ selectedDateInfo: null });
    }
  },

  // 构建选中日期信息
  _buildSelectedDateInfo: function (dayItem, settings) {
    if (!dayItem || dayItem.isOtherMonth) return null;

    const hasNotes = !!StorageManager.getNote(dayItem.fullDate);
    const pregnancyRateText = this._getPregnancyRateText(dayItem);
    
    // 获取状态文本
    let statusText = '';
    if (dayItem.isOvulationDay) {
      statusText = '排卵日';
    } else if (dayItem.isFertile) {
      statusText = '易孕期';
    } else if (dayItem.isPeriod) {
      statusText = '月经期';
    } else if (dayItem.isSafe) {
      statusText = '安全期';
    }
    
    let predictedOvulationDateStr = '未预测';
    if (dayItem.isOvulationDay) {
      const ovDate = new Date(dayItem.fullDate);
      predictedOvulationDateStr = `${ovDate.getMonth() + 1}月${ovDate.getDate()}日`;
    }

    // 格式化日期显示
    const date = new Date(dayItem.fullDate);
    const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = `星期${weekdays[date.getDay()]}`;
    const year = date.getFullYear();

    const infoItems = UIManager.buildInfoItems(dayItem, settings);

    return {
      ...dayItem,
      monthDay: monthDay,
      weekday: weekday,
      year: year,
      statusText: statusText,
      predictedOvulationDateDisplay: predictedOvulationDateStr,
      pregnancyRateDisplay: pregnancyRateText,
      hasNotes: hasNotes,
      infoItems: infoItems,
    };
  },

  // 信息项变更处理
  onInfoItemChange: function (e) {
    if (!this.data.selectedDateInfo) return;

    const type = e.currentTarget.dataset.type;
    const isChecked = e.detail && e.detail.value && e.detail.value.length > 0 && 
      e.detail.value[0] === (e.currentTarget.dataset.checkValue || 'true');

    const fullDate = this.data.selectedDateInfo.fullDate;
    let currentSettings = { ...this.data.periodSettings };
    let settingsChanged = false;

    if (type === 'note') {
      // 打开备注编辑器
      const existingNote = StorageManager.getNote(fullDate);
      this.setData({
        showNoteEditor: true,
        noteEditorDate: fullDate,
        noteEditorExistingNote: existingNote
      });
      return;
    }

    if (!currentSettings.setupCompleted) {
      wx.showToast({ title: '请先完成月经设置', icon: 'none' });
      this._revertCheckboxState(type);
      return;
    }

    // 移除了原有的月经开始和结束处理逻辑

    if (settingsChanged) {
      // 统一保存到同一个数据源
      StorageManager.savePeriodSettings(currentSettings);
      this.setData({ periodSettings: currentSettings });
      this.refreshCalendar(fullDate);
    } else {
      const newSelectedInfo = this._buildSelectedDateInfo(this.data.selectedDateInfo, currentSettings);
      if (newSelectedInfo) {
        newSelectedInfo.infoItems = newSelectedInfo.infoItems.map(item => 
          item.type === type ? { ...item, checked: isChecked } : item
        );
        this.setData({ selectedDateInfo: newSelectedInfo });
      }
    }
  },

  // 恢复复选框状态
  _revertCheckboxState: function(type) {
    if (this.data.selectedDateInfo && this.data.selectedDateInfo.infoItems) {
      const newInfoItems = this.data.selectedDateInfo.infoItems.map(item => {
        if (item.type === type) {
          return { ...item, checked: false };
        }
        return item;
      });
      this.setData({ 'selectedDateInfo.infoItems': newInfoItems });
    }
  },

  // 底部导航处理
  onTabChange: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 底部导航处理
  handleFooterTap: function(e) {
    const action = e.currentTarget.dataset.action;
    this.setData({ activeTab: action });
    
    // 根据不同的操作执行相应的功能
    switch(action) {
      case 'settings':
        // 打开设置面板
        this.setData({
          showSetupWizard: true,
          isUpdateSetup: true
        });
        break;
      case 'sync':
        // 处理数据同步功能
        this.handleDataSync();
        break;
      case 'share':
        // 处理分享功能
        wx.showShareMenu({
          withShareTicket: true,
          menus: ['shareAppMessage', 'shareTimeline']
        });
        break;
      case 'service':
        // 客服功能由open-type="contact"自动处理
        break;
    }
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于catchtap阻止事件冒泡
  },

  // 显示同步选项面板
  showSyncOptions() {
    this.setData({
      showSyncOptions: true
    });
  },

  // 隐藏同步选项面板
  hideSyncOptions() {
    this.setData({
      showSyncOptions: false
    });
  },

  // 显示下载确认对话框
  showDownloadConfirm() {
    this.setData({
      showDownloadConfirm: true,
      showSyncOptions: false
    });
  },

  // 隐藏下载确认对话框
  hideDownloadConfirm() {
    this.setData({
      showDownloadConfirm: false
    });
  },

  // 显示同步提示
  showSyncTip(text, type = 'success') {
    this.setData({
      syncTipText: text,
      syncTipType: type,
      showSyncTip: true
    });

    // 3秒后自动隐藏
    setTimeout(() => {
      this.setData({
        showSyncTip: false
      });
    }, 3000);
  },

  // 处理同步错误
  handleSyncError(errorMsg) {
    this.setData({
      showSyncProgress: false,
      syncStatus: ''
    });
    this.showSyncTip(errorMsg, 'error');
    wx.vibrateShort(); // 震动提示错误
  },

  // 数据同步处理
  handleDataSync: function() {
    // 防止恶意同步 - 检查上次同步时间
    const lastSyncTime = wx.getStorageSync('lastSyncTime') || 0;
    const currentTime = Date.now();
    const syncInterval = 30 * 1000; // 30秒间隔限制
    
    if (currentTime - lastSyncTime < syncInterval) {
      const remainingTime = Math.ceil((syncInterval - (currentTime - lastSyncTime)) / 1000);
      
      // 使用自定义提示框而不是默认的Toast
      this.setData({
        showSyncTip: true,
        syncTipType: 'warning',
        syncTipMessage: `请等待${remainingTime}秒后再同步`,
      });
      
      // 3秒后自动隐藏提示
      setTimeout(() => {
        this.setData({
          showSyncTip: false
        });
      }, 3000);
      return;
    }
    
    // 显示美化后的同步选项
    this.setData({
      showSyncOptions: true
    });
  },
  
  // 关闭同步选项面板
  closeSyncOptions: function() {
    this.setData({
      showSyncOptions: false
    });
  },

  // 取消下载
  cancelDownload: function() {
    this.setData({
      showDownloadConfirm: false
    });
  },

  // 阻止事件冒泡
  stopPropagation: function() {
    // 空函数，用于catchtap阻止事件冒泡
  },
  
  // 选择同步选项
  selectSyncOption: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      showSyncOptions: false
    });
    
    if (type === 'upload') {
      this.uploadDataToCloud();
    } else if (type === 'download') {
      this.downloadDataFromCloud();
    }
  },

  // 上传数据到云端
  uploadDataToCloud: function() {
    // 隐藏选项面板
    this.setData({
      showSyncOptions: false
    });
    
    // 显示进度条
    this.setData({
      showSyncProgress: true,
      syncProgress: 0,
      syncProgressTitle: '正在上传数据',
      syncStatus: 'syncing'
    });

    // 模拟进度
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress >= 90) {
        clearInterval(progressInterval);
      }
      this.setData({
        syncProgress: progress
      });
    }, 200);

    const periodSettings = StorageManager.getPeriodSettings();
    const notes = this.getAllNotes();
    
    wx.cloud.callFunction({
      name: 'period-data',
      data: {
        action: 'upload',
        periodSettings,
        notes
      },
      success: (res) => {
        clearInterval(progressInterval);
        
        if (res.result && res.result.success) {
          // 设置进度为100%
          this.setData({
            syncProgress: 100,
            syncProgressTitle: '上传完成'
          });
          
          // 延迟关闭进度条
          setTimeout(() => {
            this.setData({
              showSyncProgress: false,
              syncStatus: ''
            });
            wx.setStorageSync('lastSyncTime', Date.now());
            this.showSyncTip('数据上传成功');
          }, 800);
        } else {
          this.handleSyncError('数据上传失败');
        }
      },
      fail: (err) => {
        clearInterval(progressInterval);
        console.error('上传数据失败', err);
        this.handleSyncError('数据上传失败');
      }
    });
  },
  
  // 处理同步错误
  handleSyncError: function(errorMsg) {
    this.setData({
      showSyncProgress: false,
      syncStatus: 'sync-error',
      showSyncTip: true,
      syncTipType: 'error',
      syncTipMessage: errorMsg,
    });
    
    // 震动反馈
    wx.vibrateShort();
    
    // 3秒后隐藏提示
    setTimeout(() => {
      this.setData({
        showSyncTip: false,
        syncStatus: ''
      });
    }, 3000);
  },

  // 从云端下载数据
  downloadDataFromCloud: function() {
    this.setData({
      showDownloadConfirm: true,
      showSyncOptions: false
    });
  },
  
  // 关闭下载确认对话框
  closeDownloadConfirm: function() {
    this.setData({
      showDownloadConfirm: false
    });
  },
  
  // 确认下载数据
  confirmDownload: function() {
    // 隐藏确认对话框
    this.setData({
      showDownloadConfirm: false
    });
    
    // 显示进度条
    this.setData({
      showSyncProgress: true,
      syncProgress: 0,
      syncProgressTitle: '正在下载数据',
      syncStatus: 'syncing'
    });

    // 模拟进度
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 5;
      if (progress >= 90) {
        clearInterval(progressInterval);
      }
      this.setData({
        syncProgress: progress
      });
    }, 200);

    wx.cloud.callFunction({
      name: 'period-data',
      data: {
        action: 'download'
      },
      success: (res) => {
        clearInterval(progressInterval);
        
        if (res.result && res.result.success) {
          // 设置进度为100%
          this.setData({
            syncProgress: 100,
            syncProgressTitle: '下载完成'
          });
          
          const { periodSettings, notes } = res.result.data;
          
          // 保存周期设置
          if (periodSettings) {
            StorageManager.savePeriodSettings(periodSettings);
            this.setData({ periodSettings });
          }
          
          // 保存笔记
          if (notes) {
            this.saveAllNotes(notes);
          }
          
          // 延迟关闭进度条
          setTimeout(() => {
            this.setData({
              showSyncProgress: false,
              syncStatus: ''
            });
            wx.setStorageSync('lastSyncTime', Date.now());
            this.showSyncTip('数据下载成功');
            
            // 重新加载页面数据
            this.refreshCalendar();
          }, 800);
        } else {
          this.handleSyncError('数据下载失败');
        }
      },
      fail: (err) => {
        clearInterval(progressInterval);
        console.error('下载数据失败', err);
        this.handleSyncError('数据下载失败');
      }
    });
  },

  // 获取所有备注数据
  getAllNotes: function() {
    const notes = {};
    try {
      const info = wx.getStorageInfoSync();
      info.keys.forEach(key => {
        if (key.startsWith('notes_')) {
          const dateKey = key.replace('notes_', '');
          const noteContent = wx.getStorageSync(key);
          if (noteContent) {
            notes[dateKey] = noteContent;
          }
        }
      });
    } catch (error) {
      console.error('获取备注数据失败:', error);
    }
    return notes;
  },

  // 保存所有备注数据
  saveAllNotes: function(notes) {
    try {
      // 先清除现有的备注数据
      const info = wx.getStorageInfoSync();
      info.keys.forEach(key => {
        if (key.startsWith('notes_')) {
          wx.removeStorageSync(key);
        }
      });
      
      // 保存新的备注数据
      Object.keys(notes).forEach(dateKey => {
        if (notes[dateKey]) {
          wx.setStorageSync(`notes_${dateKey}`, notes[dateKey]);
        }
      });
    } catch (error) {
      console.error('保存备注数据失败:', error);
    }
  },

  // 备注编辑器事件处理
  onNoteEditorSave: function(e) {
    const { date, note } = e.detail;
    
    // 保存备注
    StorageManager.saveNote(date, note);
    
    // 检查是否包含月经相关选项并处理
    let currentSettings = { ...this.data.periodSettings };
    let settingsChanged = false;
    let toastMessage = '备注已保存';
    
    if (note.includes('月经来了')) {
      // 月经来了 - 更新月经开始日期和周期
      const selectedDate = new Date(date);
      const lastPeriodDate = new Date(currentSettings.lastPeriodDate);
      
      // 计算新的周期长度
      const daysDiff = Math.floor((selectedDate - lastPeriodDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > 0) {
        currentSettings.periodCycle = daysDiff;
        currentSettings.cycleLength = daysDiff;
      }
      
      // 更新末次月经日期
      currentSettings.lastPeriodDate = date;
      settingsChanged = true;
      toastMessage = '已更新月经开始日期';
      
    } else if (note.includes('月经走了')) {
      // 月经走了 - 更新月经持续时间
      const selectedDate = new Date(date);
      const lastPeriodDate = new Date(currentSettings.lastPeriodDate);
      
      // 计算持续天数
      const durationDays = Math.floor((selectedDate - lastPeriodDate) / (1000 * 60 * 60 * 24)) + 1;
      if (durationDays > 0) {
        currentSettings.periodDuration = durationDays;
        settingsChanged = true;
        toastMessage = `已更新月经持续时间为${durationDays}天`;
      }
      
    } else if (note.includes('月经还在')) {
      // 月经还在 - 延长月经持续时间
      const selectedDate = new Date(date);
      const lastPeriodDate = new Date(currentSettings.lastPeriodDate);
      
      // 计算新的持续天数
      const newDurationDays = Math.floor((selectedDate - lastPeriodDate) / (1000 * 60 * 60 * 24)) + 1;
      if (newDurationDays > (currentSettings.periodDuration || 5)) {
        currentSettings.periodDuration = newDurationDays;
        settingsChanged = true;
        toastMessage = `已延长月经持续时间至${newDurationDays}天`;
      }
    }
    
    // 如果设置有变化，保存并刷新日历
    if (settingsChanged) {
      StorageManager.savePeriodSettings(currentSettings);
      this.setData({ periodSettings: currentSettings });
      this.refreshCalendar(date);
    }
    
    // 关闭编辑器
    this.setData({
      showNoteEditor: false,
      noteEditorDate: '',
      noteEditorExistingNote: ''
    });
    
    // 刷新选中日期信息
    if (this.data.selectedDateInfo && this.data.selectedDateInfo.fullDate === date) {
      const finalSettings = settingsChanged ? currentSettings : StorageManager.getPeriodSettings();
      const newSelectedInfo = this._buildSelectedDateInfo(this.data.selectedDateInfo, finalSettings);
      this.setData({ selectedDateInfo: newSelectedInfo });
    }
    
    // 显示相应提示
    if (note.trim()) {
      wx.showToast({ title: toastMessage, icon: 'success' });
    } else {
      wx.showToast({ title: '备注已删除', icon: 'success' });
    }
  },

  onNoteEditorClose: function() {
    this.setData({
      showNoteEditor: false,
      noteEditorDate: '',
      noteEditorExistingNote: ''
    });
  },

  // 咨询医生点击处理
  onDoctorConsultation: function() {
    // 获取用户提供的腾讯健康小程序链接
    const miniProgramLink = '#小程序://腾讯健康/4yU7SfdqKK2AuIv';
    
    // 尝试直接跳转到腾讯健康小程序
    wx.navigateToMiniProgram({ 
      appId: 'wxb032bc789053daf4', // 确认腾讯健康的正确AppID
      path: 'wenzhen/pages/doctor/index/main?adtag=10030015&doctorId=1617559963&th_share_src=13923835&partnerId=100000058', // 目标页面路径 
      // 可选参数： 
      extraData: { 
        from: 'h-care', // 自定义参数，供腾讯健康小程序接收处理 
        userId: this.data.userInfo ? this.data.userInfo._id : ''
      },
      // 打开正式版本
      envVersion: 'release',
      success: function(res) { 
        console.log('跳转成功'); 
        // 跳转成功后的逻辑（如记录用户行为） 
      }, 
      fail: function(res) { 
        console.error('跳转失败:', res.errMsg); 
        // 如果跳转失败，使用小程序链接方式
        wx.setClipboardData({
          data: miniProgramLink,
          success: function() {
            wx.showModal({
              title: '咨询医生',
              content: '已为您复制腾讯健康小程序链接！\n\n请在微信聊天窗口粘贴发送，点击链接即可打开腾讯健康小程序进行医生咨询。',
              showCancel: false,
              confirmText: '知道了'
            });
          },
          fail: function() {
            wx.showModal({
              title: '咨询医生',
              content: '请手动复制以下小程序链接：\n\n' + miniProgramLink + '\n\n在微信聊天窗口粘贴发送，点击即可打开腾讯健康小程序。',
              showCancel: false,
              confirmText: '知道了'
            });
          }
        });
      }
    });
  },
  
  // 分享给朋友
  onShareAppMessage() {
    const app = getApp();
    return app.globalData.shareInfo;
  },

  // 分享到朋友圈
  onShareTimeline() {
    const app = getApp();
    return app.globalData.shareInfo;
  }
});