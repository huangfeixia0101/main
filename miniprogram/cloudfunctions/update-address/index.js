// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const addressCollection = db.collection('addresses')

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event
  
  if (!openid) {
    return {
      code: 1,
      message: '用户未登录'
    }
  }

  try {
    switch (action) {
      case 'add':
        return await addAddress(openid, data)
      case 'update':
        return await updateAddress(openid, data)
      case 'delete':
        return await deleteAddress(openid, data)
      case 'detail':
        return await getAddressDetail(openid, data)
      case 'list':
        return await getAddressList(openid)
      case 'setDefault':
        return await setDefaultAddress(openid, data)
      default:
        return {
          code: 1,
          message: '无效的操作类型'
        }
    }
  } catch (error) {
    console.error('地址操作失败：', error)
    return {
      code: 1,
      message: '操作失败'
    }
  }
}

// 验证手机号码格式
function validatePhoneNumber(phone) {
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(phone)
}

// 添加地址
async function addAddress(openid, address) {
  if (!address) {
    return {
      code: 1,
      message: '地址信息不能为空'
    }
  }

  if (!validatePhoneNumber(address.phone)) {
    return {
      code: 1,
      message: '请输入正确的手机号码'
    }
  }

  // 如果设置为默认地址，需要将其他地址设为非默认
  if (address.isDefault) {
    await addressCollection.where({
      _openid: openid,
      isDefault: true
    }).update({
      data: {
        isDefault: false
      }
    })
  }

  // 添加新地址
  const result = await addressCollection.add({
    data: {
      ...address,
      _openid: openid,
      createTime: db.serverDate()
    }
  })
  
  return {
    code: 0,
    message: '添加成功',
    data: {
      id: result._id
    }
  }
}

// 更新地址
async function updateAddress(openid, { id, address }) {
  if (!id || !address) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  if (!validatePhoneNumber(address.phone)) {
    return {
      code: 1,
      message: '请输入正确的手机号码'
    }
  }

  // 先检查地址是否存在且属于当前用户
  const addressDoc = await addressCollection.doc(id).get()
  if (addressDoc.data._openid !== openid) {
    return {
      code: 1,
      message: '无权修改该地址'
    }
  }

  // 如果设置为默认地址，需要将其他地址设为非默认
  if (address.isDefault) {
    await addressCollection.where({
      _openid: openid,
      isDefault: true,
      _id: db.command.neq(id)
    }).update({
      data: {
        isDefault: false
      }
    })
  }

  // 更新地址信息
  await addressCollection.doc(id).update({
    data: {
      ...address,
      updateTime: db.serverDate()
    }
  })
  
  return {
    code: 0,
    message: '更新成功'
  }
}

// 删除地址
async function deleteAddress(openid, { id }) {
  if (!id) {
    return {
      code: 1,
      message: '地址ID不能为空'
    }
  }

  // 检查地址是否存在且属于当前用户
  const addressDoc = await addressCollection.doc(id).get()
  if (addressDoc.data._openid !== openid) {
    return {
      code: 1,
      message: '无权删除该地址'
    }
  }

  // 删除地址
  await addressCollection.doc(id).remove()
  
  return {
    code: 0,
    message: '删除成功'
  }
}

// 获取地址详情
async function getAddressDetail(openid, { id }) {
  if (!id) {
    return {
      code: 1,
      message: '地址ID不能为空'
    }
  }

  // 查询指定ID的地址，并确保是当前用户的地址
  const address = await addressCollection.doc(id).get()
  
  // 验证地址所属
  if (address.data._openid !== openid) {
    return {
      code: 1,
      message: '无权访问该地址'
    }
  }
  
  return {
    code: 0,
    data: address.data
  }
}

// 获取地址列表
async function getAddressList(openid) {
  // 查询当前用户的所有地址
  const { data } = await addressCollection
    .where({
      _openid: openid
    })
    .orderBy('isDefault', 'desc') // 默认地址排在前面
    .get()
  
  return {
    code: 0,
    data
  }
}

// 设置默认地址
async function setDefaultAddress(openid, { id }) {
  if (!id) {
    return {
      code: 1,
      message: '地址ID不能为空'
    }
  }

  // 检查地址是否存在且属于当前用户
  const addressDoc = await addressCollection.doc(id).get()
  if (addressDoc.data._openid !== openid) {
    return {
      code: 1,
      message: '无权操作该地址'
    }
  }

  // 将其他地址设为非默认
  await addressCollection.where({
    _openid: openid,
    isDefault: true,
    _id: db.command.neq(id)
  }).update({
    data: {
      isDefault: false
    }
  })

  // 设置当前地址为默认地址
  await addressCollection.doc(id).update({
    data: {
      isDefault: true,
      updateTime: db.serverDate()
    }
  })

  return {
    code: 0,
    message: '设置成功'
  }
}