import type { DiagnosisItem, KnowledgePoint, QuizQuestion, QuizResult, QuizSettings, SubjectType, UserAnswer } from '../types';
import { getExamStrategy, getQuestionPatternPlan, inferSubjectType } from './examStrategy';

const baseSystemPrompt = '你是严谨的中文教学测评命题专家。你必须只输出 JSON，不要输出 Markdown、解释性前言或代码块。';
const subjectTypeList: SubjectType[] = [
  '语文',
  '数学',
  '英语',
  '物理',
  '化学',
  '生物',
  '政治',
  '历史',
  '地理',
  '高等数学',
  '线性代数',
  '概率统计',
  '大学物理',
  '电路',
  '计算机',
  '程序设计',
  '数据结构',
  '操作系统',
  '计算机网络',
  '数据库',
  '经济学',
  '管理学',
  '会计学',
  '法学',
  '医学',
  '护理学',
  '机械',
  '哲学',
  '文学',
  '理学',
  '工学',
  '农学',
  '艺术学',
  '交叉学科',
  '通用',
];

const normalizeDifficultyRatio = (settings?: QuizSettings) => {
  const ratio = settings?.difficultyRatio ?? { easy: 20, medium: 50, hard: 30 };
  const total = ratio.easy + ratio.medium + ratio.hard;
  if (total <= 0) return { easy: 20, medium: 50, hard: 30 };
  const easy = Math.round((ratio.easy / total) * 100);
  const medium = Math.round((ratio.medium / total) * 100);
  return { easy, medium, hard: Math.max(0, 100 - easy - medium) };
};

export const buildKnowledgePrompt = (materialText: string) => ({
  systemPrompt: baseSystemPrompt,
  userPrompt: `请基于以下学习资料提取 4-8 个知识点。不得编造资料外知识。每个知识点必须包含 id、title、description、importance、masteryTarget、examType、sourceEvidence、keywords、subjectType、examPatterns、formulas、commonMistakes、keyMethods。

要求：
1. title 必须是完整名词短语，不要使用碎片词、页码、目录、谢谢观看。
2. description 用完整中文句子概括。
3. sourceEvidence 必须引用资料中能支撑该知识点的原句或近似原文。
4. keywords 是 2-5 个关键词。
5. importance 只能是“高”“中”“低”。
6. subjectType 只能从以下值中选择：${subjectTypeList.join('、')}。
7. examPatterns 从以下选择：基础概念题、公式套用题、条件辨析题、易错判断题、材料分析题、变式迁移题、综合解答题。
8. 如果资料有公式、规则、步骤或易错点，必须提取到 formulas、keyMethods、commonMistakes。

输出 JSON：
{
  "knowledgePoints": [
    {
      "id": "kp-1",
      "title": "知识点标题",
      "description": "完整解释",
      "importance": "高",
      "masteryTarget": "建议掌握程度",
      "examType": "可能考查方式",
      "sourceEvidence": "资料依据句",
      "keywords": ["关键词1", "关键词2"],
      "subjectType": "数学",
      "examPatterns": ["公式套用题", "条件辨析题"],
      "formulas": ["sin²α + cos²α = 1"],
      "commonMistakes": ["忘记根据象限判断正负号"],
      "keyMethods": ["先判断象限，再确定符号"]
    }
  ]
}

学习资料：
${materialText.slice(0, 16000)}`,
});

export const buildQuizPrompt = (materialText: string, knowledgePoints: KnowledgePoint[], settings?: QuizSettings) => ({
  systemPrompt: '你是熟悉中国考试命题规律的教研老师，擅长根据学习资料生成符合中国考试训练方式的题目。你必须围绕考点、题型、得分点、易错点、标准解法和变式训练命题。你必须只输出 JSON，不要输出 Markdown、解释性前言或代码块。',
  userPrompt: (() => {
    const subjectType: SubjectType = inferSubjectType(materialText);
    const strategy = getExamStrategy(subjectType);
    const questionCount = settings?.questionCount ?? 10;
    const selectedTypes = settings?.questionTypes?.join('、') || '单选、判断、简答、解答';
    const examType = settings?.examType === '自定义' ? settings.customExamType || '自定义考试' : settings?.examType || '自动识别';
    const selectedSubject = settings?.subjectType === '自动识别' || !settings?.subjectType ? subjectType : settings.subjectType;
    const ratio = normalizeDifficultyRatio(settings);
    return `请基于用户资料、知识点和出题设置生成高质量测评题。必须只基于资料，不得编造资料外知识。

出题设置：
- 学科类型：${selectedSubject}
- 考试类型：${examType}
- 题目数量：${questionCount}
- 难度比例：简单 ${ratio.easy}% / 中等 ${ratio.medium}% / 较难 ${ratio.hard}%
- 题型组合：${selectedTypes}
- 训练模式：${settings?.trainingMode ?? '基础巩固'}

必须输出 ${questionCount} 道题，题型尽量覆盖题型组合；请严格参考难度比例，中等和较难题不能缺席。

命题总要求：
1. 不要生成泛泛讨论题，不要生成“为什么重要”“请解释某知识点”这类空泛题。
2. 题目必须像真实中国考试训练题，围绕考点、母题、变式、得分点和易错项。
3. 数学/物理/化学类题目必须给出标准解题步骤 solutionSteps。
4. 选择题干扰项必须来自常见错误，不得使用明显弱智选项；四个选项不能是同一句式的机械改写。
5. 每道题必须说明 learningObjective。
6. 每道题必须说明 commonMistake。
7. 每道题必须有 scoringRubric 得分点。
8. 每道题必须有 sourceEvidence 来源依据。
9. 简答题/解答题必须支持 answerInputMode: "both"。
10. 每道题必须包含 examPattern。
11. options 必须是 4 个完整选项，正确答案必须是 options 中的完整句子。
12. optionExplanations 必须解释每个选项为什么对或错。
13. 每道题必须包含 recommendedVariant，说明推荐的同类变式方向。
14. 不允许所有题干格式一样；题干要有概念辨析、条件变化、材料分析、步骤规范等变化。
15. 中等和较难题要体现得分点、易错项和区分度。
16. 如果资料中含有原题、例题或练习题，请把它当作“母题”改编：换条件、换数值、换设问角度，但不得直接复制原题；必须保证答案唯一或评分标准明确。
17. 题目内容必须落在资料能支撑的范围内，不能凭空编造资料外事实。
18. 高考/中考/模拟考试类题目要体现情境、关键能力、必备知识和应用性；大学课程考试类题目要体现基本概念、基本方法、基本技能、综合应用和评分标准。

判断题要求：
1. 题干必须是完整判断句。
2. answer 只能是“正确”或“错误”。

当前识别学科：${selectedSubject}
该学科考试策略：${strategy.methods.join('、')}
常见误区：${strategy.commonMistakes.join('、')}
答题要求：${strategy.answerRequirements.join('、')}
建议题型计划：${getQuestionPatternPlan(subjectType).join('、')}
选项设计要求：
- 正确项：必须是能从资料依据推出的完整判断或完整步骤。
- 干扰项：分别来自“概念偷换、条件遗漏、步骤跳跃、常见计算/规则错误”等不同错误来源。
- 不要让 A/B/C/D 的开头和结构完全一样。
- 不要用“以上都不对”“无关干扰项”“资料背景信息”这类假选项。

difficulty 只能是“简单”“中等”“较难”。
examPattern 只能从以下选择：基础概念题、公式套用题、条件辨析题、易错判断题、材料分析题、变式迁移题、综合解答题。

如果资料涉及三角函数，题目应包含同角三角函数基本关系、象限判断正负号、tanα = sinα / cosα、sin²α + cos²α = 1、证明恒等式步骤规范、变式训练。

输出 JSON：
{
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "examPattern": "公式套用题",
      "question": "完整题干",
      "options": ["完整选项A", "完整选项B", "完整选项C", "完整选项D"],
      "answer": "完整选项A",
      "explanation": "解析",
      "optionExplanations": {
        "完整选项A": "为什么对/错",
        "完整选项B": "为什么对/错"
      },
      "knowledgePointId": "kp-1",
      "difficulty": "简单",
      "sourceEvidence": "资料中的依据句",
      "learningObjective": "本题考查什么能力",
      "commonMistake": "常见错误",
      "scoringRubric": ["得分点1", "得分点2"],
      "solutionSteps": ["步骤1", "步骤2"],
      "answerInputMode": "text",
      "recommendedVariant": "推荐变式方向"
    }
  ]
}

知识点：
${JSON.stringify(knowledgePoints, null, 2)}

学习资料：
${materialText.slice(0, 16000)}`;
  })(),
});

export const buildDiagnosisPrompt = (
  result: QuizResult,
  questions: QuizQuestion[],
  answers: UserAnswer[],
) => ({
  systemPrompt: baseSystemPrompt,
  userPrompt: `请基于测评结果生成错因诊断。只输出 JSON。

输出 JSON：
{
  "diagnosis": [
    {
      "id": "diag-q1",
      "questionId": "q1",
      "question": "题干",
      "knowledgePointTitle": "知识点",
      "userAnswer": "用户答案或未作答",
      "reasonType": "概念混淆",
      "diagnosis": "具体说明用户错在哪里，必须结合用户答案和题干",
      "correctUnderstanding": "必须基于标准答案、解析和资料依据生成正确理解",
      "suggestion": "必须结合缺失得分点给出具体复习动作",
      "missingRubric": ["缺失得分点1", "缺失得分点2"],
      "commonMistake": "常见误区",
      "masteryStatus": "薄弱"
    }
  ]
}

reasonType 只能从以下值中选择：概念混淆、关键词遗漏、应用场景判断错误、记忆不牢固、表达不完整。
masteryStatus 只能从以下值中选择：已掌握、待加强、薄弱。
诊断要求：
1. 不要写“建议重新复习该知识点”这种空话。
2. correctUnderstanding 必须包含正确答案/结论和关键理由。
3. missingRubric 必须尽量写全，来自题目的 scoringRubric、solutionSteps 和评分反馈。
4. suggestion 必须指出下一步做哪些题、补哪些步骤、背哪些公式或规则。

测评结果：
${JSON.stringify(result, null, 2)}

题目：
${JSON.stringify(questions, null, 2)}

用户答案：
${JSON.stringify(answers, null, 2)}`,
});

export type DiagnosisPromptPayload = {
  diagnosis: DiagnosisItem[];
};
