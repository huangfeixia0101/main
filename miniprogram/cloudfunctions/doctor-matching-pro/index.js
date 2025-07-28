const cloud = require('wx-server-sdk');
const fetch = require('node-fetch');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

// 检查用户Pro服务权限
async function checkUserAccess(openid, userInfo) {
  try {
    // 如果有openid，重新查询数据库获取完整的用户信息（包括isVIP字段）
    let fullUserInfo = userInfo;
    if (openid) {
      try {
        const userResult = await db.collection('users').where({
          openid: openid
        }).get();
        
        if (userResult.data && userResult.data.length > 0) {
          fullUserInfo = userResult.data[0];
          console.log('从数据库获取到完整用户信息，isVIP:', fullUserInfo.isVIP);
        }
      } catch (error) {
        console.error('查询用户信息失败:', error);
        // 如果查询失败，继续使用传入的userInfo
      }
    }
    
    // 检查用户是否已登录
    if (!fullUserInfo || !fullUserInfo._id) {
      return {
        allowed: false,
        needLogin: true,
        reason: '用户未登录',
        message: '使用Pro版功能需要先登录。\n\n请点击右下角"我的"进行登录。'
      };
    }
    
    // 检查用户是否为VIP
    const isVIP = fullUserInfo && fullUserInfo.isVIP === true;
    console.log('Pro版用户VIP状态检查:', { isVIP, userInfo: fullUserInfo ? 'exists' : 'null', isVIPField: fullUserInfo ? fullUserInfo.isVIP : 'undefined' });
    
    // VIP用户可以免费使用Pro功能
    if (isVIP) {
      return {
        allowed: true,
        isVIP: true,
        needLogin: false,
        needPurchase: false,
        reason: 'VIP用户免费使用',
        message: 'VIP用户可以免费使用Pro功能'
      };
    }
    
    // 查询用户是否有"匹配医生Pro"的已支付订单
    console.log('开始查询订单，用户ID:', userInfo._id);
    console.log('开始查询订单，openid:', openid);
    
    const orderResult = await db.collection('ai_orders')
      .where({
        _openid: openid,
        serviceName: '匹配医生',
        spec: '智能匹配Pro/次',
        status: 'PAID' // 已支付状态
      })
      .limit(1)
      .get();
    
    console.log('订单查询结果:', JSON.stringify(orderResult, null, 2));
    console.log('查询条件:', {
      _openid: openid,
      serviceName: '匹配医生',
      spec: '智能匹配Pro/次',
      status: 'PAID'
    });
    
    if (!orderResult.data || orderResult.data.length === 0) {
      return {
        allowed: false,
        needLogin: false,
        needPurchase: true,
        canUsePoints: true,
        pointsRequired: 100,
        reason: '未找到有效的Pro服务订单',
        message: '您还没有购买"匹配医生Pro"服务。\n\n可以使用100积分体验一次，或购买Pro服务。'
      };
    }
    
    const order = orderResult.data[0];
    
    return {
      allowed: true,
      isLoggedIn: true,
      orderId: order._id,
      order: order
    };
    
  } catch (error) {
    console.error('检查Pro服务权限失败:', error);
    return {
      allowed: false,
      needLogin: false,
      reason: '系统错误',
      message: '系统繁忙，请稍后再试。'
    };
  }
}

// 更新订单状态为已完成
async function updateOrderStatus(orderId) {
  try {
    await db.collection('ai_orders').doc(orderId).update({
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        updateTime: new Date()
      }
    });
    console.log('订单状态更新成功:', orderId);
    return true;
  } catch (error) {
    console.error('更新订单状态失败:', error);
    return false;
  }
}

// 记录Pro服务使用
async function recordProUsage(openid, userInfo, userInput, orderId) {
  try {
    await db.collection('doctor_matching_usage').add({
      data: {
        openid: openid,
        userId: userInfo._id,
        userInput: userInput.substring(0, 100), // 只记录前100个字符
        createTime: new Date(),
        isLoggedIn: true,
        version: 'pro',
        orderId: orderId // 关联订单ID
      }
    });
    console.log('Pro版使用记录保存成功');
  } catch (error) {
    console.error('保存Pro版使用记录失败:', error);
    // 记录失败不影响主要功能
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const startTime = Date.now();
  console.log('doctor-matching-pro云函数开始执行...', new Date().toISOString());
  console.log('接收到的事件数据:', JSON.stringify(event));
  
  try {
    const { userInput, conversationHistory, userInfo, openid, usePoints } = event;
    
    if (!userInput) {
      console.error('缺少必要参数: userInput');
      return {
        success: false,
        error: '缺少必要参数: userInput',
        data: {
          response: '请输入您的症状或需求描述。',
          recommendedDoctors: []
        }
      };
    }
    
    // 声明authResult变量
    let authResult;
    
    // 检查Pro服务权限（如果不是使用积分的情况）
    if (!usePoints) {
      console.log(`[${Date.now() - startTime}ms] 检查Pro服务权限...`);
      authResult = await checkUserAccess(openid, userInfo);
      
      if (!authResult.allowed) {
        console.log('Pro服务权限检查失败:', authResult.reason);
        // 如果可以使用积分抵扣
        if (authResult.canUsePoints) {
          return {
            success: false,
            error: authResult.reason,
            needLogin: authResult.needLogin,
            needPurchase: authResult.needPurchase,
            canUsePoints: true,
            pointsRequired: authResult.pointsRequired,
            data: {
              response: authResult.message,
              recommendedDoctors: []
            }
          };
        }
        return {
          success: false,
          error: authResult.reason,
          needLogin: authResult.needLogin,
          needPurchase: authResult.needPurchase,
          data: {
            response: authResult.message,
            recommendedDoctors: []
          }
        };
      }
    } else {
      console.log(`[${Date.now() - startTime}ms] 使用积分，跳过Pro服务权限检查...`);
      // 使用积分时，初始化authResult对象
      authResult = {
        allowed: true,
        orderId: 'points_' + Date.now(), // 使用积分时生成临时订单ID
        isLoggedIn: true
      };
    }
    
    console.log(`[${Date.now() - startTime}ms] Pro服务权限验证通过，订单ID: ${authResult.orderId}`);
    console.log(`[${Date.now() - startTime}ms] 开始分析用户输入...`);
    
    // 1. 初始化数据库连接
    console.log(`[${Date.now() - startTime}ms] 初始化数据库连接...`);
    const db = cloud.database();
    const doctorsCollection = db.collection('doctors');
    

    
    // 2. 第一步：使用LLM分析用户输入，分析疾病并给出健康建议
    console.log(`[${Date.now() - startTime}ms] 开始LLM疾病分析和建议...`);
    
    // 检查是否还有足够时间进行LLM调用
    if (Date.now() - startTime > 80000) {
      console.warn(`[${Date.now() - startTime}ms] 时间不足，返回超时错误`);
      return {
        success: false,
        error: '系统处理超时',
        data: {
          response: '系统繁忙，请稍后重试。',
          recommendedDoctors: []
        }
      };
    }
    
    const analysisPrompt = buildDiseaseAnalysisPrompt(userInput, conversationHistory);
    
    let diseaseAnalysis;
    try {
      console.log(`[${Date.now() - startTime}ms] 调用LLM进行疾病分析...`);
      const analysisResponse = await callLLM(analysisPrompt);
      diseaseAnalysis = parseDiseaseAnalysis(analysisResponse);
      console.log(`[${Date.now() - startTime}ms] 疾病分析完成:`, diseaseAnalysis);
    } catch (analysisError) {
      console.error(`[${Date.now() - startTime}ms] 疾病分析失败:`, analysisError);
      return {
        success: false,
        error: '疾病分析失败: ' + analysisError.message,
        data: {
          response: '抱歉，无法理解您的症状，请重新描述您的症状或需要咨询的问题。',
          recommendedDoctors: []
        }
      };
    }
    
    // 3. 第二步：根据LLM分析的查询类型决定处理方式
    console.log(`[${Date.now() - startTime}ms] 查询类型: ${diseaseAnalysis.queryType}`);
    
    let dbMatchResult;
    
    if (diseaseAnalysis.queryType === '医生查询') {
      // 医生查询：根据医生姓名搜索
      console.log(`[${Date.now() - startTime}ms] 执行医生查询: ${diseaseAnalysis.targetName}`);
      dbMatchResult = await searchDoctorsByName(diseaseAnalysis.targetName, doctorsCollection);
    } else if (diseaseAnalysis.queryType === '科室查询') {
      // 检查是否为复合查询（同时包含医院和科室信息）
      if (diseaseAnalysis.hospitalName && diseaseAnalysis.departmentName) {
        // 复合查询：同时根据医院和科室搜索
        console.log(`[${Date.now() - startTime}ms] 执行复合查询: ${diseaseAnalysis.hospitalName} - ${diseaseAnalysis.departmentName}`);
        dbMatchResult = await searchDoctorsByHospitalAndDepartment(diseaseAnalysis.hospitalName, diseaseAnalysis.departmentName, doctorsCollection);
      } else {
        // 单纯科室查询：根据科室名称搜索
        const departmentName = diseaseAnalysis.departmentName || diseaseAnalysis.targetName;
        console.log(`[${Date.now() - startTime}ms] 执行科室查询: ${departmentName}`);
        dbMatchResult = await searchDoctorsByDepartment(departmentName, doctorsCollection);
      }
    } else if (diseaseAnalysis.queryType === '医院查询') {
      // 医院查询：根据医院名称搜索
      const hospitalName = diseaseAnalysis.hospitalName || diseaseAnalysis.targetName;
      console.log(`[${Date.now() - startTime}ms] 执行医院查询: ${hospitalName}`);
      dbMatchResult = await searchDoctorsByHospital(hospitalName, doctorsCollection);
    } else {
      // 症状描述：按原有逻辑处理
      console.log(`[${Date.now() - startTime}ms] 根据疾病分析结果查找数据库...`);
      dbMatchResult = await searchDoctorsByDiseaseAnalysisFromDB(diseaseAnalysis, doctorsCollection);
    }
    
    if (dbMatchResult.found && dbMatchResult.doctors.length > 0) {
      console.log(`[${Date.now() - startTime}ms] 数据库匹配成功，找到${dbMatchResult.doctors.length}位医生`);
      
      // 检查是否还有足够时间进行第二次LLM调用来组织语言
      if (Date.now() - startTime > 90000) {
        console.warn(`[${Date.now() - startTime}ms] 时间不足，直接返回数据库匹配结果`);
        // 保存对话记忆
        await saveConversationMemory(userInput, diseaseAnalysis, dbMatchResult.doctors);
        
        return {
          success: true,
          data: {
            response: `根据您的症状分析:\n${diseaseAnalysis.advice || '建议您及时就医'}。为您匹配以下专业医生：`,
            recommendedDoctors: dbMatchResult.doctors.map(doctor => ({
              ...doctor,
              study_report: doctor.study_report || '暂无研究报告'
            }))
          }
        };
      }
      
      // 4. 第三步：使用LLM组织优美亲切的语言输出
      console.log(`[${Date.now() - startTime}ms] 调用LLM组织最终回复...`);
      const finalResponsePrompt = buildFinalResponsePrompt(diseaseAnalysis, dbMatchResult.doctors, conversationHistory);
      
      try {
        const finalResponse = await callLLM(finalResponsePrompt);
        const parsedFinalResponse = parseFinalResponse(finalResponse);
        
        // 保存对话记忆
        await saveConversationMemory(userInput, diseaseAnalysis, dbMatchResult.doctors);
        
        // 记录Pro服务使用并更新订单状态
        await recordProUsage(openid, userInfo, userInput, authResult.orderId);
        await updateOrderStatus(authResult.orderId);
        
        console.log(`[${Date.now() - startTime}ms] 最终回复组织完成`);
        return {
          success: true,
          data: {
            response: parsedFinalResponse,
            recommendedDoctors: dbMatchResult.doctors.map(doctor => ({
              ...doctor,
              study_report: doctor.study_report || '暂无研究报告'
            }))
          }
        };
      } catch (finalResponseError) {
        console.error(`[${Date.now() - startTime}ms] 最终回复组织失败:`, finalResponseError);
        // 如果LLM组织语言失败，返回简单的回复
        await saveConversationMemory(userInput, diseaseAnalysis, dbMatchResult.doctors);
        
        // 记录Pro服务使用并更新订单状态
        await recordProUsage(openid, userInfo, userInput, authResult.orderId);
        await updateOrderStatus(authResult.orderId);
        
        return {
          success: true,
          data: {
            response: `根据您的症状分析:\n${diseaseAnalysis.advice || '建议您及时就医'}。为您匹配以下专业医生：`,
            recommendedDoctors: dbMatchResult.doctors.map(doctor => ({
              ...doctor,
              study_report: doctor.study_report || '暂无研究报告'
            }))
          }
        };
      }
    }
    
    console.log(`[${Date.now() - startTime}ms] 数据库中未找到匹配医生，返回隐私限制提醒`);
    
    // 5. 如果数据库中找不到合适的医生，返回隐私限制提醒
    return {
      success: true,
      data: {
        response: `根据您描述的症状:\n${diseaseAnalysis.advice || '建议您寻求专业医疗帮助'}\n由于没法根据您的描述匹配到合适的医生或者您要的医生没有经过我们的调研，请您再次详细描述您的症状或需求，如需人工匹配医生请使用以下服务：`,
        recommendedDoctors: []
      }
    };
    
  } catch (error) {
    console.error(`[${Date.now() - startTime}ms] 云函数执行过程中发生错误:`, error);
    return {
      success: false,
      error: '处理失败: ' + error.message,
      data: {
        response: '抱歉，服务暂时不可用，请稍后重试。',
        recommendedDoctors: [{
          _id: 'unknown',
          name: '默认医生',
          department: '综合科室',
          matchScore: 70,
          study_report: '暂无研究报告'
        }]
      }
    };
  } finally {
    console.log(`[${Date.now() - startTime}ms] 云函数执行完成`);
  }
};

// LLM调用函数
async function callLLM(prompt) {
  const startTime = Date.now();
  console.log(`[${Date.now() - startTime}ms] 开始调用LLM API...`);
  
  // 检查是否设置了API密钥
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY环境变量未设置，无法调用LLM API');
    throw new Error('API密钥未配置');
  }
  
  let timeoutId;
  try {
    timeoutId = setTimeout(() => {
      throw new Error('LLM API调用超时');
    }, 30000);
    
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`[${Date.now() - startTime}ms] LLM API响应错误: ${response.status} ${response.statusText}`);
        throw new Error(`LLM API响应错误: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        console.error(`[${Date.now() - startTime}ms] LLM API返回数据格式错误`);
        throw new Error('LLM API返回数据格式错误');
      }
      
      const responseContent = data.choices[0].message.content;
      
      if (!responseContent || responseContent.trim() === '') {
        console.error(`[${Date.now() - startTime}ms] 响应内容为空`);
        throw new Error('响应内容为空');
      }
      
      console.log(`[${Date.now() - startTime}ms] LLM返回响应长度: ${responseContent.length}`);
      console.log(`[${Date.now() - startTime}ms] LLM响应预览:`, responseContent.substring(0, 200) + (responseContent.length > 200 ? '...' : ''));
      
      return responseContent;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.error(`[${Date.now() - startTime}ms] LLM API调用失败:`, error.message);
    console.error(`[${Date.now() - startTime}ms] LLM调用过程中发生错误:`, error);
    throw error;
  }
}

// 构建疾病分析的LLM提示
function buildDiseaseAnalysisPrompt(userInput, conversationHistory) {
  const historyText = Array.isArray(conversationHistory) && conversationHistory.length > 0 ? 
    conversationHistory.map(h => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`).join('\n') : 
    '无历史对话';
  
  const promptText = `
  你是医疗意图识别助手。
  对话历史：
  ${historyText}
  用户当前输入：${userInput}
  请根据用户输入，仅返回符合下列 JSON 格式的结果，不要输出任何解释或额外文字。
  需要识别的医院简称：
  浙一 → 浙江大学医学院附属第一医院
  浙二 → 浙江大学医学院附属第二医院
  省人民 → 浙江省人民医院
  市一 → 杭州市第一人民医院
  儿保 → 浙江大学医学院附属儿童医院
  妇保 → 浙江大学医学院附属妇产科医院
  JSON 字段说明与取值示例：
  queryType：症状描述 | 医生查询 | 科室查询 | 医院查询
  targetName：查询目标名称（如医生姓名、科室名），无则留空串 ""
  hospitalName：完整医院名称，无则留空串 ""
  departmentName：科室名称，无则留空串 ""
  symptoms：症状列表，无则空数组 []
  possibleDiseases：可能疾病列表，无则空数组 []
  department：与症状最相关的科室，无则留空串 ""
  specialties：相关专长列表，无则空数组 []
  urgency：低 | 中 | 高
  advice：针对症状或查询的建议，无则留空串 ""
  summary：用户输入的一句话总结，不可为空
  示例输出（仅供参考，禁止照抄）JSON：
  {
    "queryType": "医生查询",
    "targetName": "黄建霞医生",
    "hospitalName": "浙江大学医学院附属第二医院",
    "departmentName": "妇科",
    "symptoms": [白带黄],
    "possibleDiseases": [阴道炎],
    "department": "妇科",
    "specialties": ["妇科肿瘤", "宫颈病变"],
    "urgency": "低",
    "advice": "建议提前预约专家门诊，携带既往检查报告。",
    "summary": "用户想了解浙二医院妇科的医生情况。"
  }
  请严格按照上述格式输出，不要添加 Markdown 代码块标记，直接输出纯 JSON。
`;
  
  return promptText;
}

// 解析疾病分析结果
function parseDiseaseAnalysis(llmResponse) {
  try {
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : llmResponse;
    const parsed = JSON.parse(jsonStr);
    
    return {
      queryType: parsed.queryType || '症状描述',
      targetName: parsed.targetName || '',
      hospitalName: parsed.hospitalName || '',
      departmentName: parsed.departmentName || '',
      symptoms: parsed.symptoms || [],
      possibleDiseases: parsed.possibleDiseases || [],
      department: parsed.department || '',
      specialties: parsed.specialties || [],
      urgency: parsed.urgency || '中',
      advice: parsed.advice || '建议及时就医咨询专业医生',
      summary: parsed.summary || '用户咨询健康问题'
    };
  } catch (error) {
    console.error('解析疾病分析失败:', error);
    return {
      queryType: '症状描述',
      targetName: '',
      hospitalName: '',
      departmentName: '',
      symptoms: [],
      possibleDiseases: [],
      department: '',
      specialties: [],
      urgency: '中',
      advice: '建议及时就医咨询专业医生',
      summary: '用户咨询健康问题'
    };
  }
}

// 根据疾病分析结果直接从数据库查询匹配的医生（优化版本）
async function searchDoctorsByDiseaseAnalysisFromDB(diseaseAnalysis, doctorsCollection) {
  console.log('根据疾病分析从数据库搜索医生:', diseaseAnalysis);
  
  try {
    let allMatchedDoctors = [];
    const doctorIds = new Set(); // 用于去重
    
    // 阶段1：科室精确匹配
    if (diseaseAnalysis.department) {
      const departmentQuery = {
        department: diseaseAnalysis.department // 精确匹配科室
      };
      
      console.log('执行科室精确查询:', JSON.stringify(departmentQuery));
      
      try {
        const departmentResult = await doctorsCollection
          .where(departmentQuery)
          .get();
        
        if (departmentResult.data && departmentResult.data.length > 0) {
          console.log(`科室精确匹配找到 ${departmentResult.data.length} 位医生`);
          
          for (const doctor of departmentResult.data) {
            if (!doctorIds.has(doctor._id)) {
              doctorIds.add(doctor._id);
              allMatchedDoctors.push(doctor);
            }
          }
        } else {
          console.log('科室精确匹配无结果');
        }
      } catch (departmentError) {
        console.error('科室查询失败:', departmentError);
      }
    }
    
    // 阶段2：如果结果不足50位，进行专长匹配
    if (allMatchedDoctors.length < 50 && diseaseAnalysis.specialties && diseaseAnalysis.specialties.length > 0) {
      console.log('结果不足50位，进行专长匹配');
      
      const specialtyRegex = diseaseAnalysis.specialties.map(s => new RegExp(s, 'i'));
      const specialtyQuery = {
        specialties: { $in: specialtyRegex }
      };
      
      try {
        const specialtyResult = await doctorsCollection
          .where(specialtyQuery)
          .get();
        
        if (specialtyResult.data && specialtyResult.data.length > 0) {
          console.log(`专长匹配找到 ${specialtyResult.data.length} 位医生`);
          
          for (const doctor of specialtyResult.data) {
            if (!doctorIds.has(doctor._id)) {
              doctorIds.add(doctor._id);
              allMatchedDoctors.push(doctor);
            }
          }
        }
      } catch (specialtyError) {
        console.error('专长查询失败:', specialtyError);
      }
    }
    
    // 阶段3：如果结果仍不足50位，进行疾病匹配
    if (allMatchedDoctors.length < 50 && diseaseAnalysis.possibleDiseases && diseaseAnalysis.possibleDiseases.length > 0) {
      console.log('结果不足50位，进行疾病匹配');
      
      const diseaseRegex = diseaseAnalysis.possibleDiseases.map(d => new RegExp(d, 'i'));
      const diseaseQuery = {
        $or: [
          { specialties: { $in: diseaseRegex } },
          { introduction: { $in: diseaseRegex } }
        ]
      };
      
      try {
        const diseaseResult = await doctorsCollection
          .where(diseaseQuery)
          .get();
        
        if (diseaseResult.data && diseaseResult.data.length > 0) {
          console.log(`疾病匹配找到 ${diseaseResult.data.length} 位医生`);
          
          for (const doctor of diseaseResult.data) {
            if (!doctorIds.has(doctor._id)) {
              doctorIds.add(doctor._id);
              allMatchedDoctors.push(doctor);
            }
          }
        }
      } catch (diseaseError) {
        console.error('疾病查询失败:', diseaseError);
      }
    }
    
    // 阶段4：如果结果仍不足50位，进行症状匹配
    if (allMatchedDoctors.length < 50 && diseaseAnalysis.symptoms && diseaseAnalysis.symptoms.length > 0) {
      console.log('结果不足50位，进行症状匹配');
      
      const symptomRegex = diseaseAnalysis.symptoms.map(s => new RegExp(s, 'i'));
      const symptomQuery = {
        $or: [
          { specialties: { $in: symptomRegex } },
          { introduction: { $in: symptomRegex } }
        ]
      };
      
      try {
        const symptomResult = await doctorsCollection
          .where(symptomQuery)
          .get();
        
        if (symptomResult.data && symptomResult.data.length > 0) {
          console.log(`症状匹配找到 ${symptomResult.data.length} 位医生`);
          
          for (const doctor of symptomResult.data) {
            if (!doctorIds.has(doctor._id)) {
              doctorIds.add(doctor._id);
              allMatchedDoctors.push(doctor);
            }
          }
        }
      } catch (symptomError) {
        console.error('症状查询失败:', symptomError);
      }
    }
    
    // 如果所有阶段都无结果，不返回默认医生
    if (allMatchedDoctors.length === 0) {
      console.log('所有匹配阶段都无结果，不返回默认医生');
      return {
        found: false,
        doctors: [],
        response: '抱歉，暂时无法找到合适的医生，请稍后重试。'
      };
    }
    
    console.log(`总共找到 ${allMatchedDoctors.length} 位匹配的医生`);
    
    // 将字符串类型的rating转换为数值进行排序
    const sortedDoctors = allMatchedDoctors
      .map(doctor => ({
        ...doctor,
        numericRating: parseFloat(doctor.rating) || 0
      }))
      .sort((a, b) => b.numericRating - a.numericRating);
    
    console.log(`排序后返回所有 ${sortedDoctors.length} 位医生`);
    
    const matchedDoctors = sortedDoctors;
    
    // 5. 对匹配的医生进行评分
    const scoredDoctors = matchedDoctors.map(doctor => {
      let matchScore = 0;
      let matchReasons = [];
      
      console.log(`\n开始为医生 ${doctor.name} (${doctor.department}) 计分:`);
      console.log(`初始分数: ${matchScore}`);
      
      // 科室匹配评分 - 优先精确匹配
      if (diseaseAnalysis.department && doctor.department) {
        if (doctor.department === diseaseAnalysis.department) {
          matchScore += 40;
          matchReasons.push(`科室精确匹配：${doctor.department}`);
          console.log(`科室精确匹配 +40分: ${diseaseAnalysis.department} = ${doctor.department}, 当前分数: ${matchScore}`);
        }
      }
      
      // 专长匹配评分
      if (diseaseAnalysis.specialties && doctor.specialties) {
        for (const userSpecialty of diseaseAnalysis.specialties) {
          for (const doctorSpecialty of doctor.specialties) {
            if (doctorSpecialty.includes(userSpecialty) || userSpecialty.includes(doctorSpecialty)) {
              matchScore += 30;
              matchReasons.push(`专长匹配：${doctorSpecialty}`);
              console.log(`专长匹配 +30分: ${userSpecialty} <-> ${doctorSpecialty}, 当前分数: ${matchScore}`);
              break;
            }
          }
        }
      }
      
      // 可能疾病匹配评分
      if (diseaseAnalysis.possibleDiseases && doctor.specialties) {
        for (const disease of diseaseAnalysis.possibleDiseases) {
          for (const specialty of doctor.specialties) {
            if (specialty.includes(disease) || disease.includes(specialty)) {
              matchScore += 25;
              matchReasons.push(`疾病相关：${specialty}`);
              console.log(`疾病匹配 +25分: ${disease} <-> ${specialty}, 当前分数: ${matchScore}`);
              break;
            }
          }
        }
      }
      
      // 症状关键词匹配评分
      if (diseaseAnalysis.symptoms && doctor.specialties) {
        for (const symptom of diseaseAnalysis.symptoms) {
          for (const specialty of doctor.specialties) {
            if (specialty.includes(symptom)) {
              matchScore += 20;
              matchReasons.push(`症状相关：${specialty}`);
              console.log(`症状匹配 +20分: ${symptom} -> ${specialty}, 当前分数: ${matchScore}`);
              break;
            }
          }
        }
      }
      
      // 当科室不精确匹配时，基于其他字段的相关性匹配
    if (diseaseAnalysis.department && doctor.department && 
        doctor.department !== diseaseAnalysis.department) {
      
      console.log(`科室不精确匹配，进行相关性匹配: ${diseaseAnalysis.department} != ${doctor.department}`);
      
      // 检查症状是否与医生科室、专长或简介相关
      if (diseaseAnalysis.symptoms) {
        let symptomMatched = false;
        for (const symptom of diseaseAnalysis.symptoms) {
          // 症状与医生科室相关
            if (doctor.department.includes(symptom)) {
              matchScore += 8;
              matchReasons.push(`症状科室相关：${symptom}-${doctor.department}`);
              console.log(`症状科室相关 +8分: ${symptom} -> ${doctor.department}, 当前分数: ${matchScore}`);
              symptomMatched = true;
              break;
            }
          // 症状与医生专长相关
          if (doctor.specialties) {
            for (const specialty of doctor.specialties) {
              if (specialty.includes(symptom)) {
                matchScore += 6;
                matchReasons.push(`症状专长相关：${symptom}-${specialty}`);
                console.log(`症状专长相关 +6分: ${symptom} -> ${specialty}, 当前分数: ${matchScore}`);
                symptomMatched = true;
                break;
              }
            }
          }
          // 症状与医生简介相关
          if (doctor.introduction && doctor.introduction.includes(symptom)) {
            matchScore += 5;
            matchReasons.push(`症状简介相关：${symptom}`);
            console.log(`症状简介相关 +5分: ${symptom}, 当前分数: ${matchScore}`);
            symptomMatched = true;
            break;
          }
        }
        // 如果症状完全不匹配，给予负分
        if (!symptomMatched) {
          matchScore -= 5;
          matchReasons.push(`症状不匹配`);
          console.log(`症状不匹配 -5分, 当前分数: ${matchScore}`);
        }
      }
      
      // 检查疾病是否与医生科室、专长或简介相关
      if (diseaseAnalysis.possibleDiseases) {
        let diseaseMatched = false;
        for (const disease of diseaseAnalysis.possibleDiseases) {
          // 疾病与医生科室相关
            if (doctor.department.includes(disease)) {
              matchScore += 8;
              matchReasons.push(`疾病科室相关：${disease}-${doctor.department}`);
              console.log(`疾病科室相关 +8分: ${disease} -> ${doctor.department}, 当前分数: ${matchScore}`);
              diseaseMatched = true;
              break;
            }
          // 疾病与医生专长相关
          if (doctor.specialties) {
            for (const specialty of doctor.specialties) {
              if (specialty.includes(disease)) {
                matchScore += 6;
                matchReasons.push(`疾病专长相关：${disease}-${specialty}`);
                console.log(`疾病专长相关 +6分: ${disease} -> ${specialty}, 当前分数: ${matchScore}`);
                diseaseMatched = true;
                break;
              }
            }
          }
          // 疾病与医生简介相关
          if (doctor.introduction && doctor.introduction.includes(disease)) {
            matchScore += 5;
            matchReasons.push(`疾病简介相关：${disease}`);
            console.log(`疾病简介相关 +5分: ${disease}, 当前分数: ${matchScore}`);
            diseaseMatched = true;
            break;
          }
        }
        // 如果疾病完全不匹配，给予负分
        if (!diseaseMatched) {
          matchScore -= 5;
          matchReasons.push(`疾病不匹配`);
          console.log(`疾病不匹配 -5分, 当前分数: ${matchScore}`);
        }
      }
      
      // 检查分析的专长是否与医生科室或简介相关
      if (diseaseAnalysis.specialties) {
        let specialtyMatched = false;
        for (const userSpecialty of diseaseAnalysis.specialties) {
          // 分析专长与医生科室相关
            if (doctor.department.includes(userSpecialty)) {
              matchScore += 10;
              matchReasons.push(`专长科室相关：${userSpecialty}-${doctor.department}`);
              console.log(`专长科室相关 +10分: ${userSpecialty} -> ${doctor.department}, 当前分数: ${matchScore}`);
              specialtyMatched = true;
              break;
            }
          // 分析专长与医生简介相关
          if (doctor.introduction && doctor.introduction.includes(userSpecialty)) {
            matchScore += 6;
            matchReasons.push(`专长简介相关：${userSpecialty}`);
            console.log(`专长简介相关 +6分: ${userSpecialty}, 当前分数: ${matchScore}`);
            specialtyMatched = true;
            break;
          }
        }
        // 如果专长完全不匹配，给予负分
        if (!specialtyMatched) {
          matchScore -= 3;
          matchReasons.push(`专长不匹配`);
          console.log(`专长不匹配 -3分, 当前分数: ${matchScore}`);
        }
      }
    }
      
      // 经验加分
      if (doctor.experience_years && doctor.experience_years >= 5) {
        matchScore += 10;
        matchReasons.push(`经验丰富：${doctor.experience_years}年`);
        console.log(`经验丰富 +10分: ${doctor.experience_years}年, 当前分数: ${matchScore}`);
      }
      
      // 评分加分
      if (doctor.rating && parseFloat(doctor.rating) >= 4.5) {
        matchScore += 10;
        matchReasons.push(`评分优秀：${doctor.rating}分`);
        console.log(`评分优秀 +10分: ${doctor.rating}分, 当前分数: ${matchScore}`);
      }
      
      // 如果没有明确的匹配原因，给一个基础分数
      if (matchScore === 0) {
        matchScore = 50;
        matchReasons.push('系统智能匹配');
        console.log(`基础分数 +50分: 系统智能匹配, 当前分数: ${matchScore}`);
      }
      
      // 限制最大匹配分数为100
      matchScore = Math.min(matchScore, 100);
      
      console.log(`医生 ${doctor.name} 最终分数: ${matchScore}, 匹配原因: ${matchReasons.join('，')}`);
       console.log('---');
      
      const doctorResult = {
        ...doctor,
        matchScore: matchScore,
        study_report: doctor.study_report || '暂无研究报告'
      };
      
      // 只有当有匹配理由时才添加recommendReason字段
      if (matchReasons.length > 0) {
        doctorResult.recommendReason = matchReasons.join('，');
      }
      
      return doctorResult;
    });
    
    // 6. 按匹配分数排序，选择最佳匹配
    scoredDoctors.sort((a, b) => b.matchScore - a.matchScore);
    const topDoctors = scoredDoctors.slice(0, 2);
    
    if (topDoctors.length > 0) {
      return {
        found: true,
        doctors: topDoctors,
        response: `根据您的症状"${diseaseAnalysis.summary}"，为您找到以下匹配的医生：`
      };
    } else {
      return {
        found: false,
        doctors: [],
        response: '抱歉，暂时无法找到合适的医生，请稍后重试。'
      };
    }
    
  } catch (error) {
    console.error('数据库查询医生失败:', error);
    return {
      found: false,
      doctors: [],
      response: '抱歉，系统繁忙，请稍后重试。'
    };
  }
}

// 保存对话记忆
async function saveConversationMemory(userInput, userNeedsAnalysis, recommendedDoctors) {
  try {
    const db = cloud.database();
    const memoryCollection = db.collection('conversation_memory');
    
    const memoryRecord = {
      timestamp: new Date(),
      userInput: userInput,
      needsAnalysis: userNeedsAnalysis,
      recommendedDoctors: recommendedDoctors.map(doctor => ({
        id: doctor._id,
        name: doctor.name,
        department: doctor.department,
        matchScore: doctor.matchScore
      })),
      createTime: db.serverDate()
    };
    
    await memoryCollection.add({
      data: memoryRecord
    });
    
    console.log('对话记忆保存成功');
  } catch (error) {
    console.error('保存对话记忆失败:', error);
  }
}

// 构建最终回复提示
function buildFinalResponsePrompt(diseaseAnalysis, matchedDoctors) {
  const doctorsInfo = matchedDoctors.map(doctor => {
    let info = `医生：${doctor.name}，科室：${doctor.department}，医院：${doctor.hospital}，专长：${doctor.specialties ? doctor.specialties.join('、') : '未知'}，经验：${doctor.experience_years}年，评分：${doctor.rating}`;
    if (doctor.recommendReason) {
      info += `，匹配理由：${doctor.recommendReason}`;
    }
    return info;
  }).join('\n');
  
  const promptText = `
请基于以下信息，为用户组织一个温暖、专业、有帮助的回复：

疾病分析结果：
- 症状：${diseaseAnalysis.symptoms.join('、')}
- 可能疾病：${diseaseAnalysis.possibleDiseases.join('、')}
- 建议科室：${diseaseAnalysis.department}
- 健康建议：${diseaseAnalysis.advice}

匹配的医生信息：
${doctorsInfo}

请组织一个包含以下内容的回复：
1. 对用户症状的理解和关怀
2. 简要的健康建议
3. 匹配的医生信息（包括姓名、科室、医院等）
4. 温馨提醒和就医建议

回复要求：
- 语气温暖、专业、有同理心
- 内容结构清晰，易于阅读
- 避免过于医学化的术语
- 字数控制在200-300字

请直接返回组织好的回复内容，不需要JSON格式。
`;
  
  return promptText;
}

// 解析最终回复结果
function parseFinalResponse(llmResponse) {
  try {
    return llmResponse.trim();
  } catch (error) {
    console.error('解析最终回复失败:', error);
    return '感谢您的咨询，我们已为您匹配了合适的医生，建议您及时就医。';
  }
}

// 获取默认匹配医生（包含study_report）
function getDefaultRecommendation(doctorInfo) {
  return [{
    ...doctorInfo,
    matchScore: 70,
    study_report: doctorInfo.study_report || '暂无研究报告'
  }];
}

// 根据医生姓名搜索医生
// 简化的数据库查询函数（避免与doctor-matching重复）
async function searchDoctorsByName(doctorName, doctorsCollection) {
  if (!doctorName || doctorName.trim() === '') {
    return { found: false, doctors: [], message: '请提供医生姓名' };
  }
  
  try {
    const cleanName = doctorName.replace(/(医生|大夫|主任|教授|博士|Dr\.|dr\.)$/g, '').trim();
    const result = await doctorsCollection.where({ name: cleanName }).get();
    const doctors = result.data || [];
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `找到${doctors.length}位医生` : '未找到匹配的医生'
    };
  } catch (error) {
    console.error('搜索医生失败:', error);
    return { found: false, doctors: [], message: '搜索医生时发生错误' };
  }
}

async function searchDoctorsByDepartment(departmentName, doctorsCollection) {
  if (!departmentName || departmentName.trim() === '') {
    return { found: false, doctors: [], message: '请提供科室名称' };
  }
  
  try {
    const result = await doctorsCollection.where({ department: departmentName }).get();
    const doctors = (result.data || []).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `在${departmentName}找到${doctors.length}位医生` : `未找到${departmentName}的医生`
    };
  } catch (error) {
    console.error('搜索科室医生失败:', error);
    return { found: false, doctors: [], message: '搜索科室医生时发生错误' };
  }
}

async function searchDoctorsByHospital(hospitalName, doctorsCollection) {
  if (!hospitalName || hospitalName.trim() === '') {
    return { found: false, doctors: [], message: '请提供医院名称' };
  }
  
  try {
    const result = await doctorsCollection.where({ hospital: hospitalName }).get();
    const doctors = (result.data || []).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `在${hospitalName}找到${doctors.length}位医生` : `未找到${hospitalName}的医生`
    };
  } catch (error) {
    console.error('搜索医院医生失败:', error);
    return { found: false, doctors: [], message: '搜索医院医生时发生错误' };
  }
}

async function searchDoctorsByHospitalAndDepartment(hospitalName, departmentName, doctorsCollection) {
  if (!hospitalName || !departmentName || hospitalName.trim() === '' || departmentName.trim() === '') {
    return { found: false, doctors: [], message: '请提供完整的医院和科室名称' };
  }
  
  try {
    const result = await doctorsCollection.where({
      hospital: hospitalName,
      department: departmentName
    }).get();
    const doctors = (result.data || []).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `在${hospitalName}的${departmentName}找到${doctors.length}位医生` : `未找到${hospitalName}${departmentName}的医生`
    };
  } catch (error) {
    console.error('搜索医院科室医生失败:', error);
    return { found: false, doctors: [], message: '搜索医院科室医生时发生错误' };
  }
}