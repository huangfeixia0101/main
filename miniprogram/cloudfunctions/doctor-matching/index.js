const cloud = require('wx-server-sdk');
const fetch = require('node-fetch');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

// 检查用户使用次数限制
async function checkUsageLimit(openid, userInfo) {
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
    
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    // 查询今日使用记录
    const usageResult = await db.collection('doctor_matching_usage')
      .where({
        openid: openid,
        createTime: db.command.gte(todayStart).and(db.command.lt(todayEnd))
      })
      .count();
    
    const todayUsageCount = usageResult.total || 0;
    
    // 判断用户是否已登录（使用与doctor-matching-pro相同的逻辑）
    const isLoggedIn = !!(fullUserInfo && fullUserInfo._id);
    console.log('用户登录状态检查:', { 
      isLoggedIn, 
      openid, 
      todayUsageCount,
      hasUserId: !!(fullUserInfo && fullUserInfo._id),
      fullUserInfo: fullUserInfo ? { _id: fullUserInfo._id, isVIP: fullUserInfo.isVIP } : null 
    });
    
    if (!isLoggedIn) {
      // 未登录用户：每天只能使用1次
      console.log('未登录用户使用次数检查:', { todayUsageCount, limit: 1 });
      if (todayUsageCount >= 1) {
        console.log('未登录用户已达使用上限');
        return {
          allowed: false,
          needLogin: true,
          reason: '未登录用户每日使用次数已达上限',
          message: '您今天已经使用过智能医生匹配功能了。\n\n如需继续使用，请先注册登录，登录后每天可使用3次。\n\n点击右下角"我的"进行注册登录。'
        };
      }
      console.log('未登录用户允许使用（今日第' + (todayUsageCount + 1) + '次）');
    } else {
      // 已登录用户：先检查是否为VIP
      const isVIP = fullUserInfo && fullUserInfo.isVIP === true;
      console.log('已登录用户VIP状态检查:', { 
        isVIP, 
        userInfo: fullUserInfo ? 'exists' : 'null', 
        isVIPField: fullUserInfo ? fullUserInfo.isVIP : 'undefined',
        userId: fullUserInfo ? fullUserInfo._id : null
      });
      
      // VIP用户无使用次数限制（但必须已登录）
      if (isVIP) {
        console.log('VIP用户（已登录），允许无限制使用，今日已使用次数:', todayUsageCount);
        return {
          allowed: true,
          isLoggedIn: true,
          isVIP: true,
          todayUsageCount: todayUsageCount
        };
      }
      
      // 非VIP的已登录用户：每天最多3次
      console.log('非VIP已登录用户使用次数检查:', { todayUsageCount, limit: 3 });
      if (todayUsageCount >= 3) {
        console.log('非VIP已登录用户已达使用上限，检查积分抵扣');
        return {
          allowed: false,
          needLogin: false,
          canUsePoints: true,
          pointsRequired: 10,
          reason: '已登录用户每日使用次数已达上限',
          message: `您今天已经使用了3次智能医生匹配功能，已达每日上限。\n\n可以使用10积分继续使用，或明天再来。`
        };
      }
      console.log('非VIP已登录用户允许使用（今日第' + (todayUsageCount + 1) + '次）');
    }
    
    return {
      allowed: true,
      isLoggedIn: isLoggedIn,
      todayUsageCount: todayUsageCount
    };
    
  } catch (error) {
    console.error('检查使用次数限制失败:', error);
    // 如果检查失败，为了安全起见，限制使用（避免绕过使用限制）
    return {
      allowed: false,
      needLogin: true,
      reason: '系统暂时无法验证使用次数',
      message: '系统暂时繁忙，请稍后重试。如果问题持续存在，请联系客服。'
    };
  }
}

// 记录使用次数
async function recordUsage(openid, userInfo, userInput) {
  try {
    await db.collection('doctor_matching_usage').add({
      data: {
        openid: openid,
        userId: userInfo ? userInfo._id : null,
        userInput: userInput.substring(0, 100), // 只记录前100个字符
        createTime: new Date(),
        isLoggedIn: userInfo && userInfo._id ? true : false
      }
    });
    console.log('使用记录保存成功');
  } catch (error) {
    console.error('保存使用记录失败:', error);
    // 记录失败不影响主要功能
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const startTime = Date.now();
  console.log('doctor-matching云函数开始执行...', new Date().toISOString());
  console.log('接收到的事件数据:', JSON.stringify(event));
  
  try {
    const { userInput, conversationHistory, userInfo, openid, usePoints } = event;
    
    // 获取微信上下文和openid
    const wxContext = cloud.getWXContext();
    const openidFromWX = wxContext.OPENID;
    
    // 获取用户openid（优先使用微信上下文的openid，然后是传入的openid，最后从userInfo获取）
    const currentOpenid = openidFromWX || openid || (userInfo && userInfo.openId);
    console.log('获取到的openid:', currentOpenid);
    console.log('微信上下文openid:', openidFromWX);
    
    if (!currentOpenid) {
      console.error('无法获取用户openid');
      console.log('event.openid:', openid);
      console.log('userInfo.openId:', userInfo && userInfo.openId);
      console.log('wxContext.OPENID:', openidFromWX);
      return {
        success: false,
        error: '用户身份验证失败',
        data: {
          response: '抱歉，无法验证您的身份，请重新进入小程序。',
          recommendedDoctors: []
        }
      };
    }
    
    // 检查用户使用次数限制（如果不是使用积分的情况）
    if (!usePoints) {
      const usageCheckResult = await checkUsageLimit(currentOpenid, userInfo);
      if (!usageCheckResult.allowed) {
        // 如果可以使用积分抵扣
        if (usageCheckResult.canUsePoints) {
          return {
            success: false,
            error: usageCheckResult.reason,
            needLogin: usageCheckResult.needLogin,
            canUsePoints: true,
            pointsRequired: usageCheckResult.pointsRequired,
            data: {
              response: usageCheckResult.message,
              recommendedDoctors: []
            }
          };
        }
        return {
          success: false,
          error: usageCheckResult.reason,
          needLogin: usageCheckResult.needLogin,
          data: {
            response: usageCheckResult.message,
            recommendedDoctors: []
          }
        };
      }
    }
    
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
    
    // 通过使用次数检查后，立即记录使用次数（避免因后续处理失败导致次数不被记录）
    await recordUsage(currentOpenid, userInfo, userInput);
    console.log('使用次数已记录');
    
    console.log(`[${Date.now() - startTime}ms] 开始分析用户输入...`);
    
    const db = cloud.database();
    const doctorsCollection = db.collection('doctors');
    
    // 1. 第一步：使用LLM分析用户输入，分析疾病并给出健康建议
    console.log(`[${Date.now() - startTime}ms] 开始LLM疾病分析和建议...`);
    
    // 检查是否还有足够时间进行LLM调用
    if (Date.now() - startTime > 100000) {
      console.warn(`[${Date.now() - startTime}ms] 时间不足，返回超时错误`);
      return {
        success: false,
        error: '系统繁忙，请稍后重试',
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
    
    // 2. 第二步：根据LLM分析的查询类型决定处理方式
    console.log(`[${Date.now() - startTime}ms] 查询类型: ${diseaseAnalysis.queryType}`);
    
    let dbMatchResult;
    
    if (diseaseAnalysis.queryType === '医生查询') {
      // 医生查询：根据医生姓名搜索
const doctorResult = {
  ...doctor,
  matchScore: normalizedScore,

  // ... 其他字段
};
matchedDoctors.push(doctorResult);      console.log(`[${Date.now() - startTime}ms] 执行医生查询: ${diseaseAnalysis.targetName}`);
      const basicResult = await searchDoctorsByName(diseaseAnalysis.targetName, doctorsCollection);
      
      dbMatchResult = basicResult;
    } else if (diseaseAnalysis.queryType === '科室查询') {
      // 科室查询：检查是否为复合查询（同时包含医院和科室）
      let basicResult;
      if (diseaseAnalysis.hospitalName && diseaseAnalysis.departmentName) {
        console.log(`[${Date.now() - startTime}ms] 执行复合查询: ${diseaseAnalysis.hospitalName} - ${diseaseAnalysis.departmentName}`);
        basicResult = await searchDoctorsByHospitalAndDepartment(diseaseAnalysis.hospitalName, diseaseAnalysis.departmentName, doctorsCollection);
      } else {
        // 单纯科室查询
        const departmentName = diseaseAnalysis.departmentName || diseaseAnalysis.targetName;
        console.log(`[${Date.now() - startTime}ms] 执行科室查询: ${departmentName}`);
        basicResult = await searchDoctorsByDepartment(departmentName, doctorsCollection);
      }
      
      dbMatchResult = basicResult;
    } else if (diseaseAnalysis.queryType === '医院查询') {
      // 医院查询：根据医院名称搜索
      const hospitalName = diseaseAnalysis.hospitalName || diseaseAnalysis.targetName;
      console.log(`[${Date.now() - startTime}ms] 执行医院查询: ${hospitalName}`);
      const basicResult = await searchDoctorsByHospital(hospitalName, doctorsCollection);
      
      dbMatchResult = basicResult;
    } else {
      // 症状描述：使用高级匹配评分系统
      console.log(`[${Date.now() - startTime}ms] 根据疾病分析结果进行高级匹配...`);
      
      // 首先从数据库获取所有相关医生
      const dbResult = await searchDoctorsByDiseaseAnalysisFromDB(diseaseAnalysis, doctorsCollection);
      
      dbMatchResult = dbResult;
    }
    
    if (dbMatchResult.found && dbMatchResult.doctors.length > 0) {
      console.log(`[${Date.now() - startTime}ms] 数据库匹配成功，找到${dbMatchResult.doctors.length}位医生`);
      
      // 检查是否还有足够时间进行第二次LLM调用来组织语言
      if (Date.now() - startTime > 90000) {
        console.warn(`[${Date.now() - startTime}ms] 时间不足，直接返回数据库匹配结果`);
        // 保存对话记忆
        await saveConversationMemory(userInput, diseaseAnalysis, dbMatchResult.doctors);
        
        // 使用次数已在函数开始时记录
        
        return {
          success: true,
          data: {
            response: `根据您的症状分析:\n${diseaseAnalysis.advice || '建议您及时就医'}。为您匹配以下专业医生：`,
            recommendedDoctors: dbMatchResult.doctors,
            doctors: dbMatchResult.doctors  // 添加doctors字段供前端使用
          }
        };
      }
      
      // 3. 第三步：使用LLM组织优美亲切的语言输出
      console.log(`[${Date.now() - startTime}ms] 调用LLM组织最终回复...`);
      const finalResponsePrompt = buildFinalResponsePrompt(diseaseAnalysis, dbMatchResult.doctors, conversationHistory);
      
      try {
        const finalResponse = await callLLM(finalResponsePrompt);
        const parsedFinalResponse = parseFinalResponse(finalResponse);
        
        // 保存对话记忆
        await saveConversationMemory(userInput, diseaseAnalysis, dbMatchResult.doctors);
        
        // 使用次数已在函数开始时记录
        
        console.log(`[${Date.now() - startTime}ms] 最终回复组织完成`);
        return {
          success: true,
          data: {
            response: parsedFinalResponse,
            recommendedDoctors: dbMatchResult.doctors,
            doctors: dbMatchResult.doctors  // 添加doctors字段供前端使用
          }
        };
      } catch (finalResponseError) {
        console.error(`[${Date.now() - startTime}ms] 最终回复组织失败:`, finalResponseError);
        // 如果LLM组织语言失败，返回简单的回复
        await saveConversationMemory(userInput, diseaseAnalysis, dbMatchResult.doctors);
        
        // 使用次数已在函数开始时记录
        
        return {
          success: true,
          data: {
            response: `根据您的症状分析:\n${diseaseAnalysis.advice || '建议您及时就医'}。为您匹配以下专业医生：`,
            recommendedDoctors: dbMatchResult.doctors,
            doctors: dbMatchResult.doctors  // 添加doctors字段供前端使用
          }
        };
      }
    }
    
    console.log(`[${Date.now() - startTime}ms] 数据库中未找到匹配医生，返回隐私限制提醒`);
    
    // 5. 如果数据库中找不到合适的医生，返回隐私限制提醒
    // 使用次数已在函数开始时记录
    
    return {
      success: true,
      data: {
        response: `根据您描述的症状:\n${diseaseAnalysis.advice || '建议您寻求专业医疗帮助'}\n由于没法根据您的描述匹配到合适的医生或者您要的医生没有经过我们的调研，请您再次详细描述您的症状或需求，如需人工匹配医生请使用以下服务：`,
        recommendedDoctors: [],
        doctors: []  // 添加doctors字段供前端使用
      }
    };
    

  } catch (error) {
    console.error(`[${Date.now() - startTime}ms] 云函数执行过程中发生错误:`, error);
    console.error(`[${Date.now() - startTime}ms] 错误堆栈:`, error.stack);
    
    // 使用次数已在函数开始时记录
    
    // 根据错误类型提供不同的响应
    let errorMessage = '抱歉，服务暂时不可用，请稍后重试。';
    if (error.message.includes('timeout') || error.message.includes('超时')) {
      errorMessage = '请求处理时间较长，请稍后重试。如果问题持续，建议直接咨询医生。';
    } else if (error.message.includes('API') || error.message.includes('网络')) {
      errorMessage = '网络连接异常，请检查网络后重试。';
    }
    
    const fallbackDoctor = {
      _id: 'fallback_doctor',
      name: '在线医生',
      department: '综合科室',
      hospital: '智能医疗平台',
      recommendReason: '系统推荐：建议您直接咨询专业医生',
      matchScore: 60,
      rating: '4.5',
      experience: '5年以上'
    };
    
    return {
      success: true, // 改为true，避免前端显示错误
      data: {
        response: errorMessage,
        recommendedDoctors: [fallbackDoctor],
        doctors: [fallbackDoctor]  // 添加doctors字段供前端使用
      }
    };
  } finally {
    console.log(`[${Date.now() - startTime}ms] 云函数执行完成`);
  }
};

function buildPrompt(userInput, history, doctorInfo) {
  // 将单个医生对象转换为数组格式的字符串
  const doctorInfoText = `医生ID: ${doctorInfo._id}, 姓名: ${doctorInfo.name}, 科室: ${doctorInfo.department}, 专长: ${doctorInfo.specialties ? doctorInfo.specialties.join(', ') : '未知'}, 经验: ${doctorInfo.experience_years || '未知'}年, 医院: ${doctorInfo.hospital || '未知'}, 评分: ${doctorInfo.rating || '未知'}`;
  
  console.log('医生信息文本:', doctorInfoText);
  
  const historyText = Array.isArray(history) && history.length > 0 ? 
    history.map(h => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`).join('\n') : 
    '无历史对话';
  
  console.log('对话历史文本长度:', historyText.length);
  
  const promptText = `
你是一个专业的医疗咨询助手，需要根据用户描述的症状和需求，判断用户是否适合咨询以下医生。

医生信息：
${doctorInfoText}

对话历史：
${historyText}

用户当前输入：${userInput}

请分析用户的症状和需求，判断该医生是否适合，并说明理由。请严格按照以下JSON格式返回：
{
  "analysis": "对用户症状的简要分析",
  "recommendations": [
    {
      "doctorId": "${doctorInfo._id}",
      "reason": "匹配理由（50字以内）",
      "matchScore": 95
    }
  ],
  "response": "给用户的友好回复"
}
`;

  console.log('构建的提示词长度:', promptText.length);
  return promptText;
}

function getDefaultRecommendation(doctorInfo) {
  console.log('使用默认匹配');
  return [{
    ...doctorInfo,
    recommendReason: '系统匹配，专业可靠',
    matchScore: 80
  }];
}

function parseLLMResponse(llmResponse, doctorInfo) {
  try {
    console.log('开始解析LLM响应...');
    // 尝试提取JSON部分
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : llmResponse;
    console.log('提取的JSON字符串:', jsonStr.substring(0, 100) + '...');
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (jsonError) {
      console.error('JSON解析失败:', jsonError.message);
      throw new Error('无法解析LLM响应');
    }
    
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
      console.warn('LLM响应中没有匹配数据');
      return {
        explanation: parsed.response || '很抱歉，无法提供医生匹配',
        doctors: getDefaultRecommendation(doctorInfo)
      };
    }
    
    const recommendedDoctors = parsed.recommendations.map(rec => {
      return {
        ...doctorInfo,
        recommendReason: rec.reason || '系统匹配',
        matchScore: rec.matchScore || 85
      };
    });
    
    console.log('解析完成，匹配医生数量:', recommendedDoctors.length);
    
    return {
      explanation: parsed.response || '为您匹配以下医生：',
      doctors: recommendedDoctors
    };
  } catch (error) {
    console.error('解析LLM响应失败:', error);
    // 如果解析失败，返回默认匹配
    return {
      explanation: '根据您的描述，为您匹配以下医生：',
      doctors: getDefaultRecommendation(doctorInfo)
    };
  }
}

async function callLLM(prompt) {
  const startTime = Date.now();
  try {
    console.log(`[${Date.now() - startTime}ms] 开始调用MiniMax API...`);
    
    // 打印完整的prompt内容
    console.log(`[${Date.now() - startTime}ms] 发送给MiniMax的完整prompt内容:`);
    console.log(prompt);
    
    // 检查是否设置了API密钥
    const apiKey = process.env.MINIMAX_API_KEY;
    const baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat';
    
    if (!apiKey) {
      console.error('MINIMAX_API_KEY环境变量未设置，无法调用LLM API');
      throw new Error('API密钥未设置');
    }
    
    // 设置请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn(`[${Date.now() - startTime}ms] MiniMax API请求即将超时，中断请求`);
    }, 60000); // 60秒超时，避免云函数整体超时
    
    try {
      console.log(`[${Date.now() - startTime}ms] 发送API请求到:`, baseUrl);
      const response = await fetch(`${baseUrl}/v1/text/chatcompletion_pro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'abab5.5-chat',
          tokens_to_generate: 1024,
          temperature: 0.3,
          top_p: 0.95,
          stream: false,
          reply_constraints: {
            sender_type: 'BOT',
            sender_name: 'MM智能助理'
          },
          messages: [{
            sender_type: 'USER',
            sender_name: '用户',
            text: prompt
          }],
          bot_setting: [{
            bot_name: 'MM智能助理',
            content: 'MM智能助理是一款专业的医疗咨询助手，能够根据用户症状提供专业的医生匹配建议。'
          }]
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log(`[${Date.now() - startTime}ms] MiniMax API响应状态:`, response.status);
      
      if (!response.ok) {
        console.error(`MiniMax API错误: ${response.status} ${response.statusText}`);
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }
      
      // 接收响应体（兼容微信小程序环境）
      console.log(`[${Date.now() - startTime}ms] 开始接收响应体...`);
      
      let data;
      try {
        // 直接使用 response.json()，因为微信小程序环境不支持 getReader
        data = await response.json();
        console.log(`[${Date.now() - startTime}ms] 响应体接收完成`);
      } catch (parseError) {
        console.error(`[${Date.now() - startTime}ms] JSON解析失败:`, parseError.message);
        throw new Error('响应格式错误，无法解析JSON: ' + parseError.message);
      }
      
      // 检查MiniMax响应格式
      if (!data || data.base_resp?.status_code !== 0) {
        console.error(`[${Date.now() - startTime}ms] MiniMax API返回错误`);
        console.error('错误信息:', data?.base_resp?.status_msg || '未知错误');
        console.error('响应数据:', JSON.stringify(data, null, 2));
        throw new Error(`MiniMax API错误: ${data?.base_resp?.status_msg || '未知错误'}`);
      }
      
      // 确保响应体已完全接收
      if (!data.choices || !data.choices[0] || !data.choices[0].messages || !data.choices[0].messages[0]) {
        console.error(`[${Date.now() - startTime}ms] 响应体不完整或格式错误`);
        console.error('响应数据:', JSON.stringify(data, null, 2));
        throw new Error('响应体不完整或格式错误');
      }
      
      const responseContent = data.choices[0].messages[0].text;
      
      // 添加额外的检查，确保响应内容不为空
      if (!responseContent || responseContent.trim() === '') {
        console.error(`[${Date.now() - startTime}ms] 响应内容为空`);
        throw new Error('响应内容为空');
      }
      
      // 打印MiniMax返回的完整响应（限制长度避免日志过长）
      console.log(`[${Date.now() - startTime}ms] MiniMax返回响应长度: ${responseContent.length}`);
      console.log(`[${Date.now() - startTime}ms] MiniMax响应预览:`, responseContent.substring(0, 200) + (responseContent.length > 200 ? '...' : ''));
      
      return responseContent;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[${Date.now() - startTime}ms] MiniMax API调用失败:`, error.message);
      throw error; // 将错误向上传递
    }
  } catch (error) {
    console.error(`[${Date.now() - startTime}ms] MiniMax调用过程中发生错误:`, error);
    throw error; // 将错误向上传递
  }
}

// getMockLLMResponse函数已被移除，不再使用模拟响应

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

// 高级医生匹配评分系统 - 多维度综合评估
async function searchDoctorsByDiseaseAnalysis(diseaseAnalysis, allDoctors) {
  console.log('=== 启动高级医生匹配评分系统 ===');
  console.log('疾病分析结果:', diseaseAnalysis);
  
  const matchedDoctors = [];
  
  for (const doctor of allDoctors) {
    console.log(`\n🔍 开始评估医生: ${doctor.name} (${doctor.hospital} - ${doctor.department})`);
    

    
    const matchDetails = {
      departmentMatch: [],
      specialtyMatch: [],
      symptomRelevance: [],
      diseaseExpertise: [],
      experienceLevel: [],
      qualityRating: [],
      semanticSimilarity: [],
      urgencyAlignment: []
    };
    

    

    

      

      

    

    

    

    
    // 简化的匹配逻辑
    const normalizedScore = 60; // 基础匹配分数
    
    // 生成推荐原因
    const reasons = [];
    if (doctor.department) {
      reasons.push(`科室匹配：${doctor.department}`);
    }
    if (doctor.rating && parseFloat(doctor.rating) >= 4.5) {
      reasons.push(`评分优秀：${doctor.rating}分`);
    }
    if (doctor.experience_years && parseInt(doctor.experience_years) >= 5) {
      reasons.push('经验丰富');
    }
    if (reasons.length === 0) {
      reasons.push('系统匹配');
    }
    
    const doctorResult = {
      ...doctor,
      matchScore: normalizedScore,
      recommendReason: reasons.join('，')
    };
    
    matchedDoctors.push(doctorResult);
  }
  
  // 按匹配分数排序
  matchedDoctors.sort((a, b) => b.matchScore - a.matchScore);
  
  if (matchedDoctors.length > 0) {
    const topDoctors = matchedDoctors.slice(0, 3); // 增加到3位医生
    
    console.log('\n🎯 最终匹配结果:');
    topDoctors.forEach((doctor, index) => {
      console.log(`${index + 1}. ${doctor.name} - 匹配度: ${doctor.matchScore}%`);
    });
    
    return {
      found: true,
      doctors: topDoctors,
      response: generateDetailedMatchingReport(diseaseAnalysis, topDoctors)
    };
  }
  
  // 如果没有医生匹配，返回基础结果
  console.log('\n⚠️ 没有医生达到匹配阈值');
  const doctorsWithBasicScores = allDoctors.slice(0, 3).map(doctor => {
    // 生成简单的推荐原因
    const reasons = [];
    if (doctor.department) {
      reasons.push(`科室匹配：${doctor.department}`);
    }
    if (doctor.rating && parseFloat(doctor.rating) >= 4.0) {
      reasons.push(`评分优秀：${doctor.rating}分`);
    }
    if (doctor.experience_years && parseInt(doctor.experience_years) >= 10) {
      reasons.push(`经验丰富：${doctor.experience_years}年`);
    }
    if (reasons.length === 0) {
      reasons.push('系统基础匹配');
    }
    
    return {
      ...doctor,
      matchScore: 25,
      recommendReason: reasons.join('，')
    };
  });
  
  return {
    found: true,
    doctors: doctorsWithBasicScores,
    response: generateDetailedMatchingReport(diseaseAnalysis, doctorsWithBasicScores)
  };
}

// 辅助函数：获取相关科室
function getRelatedDepartments(department) {
  const relatedMap = {
    '内科': ['心内科', '消化内科', '呼吸内科', '神经内科', '内分泌科'],
    '外科': ['普外科', '骨科', '泌尿外科', '神经外科', '胸外科'],
    '妇科': ['妇产科', '生殖医学科'],
    '儿科': ['新生儿科', '小儿外科'],
    '眼科': ['眼底病科', '青光眼科'],
    '耳鼻喉科': ['头颈外科']
  };
  return relatedMap[department] || [];
}

// 辅助函数：判断跨学科相关性
function isCrossDisciplinary(dept1, dept2) {
  const crossDisciplinaryPairs = [
    ['内科', '急诊科'],
    ['外科', '麻醉科'],
    ['妇科', '内分泌科'],
    ['儿科', '营养科'],
    ['神经内科', '精神科'],
    ['心内科', '心外科']
  ];
  
  return crossDisciplinaryPairs.some(pair => 
    (pair[0] === dept1 && pair[1] === dept2) || 
    (pair[0] === dept2 && pair[1] === dept1)
  );
}

// 辅助函数：判断跨领域相关性
function isCrossField(dept1, dept2) {
  const medicalFields = {
    '内科系': ['内科', '心内科', '消化内科', '呼吸内科', '神经内科', '内分泌科'],
    '外科系': ['外科', '普外科', '骨科', '泌尿外科', '神经外科', '胸外科'],
    '专科系': ['眼科', '耳鼻喉科', '皮肤科', '口腔科'],
    '妇儿系': ['妇科', '产科', '儿科', '新生儿科']
  };
  
  for (const field of Object.values(medicalFields)) {
    if (field.includes(dept1) && field.includes(dept2)) {
      return true;
    }
  }
  return false;
}

// 辅助函数：判断专长相关性
function isRelatedSpecialty(specialty1, specialty2) {
  const keywords1 = specialty1.split(/[，、\s]+/);
  const keywords2 = specialty2.split(/[，、\s]+/);
  
  return keywords1.some(k1 => 
    keywords2.some(k2 => 
      k1.includes(k2) || k2.includes(k1) || 
      (k1.length > 1 && k2.length > 1 && (k1.includes(k2.substring(0, 2)) || k2.includes(k1.substring(0, 2))))
    )
  );
}

// 辅助函数：计算语义相似度
function calculateSemanticSimilarity(text1, text2) {
  // 简化的语义相似度计算
  const words1 = text1.toLowerCase().split(/[\s，、。！？]+/).filter(w => w.length > 1);
  const words2 = text2.toLowerCase().split(/[\s，、。！？]+/).filter(w => w.length > 1);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matchCount = 0;
  words1.forEach(w1 => {
    if (words2.some(w2 => w1.includes(w2) || w2.includes(w1))) {
      matchCount++;
    }
  });
  
  return matchCount / Math.max(words1.length, words2.length);
}

// 辅助函数：提取医学术语
function extractMedicalTerms(text) {
  const medicalTerms = [
    '疼痛', '发热', '咳嗽', '头痛', '腹痛', '胸痛', '呼吸困难', '心悸', '失眠', '便秘', '腹泻',
    '高血压', '糖尿病', '冠心病', '哮喘', '胃炎', '肝炎', '肾炎', '关节炎', '骨折', '肿瘤',
    '手术', '治疗', '诊断', '检查', '药物', '康复', '预防', '急救', '护理'
  ];
  
  return medicalTerms.filter(term => text.includes(term));
}

// 辅助函数：计算紧急程度匹配
function calculateUrgencyAlignment(urgency, doctor) {
  const urgencyMap = {
    '高': 5,
    '中': 3,
    '低': 1
  };
  
  const baseScore = urgencyMap[urgency] || 0;
  
  // 急诊科医生在高紧急度情况下加分
  if (urgency === '高' && doctor.department && doctor.department.includes('急诊')) {
    return Math.min(baseScore + 2, 5);
  }
  
  return baseScore;
}

// 辅助函数：计算数据完整性
function calculateDataCompleteness(doctor) {
  let completeness = 0;
  const fields = ['name', 'department', 'hospital', 'specialties', 'experience_years', 'rating', 'introduction'];
  
  fields.forEach(field => {
    if (doctor[field] && doctor[field] !== '' && doctor[field] !== null) {
      completeness += 1;
    }
  });
  
  return Math.round((completeness / fields.length) * 100);
}

// 辅助函数：计算匹配可靠性




// 辅助函数：生成详细匹配报告
function generateDetailedMatchingReport(diseaseAnalysis, topDoctors) {
  let report = `🔍 **智能医生匹配分析报告**\n\n`;
  
  // 用户需求分析
  report += `📋 **您的需求分析:**\n`;
  if (diseaseAnalysis.symptoms && diseaseAnalysis.symptoms.length > 0) {
    report += `• 主要症状: ${diseaseAnalysis.symptoms.join('、')}\n`;
  }
  if (diseaseAnalysis.possibleDiseases && diseaseAnalysis.possibleDiseases.length > 0) {
    report += `• 可能疾病: ${diseaseAnalysis.possibleDiseases.join('、')}\n`;
  }
  if (diseaseAnalysis.department) {
    report += `• 建议科室: ${diseaseAnalysis.department}\n`;
  }
  report += `• 紧急程度: ${diseaseAnalysis.urgency || '中等'}\n\n`;
  
  // 匹配结果
  report += `🎯 **为您匹配到 ${topDoctors.length} 位专业医生:**\n\n`;
  
  topDoctors.forEach((doctor, index) => {
    report += `**${index + 1}. ${doctor.name}**\n`;
    report += `   📍 ${doctor.hospital} · ${doctor.department}\n`;
    report += `   ⭐ 综合匹配度: ${doctor.matchScore}%\n`;
    
    // 显示推荐原因
    if (doctor.recommendReason) {
      report += `   💡 推荐理由: ${doctor.recommendReason}\n`;
    }
    
    report += `\n`;
  });
  
  // 健康建议
  if (diseaseAnalysis.advice) {
    report += `💊 **健康建议:**\n${diseaseAnalysis.advice}\n\n`;
  }
  
  report += `📞 建议您选择匹配度最高的医生进行咨询，祝您早日康复！`;
  
  return report;
}


  
  function buildLLMPromptForDoctorMatching(userInput, history, allDoctors) {
  // 将医生信息转换为简洁的文本格式
  const doctorsInfoText = allDoctors.map(doctor => {
    return `医生ID: ${doctor._id}, 姓名: ${doctor.name}, 科室: ${doctor.department || '未知'}, 专长: ${doctor.specialties ? doctor.specialties.join(', ') : '未知'}, 经验: ${doctor.experience_years || '未知'}年, 医院: ${doctor.hospital || '未知'}, 评分: ${doctor.rating || '未知'}`;
  }).join('\n');
  
  console.log('医生信息文本长度:', doctorsInfoText.length);
  
  const historyText = Array.isArray(history) && history.length > 0 ? 
    history.map(h => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`).join('\n') : 
    '无历史对话';
  
  console.log('对话历史文本长度:', historyText.length);
  
  const promptText = `
你是一个专业的医疗咨询助手，需要根据用户描述的症状和需求，从医生数据库中匹配最合适的医生。

医生数据库信息：
${doctorsInfoText}

对话历史：
${historyText}

用户当前输入：${userInput}

请分析用户的症状和需求，从医生数据库中选择1-3位最合适的医生，并说明匹配理由。请严格按照以下JSON格式返回：
{
  "analysis": "对用户症状的简要分析",
  "recommendations": [
    {
      "doctorId": "医生ID",
      "reason": "匹配理由（50字以内）",
      "matchScore": 95
    }
    // 可以匹配1-2位医生
  ],
  "response": "给用户的友好回复，解释为什么匹配这些医生"
}
`;

  console.log('构建的提示词长度:', promptText.length);
  return promptText;
}

function parseLLMMatchingResponse(llmResponse, allDoctors) {
  try {
    console.log('开始解析LLM响应...');
    // 尝试提取JSON部分
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : llmResponse;
    console.log('提取的JSON字符串:', jsonStr.substring(0, 100) + '...');
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (jsonError) {
      console.error('JSON解析失败:', jsonError.message);
      throw new Error('无法解析LLM响应');
    }
    
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
      console.warn('LLM响应中没有匹配数据');
      return {
        explanation: parsed.response || '很抱歉，无法提供医生匹配',
        doctors: allDoctors.slice(0, 2).map(doctor => ({
          ...doctor,
          recommendReason: '系统匹配，专业可靠',
          matchScore: 80
        }))
      };
    }
    
    const recommendedDoctors = parsed.recommendations.map(rec => {
      // 根据doctorId查找对应的医生信息
      const doctorInfo = allDoctors.find(d => d._id === rec.doctorId) || allDoctors[0];
      
      return {
        ...doctorInfo,
        recommendReason: rec.reason || '系统匹配',
        matchScore: rec.matchScore || 85
      };
    });
    
    console.log('解析完成，匹配医生数量:', recommendedDoctors.length);
    
    return {
      explanation: parsed.response || '为您匹配以下医生：',
      doctors: recommendedDoctors
    };
  } catch (error) {
    console.error('解析LLM响应失败:', error);
    // 如果解析失败，返回默认匹配
    return {
      explanation: '根据您的描述，为您匹配以下医生：',
      doctors: allDoctors.slice(0, 2).map(doctor => ({
        ...doctor,
        recommendReason: '系统匹配，专业可靠',
        matchScore: 80
      }))
    };
  }
}

// getMockLLMResponse函数已被移除，不再使用模拟响应

// 构建疾病分析的LLM提示
// 第二个重复函数已删除

// 重复的parseDiseaseAnalysis函数已删除




  
  function buildLLMPromptForDoctorMatching(userInput, history, allDoctors) {
  // 将医生信息转换为简洁的文本格式
  const doctorsInfoText = allDoctors.map(doctor => {
    return `医生ID: ${doctor._id}, 姓名: ${doctor.name}, 科室: ${doctor.department || '未知'}, 专长: ${doctor.specialties ? doctor.specialties.join(', ') : '未知'}, 经验: ${doctor.experience_years || '未知'}年, 医院: ${doctor.hospital || '未知'}, 评分: ${doctor.rating || '未知'}`;
  }).join('\n');
  
  console.log('医生信息文本长度:', doctorsInfoText.length);
  
  const historyText = Array.isArray(history) && history.length > 0 ? 
    history.map(h => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`).join('\n') : 
    '无历史对话';
  
  console.log('对话历史文本长度:', historyText.length);
  
  const promptText = `
你是一个专业的医疗咨询助手，需要根据用户描述的症状和需求，从医生数据库中匹配最合适的医生。

医生数据库信息：
${doctorsInfoText}

对话历史：
${historyText}

用户当前输入：${userInput}

请分析用户的症状和需求，从医生数据库中选择1-3位最合适的医生，并说明匹配理由。请严格按照以下JSON格式返回：
{
  "analysis": "对用户症状的简要分析",
  "recommendations": [
    {
      "doctorId": "医生ID",
      "reason": "匹配理由（50字以内）",
      "matchScore": 95
    }
    // 可以匹配1-2位医生
  ],
  "response": "给用户的友好回复，解释为什么匹配这些医生"
}
`;

  console.log('构建的提示词长度:', promptText.length);
  return promptText;
}

function parseLLMMatchingResponse(llmResponse, allDoctors) {
  try {
    console.log('开始解析LLM响应...');
    // 尝试提取JSON部分
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : llmResponse;
    console.log('提取的JSON字符串:', jsonStr.substring(0, 100) + '...');
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (jsonError) {
      console.error('JSON解析失败:', jsonError.message);
      throw new Error('无法解析LLM响应');
    }
    
    if (!parsed.recommendations || !Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
      console.warn('LLM响应中没有匹配数据');
      return {
        explanation: parsed.response || '很抱歉，无法提供医生匹配',
        doctors: allDoctors.slice(0, 2).map(doctor => ({
          ...doctor,
          recommendReason: '系统匹配，专业可靠',
          matchScore: 80
        }))
      };
    }
    
    const recommendedDoctors = parsed.recommendations.map(rec => {
      // 根据doctorId查找对应的医生信息
      const doctorInfo = allDoctors.find(d => d._id === rec.doctorId) || allDoctors[0];
      
      return {
        ...doctorInfo,
        recommendReason: rec.reason || '系统匹配',
        matchScore: rec.matchScore || 85
      };
    });
    
    console.log('解析完成，匹配医生数量:', recommendedDoctors.length);
    
    return {
      explanation: parsed.response || '为您匹配以下医生：',
      doctors: recommendedDoctors
    };
  } catch (error) {
    console.error('解析LLM响应失败:', error);
    // 如果解析失败，返回默认匹配
    return {
      explanation: '根据您的描述，为您匹配以下医生：',
      doctors: allDoctors.slice(0, 2).map(doctor => ({
        ...doctor,
        recommendReason: '系统匹配，专业可靠',
        matchScore: 80
      }))
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
    // 不影响主流程，只记录错误
  }
}

function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
  


// 最后一个重复的parseDiseaseAnalysis函数已删除

// 根据疾病分析结果在数据库中搜索医生
async function searchDoctorsByDiseaseAnalysis(diseaseAnalysis, allDoctors) {
  console.log('根据疾病分析搜索医生:', diseaseAnalysis);
  
  const matchedDoctors = [];
  
  for (const doctor of allDoctors) {
    let matchScore = 0;
    let matchReasons = [];
    
    console.log(`开始匹配医生: ${doctor.name}, 初始分数: ${matchScore}`);
    
    // 科室匹配 - 优先精确匹配
    if (diseaseAnalysis.department && doctor.department) {
      if (doctor.department === diseaseAnalysis.department) {
        matchScore += 40;
        matchReasons.push(`科室精确匹配：${doctor.department}`);
        console.log(`科室精确匹配 +40分: ${doctor.department}, 当前分数: ${matchScore}`);
      }
    }
    
    // 专长匹配
    if (diseaseAnalysis.specialties && doctor.specialties) {
      for (const userSpecialty of diseaseAnalysis.specialties) {
        for (const doctorSpecialty of doctor.specialties) {
          if (doctorSpecialty.includes(userSpecialty) || userSpecialty.includes(doctorSpecialty)) {
            matchScore += 30;
            matchReasons.push(`专长匹配：${doctorSpecialty}`);
            console.log(`专长匹配 +30分: ${userSpecialty} -> ${doctorSpecialty}, 当前分数: ${matchScore}`);
            break;
          }
        }
      }
    }
    
    // 可能疾病匹配
    if (diseaseAnalysis.possibleDiseases && doctor.specialties) {
      for (const disease of diseaseAnalysis.possibleDiseases) {
        for (const specialty of doctor.specialties) {
          if (specialty.includes(disease) || disease.includes(specialty)) {
            matchScore += 25;
            matchReasons.push(`疾病相关：${specialty}`);
            console.log(`疾病匹配 +25分: ${disease} -> ${specialty}, 当前分数: ${matchScore}`);
            break;
          }
        }
      }
    }
    
    // 症状关键词匹配
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
      
      console.log(`科室不精确匹配，进行相关性匹配: ${diseaseAnalysis.department} vs ${doctor.department}`);
      
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
    if (doctor.rating && doctor.rating >= 4.5) {
      matchScore += 10;
      matchReasons.push(`评分优秀：${doctor.rating}分`);
      console.log(`评分优秀 +10分: ${doctor.rating}分, 当前分数: ${matchScore}`);
    }
    
    // 限制最大匹配分数为100
    matchScore = Math.min(matchScore, 100);
    
    console.log(`医生 ${doctor.name} 最终分数: ${matchScore}, 匹配原因: ${matchReasons.join('，')}`);
    console.log('---');
    
    if (matchScore >= 30) { // 设置最低匹配分数阈值
      const doctorResult = {
        ...doctor,
        matchScore: matchScore
      };
      
      // 只有当有匹配理由时才添加recommendReason字段
      if (matchReasons.length > 0) {
        doctorResult.recommendReason = matchReasons.join('，');
      }
      
      matchedDoctors.push(doctorResult);
    }
  }
  
  // 按匹配分数排序
  matchedDoctors.sort((a, b) => b.matchScore - a.matchScore);
  
  if (matchedDoctors.length > 0) {
    const topDoctors = matchedDoctors.slice(0, 2);
    return {
      found: true,
      doctors: topDoctors,
      response: `根据您的症状"${diseaseAnalysis.summary}"，为您找到以下匹配的医生：`
    };
  }
  
  return { found: false };
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
    // 不影响主流程，只记录错误
  }
}

function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 构建最终回复提示
function buildFinalResponsePrompt(diseaseAnalysis, matchedDoctors) {
  const doctorsInfo = matchedDoctors.map(doctor => {
    let info = `医生：${doctor.name}，科室：${doctor.department}，医院：${doctor.hospital}，专长：${doctor.specialties.join('、')}，经验：${doctor.experience_years}年，评分：${doctor.rating}`;
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
    // 直接返回LLM的回复内容，进行基本的清理
    return llmResponse.trim();
  } catch (error) {
    console.error('解析最终回复失败:', error);
    return '感谢您的咨询，我们已为您匹配了合适的医生，建议您及时就医。';
  }
}

// 根据疾病分析结果从数据库精确查找医生
async function searchDoctorsByDiseaseAnalysisFromDB(diseaseAnalysis, doctorsCollection) {
  console.log('根据疾病分析从数据库搜索医生:', diseaseAnalysis);
  
  try {
    let matchedDoctors = [];
    
    // 第一阶段：精确匹配科室
     if (diseaseAnalysis.department) {
       console.log(`第一阶段：精确匹配科室 - ${diseaseAnalysis.department}`);
       const departmentQuery = {
         department: diseaseAnalysis.department // 精确匹配，不使用正则
       };
       
       console.log('执行科室精确查询:', JSON.stringify(departmentQuery));
       
       const departmentResult = await doctorsCollection
         .where(departmentQuery)
         .field({
           study_report: false
         })
         .get();
       
       if (departmentResult.data && departmentResult.data.length > 0) {
         // 按rating数值排序（rating是字符串，需要转换为数字）
         const sortedDoctors = departmentResult.data.sort((a, b) => {
           const ratingA = parseFloat(a.rating) || 0;
           const ratingB = parseFloat(b.rating) || 0;
           return ratingB - ratingA; // 降序排序
         });
         matchedDoctors = sortedDoctors;
         console.log(`科室精确匹配成功，找到${departmentResult.data.length}位医生，按评分排序后返回${matchedDoctors.length}位`);
       } else {
         console.log('科室精确匹配无结果，跳过科室匹配');
       }
     }
    
    // 第二阶段：如果科室匹配结果不足，扩展到专长匹配
    if (matchedDoctors.length < 50 && diseaseAnalysis.specialties && diseaseAnalysis.specialties.length > 0) {
      console.log(`第二阶段：专长匹配扩展（当前结果${matchedDoctors.length}位）`);
      const specialtyRegexes = diseaseAnalysis.specialties.map(specialty => 
        new RegExp(specialty, 'i')
      );
      const specialtyQuery = {
        specialties: { $in: specialtyRegexes }
      };
      
      console.log('执行专长查询:', JSON.stringify(specialtyQuery, (key, value) => {
        if (value instanceof RegExp) {
          return value.toString();
        }
        return value;
      }));
      
      const specialtyResult = await doctorsCollection
        .where(specialtyQuery)
        .field({
          study_report: false
        })
        .get();
      
      if (specialtyResult.data && specialtyResult.data.length > 0) {
        // 合并结果，去重
        const existingIds = new Set(matchedDoctors.map(d => d._id));
        const newDoctors = specialtyResult.data.filter(d => !existingIds.has(d._id));
        matchedDoctors = matchedDoctors.concat(newDoctors);
        
        // 重新排序
        matchedDoctors.sort((a, b) => {
          const ratingA = parseFloat(a.rating) || 0;
          const ratingB = parseFloat(b.rating) || 0;
          return ratingB - ratingA;
        });
        
        console.log(`专长匹配扩展成功，新增${newDoctors.length}位医生，总计${matchedDoctors.length}位`);
      }
    }
    
    // 第三阶段：如果结果仍然不足，扩展到疾病匹配
    if (matchedDoctors.length < 50 && diseaseAnalysis.possibleDiseases && diseaseAnalysis.possibleDiseases.length > 0) {
      console.log(`第三阶段：疾病匹配扩展（当前结果${matchedDoctors.length}位）`);
      const diseaseRegexes = diseaseAnalysis.possibleDiseases.map(disease => 
        new RegExp(disease, 'i')
      );
      const diseaseQuery = {
        $or: [
          { specialties: { $in: diseaseRegexes } },
          { introduction: { $in: diseaseRegexes } }
        ]
      };
      
      console.log('执行疾病查询:', JSON.stringify(diseaseQuery, (key, value) => {
        if (value instanceof RegExp) {
          return value.toString();
        }
        return value;
      }));
      
      const diseaseResult = await doctorsCollection
        .where(diseaseQuery)
        .field({
          study_report: false
        })
        .get();
      
      if (diseaseResult.data && diseaseResult.data.length > 0) {
        const existingIds = new Set(matchedDoctors.map(d => d._id));
        const newDoctors = diseaseResult.data.filter(d => !existingIds.has(d._id));
        matchedDoctors = matchedDoctors.concat(newDoctors);
        
        matchedDoctors.sort((a, b) => {
          const ratingA = parseFloat(a.rating) || 0;
          const ratingB = parseFloat(b.rating) || 0;
          return ratingB - ratingA;
        });
        
        console.log(`疾病匹配扩展成功，新增${newDoctors.length}位医生，总计${matchedDoctors.length}位`);
      }
    }
    
    // 第四阶段：如果结果仍然不足，使用症状匹配
    if (matchedDoctors.length < 50 && diseaseAnalysis.symptoms && diseaseAnalysis.symptoms.length > 0) {
      console.log(`第四阶段：症状匹配扩展（当前结果${matchedDoctors.length}位）`);
      const symptomRegexes = diseaseAnalysis.symptoms.map(symptom => 
        new RegExp(symptom, 'i')
      );
      const symptomQuery = {
        $or: [
          { specialties: { $in: symptomRegexes } },
          { introduction: { $in: symptomRegexes } }
        ]
      };
      
      console.log('执行症状查询:', JSON.stringify(symptomQuery, (key, value) => {
        if (value instanceof RegExp) {
          return value.toString();
        }
        return value;
      }));
      
      const symptomResult = await doctorsCollection
        .where(symptomQuery)
        .field({
          study_report: false
        })
        .get();
      
      if (symptomResult.data && symptomResult.data.length > 0) {
        const existingIds = new Set(matchedDoctors.map(d => d._id));
        const newDoctors = symptomResult.data.filter(d => !existingIds.has(d._id));
        matchedDoctors = matchedDoctors.concat(newDoctors);
        
        matchedDoctors.sort((a, b) => {
          const ratingA = parseFloat(a.rating) || 0;
          const ratingB = parseFloat(b.rating) || 0;
          return ratingB - ratingA;
        });
        
        console.log(`症状匹配扩展成功，新增${newDoctors.length}位医生，总计${matchedDoctors.length}位`);
      }
    }
    
    // 如果所有匹配阶段都无结果，不返回默认医生
     if (matchedDoctors.length === 0) {
       console.log('所有匹配阶段都无结果，不返回默认医生');
     }
    
    if (matchedDoctors.length > 0) {
      // 计算匹配分数并添加推荐理由
      const scoredDoctors = matchedDoctors.map(doctor => {
        let matchScore = 60; // 基础分数
        let matchReasons = [];
        
        // 科室匹配加分 - 优先精确匹配
         if (diseaseAnalysis.department && doctor.department) {
           if (doctor.department === diseaseAnalysis.department) {
             matchScore += 30;
             matchReasons.push(`科室精确匹配：${doctor.department}`);
           }
         }
        
        // 专长匹配加分
        if (diseaseAnalysis.specialties && doctor.specialties) {
          for (const userSpecialty of diseaseAnalysis.specialties) {
            for (const doctorSpecialty of doctor.specialties) {
              if (doctorSpecialty.includes(userSpecialty)) {
                matchScore += 25;
                matchReasons.push(`专长匹配：${doctorSpecialty}`);
                break;
              }
            }
          }
        }
        
        // 经验加分
        if (doctor.experience_years) {
          const years = parseInt(doctor.experience_years);
          if (years >= 10) {
            matchScore += 15;
            matchReasons.push(`经验丰富：${doctor.experience_years}年`);
          } else if (years >= 5) {
            matchScore += 10;
            matchReasons.push(`经验丰富：${doctor.experience_years}年`);
          }
        }
        
        // 职称加分
        if (doctor.title && (doctor.title.includes('主任') || doctor.title.includes('教授'))) {
          matchScore += 10;
          matchReasons.push(`职称优秀：${doctor.title}`);
        }
        
        const doctorResult = {
          ...doctor,
          matchScore: matchScore
        };
        
        // 只有当有匹配理由时才添加recommendReason字段
        if (matchReasons.length > 0) {
          doctorResult.recommendReason = matchReasons.join('，');
        }
        
        return doctorResult;
      });
      
      // 按匹配分数排序，取前2位
      scoredDoctors.sort((a, b) => b.matchScore - a.matchScore);
      const topDoctors = scoredDoctors.slice(0, 2);
      
      return {
        found: true,
        doctors: topDoctors,
        response: `根据您的症状"${diseaseAnalysis.summary || '相关症状'}",为您找到以下匹配的医生：`
      };
    }
    
    return { found: false };
    
  } catch (error) {
    console.error('数据库查询医生失败:', error);
    return { found: false, error: error.message };
  }
}

// 根据医生姓名搜索医生
async function searchDoctorsByName(doctorName, doctorsCollection) {
  console.log('根据医生姓名搜索:', doctorName);
  
  if (!doctorName || doctorName.trim() === '') {
    return {
      found: false,
      doctors: [],
      message: '请提供医生姓名'
    };
  }
  
  try {
    // 移除常见的医生称谓
    const cleanName = doctorName.replace(/(医生|大夫|主任|教授|博士|Dr\.|dr\.)$/g, '').trim();
    
    // 精确匹配和模糊匹配
    const exactMatch = await doctorsCollection.where({
      name: cleanName
    }).field({
      study_report: false
    }).get();
    
    let doctors = exactMatch.data || [];
    
    // 如果精确匹配没有结果，尝试模糊匹配
    if (doctors.length === 0) {
      const fuzzyMatch = await doctorsCollection.where({
        name: db.RegExp({
          regexp: cleanName,
          options: 'i'
        })
      }).field({
        study_report: false
      }).get();
      doctors = fuzzyMatch.data || [];
    }
    
    console.log(`找到 ${doctors.length} 位匹配的医生`);
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `找到${doctors.length}位医生` : '未找到匹配的医生'
    };
  } catch (error) {
    console.error('搜索医生失败:', error);
    return {
      found: false,
      doctors: [],
      message: '搜索医生时发生错误'
    };
  }
}

// 根据科室名称搜索医生
async function searchDoctorsByDepartment(departmentName, doctorsCollection) {
  console.log('根据科室搜索医生:', departmentName);
  
  if (!departmentName || departmentName.trim() === '') {
    return {
      found: false,
      doctors: [],
      message: '请提供科室名称'
    };
  }
  
  try {
    // 精确匹配
    const exactMatch = await doctorsCollection.where({
      department: departmentName
    }).field({
      study_report: false
    }).get();
    
    let doctors = exactMatch.data || [];
    
    // 如果精确匹配没有结果，尝试模糊匹配
    if (doctors.length === 0) {
      const fuzzyMatch = await doctorsCollection.where({
        department: db.RegExp({
          regexp: departmentName,
          options: 'i'
        })
      }).field({
        study_report: false
      }).get();
      doctors = fuzzyMatch.data || [];
    }
    
    // 按评分排序
    doctors.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    console.log(`在${departmentName}科室找到 ${doctors.length} 位医生`);
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `在${departmentName}找到${doctors.length}位医生` : `未找到${departmentName}的医生`
    };
  } catch (error) {
    console.error('搜索科室医生失败:', error);
    return {
      found: false,
      doctors: [],
      message: '搜索科室医生时发生错误'
    };
  }
}

// 根据医院名称搜索医生
async function searchDoctorsByHospital(hospitalName, doctorsCollection) {
  console.log('根据医院搜索医生:', hospitalName);
  
  if (!hospitalName || hospitalName.trim() === '') {
    return {
      found: false,
      doctors: [],
      message: '请提供医院名称'
    };
  }
  
  try {
    // 精确匹配
    const exactMatch = await doctorsCollection.where({
      hospital: hospitalName
    }).field({
      study_report: false
    }).get();
    
    let doctors = exactMatch.data || [];
    
    // 如果精确匹配没有结果，尝试模糊匹配
    if (doctors.length === 0) {
      const fuzzyMatch = await doctorsCollection.where({
        hospital: db.RegExp({
          regexp: hospitalName,
          options: 'i'
        })
      }).field({
        study_report: false
      }).get();
      doctors = fuzzyMatch.data || [];
    }
    
    // 按评分排序
    doctors.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    console.log(`在${hospitalName}找到 ${doctors.length} 位医生`);
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `在${hospitalName}找到${doctors.length}位医生` : `未找到${hospitalName}的医生`
    };
  } catch (error) {
    console.error('搜索医院医生失败:', error);
    return {
      found: false,
      doctors: [],
      message: '搜索医院医生时发生错误'
    };
  }
}

// 根据医院和科室同时搜索医生（复合查询）
async function searchDoctorsByHospitalAndDepartment(hospitalName, departmentName, doctorsCollection) {
  console.log('根据医院和科室搜索医生:', hospitalName, '-', departmentName);
  
  if (!hospitalName || !departmentName || hospitalName.trim() === '' || departmentName.trim() === '') {
    return {
      found: false,
      doctors: [],
      message: '请提供完整的医院和科室名称'
    };
  }
  
  try {
    // 精确匹配
    const exactMatch = await doctorsCollection.where({
      hospital: hospitalName,
      department: departmentName
    }).field({
      study_report: false
    }).get();
    
    let doctors = exactMatch.data || [];
    
    // 如果精确匹配没有结果，尝试模糊匹配
    if (doctors.length === 0) {
      const fuzzyMatch = await doctorsCollection.where({
        hospital: db.RegExp({
          regexp: hospitalName,
          options: 'i'
        }),
        department: db.RegExp({
          regexp: departmentName,
          options: 'i'
        })
      }).field({
        study_report: false
      }).get();
      doctors = fuzzyMatch.data || [];
    }
    
    // 按评分排序
    doctors.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    
    console.log(`在${hospitalName}的${departmentName}找到 ${doctors.length} 位医生`);
    
    return {
      found: doctors.length > 0,
      doctors: doctors,
      message: doctors.length > 0 ? `在${hospitalName}的${departmentName}找到${doctors.length}位医生` : `未找到${hospitalName}${departmentName}的医生`
    };
  } catch (error) {
    console.error('搜索医院科室医生失败:', error);
    return {
      found: false,
      doctors: [],
      message: '搜索医院科室医生时发生错误'
    };
  }
}