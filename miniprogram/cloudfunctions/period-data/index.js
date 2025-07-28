// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const collection = db.collection('period_data')

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    switch (event.action) {
      case 'upload':
        return await uploadData(openid, event.periodSettings, event.notes)
      case 'download':
        return await downloadData(openid)
      default:
        return {
          success: false,
          message: '未知操作类型'
        }
    }
  } catch (error) {
    console.error('云函数执行错误:', error)
    return {
      success: false,
      message: '服务器内部错误'
    }
  }
}

// 上传数据到云端
async function uploadData(openid, periodSettings, notes) {
  try {
    // 检查是否已存在用户数据
    const existingData = await collection.where({
      _openid: openid
    }).get()
    
    const uploadData = {
      _openid: openid,
      periodSettings: periodSettings,
      notes: notes,
      updateTime: new Date()
    }
    
    if (existingData.data.length > 0) {
      // 更新现有数据
      await collection.doc(existingData.data[0]._id).update({
        data: {
          periodSettings: periodSettings,
          notes: notes,
          updateTime: new Date()
        }
      })
    } else {
      // 创建新数据
      await collection.add({
        data: uploadData
      })
    }
    
    return {
      success: true,
      message: '数据上传成功'
    }
  } catch (error) {
    console.error('上传数据失败:', error)
    return {
      success: false,
      message: '上传数据失败'
    }
  }
}

// 从云端下载数据
async function downloadData(openid) {
  try {
    const result = await collection.where({
      _openid: openid
    }).get()
    
    if (result.data.length === 0) {
      return {
        success: false,
        message: '云端暂无数据'
      }
    }
    
    const userData = result.data[0]
    return {
      success: true,
      data: {
        periodSettings: userData.periodSettings,
        notes: userData.notes
      },
      message: '数据下载成功'
    }
  } catch (error) {
    console.error('下载数据失败:', error)
    return {
      success: false,
      message: '下载数据失败'
    }
  }
}