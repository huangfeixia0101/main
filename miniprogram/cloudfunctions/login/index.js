const cloud = require('wx-server-sdk')
const Axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database()
const _ = db.command

// 生成随机token
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

console.log('cloud 对象:', cloud);
console.log('cloud.getPhoneNumber 是否存在:', typeof cloud.getPhoneNumber);

let accessTokenCache = null;
let accessTokenExpireTime = 0;

// 获取微信 access_token
const getAccessToken = async () => {
  const now = Date.now();
  if (accessTokenCache && now < accessTokenExpireTime) {
    console.log('[getAccessToken] 使用缓存的 access_token');
    return accessTokenCache;
  }

  const wxContext = cloud.getWXContext();
  const appid = wxContext.APPID; // 从微信上下文中获取 APPID
  const secret = process.env.APPSECRET; // 从环境变量获取 APPSECRET
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;

  console.log('[getAccessToken] 请求URL:', url);
  console.log('[getAccessToken] APPID:', appid);
  console.log('[getAccessToken] APPSECRET:', secret ? '已配置' : '未配置');

  try {
    const response = await Axios.get(url);
    console.log('[getAccessToken] 响应数据:', JSON.stringify(response.data, null, 2));

    if (!response.data.access_token) {
      console.error('[getAccessToken] 获取access_token失败，响应数据中缺少access_token');
      throw new Error('获取access_token失败');
    }

    // 缓存 access_token，有效期 7200 秒
    accessTokenCache = response.data.access_token;
    accessTokenExpireTime = now + 7200*1000;
    console.log('[getAccessToken] 获取access_token成功:', accessTokenCache);
    return accessTokenCache;
  } catch (err) {
    console.error('[getAccessToken] 请求失败:', err.message);
    console.error('[getAccessToken] 完整错误:', JSON.stringify(err, null, 2));
    throw new Error('获取access_token失败');
  }
};

// 获取手机号
const getPhoneNumber = async (code) => {
  try {
    const accessToken = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    console.log('[getPhoneNumber] 请求URL:', url);
    console.log('[getPhoneNumber] 请求参数:', { code });

    const response = await Axios.post(url, { code });
    console.log('[getPhoneNumber] 响应数据:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (err) {
    console.error('[getPhoneNumber] 获取手机号失败:', err.message);
    console.error('[getPhoneNumber] 完整错误:', JSON.stringify(err, null, 2));
    throw err;
  }
};

exports.main = async (event, context) => {
  console.log('[登录函数] 收到的参数:', event)
  const wxContext = cloud.getWXContext()
  console.log('[登录函数] 微信上下文:', wxContext)
  
  // 检查必要参数
  if (!event || !event.wxUserInfo) {
    console.log('[登录函数] 缺少必要参数 wxUserInfo')
    return {
      code: 1,
      message: '缺少必要的用户信息参数'
    }
  }

  // 确保从event中解构的参数都有默认值
  const { wxUserInfo, userType = 'patient', phoneCode } = event
  console.log('[登录函数] 解构后的参数:', { userType, phoneCode })

  if (!wxContext.OPENID) {
    console.log('[登录函数] 获取OPENID失败')
    return {
      code: 1,
      message: '获取用户openid失败'
    }
  }

  if (phoneCode && typeof phoneCode !== 'string') {
    console.error('phoneCode 无效:', phoneCode);
    return {
      code: 1,
      message: 'phoneCode 无效'
    };
  }

  try {
    // 获取手机号
    const phoneInfo = await getPhoneNumber(phoneCode);
    console.log('获取手机号成功:', phoneInfo);

    // 检查返回结果
    if (phoneInfo.errcode !== 0) {
      throw new Error(phoneInfo.errmsg || '获取手机号失败');
    }

    // 查询用户是否已存在
    const userCollection = db.collection('users')
    console.log('[登录函数] 开始查询用户:', wxContext.OPENID)
    const existUser = await userCollection.where({
      openid: wxContext.OPENID
    }).get()
    console.log('[登录函数] 查询结果:', existUser)

    let userId
    const token = generateToken()
    const now = new Date()

    if (existUser.data.length > 0) {
      // 更新已存在用户信息
      userId = existUser.data[0]._id
      console.log('[登录函数] 更新已存在用户:', userId)
      // 更新用户信息时保留原有头像和用户类型
      await userCollection.doc(userId).update({
        data: {
          nickName: wxUserInfo.nickName,
          phoneNumber: phoneInfo.phone_info.phoneNumber,
          countryCode: phoneInfo.phone_info.countryCode,
          updateTime: now,
          token
        }
      })
    } else {
      // 创建新用户
      console.log('[登录函数] 创建新用户')
      const result = await userCollection.add({
        data: {
          openid: wxContext.OPENID,
          unionid: wxContext.UNIONID || '',
          userType,
          nickName: wxUserInfo.nickName,
          avatarUrl: wxUserInfo.avatarUrl,
          gender: wxUserInfo.gender,
          phoneNumber: phoneInfo.phone_info.phoneNumber,
          countryCode: phoneInfo.phone_info.countryCode,
          isAdmin: false,
          isVerified: false,
          isVIP: false,
          status: 'active',
          createTime: now,
          updateTime: now,
          token
        }
      })
      userId = result._id
      console.log('[登录函数] 新用户创建成功:', userId)
    }

    // 获取最新的用户信息并确保返回userType
    console.log('[登录函数] 获取最新用户信息')
    const userInfo = await userCollection.doc(userId).get()
    const userData = {
      ...userInfo.data,
      userType: userInfo.data.userType || 'patient' // 确保返回userType，如果没有则默认为patient
    }

    console.log('[登录函数] 登录成功:', userData)
    return {
      code: 0,
      message: '登录成功',
      data: userData,
      token,
      openid: wxContext.OPENID
    }

  } catch (err) {
    console.error('[登录失败] 错误详情:', err)
    return {
      code: 1,
      message: '登录失败，请重试'
    }
  }
}