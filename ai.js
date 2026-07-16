/**
 * AI Core Module - Handles both Local Simulation and DeepSeek API interactions.
 */

// Local Database of responses for specific scenarios (for fallback mock mode)
const LOCAL_RESPONSES = {
  fatLoss: {
    bioLogic: [
      "根据生化逻辑，今日体重变动主因是糖原消耗及结合水排出。空腹状态下，高皮下废水排出使得视觉紧致度提升，纯脂肪消耗正平稳推进。",
      "由于你处于减脂周期，体重的微小波动通常是盐分摄入导致的水分滞留（钠水潴留），并非脂肪增长。继续维持热量赤字，脂肪细胞正在缩小。"
    ],
    dietPatch: {
      clean: {
        strategy: "完美符合干饭代码！保持优质高蛋白低碳水配比，胰岛素水平处于极佳的燃脂区间。",
        nextMeal: "【智慧餐厅减脂模板】：150g 慢碳（糙米/薯类） + 200g 鸡胸肉/牛肉 + 250g 水煮绿叶菜 + 500ml 纯水。"
      },
      bug: {
        strategy: "检测到干饭 Bug（高钠/隐形碳水）！开启对冲格式化：下午/晚上进行 40 分钟中等强度有氧，全天补水至 3.5L 冲淡钠离子，严禁熬夜。",
        nextMeal: "【0碳水熄火防线】：200g 纯瘦肉/去皮禽肉 + 300g 清炒时蔬（少盐），主食彻底断掉，提前 1 小时关闭消化系统。"
      }
    }
  },
  muscleGain: {
    bioLogic: [
      "今日体重呈良好上升/平稳态势。肌糖原填充充足，肌肉细胞内含水量上升，这是合成代谢（Anabolism）启动的关键信号。",
      "体重平稳波动。目标是高质量增肌，当前的蛋白质摄入确保了氮平衡为正，运动后的超量恢复正在悄然重塑肌纤维。"
    ],
    dietPatch: {
      clean: {
        strategy: "干饭代码极其硬核！热量盈余充足，碳水与蛋白质配比完美，为肌肉合成提供了源源不断的原材料。",
        nextMeal: "【高性能增肌模板】：250g 优质碳水（紫薯/燕麦） + 220g 牛肉/三文鱼 + 200g 西兰花 + 1个煎蛋。"
      },
      bug: {
        strategy: "碳水比例失衡/优质蛋白不足！补救补丁：加餐补入 1 用乳清蛋白粉或 3 个蛋白，缩减下一餐的油脂摄入，防止体脂失控。",
        nextMeal: "【高效增肌精补】：150g 蒸土豆 + 180g 煎鱼排 + 200g 芦笋，配 1 杯低脂牛奶。"
      }
    }
  }
};

/**
 * Clean and parse inputs to see if user has eaten high-calorie/carb "bugs"
 */
function inspectDietForBugs(lunch, dinner) {
  const bugKeywords = ['麻辣香锅', '火锅', '烧烤', '奶茶', '蛋糕', '油炸', '可乐', '炸鸡', '汉堡', '披萨', '啤酒', '面条', '米饭太多', '甜点', '淀粉'];
  const text = (lunch + " " + dinner).toLowerCase();
  for (let keyword of bugKeywords) {
    if (text.includes(keyword)) {
      return { hasBug: true, bugName: keyword };
    }
  }
  return { hasBug: false, bugName: null };
}

/**
 * Inspect workout type and return classification
 */
function inspectWorkoutType(exercise, feedback) {
  const text = (exercise + " " + feedback).toLowerCase();
  
  if (['球', '篮', '运球', '三分', '投篮', '变向', '接波', '打比赛', '老老老詹', '全场'].some(k => text.includes(k))) {
    return 'basketball';
  }
  if (['健身房', '抗阻', '力量', '哑铃', '杠铃', '推胸', '深蹲', '硬拉', '卧推', '器械', '铁', '肌肉', '俯卧撑', '引体'].some(k => text.includes(k))) {
    return 'strength';
  }
  if (['跑', '单车', '有氧', '游泳', '椭圆机', '爬楼', '跳绳', '骑行'].some(k => text.includes(k))) {
    return 'cardio';
  }
  if (['休息', '纯休息', '恢复', '没运动', '罢工', '停了', '断了', '躺'].some(k => text.includes(k))) {
    return 'rest';
  }
  return 'general';
}

/**
 * Get dynamic training drills advice based on workout type and goals
 */
function getCustomDrills(workoutType, isFatLoss) {
  if (workoutType === 'basketball') {
    if (isFatLoss) {
      return `* **半场控球补丁**：左右手大力运球各 100 下 + 降重心体前变向 50 次，榨干体内剩余糖原。\n* **射手记忆补丁**：定点投篮 5 个点，每个位置雷打不动进 10 个（共 50 个投篮命中），保持心率处于燃脂区间。`;
    } else {
      return `* **爆发变向补丁**：持球跨步突破 + 降重心急停中投 30 次，提升瞬间加速与核心制动性能。\n* **垂直弹跳补丁**：双脚起跳摸板 20 次 + 指尖抛球制空核心稳定训练。`;
    }
  } else if (workoutType === 'strength') {
    if (isFatLoss) {
      return `* **高能复合链**：哑铃深蹲 4组 * 20次 + 标准俯卧撑最大次数 * 4组。\n* **组间短间歇**：严格控制组间休息在 45 秒内，维持极高新陈代谢与脂肪动员。`;
    } else {
      return `* **肥大超载补丁**：主项（深蹲/卧推/硬拉）安排 4组 * 8-12次，最后两组冲刺至力竭，撕裂肌纤维。\n* **合成增肌补充**：每组完成后拉伸目标肌肉 10 秒，促进血液灌注与超量恢复。`;
    }
  } else if (workoutType === 'cardio') {
    if (isFatLoss) {
      return `* **靶心率慢跑**：维持心率在 130-150 bpm（最大心率的 60%-70%）持续 40 分钟以上，启动高效脂肪氧化。\n* **浮水清除补丁**：有氧运动后进行 3 组 30 秒开合跳，彻底清空皮下浮水。`;
    } else {
      return `* **稳态心肺维持**：限制慢跑时长在 20-25 分钟以内，保持心肺活力，避免产生皮质醇引起肌肉降解。\n* **糖原回填哨**：运动后半小时内，立刻补充 30g 快速碳水 + 20g 优质蛋白。`;
    }
  } else if (workoutType === 'rest') {
    if (isFatLoss) {
      return `* **主动恢复补丁**：进行 15 分钟全身静态拉伸，重点松解髋屈肌与大腿后侧肌肉群。\n* **NEAT热量扩充**：虽然是纯休息日，尽量保持步行 8000 步，维持基础能量消耗。`;
    } else {
      return `* **肌纤维野蛮生长**：严格禁止高强度劳作，通过热敷或按摩酸痛部位，为超量恢复创造物理环境。\n* **蛋白质充能防御**：定时喝水，每 3-4 小时补充一次优质蛋白，维持体内充足氨基酸浓度。`;
    }
  } else {
    // General
    if (isFatLoss) {
      return `* **核心激活补丁**：平板支撑 1分钟 * 3组 + 卷腹 20次 * 4组，缩紧腹腔腰围。\n* **热量缺口防线**：今天无专项训练，必须执行极严格低碳饮食，增加日常步行。`;
    } else {
      return `* **自重基础打底**：标准俯卧撑 20次 * 4组 + 自重深蹲 30次 * 4组，维持基础力量底座。\n* **肌肉力学巩固**：进行 5 分钟死壁挂（单杠悬吊）和拉伸，扩展上肢关节空间。`;
    }
  }
}

/**
 * Generates local simulated AI Audit Response
 */
function generateLocalAudit(profile, checkIn, lastWeight) {
  const isFatLoss = profile.goal === 'fat_loss';
  const repo = isFatLoss ? LOCAL_RESPONSES.fatLoss : LOCAL_RESPONSES.muscleGain;
  
  // 1. Calculate weight change
  const currentWeight = parseFloat(checkIn.currentWeight);
  const targetWeight = parseFloat(profile.targetWeight || 75);
  const prevWeight = lastWeight ? parseFloat(lastWeight) : parseFloat(profile.weight);
  
  const diff = currentWeight - prevWeight;
  let weightAnalysis = "";
  if (Math.abs(diff) < 0.1) {
    weightAnalysis = `今日体重与昨日持平（${currentWeight.toFixed(1)} kg）。`;
  } else if (diff < 0) {
    weightAnalysis = `今日体重下降了 ${Math.abs(diff).toFixed(1)} kg！`;
  } else {
    weightAnalysis = `今日体重上升了 ${diff.toFixed(1)} kg。`;
  }
  
  // Biologic text selection
  const bioIdx = Math.floor(Math.random() * repo.bioLogic.length);
  let bioLogicText = `${weightAnalysis}${repo.bioLogic[bioIdx]}`;
  if (profile.illnesses && profile.illnesses !== '无' && profile.illnesses !== 'no') {
    bioLogicText += ` 同时考虑到你的身体状况（${profile.illnesses}），我们已在运动负荷及关节压力上做出了保护性调整。`;
  }

  // Deadline feasibility + disclaimer
  let deadlineWarning = '';
  if (profile.deadlineDate) {
    const today = new Date();
    const deadline = new Date(profile.deadlineDate);
    const timeDiff = deadline.getTime() - today.getTime();
    const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const weightGap = currentWeight - targetWeight;

    if (daysLeft > 0) {
      if (isFatLoss) {
        if (weightGap <= 0) {
          targetText = `你已提前达成目标体重 ${targetWeight} kg！当前领先死线 Flag。继续稳住，塑造极致线条！`;
        } else {
          var dailyLoss = weightGap / daysLeft;
          targetText = `距离 ${profile.deadlineDate} 死线还有最后 ${daysLeft} 天！离目标 ${targetWeight} kg 还差 ${weightGap.toFixed(1)} kg。每天需稳步赤字约 ${dailyLoss.toFixed(2)} kg。`;
          if (dailyLoss > 0.15) {
            deadlineWarning = `\n\n⚠️ **死线可行性警告**：当前目标要求每天减 ${dailyLoss.toFixed(2)} kg（健康上限约 0.1-0.15 kg/天）。该目标非常激进，长期执行可能导致代谢损伤、肌肉流失和反弹风险。建议延长死线或调整目标体重，以健康为先。`;
          } else if (dailyLoss > 0.1) {
            deadlineWarning = `\n\n💡 **提示**：当前减重速率（${dailyLoss.toFixed(2)} kg/天）处于健康上限。建议搭配足量蛋白和力量训练以保护肌肉。如果感到极度疲劳或饥饿，适当放宽速度。`;
          }
        }
      } else {
        if (weightGap >= 0) {
          targetText = `你已成功达成增肌目标体重 ${targetWeight} kg！当前正在巩固期。继续无情轰炸！`;
        } else {
          var dailyGain = Math.abs(weightGap) / daysLeft;
          targetText = `距离 ${profile.deadlineDate} 死线还有最后 ${daysLeft} 天！离增重目标 ${targetWeight} kg 还差 ${Math.abs(weightGap).toFixed(1)} kg。冲刺阶段，合成代谢火力全开！`;
          if (dailyGain > 0.2) {
            deadlineWarning = `\n\n⚠️ **增重可行性警告**：当前目标要求每天增重 ${dailyGain.toFixed(2)} kg（健康上限约 0.1-0.2 kg/周肌肉）。该目标极度不现实，请调整为更长期的目标，避免被迫采用不健康的增重手段。`;
          }
        }
      }
    } else {
      targetText = `死线已到（${profile.deadlineDate}）！当前体重 ${currentWeight} kg，目标体重 ${targetWeight} kg。身体安全第一，请根据当前进度重新设定合理的新目标。`;
    }
  } else {
    targetText = `稳步推进 ${targetWeight} kg！无惧时间，稳扎稳打。`;
  }

  // Weight swing detection
  var weightSwingWarning = '';
  if (Math.abs(diff) > 2) {
    weightSwingWarning = `\n\n⚠️ **数据异常提醒**：今日体重波动 ${Math.abs(diff).toFixed(1)} kg，超出正常日间波动范围（0.5-2 kg）。可能原因：称重时间不一致、饮水/进食状态不同、衣物重量差异。建议固定晨起空腹称重以保证数据一致性。`;
  }

  // 2. Diet Audit
  const bugAudit = inspectDietForBugs(checkIn.lunch, checkIn.dinner);
  const dietPatchData = bugAudit.hasBug ? repo.dietPatch.bug : repo.dietPatch.clean;
  let dietAuditText = "";
  if (bugAudit.hasBug) {
    dietAuditText = `🚨 **警告！检测到隐形炸弹：【${bugAudit.bugName}】混入干饭代码！**\n* **如果你吃多了/混进Bug**：${dietPatchData.strategy}\n* **下一餐执行公式**：${dietPatchData.nextMeal}`;
  } else {
    dietAuditText = `✅ **绿灯通过！干饭代码极其清澈。**\n* **干饭审计结论**：${dietPatchData.strategy}\n* **下一餐执行公式**：${dietPatchData.nextMeal}`;
  }

  // 3. Movement / Exercise code
  const workoutType = inspectWorkoutType(checkIn.tonightExercise, checkIn.exerciseFeedback);
  const drillsText = getCustomDrills(workoutType, isFatLoss);
  
  // Joint protection / injury analysis
  let recoveryText = "";
  const lowerFeedback = checkIn.exerciseFeedback.toLowerCase();
  const hasInjury = lowerFeedback.includes('伤') || lowerFeedback.includes('疼') || lowerFeedback.includes('剧痛');
  const hasSore = lowerFeedback.includes('酸') || lowerFeedback.includes('累');
  
  if (hasInjury) {
    recoveryText = `🚑 **检测到疼痛/损伤信号【${checkIn.exerciseFeedback}】——这不是普通的酸痛！**\n* **立即停止**相关部位的高强度训练，避免二次损伤。\n* **建议**：对受伤部位冰敷（急性期 48h 内），48h 后可热敷。如疼痛持续超过 3 天或加重，请务必就医检查，排除韧带/半月板/肌腱损伤。\n* **安全替代训练**：对侧肢体/不涉及受伤关节的低强度运动（如受伤下肢可做上肢训练）。\n* **休息不是偷懒，是保护！**`;
  } else if (hasSore) {
    recoveryText = `检测到肌肉酸痛/疲劳【${checkIn.exerciseFeedback}】。建议温水泡脚 15 分钟，对酸痛处进行静态拉伸或泡沫轴滚压。保证充足睡眠，生长激素全力修复！`;
  } else {
    recoveryText = `当前体感极佳。训练后进行全身拉伸各 30 秒。锁定充足睡眠时间，今晚优质睡眠是最好的修复补剂。`;
  }

  // 4. Close Slogan
  const slogan = isFatLoss 
    ? `换好装备，端起盘子，向着 ${targetWeight} kg 和八月底的硬核腹肌，全速平推！冲！！！`
    : `无情加重，疯狂干饭，向着钢筋铁骨与 ${targetWeight} kg 的野兽体格，全速碾压！冲！！！`;

  // Return the standard 4-module formatted output
  return `> ⚠️ **免责声明**：以下内容由 AI 生成，仅供参考和教育目的，不构成医疗诊断、治疗建议或专业运动指导。在开始任何饮食、运动或补充剂计划前，请咨询医生或注册营养师。如运动中感到疼痛或不适，请立即停止并就医。

## 🚀 模块一：【大盘审计与硬核震慑】
> (针对你最新的体重和状态，进行生化逻辑拆解。跌了狠狠夸、涨了找 Bug、沉沦了直接格式化心理负担，立住信心底座！)
* **生化逻辑解析**：${bioLogicText}
* **战绩同步**：${targetText}${deadlineWarning}${weightSwingWarning}

## 🛠️ 模块二：【干饭代码一键修复 (饮食补丁)】
> (对你吃进去的食物进行严格的生化审计，卡死主食碳水和隐形炸弹)
${dietAuditText}

## 🏀 模块三：【运动与训练性能包注入】
> (针对你今日的运动计划，拒绝盲目划水，给出高性能训练与恢复方案)
${drillsText}
* **关节保护伞**：${recoveryText}

## 🚨 模块四：【今日教练收盘指令】
> (用最强有力的死命令，逼你立刻放下筷子、推开碳水、去球场无情输出或准时挺尸)
* **最终口号**：${slogan}`;
}

/**
 * Make API call to DeepSeek API
 */
async function generateDeepSeekAudit(apiKey, profile, checkIn, lastWeight) {
  const isFatLoss = profile.goal === 'fat_loss';
  
  const systemPrompt = `你是一个拥有顶尖运动生化学知识、营养学背景以及极强激励风格的AI硬核健身教练（外号“教练”）。你说话语气极其强硬、热血、硬核、专业，同时对学员高度负责。
用户会为你提供他们的【基本身体数据】以及【今日打卡数据】。
你需要根据他们定制的【个人目标】和【今日运动类型】进行针对性审计与建议。不要默认用户必须打球，而是分析他们当天的具体运动形式并给出专业定制计划。
你需要严格按照以下四个模块进行硬核审计，以Markdown格式输出，严禁修改模块标题和层级结构：

## 🚀 模块一：【大盘审计与硬核震慑】
> (针对你最新的体重 and 状态，进行生化逻辑拆解。跌了狠狠夸、涨了找 Bug、沉沦了直接格式化心理负担，立住信心底座！)
* **生化逻辑解析**：[针对最新体重波动，深入浅出分析是水分滞留、肌糖原消耗还是纯脂肪增减，并结合用户的身体疾病/损伤情况进行生化原理解析]
* **战绩同步**：[根据用户终极目标和截止日期，计算还差多少公斤，每天要完成多少赤字，进行倒计时硬核施压或激励]

## 🛠️ 模块二：【干饭代码一键修复 (饮食补丁)】
> (对你吃进去的食物进行严格的生化审计，卡死主食碳水 and 隐形炸弹)
[分析中午和晚上吃的东西。如果吃了高钠高糖高碳水的垃圾食品（Bug），给出针对性的对冲格式化战略。如果吃得很干净，给予表扬。给出下一餐的“智慧低碳餐/0碳水熄火餐”具体肉、菜、水配置比例]

## 🏀 模块三：【运动与训练性能包注入】
> (针对你今日的运动计划，拒绝盲目划水，给出高性能训练与恢复方案)
[根据用户今日填写的运动形式（如跑步、健身房抗阻、打篮球或休息），给出完全契合该运动类型的训练指导/技能打卡补丁。如果是篮球，给运球/投篮指令；如果是力量训练，给负重/拉伸方案；如果是休息，给出主动恢复与水分补水配比。针对用户的关节/体感反馈，给出具体拉伸与康复建议。对于睡眠，强制要求锁定 11:30 挺尸死线。]

## 🚨 模块四：【今日教练收盘指令】
> (用最强金有力的死命令，逼你立刻放下筷子、推开碳水、无情输出或准时挺尸)
* **最终口号**：[一句充满力量、催人泪下的热血冲刺口号！]`;

  const userPrompt = `【基本身体数据】：
- 性别：${profile.gender === 'male' ? '男' : '女'}
- 年龄：${profile.age}岁
- 身高：${profile.height}cm
- 初始/昨日体重：${lastWeight || profile.weight}kg
- 疾病/损伤：${profile.illnesses || '无'}
- 核心目标：${isFatLoss ? '减脂' : '增肌'}
- 终极目标体重：${profile.targetWeight}kg
- 目标截止日期：${profile.deadlineDate || '未设置'}

【今日打卡数据】：
### 📊 【今日数据打卡】
* **当前体重**：${checkIn.currentWeight} kg (${checkIn.weightCondition === 'fasting' ? '空腹' : '运动后'})
* **状态说明**：${checkIn.stateDescription}

### 🍱 【干饭审计日志】
* **中午吃了**：${checkIn.lunch}
* **晚上计划/已经吃了**：${checkIn.dinner}

### 🏀 【球场/运动代码】
* **今晚运动**：${checkIn.tonightExercise}
* **球场反馈**：${checkIn.exerciseFeedback}

### 🎯 【当前死线 Flag】
* **终极目标**：${checkIn.ultimateGoal}`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: false
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("DeepSeek API 返回了空内容");
  }
  return text;
}

// Export functions to global scope for ease of use in app.js
window.AiEngine = {
  generateLocalAudit,
  generateDeepSeekAudit,
  generateServerAudit
};

/**
 * Call backend AI proxy (requires auth token, server handles API key + membership check)
 */
async function generateServerAudit(authToken, checkIn) {
  const response = await fetch('http://localhost:8000/api/ai/audit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify(checkIn)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `AI审计请求失败: ${response.status}`);
  }

  const data = await response.json();
  if (!data.report) {
    throw new Error("AI 返回了空内容");
  }
  return data.report;
}
