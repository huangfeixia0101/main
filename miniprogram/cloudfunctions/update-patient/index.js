// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const patientCollection = db.collection('patients')

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
        return await addPatient(openid, data)
      case 'update':
        return await updatePatient(openid, data)
      case 'delete':
        return await deletePatient(openid, data)
      case 'detail':
        return await getPatientDetail(openid, data)
      case 'list':
        return await getPatientList(openid)
      case 'setDefault':
        return await setDefaultPatient(openid, data)
      default:
        return {
          code: 1,
          message: '无效的操作类型'
        }
    }
  } catch (error) {
    console.error('就诊人操作失败：', error)
    return {
      code: 1,
      message: '操作失败'
    }
  }
}

// 验证手机号码格式
function validatePhoneNumber(phone) {
  if (!phone) return true // 手机号是选填项
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(phone)
}

// 验证身份证号格式
function validateIdCard(idCard) {
  if (!idCard) return true // 身份证号是选填项
  const idCardReg = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/
  return idCardReg.test(idCard)
}

// 添加就诊人
async function addPatient(openid, patient) {
  if (!patient) {
    return {
      code: 1,
      message: '就诊人信息不能为空'
    }
  }

  if (!patient.name) {
    return {
      code: 1,
      message: '就诊人姓名不能为空'
    }
  }

  if (!patient.relation) {
    return {
      code: 1,
      message: '请选择与就诊人关系'
    }
  }

  if (patient.phone && !validatePhoneNumber(patient.phone)) {
    return {
      code: 1,
      message: '请输入正确的手机号码'
    }
  }

  if (patient.idCard && !validateIdCard(patient.idCard)) {
    return {
      code: 1,
      message: '请输入正确的身份证号'
    }
  }

  // 如果设置为默认就诊人，需要将其他就诊人设为非默认
  if (patient.isDefault) {
    await patientCollection.where({
      _openid: openid,
      isDefault: true
    }).update({
      data: {
        isDefault: false
      }
    })
  }

  // 生成唯一的patientId
  const patientId = `P${Date.now()}${Math.floor(Math.random() * 1000)}`

  // 添加新就诊人
  const result = await patientCollection.add({
    data: {
      ...patient,
      _openid: openid,
      patientId: patientId,  // 添加patientId字段
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

// 更新就诊人
async function updatePatient(openid, { id, patient }) {
  if (!id || !patient) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  if (!patient.name) {
    return {
      code: 1,
      message: '就诊人姓名不能为空'
    }
  }

  if (!patient.relation) {
    return {
      code: 1,
      message: '请选择与就诊人关系'
    }
  }

  if (patient.phone && !validatePhoneNumber(patient.phone)) {
    return {
      code: 1,
      message: '请输入正确的手机号码'
    }
  }

  if (patient.idCard && !validateIdCard(patient.idCard)) {
    return {
      code: 1,
      message: '请输入正确的身份证号'
    }
  }

  // 先检查就诊人是否存在且属于当前用户
  const patientDoc = await patientCollection.doc(id).get()
  if (patientDoc.data._openid !== openid) {
    return {
      code: 1,
      message: '无权修改该就诊人'
    }
  }

  // 如果设置为默认就诊人，需要将其他就诊人设为非默认
  if (patient.isDefault) {
    await patientCollection.where({
      _openid: openid,
      isDefault: true,
      _id: db.command.neq(id)
    }).update({
      data: {
        isDefault: false
      }
    })
  }

  // 更新就诊人信息
  await patientCollection.doc(id).update({
    data: {
      ...patient,
      updateTime: db.serverDate()
    }
  })
  
  return {
    code: 0,
    message: '更新成功'
  }
}

// 删除就诊人
async function deletePatient(openid, { id }) {
  if (!id) {
    return {
      code: 1,
      message: '就诊人ID不能为空'
    }
  }

  // 检查就诊人是否存在且属于当前用户
  const patientDoc = await patientCollection.doc(id).get()
  if (patientDoc.data._openid !== openid) {
    return {
      code: 1,
      message: '无权删除该就诊人'
    }
  }

  // 删除就诊人
  await patientCollection.doc(id).remove()
  
  return {
    code: 0,
    message: '删除成功'
  }
}

// 获取就诊人详情
async function getPatientDetail(openid, { id }) {
  if (!id) {
    return {
      code: 1,
      message: '就诊人ID不能为空'
    }
  }

  // 查询指定ID的就诊人，并确保是当前用户的就诊人
  const patient = await patientCollection.doc(id).get()
  
  // 验证就诊人所属
  if (patient.data._openid !== openid) {
    return {
      code: 1,
      message: '无权访问该就诊人'
    }
  }
  
  return {
    code: 0,
    data: patient.data
  }
}

// 获取就诊人列表
async function getPatientList(openid) {
  // 查询当前用户的所有就诊人
  const { data } = await patientCollection
    .where({
      _openid: openid
    })
    .orderBy('isDefault', 'desc') // 默认就诊人排在前面
    .get()
  
  return {
    code: 0,
    data
  }
}

// 设置默认就诊人
async function setDefaultPatient(openid, { id }) {
  if (!id) {
    return {
      code: 1,
      message: '就诊人ID不能为空'
    }
  }

  // 检查就诊人是否存在且属于当前用户
  const patientDoc = await patientCollection.doc(id).get()
  if (patientDoc.data._openid !== openid) {
    return {
      code: 1,
      message: '无权操作该就诊人'
    }
  }

  // 将其他就诊人设为非默认
  await patientCollection.where({
    _openid: openid,
    isDefault: true,
    _id: db.command.neq(id)
  }).update({
    data: {
      isDefault: false
    }
  })

  // 设置当前就诊人为默认就诊人
  await patientCollection.doc(id).update({
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