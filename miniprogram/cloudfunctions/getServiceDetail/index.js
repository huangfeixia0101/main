const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { serviceId } = event

  try {
    const db = cloud.database()
    const result = await db.collection('ai_service')
      .where({
        _id: serviceId,
        status: 'active' // 确保服务状态为 true
      })
      .get()

    if (result.data.length === 0) {
      return {
        code: 404,
        message: '服务不存在或已下架'
      }
    }

    // 在返回数据前，检查并处理图片路径
    if (result.data[0].images && result.data[0].images.length > 0) {
      const imagePromises = result.data[0].images.map(async image => {
        if (typeof image === 'object' && Object.keys(image).length === 0) {
          return null; // 跳过空对象
        }
        if (typeof image === 'string' && image.startsWith('cloud://')) {
          // 将云存储路径转换为 HTTPS URL
          const res = await cloud.getTempFileURL({
            fileList: [image]
          })
          return res.fileList[0].tempFileURL
        }
        return image
      })
      // 等待所有图片处理完成
      result.data[0].images = (await Promise.all(imagePromises)).filter(url => url !== null)
    }

    return {
      code: 200,
      data: result.data[0]
    }
  } catch (err) {
    console.error('获取服务详情失败:', err)
    return {
      code: 500,
      message: '服务器内部错误'
    }
  }
}