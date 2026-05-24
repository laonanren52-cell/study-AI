import type {
  DiagnosisItem,
  Difficulty,
  Importance,
  KnowledgePoint,
  QuizQuestion,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
  UserAnswer,
} from '../types';
import { evaluateQuizAnswers } from '../utils/scoring';
import { callLLMJson, getAIStatus } from './llmClient';
import { buildDiagnosisPrompt, buildKnowledgePrompt, buildQuizPrompt } from './promptTemplates';

export { getAIStatus };

const signalKeywords = ['是', '包括', '分为', '特点', '作用', '原因', '影响', '应用', '区别', '流程', '原则', '考查', '备考', '方法'];
const badFragments = ['无关干扰项', '资料背景信息', '核心知识点 X'];
const lowValuePatterns = [
  /^第\s*\d+\s*页[:：]?$/,
  /^目录$/,
  /^谢谢观看$/,
  /^THANKS?$/i,
  /^Q\s*&\s*A$/i,
  /^页码$/,
  /^\d{1,3}$/,
  /^[\s/、，。；;,.）)]+$/,
];

export const isLowQualityText = (text: string) => {
  const value = text.trim();
  if (value.length < 2) return true;
  if (lowValuePatterns.some((pattern) => pattern.test(value))) return true;
  if (/^[/、）).,，。；;]/.test(value)) return true;
  if (/第\s*\d+\s*页/.test(value)) return true;
  if (/^[^\u4e00-\u9fa5A-Za-z0-9]+$/.test(value)) return true;
  if (/(.)\1{5,}/.test(value)) return true;
  return false;
};

export const extractCandidateSentences = (materialText: string) => {
  const rawSentences = materialText
    .replace(/\r/g, '\n')
    .split(/[\n。！？!?；;]+/)
    .map((item) => item.replace(/^第\s*\d+\s*页[:：]?\s*/, '').trim())
    .filter((item) => item.length >= 8 && !isLowQualityText(item));

  const scored = rawSentences
    .map((sentence) => ({
      sentence,
      score:
        signalKeywords.filter((keyword) => sentence.includes(keyword)).length * 3 +
        Math.min(8, Math.floor(sentence.length / 18)) -
        (/目录|谢谢|版权|联系电话|二维码/.test(sentence) ? 10 : 0),
    }))
    .filter((item) => item.score > -5)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  return scored
    .map((item) => item.sentence)
    .filter((sentence) => {
      const key = sentence.slice(0, 24);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const extractKeywords = (sentence: string) => {
  const quoted = [...sentence.matchAll(/[“《](.*?)[”》]/g)].map((match) => match[1]).filter((item) => item.length >= 2 && item.length <= 12);
  const chinesePhrases = sentence
    .replace(/[，。；：、,.!?！？]/g, ' ')
    .split(/\s+/)
    .flatMap((part) => [...part.matchAll(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g)].map((match) => match[0]))
    .filter((item) => !/^(因为|所以|通过|其中|包括|分为|可以|需要|进行|对于|主要|通常|资料|内容)$/.test(item))
    .filter((item) => !isLowQualityText(item));
  return [...new Set([...quoted, ...chinesePhrases])].slice(0, 5);
};

export const extractKnowledgeTitle = (sentence: string, index: number) => {
  const keywords = extractKeywords(sentence);
  const relationMatch = sentence.match(/([\u4e00-\u9fa5A-Za-z0-9《》“”]{2,18})(?:是|包括|分为|具有|指|的特点|的作用|的原因|的影响|的应用|的区别|的流程|的原则|在.*?中)/);
  const rawTitle = (relationMatch?.[1] || keywords[0] || '')
    .replace(/[《》“”]/g, '')
    .replace(/^(首先|其次|最后|因此|其中|例如|通过|对于|关于|根据|材料)/, '')
    .replace(/[，,].*$/, '')
    .slice(0, 18)
    .trim();
  return isLowQualityText(rawTitle) || rawTitle.length < 2 ? `核心知识点 ${index + 1}` : rawTitle;
};

const inferImportance = (sentence: string, index: number): Importance => {
  if (/核心|关键|重要|必须|重点|原则|原因|影响|高频|稳定|常考/.test(sentence)) return '高';
  if (index < 3 || /应用|区别|流程|特点|方法|考查/.test(sentence)) return '中';
  return '低';
};

const inferExamType = (sentence: string) => {
  if (/区别|不同|对比|辨析/.test(sentence)) return '概念辨析、对比分析';
  if (/应用|场景|用于|案例/.test(sentence)) return '应用场景判断、案例分析';
  if (/流程|步骤|过程/.test(sentence)) return '流程排序、步骤解释';
  if (/原因|影响|作用/.test(sentence)) return '原因分析、影响判断';
  if (/原则|特点|规则|方法|考查/.test(sentence)) return '要点识记、判断改错';
  return '概念解释、简答表达';
};

export const buildKnowledgePoint = (sentence: string, index: number): KnowledgePoint => {
  const title = extractKnowledgeTitle(sentence, index);
  const keywords = extractKeywords(sentence);
  const importance = inferImportance(sentence, index);
  return {
    id: `kp-${index + 1}`,
    title,
    description: sentence.length > 110 ? `${sentence.slice(0, 110)}...` : sentence,
    importance,
    masteryTarget:
      importance === '高'
        ? `能准确解释“${title}”，并能结合材料判断典型考查场景。`
        : `能复述“${title}”的核心含义，并识别常见表述。`,
    examType: inferExamType(sentence),
    sourceEvidence: sentence,
    keywords,
  };
};

const isSampleAiMaterial = (text: string) =>
  ['人工智能', '机器学习', '深度学习', '监督学习', '过拟合', '教育'].every((keyword) => text.includes(keyword));

const sampleKnowledgePoints: KnowledgePoint[] = [
  {
    id: 'kp-ai',
    title: '人工智能定义',
    description: '人工智能关注让机器模拟、延伸和扩展人类智能，覆盖感知、理解、推理、学习与决策。',
    importance: '高',
    masteryTarget: '能准确说明 AI 的目标与典型能力边界。',
    examType: '概念解释、应用场景判断',
    sourceEvidence: '人工智能是研究如何让机器模拟、延伸和扩展人类智能的一门技术科学。',
    keywords: ['人工智能', '人类智能', '推理', '决策'],
  },
  {
    id: 'kp-ml-dl',
    title: '机器学习与深度学习',
    description: '机器学习通过数据训练模型改进表现，深度学习是机器学习的分支，依赖多层神经网络学习复杂特征。',
    importance: '高',
    masteryTarget: '能辨析人工智能、机器学习、深度学习的层级关系。',
    examType: '概念辨析、关系判断',
    sourceEvidence: '机器学习是人工智能的重要分支，深度学习是机器学习的一个分支。',
    keywords: ['机器学习', '深度学习', '分支', '神经网络'],
  },
  {
    id: 'kp-learning-types',
    title: '三类学习范式',
    description: '监督学习依赖标签，无监督学习发现数据结构，强化学习通过奖励反馈学习策略。',
    importance: '高',
    masteryTarget: '能根据数据标签、反馈方式和应用场景区分三类方法。',
    examType: '场景匹配、判断题',
    sourceEvidence: '监督学习使用带有标签的数据，无监督学习使用没有标签的数据，强化学习通过奖励学习策略。',
    keywords: ['监督学习', '无监督学习', '强化学习', '标签'],
  },
  {
    id: 'kp-neural-network',
    title: '神经网络组成',
    description: '神经网络通常包含输入层、隐藏层和输出层，训练时通过误差调整连接权重。',
    importance: '中',
    masteryTarget: '理解基本结构和权重调整的作用。',
    examType: '结构识别、流程理解',
    sourceEvidence: '神经网络由输入层、隐藏层和输出层组成，训练过程中会根据预测误差调整权重。',
    keywords: ['神经网络', '输入层', '隐藏层', '权重'],
  },
  {
    id: 'kp-fit',
    title: '过拟合与欠拟合',
    description: '过拟合泛化能力差，欠拟合无法学习有效规律，两者都影响模型在真实任务中的表现。',
    importance: '高',
    masteryTarget: '能判断模型表现对应的问题类型，并提出改进方向。',
    examType: '现象判断、原因分析',
    sourceEvidence: '过拟合是训练数据表现很好但新数据泛化能力较差，欠拟合是模型过于简单。',
    keywords: ['过拟合', '欠拟合', '泛化', '训练数据'],
  },
  {
    id: 'kp-edu',
    title: 'AI 教育应用',
    description: 'AI 可用于智能推荐、自动批改、学习分析、个性化辅导和自适应练习。',
    importance: '中',
    masteryTarget: '能将 AI 能力映射到具体教育应用场景。',
    examType: '应用设计、开放表达',
    sourceEvidence: '人工智能在教育中可以用于智能推荐、自动批改、学习分析、个性化辅导和自适应练习。',
    keywords: ['教育应用', '智能推荐', '自动批改', '个性化'],
  },
];

const isKnowledgePoint = (item: unknown): item is KnowledgePoint => {
  const value = item as Partial<KnowledgePoint>;
  return Boolean(value?.id && value.title && value.description && value.importance && value.masteryTarget && value.examType);
};

const normalizeKnowledgePoints = (input: unknown): KnowledgePoint[] => {
  const record = input as Record<string, unknown>;
  const list = Array.isArray(record?.knowledgePoints) ? record.knowledgePoints : [];
  return list
    .filter(isKnowledgePoint)
    .map((item, index) => ({
      ...item,
      id: item.id || `kp-${index + 1}`,
      title: isLowQualityText(item.title) ? `核心知识点 ${index + 1}` : item.title,
      sourceEvidence: item.sourceEvidence || item.description,
      keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 5) : extractKeywords(item.description),
    }))
    .slice(0, 8);
};

const improvedMockKnowledge = (materialText: string) => {
  if (isSampleAiMaterial(materialText)) return sampleKnowledgePoints;
  const sentences = extractCandidateSentences(materialText);
  const signalSentences = sentences.filter((sentence) => signalKeywords.some((keyword) => sentence.includes(keyword)));
  const candidates = (signalSentences.length >= 4 ? signalSentences : sentences).slice(0, 8);
  while (candidates.length < 4) {
    const fallback = candidates[candidates.length - 1] || '本资料的核心内容需要围绕定义、特点、作用和应用场景进行理解。';
    candidates.push(`${fallback} 备考时应关注概念含义、材料依据和典型考查方式。`);
  }
  return candidates.slice(0, Math.max(4, Math.min(8, candidates.length))).map(buildKnowledgePoint);
};

export const extractKnowledgePoints = async (materialText: string): Promise<KnowledgePoint[]> => {
  const prompt = buildKnowledgePrompt(materialText);
  const llmResult = await callLLMJson(prompt.systemPrompt, prompt.userPrompt);
  const llmKnowledgePoints = llmResult ? normalizeKnowledgePoints(llmResult) : [];
  if (llmKnowledgePoints.length >= 4) return llmKnowledgePoints;

  const mockKnowledgePoints = improvedMockKnowledge(materialText);
  return [...llmKnowledgePoints, ...mockKnowledgePoints.filter((mock) => !llmKnowledgePoints.some((item) => item.title === mock.title))].slice(0, 8);
};

const difficultyByIndex = (index: number): Difficulty => (index < 3 ? '简单' : index < 7 ? '中等' : '较难');
const sentenceEnd = (text: string) => (/[。！？.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}。`);
const evidenceOf = (point: KnowledgePoint) => sentenceEnd(point.sourceEvidence || point.description);
const cleanOption = (text: string) => sentenceEnd(text.replace(/\s+/g, ' ').trim());

const correctOptionFor = (point: KnowledgePoint) =>
  cleanOption(`${point.title}要求理解材料中的核心含义：${(point.description || point.sourceEvidence || '需要结合材料语境进行判断').replace(/[。！？.!?]$/, '')}`);

const distractorOptionsFor = (point: KnowledgePoint) => [
  cleanOption(`${point.title}只需要记住名称，不需要结合具体语境或材料依据进行理解`),
  cleanOption(`${point.title}的考查完全脱离材料内容，主要依靠随意猜测即可完成`),
  cleanOption(`${point.title}只关注表面字词，不需要分析作用、原因、流程或应用场景`),
];

const questionTemplates = [
  (title: string) => `关于“${title}”，下列说法正确的是哪一项？`,
  (title: string) => `根据资料内容，“${title}”主要强调什么？`,
  (title: string) => `下列哪一项最能概括“${title}”的核心含义？`,
  (title: string) => `在材料语境下，“${title}”更接近以下哪种理解？`,
];

const fallbackSingleQuestion = (point: KnowledgePoint, index: number): QuizQuestion => {
  const answer = correctOptionFor(point);
  const options = [answer, ...distractorOptionsFor(point)];
  return withQuality({
    id: `q${index + 1}`,
    type: 'single',
    question: questionTemplates[index % questionTemplates.length](point.title),
    options,
    answer,
    explanation: `本题依据材料中的表述：“${evidenceOf(point)}”正确理解应围绕该知识点的含义、依据和考查方式展开。`,
    knowledgePointId: point.id,
    difficulty: difficultyByIndex(index),
    sourceEvidence: evidenceOf(point),
  });
};

const buildJudgeQuestion = (point: KnowledgePoint, index: number): QuizQuestion =>
  withQuality({
    id: `q${index + 1}`,
    type: 'judge',
    question:
      index % 2 === 0
        ? `${point.title}的学习需要结合资料中的语境、作用或考查方式进行判断。`
        : `${point.title}只要记住标题即可，不需要理解资料中的依据和应用场景。`,
    answer: index % 2 === 0 ? '正确' : '错误',
    explanation:
      index % 2 === 0
        ? `判断正确。资料依据是：“${evidenceOf(point)}”`
        : `判断错误。资料强调的是完整理解，而不是只记忆标题；依据是：“${evidenceOf(point)}”`,
    knowledgePointId: point.id,
    difficulty: difficultyByIndex(index),
    sourceEvidence: evidenceOf(point),
  });

const buildShortQuestion = (point: KnowledgePoint, index: number): QuizQuestion =>
  withQuality({
    id: `q${index + 1}`,
    type: 'short',
    question: `请结合资料说明“${point.title}”在备考或学习中应重点关注哪些方面。`,
    answer: `应重点关注${point.title}的核心含义、材料依据、典型考查方式，以及容易混淆的应用场景。资料依据：${evidenceOf(point)}`,
    explanation: `回答应覆盖概念含义、资料依据和考查方式，不能只复述标题。`,
    knowledgePointId: point.id,
    difficulty: '较难',
    sourceEvidence: evidenceOf(point),
  });

const scoreQuestionQuality = (question: QuizQuestion) => {
  let score = 100;
  if (question.question.trim().length <= 12) score -= 30;
  if (!question.sourceEvidence?.trim()) score -= 25;
  if (question.explanation.trim().length <= 10) score -= 20;
  if (/^[/、）).,，。；;]/.test(question.question.trim())) score -= 20;
  if (badFragments.some((fragment) => JSON.stringify(question).includes(fragment))) score -= 30;
  if (question.type === 'single') {
    if (!question.options || question.options.length !== 4) score -= 40;
    question.options?.forEach((option) => {
      if (option.trim().length <= 8) score -= 20;
      if (/^[/、）).,，。；;]/.test(option.trim())) score -= 20;
      if (!/[。！？.!?]$/.test(option.trim())) score -= 5;
      if (/^[\u4e00-\u9fa5A-Za-z0-9]{1,8}$/.test(option.trim())) score -= 20;
    });
    if (!question.options?.includes(question.answer)) score -= 40;
  }
  return Math.max(0, score);
};

const withQuality = (question: QuizQuestion): QuizQuestion => ({
  ...question,
  question: question.question.trim(),
  options: question.options?.map(cleanOption),
  answer: question.type === 'single' ? cleanOption(question.answer) : question.answer.trim(),
  explanation: sentenceEnd(question.explanation),
  sourceEvidence: sentenceEnd(question.sourceEvidence || question.explanation),
  qualityScore: scoreQuestionQuality(question),
});

export const validateQuestion = (question: QuizQuestion): boolean => {
  const normalized = withQuality(question);
  if (normalized.question.length <= 12) return false;
  if (!normalized.sourceEvidence?.trim()) return false;
  if (normalized.explanation.length <= 10) return false;
  if (badFragments.some((fragment) => JSON.stringify(normalized).includes(fragment))) return false;
  if (/^[/、）).,，。；;]/.test(normalized.question)) return false;
  if (normalized.type === 'single') {
    if (!normalized.options || normalized.options.length !== 4) return false;
    if (!normalized.options.includes(normalized.answer)) return false;
    if (normalized.options.some((option) => option.length <= 8 || /^[/、）).,，。；;]/.test(option) || /^[\u4e00-\u9fa5A-Za-z0-9]{1,8}$/.test(option))) return false;
  }
  return true;
};

const normalizeQuestion = (question: QuizQuestion, fallbackPoint: KnowledgePoint, index: number): QuizQuestion => {
  const normalized = withQuality({
    ...question,
    id: question.id || `q${index + 1}`,
    knowledgePointId: question.knowledgePointId || fallbackPoint.id,
    sourceEvidence: question.sourceEvidence || fallbackPoint.sourceEvidence || fallbackPoint.description,
  });
  return validateQuestion(normalized) ? normalized : fallbackSingleQuestion(fallbackPoint, index);
};

const isQuizQuestion = (item: unknown): item is QuizQuestion => {
  const value = item as Partial<QuizQuestion>;
  return Boolean(value?.id && value.type && value.question && value.answer && value.explanation && value.knowledgePointId && value.difficulty);
};

const normalizeLLMQuestions = (input: unknown, knowledgePoints: KnowledgePoint[]) => {
  const record = input as Record<string, unknown>;
  const list = Array.isArray(record?.questions) ? record.questions : [];
  return list
    .filter(isQuizQuestion)
    .map((question, index) => normalizeQuestion(question, knowledgePoints[index % knowledgePoints.length], index))
    .filter(validateQuestion)
    .slice(0, 10);
};

const improvedMockQuiz = (knowledgePoints: KnowledgePoint[], startIndex = 0) => {
  const source = knowledgePoints.length > 0 ? knowledgePoints : sampleKnowledgePoints;
  const questions: QuizQuestion[] = [];
  for (let index = 0; index < 5; index += 1) {
    questions.push(fallbackSingleQuestion(source[index % source.length], startIndex + index));
  }
  for (let index = 0; index < 3; index += 1) {
    questions.push(buildJudgeQuestion(source[index % source.length], startIndex + questions.length));
  }
  for (let index = 0; index < 2; index += 1) {
    questions.push(buildShortQuestion(source[index % source.length], startIndex + questions.length + index));
  }
  return questions.slice(0, 10);
};

export const generateQuiz = async (knowledgePoints: KnowledgePoint[], materialText: string): Promise<QuizQuestion[]> => {
  const source = knowledgePoints.length > 0 ? knowledgePoints : sampleKnowledgePoints;
  const prompt = buildQuizPrompt(materialText, source);
  const llmResult = await callLLMJson(prompt.systemPrompt, prompt.userPrompt);
  const llmQuestions = llmResult ? normalizeLLMQuestions(llmResult, source) : [];
  const mockQuestions = improvedMockQuiz(source, llmQuestions.length);

  const combined = [...llmQuestions];
  mockQuestions.forEach((question) => {
    if (combined.length < 10 && !combined.some((item) => item.question === question.question)) combined.push(question);
  });

  return combined.slice(0, 10).map((question, index) => ({ ...question, id: `q${index + 1}` }));
};

export const evaluateAnswers = async (
  questions: QuizQuestion[],
  answers: UserAnswer[],
  knowledgePoints: KnowledgePoint[],
): Promise<QuizResult> => evaluateQuizAnswers(questions, answers, knowledgePoints);

const isDiagnosisItem = (item: unknown): item is DiagnosisItem => {
  const value = item as Partial<DiagnosisItem>;
  return Boolean(value?.id && value.questionId && value.question && value.knowledgePointTitle && value.reasonType && value.diagnosis && value.correctUnderstanding && value.suggestion);
};

export const generateDiagnosis = async (
  result: QuizResult,
  questions: QuizQuestion[],
  answers: UserAnswer[],
): Promise<DiagnosisItem[]> => {
  const prompt = buildDiagnosisPrompt(result, questions, answers);
  const llmResult = await callLLMJson(prompt.systemPrompt, prompt.userPrompt);
  const llmDiagnosis = llmResult && Array.isArray((llmResult as Record<string, unknown>).diagnosis)
    ? ((llmResult as Record<string, unknown>).diagnosis as unknown[]).filter(isDiagnosisItem)
    : [];
  if (llmDiagnosis.length > 0) return llmDiagnosis;

  const answerMap = new Map(answers.map((item) => [item.questionId, item.answer]));
  const reasonTypes: DiagnosisItem['reasonType'][] = ['概念混淆', '关键词遗漏', '应用场景判断错误', '记忆不牢固', '表达不完整'];
  return result.wrongQuestions.map((wrong, index) => {
    const question = questions.find((item) => item.id === wrong.questionId)!;
    const kp = result.byKnowledgePoint.find((item) => item.knowledgePoint.id === question.knowledgePointId)?.knowledgePoint;
    const reasonType = question.type === 'short' ? '表达不完整' : reasonTypes[index % reasonTypes.length];
    const userAnswer = answerMap.get(question.id) || '未作答';
    return {
      id: `diag-${question.id}`,
      questionId: question.id,
      question: question.question,
      knowledgePointTitle: kp?.title ?? '相关知识点',
      userAnswer,
      reasonType,
      diagnosis: `你的答案“${userAnswer}”没有准确命中本题考查点，说明对“${kp?.title ?? '该知识点'}”的理解还不稳定。`,
      correctUnderstanding: question.explanation,
      suggestion:
        reasonType === '表达不完整'
          ? '复习时先列出关键词，再用一句完整的话解释概念、材料依据和应用影响。'
          : '重新阅读知识点说明，并用“概念定义 + 典型场景 + 易错点”的方式整理笔记。',
    };
  });
};

export const generateReviewPlan = async (
  diagnosis: DiagnosisItem[],
  weakKnowledgePoints: KnowledgePoint[],
): Promise<ReviewPlanDay[]> => {
  const focus = weakKnowledgePoints.length > 0 ? weakKnowledgePoints.map((item) => item.title) : ['核心概念', '应用场景'];
  return [
    {
      day: 1,
      goal: `巩固${focus.slice(0, 2).join('、')}等基础概念。`,
      focusKnowledgePoints: focus.slice(0, 2),
      duration: '30 分钟',
      practiceCount: 5,
      method: '用结构图整理概念关系，完成概念辨析题并复述核心定义。',
    },
    {
      day: 2,
      goal: '强化材料中的应用场景、原因影响和流程判断。',
      focusKnowledgePoints: focus.length > 2 ? focus.slice(1, 4) : focus,
      duration: '40 分钟',
      practiceCount: 6,
      method: '按定义、特点、应用、易错点四列制作对比表，再做场景判断题。',
    },
    {
      day: 3,
      goal: '复盘错题并完成二次强化测试。',
      focusKnowledgePoints: diagnosis.length > 0 ? [...new Set(diagnosis.map((item) => item.knowledgePointTitle))] : focus,
      duration: '30 分钟',
      practiceCount: 5,
      method: '先看错因诊断，再遮住解析重答错题，最后完成系统生成的强化练习。',
    },
  ];
};

export const generateReinforcementQuiz = async (weakKnowledgePoints: KnowledgePoint[]): Promise<ReinforcementQuestion[]> => {
  const weak = weakKnowledgePoints.length > 0 ? weakKnowledgePoints : sampleKnowledgePoints.slice(0, 3);
  return weak.slice(0, 5).map((item, index) => ({
    id: `reinforce-${index + 1}`,
    question:
      index % 2 === 0
        ? `请用一个真实学习或考试场景解释“${item.title}”为什么重要。`
        : `给出一个容易混淆“${item.title}”的错误说法，并进行纠正。`,
    knowledgePointTitle: item.title,
    hint: '先写概念，再写材料依据，最后写判断或应用场景。',
    answer: `围绕“${item.title}”作答时，应包含核心定义、材料中的关键描述、适用场景和常见误区。`,
  }));
};
