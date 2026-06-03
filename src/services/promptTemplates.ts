import type {
  DiagnosisItem,
  KnowledgeCard,
  KnowledgePoint,
  QuestionBlueprint,
  QuizQuestion,
  QuizResult,
  QuizSettings,
  SubjectType,
  UserAnswer,
} from '../types';
import { getExamStrategy, getQuestionPatternPlan, inferSubjectType } from './examStrategy';

const SCHOOL_SUBJECTS: SubjectType[] = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '政治', '地理'];

const baseSystemPrompt =
  '你是面向初高中家教老师的课后测评命题专家。你必须只输出 JSON，不要输出 Markdown、解释性前言或代码块。';

const isSubjectType = (subject: string | undefined): subject is SubjectType =>
  SCHOOL_SUBJECTS.includes(subject as SubjectType);

const normalizeDifficultyRatio = (settings?: QuizSettings) => {
  const ratio = settings?.difficultyRatio ?? { easy: 20, medium: 50, hard: 30 };
  const total = ratio.easy + ratio.medium + ratio.hard;
  if (total <= 0) return { easy: 20, medium: 50, hard: 30 };
  const easy = Math.round((ratio.easy / total) * 100);
  const medium = Math.round((ratio.medium / total) * 100);
  return { easy, medium, hard: Math.max(0, 100 - easy - medium) };
};

const resolvePromptSubject = (materialText: string, selectedSubject?: string): SubjectType => {
  if (selectedSubject && selectedSubject !== '自动识别' && isSubjectType(selectedSubject)) {
    return selectedSubject;
  }
  return inferSubjectType(materialText);
};

const getKnowledgeExtractionRules = (subject: SubjectType): string => {
  const common = [
    '必须从学习资料原文中提取，不得引入资料外知识点。',
    '必须是初中或高中家教场景可讲、可练、可反馈的知识点。',
    '如果资料不足以支撑某个知识点，不要编造。',
  ];

  const subjectRules: Record<SubjectType, string[]> = {
    数学: ['优先提取具体章节和公式；三角函数资料只能提取三角函数相关考点。', '不要把化学、地理等资料误判为数学。'],
    语文: ['提取文本理解、文言文、古诗、修辞、病句、标点等初高中语文考点。'],
    英语: ['提取语法、词汇语境、阅读理解、完形等初高中英语考点。'],
    物理: ['提取力学、电学、光学、热学等初高中物理模型、公式和实验考点。'],
    化学: ['提取化学反应、方程式、离子、电解质、酸碱、实验现象等化学考点。', '化学资料绝不能提取为数学函数或方程考点。'],
    生物: ['提取细胞、遗传、生态、光合作用、人体调节、生物实验等初高中生物考点。'],
    历史: ['提取历史事件、时间线、原因影响、史料分析等初高中历史考点。'],
    政治: ['提取道德与法治、公民权利义务、法治观念、社会责任等初高中政治考点。'],
    地理: ['只提取初高中自然地理、人文地理、区域地理考点。', '不要引入 GIS 专业课程或项目范围外内容。'],
  };

  return [...common, ...subjectRules[subject]].map((rule, index) => `${index + 1}. ${rule}`).join('\n');
};

export const buildKnowledgePrompt = (materialText: string, subjectType?: string) => {
  const subject = resolvePromptSubject(materialText, subjectType);

  return {
    systemPrompt: baseSystemPrompt,
    userPrompt: `请从以下学习资料中提取 ${subject} 知识点，并严格输出 JSON。

## 项目定位
这是给初高中家教老师使用的课后测评与家长反馈工具，不是学生刷题平台，也不是全学科出题平台。

## 提取规则
${getKnowledgeExtractionRules(subject)}

## 输出格式
{
  "knowledgePoints": [
    {
      "id": "kp-1",
      "title": "具体知识点名称",
      "description": "资料中对应的核心含义",
      "importance": "高/中/低",
      "masteryTarget": "学生需要达到的可观察掌握目标",
      "examType": "适合的课后测评方式",
      "examPatterns": ["基础概念题", "条件辨析题", "材料分析题"],
      "sourceEvidence": "必须引用资料中的具体句子或短语",
      "keywords": ["关键词1", "关键词2"],
      "subjectType": "${subject}",
      "formulas": [],
      "commonMistakes": ["常见错误1"],
      "keyMethods": ["解题方法1"]
    }
  ]
}

## 学习资料
${materialText.slice(0, 12000)}`,
  };
};

const getSubjectGuard = (subject: SubjectType, materialText: string): string => {
  if (subject === '化学') {
    return '化学资料只能生成化学题，禁止出现 sin、cos、tan、函数、二次函数、几何、概率等数学内容。';
  }
  if (subject === '数学' && /三角函数|同角|sin|cos|tan/.test(materialText)) {
    return '当前数学资料属于三角函数，禁止生成二次函数、方程、几何、概率、数列、导数等跨章节题。';
  }
  if (subject === '地理') {
    return '地理题只限初高中自然地理、人文地理、区域地理，禁止引入项目范围外内容。';
  }
  return `题目必须始终属于 ${subject}，不得跨学科、跨章节、跨知识点。`;
};

export const buildQuizPrompt = (
  materialText: string,
  knowledgePoints: KnowledgePoint[],
  settings?: QuizSettings,
  knowledgeCards?: KnowledgeCard[],
  questionBlueprints?: QuestionBlueprint[]
) => {
  const subject = resolvePromptSubject(materialText, settings?.subjectType);
  const strategy = getExamStrategy(subject);
  const ratio = normalizeDifficultyRatio(settings);
  const candidateCount = (settings?.questionCount ?? 10) * 2;
  const selectedTypes = settings?.questionTypes?.join('、') || '单选、判断、填空、简答';
  const strictSourceMode = settings?.strictSourceMode !== false;

  return {
    systemPrompt: `${baseSystemPrompt}

你必须进行自检：每道题生成后都要确认它符合当前资料学科、章节、知识点；不合格题目不要放入 JSON。`,
    userPrompt: `请基于当前学习资料生成 ${candidateCount} 道候选题，后续系统会再筛选去重。

## 当前命题约束
- 学科：${subject}
- strictSourceMode：${strictSourceMode ? 'true' : 'false'}
- 题型要求：${selectedTypes}
- 训练模式：${settings?.trainingMode ?? '基础巩固'}
- 难度比例：简单 ${ratio.easy}% / 中等 ${ratio.medium}% / 较难 ${ratio.hard}%
- 学科守卫：${getSubjectGuard(subject, materialText)}

## 难度定义
- 简单：直接考基础概念、公式、识记。
- 中等：需要一步到两步推理。
- 较难：综合应用、情境题、材料分析题。

## 命题方法
- 考查方法：${strategy.methods.join('、')}
- 常见误区：${strategy.commonMistakes.join('、')}
- 题型计划：${getQuestionPatternPlan(subject).join('、')}
- 必须围绕知识点、命题蓝图和资料原句生成，不得套用旧题或通用题干。
- 同一批题题干不能重复；数值、材料、设问角度要有变化。

## 学习资料
${materialText.slice(0, 8000)}

## 知识点
${JSON.stringify(knowledgePoints.slice(0, 10), null, 2)}

## 考点卡
${JSON.stringify((knowledgeCards || []).slice(0, 8), null, 2)}

## 命题蓝图
${JSON.stringify((questionBlueprints || []).slice(0, 12), null, 2)}

## 输出格式
{
  "questions": [
    {
      "id": "q1",
      "subject": "${subject}",
      "type": "single/judge/fill/short/solution/material",
      "examPattern": "基础概念题/公式套用题/条件辨析题/易错判断题/材料分析题/变式迁移题/综合解答题",
      "question": "具体题干",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "answer": "正确答案",
      "correctOptionLabel": "A",
      "explanation": "解析，必须说明资料依据和解题思路",
      "knowledgePointId": "对应知识点id",
      "difficulty": "简单/中等/较难",
      "sourceEvidence": "资料中的具体依据",
      "qualityScore": 90,
      "solutionSteps": ["步骤1", "步骤2"],
      "scoringRubric": ["得分点1", "得分点2"],
      "commonMistake": "对应常见误区"
    }
  ]
}`,
  };
};

export const buildDiagnosisPrompt = (
  result: QuizResult,
  questions: QuizQuestion[],
  answers: UserAnswer[],
) => ({
  systemPrompt: baseSystemPrompt,
  userPrompt: `请基于测评结果生成错因诊断，只输出 JSON。

## 诊断要求
1. 每条诊断必须引用学生答案和题目关键条件。
2. 建议必须具体到下一步怎么复习、怎么重做、怎么练同类变式。
3. 不要使用开发词汇或系统内部词汇。

## 输出格式
{
  "diagnosis": [
    {
      "id": "diag-q1",
      "questionId": "q1",
      "question": "题干",
      "knowledgePointTitle": "知识点",
      "userAnswer": "学生答案",
      "reasonType": "概念不清/公式误用/象限判断错误/计算失误/审题错误/材料理解偏差",
      "diagnosis": "具体错因",
      "correctUnderstanding": "正确理解",
      "suggestion": "下一步复习动作",
      "missingRubric": ["缺失得分点"],
      "commonMistake": "常见误区",
      "masteryStatus": "已掌握/待加强/薄弱"
    }
  ]
}

## 测评结果
${JSON.stringify(result, null, 2)}

## 题目
${JSON.stringify(questions, null, 2)}

## 学生答案
${JSON.stringify(answers, null, 2)}`,
});

export type DiagnosisPromptPayload = {
  diagnosis: DiagnosisItem[];
};
