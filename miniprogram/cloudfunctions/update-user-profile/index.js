const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 上传头像到云存储
async function uploadAvatar(avatarUrl) {
  try {
    console.log('开始处理头像上传，原始URL:', avatarUrl)
    // 下载临时文件
    const res = await cloud.downloadFile({
      fileID: avatarUrl,
    })
    const buffer = res.fileContent
    console.log('成功下载临时文件')

    // 上传到云存储
    const upload = await cloud.uploadFile({
      cloudPath: `avatars/${Date.now()}.png`,
      fileContent: buffer
    })
    console.log('头像上传成功，新的fileID:', upload.fileID)

    return upload.fileID
  } catch (error) {
    console.error('上传头像失败:', error)
    throw error
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { userInfo } = event
  console.log('接收到的用户信息:', userInfo)

  // 参数验证
  if (!userInfo || !userInfo.realName) {
    console.log('用户信息验证失败')
    return {
      code: 1,
      message: '请提供完整的用户信息'
    }
  }

  try {
    // 检查用户是否存在
    const userRecord = await db.collection('users').where({
      openid: wxContext.OPENID
    }).get()

    // 如果提供了头像URL，先删除旧头像，再上传到云存储
    let avatarFileID = userInfo.avatarUrl
    console.log('处理前的头像URL:', avatarFileID)

    // 如果用户已存在且有旧头像，删除旧头像
    if (userRecord.data.length > 0 && userRecord.data[0].avatarUrl && userRecord.data[0].avatarUrl.startsWith('cloud://')) {
      try {
        await cloud.deleteFile({
          fileList: [userRecord.data[0].avatarUrl]
        })
        console.log('成功删除旧头像')
      } catch (error) {
        console.error('删除旧头像失败:', error)
      }
    }

    if (userInfo.avatarUrl && !userInfo.avatarUrl.startsWith('cloud://')) {
      console.log('检测到本地临时文件路径的头像，准备上传')
      try {
        // 微信小程序的临时文件路径无法在云函数中直接访问
        // 我们需要在小程序端先将图片上传到云存储，然后传递fileID
        // 这里我们假设已经收到了有效的临时文件URL或fileID
        console.log('收到的头像URL:', userInfo.avatarUrl)
        
        // 如果是http开头的临时文件URL，我们需要先下载
        let fileContent = null
        if (userInfo.avatarUrl.startsWith('http')) {
          try {
            // 尝试通过网络请求获取文件内容
            const axios = require('axios')
            const response = await axios.get(userInfo.avatarUrl, { responseType: 'arraybuffer' })
            fileContent = response.data
            console.log('成功通过HTTP下载头像')
          } catch (httpError) {
            console.error('HTTP下载头像失败:', httpError)
            throw httpError
          }
        }
        
        // 上传到云存储
        const response = await cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}.png`,
          fileContent: fileContent
        })
        avatarFileID = response.fileID
        console.log('本地头像上传成功，新的fileID:', avatarFileID)
      } catch (error) {
        console.error('上传头像失败:', error)
        // 如果上传失败，继续使用原始URL
      }
    }
    if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
      console.log('检测到云存储头像，准备处理')
      avatarFileID = await uploadAvatar(userInfo.avatarUrl)
      console.log('云存储头像处理完成，最终fileID:', avatarFileID)
    }

    const userData = {
      openid: wxContext.OPENID,
      avatarUrl: avatarFileID,
      realName: userInfo.realName,
      gender: userInfo.gender,
      birthday: userInfo.birthday,
      updateTime: db.serverDate()
    }

    if (userRecord.data.length === 0) {
      console.log('创建新用户记录，数据:', { ...userData, createTime: db.serverDate() })
      // 如果用户不存在，创建新用户记录
      await db.collection('users').add({
        data: {
          ...userData,
          createTime: db.serverDate(),
          status: 'active',
          userType: userInfo.userType || 'patient'
        }
      })
    } else {
      console.log('更新用户信息，数据:', userData)
      // 如果用户存在，更新用户信息
      await db.collection('users').where({
        openid: wxContext.OPENID
      }).update({
        data: userData
      })
    }

    return {
      code: 0,
      message: '更新成功'
    }
  } catch (error) {
    console.error('更新用户信息失败:', error)
    return {
      code: 1,
      message: '更新失败'
    }
  }
}