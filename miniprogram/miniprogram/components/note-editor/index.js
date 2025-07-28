Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    selectedDate: {
      type: String,
      value: ''
    },
    existingNote: {
      type: String,
      value: ''
    }
  },

  data: {
    selectedOption: '',
    customNote: '',
    quickOptions: ['月经来了', '月经还在', '月经走了']
  },

  observers: {
    'visible': function(visible) {
      if (visible) {
        this._initializeData();
      }
    },
    'existingNote': function(note) {
      this._parseExistingNote(note);
    }
  },

  methods: {
    // 初始化数据
    _initializeData() {
      this.setData({
        selectedOption: '',
        customNote: ''
      });
      
      // 如果有现有备注，解析它
      if (this.properties.existingNote) {
        this._parseExistingNote(this.properties.existingNote);
      }
    },

    // 解析现有备注
    _parseExistingNote(note) {
      if (!note) return;
      
      const quickOptions = this.data.quickOptions;
      let selectedOption = '';
      let customNote = note;
      
      // 检查是否是快速选项
      for (let option of quickOptions) {
        if (note.includes(option)) {
          selectedOption = option;
          // 移除快速选项文本，保留自定义部分
          customNote = note.replace(option, '').trim();
          if (customNote.startsWith('，') || customNote.startsWith(',')) {
            customNote = customNote.substring(1).trim();
          }
          break;
        }
      }
      
      this.setData({
        selectedOption,
        customNote
      });
    },

    // 选择快速选项
    onOptionSelect(e) {
      const option = e.currentTarget.dataset.option;
      const currentSelected = this.data.selectedOption;
      
      this.setData({
        selectedOption: currentSelected === option ? '' : option
      });
    },

    // 自定义备注输入
    onCustomNoteInput(e) {
      this.setData({
        customNote: e.detail.value
      });
    },

    // 保存备注
    onSave() {
      const { selectedOption, customNote } = this.data;
      
      // 构建最终的备注内容
      let finalNote = '';
      
      if (selectedOption) {
        finalNote = selectedOption;
        if (customNote.trim()) {
          finalNote += '，' + customNote.trim();
        }
      } else if (customNote.trim()) {
        finalNote = customNote.trim();
      }
      
      // 触发保存事件
      this.triggerEvent('save', {
        date: this.properties.selectedDate,
        note: finalNote
      });
      
      // 关闭弹窗
      this.onClose();
    },

    // 关闭弹窗
    onClose() {
      this.triggerEvent('close');
    },

    // 阻止事件冒泡
    onContentTap() {
      // 阻止点击内容区域时关闭弹窗
    }
  }
});