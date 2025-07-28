const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { searchKey, pageNum = 1, pageSize = 10 } = event

  try {
    let query = {
      status: 'active'
    }

    // 如果有搜索关键词，添加名称或描述的模糊搜索
    if (searchKey) {
      query = _.or([
        {
          name: db.RegExp({
            regexp: searchKey,
            options: 'i'
          })
        },
        {
          brief: db.RegExp({
            regexp: searchKey,
            options: 'i'
          })
        }
      ])
    }

    // 获取总数
    const countResult = await db.collection('ai_service')
      .where(query)
      .count()

    // 获取分页数据
    const services = await db.collection('ai_service')
      .where(query)
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .get()

    return {
      code: 0,
      message: '获取成功',
      data: {
        list: services.data,
        total: countResult.total,
        pageNum,
        pageSize
      }
    }

  } catch (err) {
    console.error(err)
    return {
      code: -1,
      message: '获取失败',
      error: err
    }
  }
}