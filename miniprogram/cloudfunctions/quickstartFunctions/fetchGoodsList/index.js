const cloud = require('wx-server-sdk');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const result = await db.collection('goods')
      .skip(0)
      .limit(10)
      .get();
    
    return {
      success: true,
      data: result.data
    };
  } catch (err) {
    return {
      success: false,
      error: err
    };
  }
};

// const cloud = require('wx-server-sdk');
// cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// const db = cloud.database();

// exports.main = async (event, context) => {
//   const result = await db.collection('goods')
//     .skip(0)
//     .limit(10)
//     .get();
//   return {
//     dataList: result?.data,
//   };
// };
        