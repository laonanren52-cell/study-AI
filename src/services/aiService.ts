import type {
  DiagnosisItem,
  Difficulty,
  ExamQuestionPattern,
  Importance,
  KnowledgePoint,
  QuizQuestion,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
  UserAnswer,
} from '../types';
import { evaluateQuizAnswers } from '../utils/scoring';
import { getExamStrategy, getQuestionPatternPlan, inferSubjectType } from './examStrategy';
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

const inferExamPatterns = (sentence: string, subjectType = inferSubjectType(sentence)): ExamQuestionPattern[] => {
  if (subjectType === '数学' || /公式|sin|cos|tan|方程|证明/.test(sentence)) return ['公式套用题', '条件辨析题', '变式迁移题'];
  if (/材料|阅读|语境|标点|病句|文言/.test(sentence)) return ['条件辨析题', '材料分析题', '易错判断题'];
  if (/流程|步骤|过程/.test(sentence)) return ['基础概念题', '条件辨析题', '综合解答题'];
  if (/原因|影响|作用|应用/.test(sentence)) return ['材料分析题', '变式迁移题'];
  return ['基础概念题', '易错判断题'];
};

const extractFormulas = (text: string) => {
  const formulas = [
    ...text.matchAll(/[A-Za-zαβθ0-9²^+\-*/=()（）√]+(?:sin|cos|tan|=)[A-Za-zαβθ0-9²^+\-*/=()（）√\s]*/gi),
    ...text.matchAll(/(?:sin|cos|tan)[²^]?[αβθ]?\s*[+\-*/=]\s*[A-Za-z0-9αβθ²^+\-*/=()（）√\s]+/gi),
  ].map((match) => match[0].trim()).filter((item) => item.length >= 5);
  if (/三角函数|sin|cos|tan/.test(text)) {
    formulas.push('sin²α + cos²α = 1', 'tanα = sinα / cosα');
  }
  return [...new Set(formulas)].slice(0, 4);
};

export const buildKnowledgePoint = (sentence: string, index: number): KnowledgePoint => {
  const title = extractKnowledgeTitle(sentence, index);
  const keywords = extractKeywords(sentence);
  const importance = inferImportance(sentence, index);
  const subjectType = inferSubjectType(sentence);
  const strategy = getExamStrategy(subjectType);
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
    subjectType,
    examPatterns: inferExamPatterns(sentence, subjectType),
    formulas: extractFormulas(sentence),
    commonMistakes: strategy.commonMistakes.slice(0, 3),
    keyMethods: strategy.methods.slice(0, 4),
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
      subjectType: item.subjectType || inferSubjectType(`${item.title} ${item.description}`),
      examPatterns: Array.isArray(item.examPatterns) && item.examPatterns.length > 0 ? item.examPatterns.slice(0, 4) : inferExamPatterns(`${item.title} ${item.description}`),
      formulas: Array.isArray(item.formulas) ? item.formulas.slice(0, 4) : extractFormulas(`${item.title} ${item.description}`),
      commonMistakes: Array.isArray(item.commonMistakes) && item.commonMistakes.length > 0 ? item.commonMistakes.slice(0, 4) : getExamStrategy(inferSubjectType(`${item.title} ${item.description}`)).commonMistakes.slice(0, 3),
      keyMethods: Array.isArray(item.keyMethods) && item.keyMethods.length > 0 ? item.keyMethods.slice(0, 4) : getExamStrategy(inferSubjectType(`${item.title} ${item.description}`)).methods.slice(0, 4),
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

const defaultRubricFor = (point: KnowledgePoint, pattern: ExamQuestionPattern) => {
  const formulas = point.formulas?.length ? [`写出或识别关键公式：${point.formulas[0]}`] : [];
  return [
    `准确定位考点：${point.title}`,
    ...formulas,
    '结合题干条件或材料依据进行判断',
    '给出规范结论',
  ].slice(0, pattern === '综合解答题' || pattern === '变式迁移题' ? 4 : 3);
};

const defaultStepsFor = (point: KnowledgePoint, pattern: ExamQuestionPattern) => {
  if (pattern === '公式套用题' || pattern === '综合解答题' || pattern === '变式迁移题') {
    return [
      `先识别本题考查“${point.title}”`,
      point.formulas?.[0] ? `写出公式：${point.formulas[0]}` : '写出相关定义、公式或规则',
      '将题干条件代入并分步推导',
      '检查条件限制、符号或语境，写出最终答案',
    ];
  }
  return [
    `定位材料中的“${point.title}”`,
    '提取题干关键词或语境条件',
    '排除常见错误理解',
    '给出符合材料依据的结论',
  ];
};

const enrichQuestion = (question: QuizQuestion, point: KnowledgePoint, pattern: ExamQuestionPattern): QuizQuestion => ({
  ...question,
  examPattern: question.examPattern || pattern,
  learningObjective: question.learningObjective || `考查学生对“${point.title}”的考点识别、条件判断和规范表达能力。`,
  commonMistake: question.commonMistake || point.commonMistakes?.[0] || '只记结论，忽略条件、步骤或材料依据。',
  scoringRubric: question.scoringRubric?.length ? question.scoringRubric : defaultRubricFor(point, pattern),
  solutionSteps: question.solutionSteps?.length ? question.solutionSteps : defaultStepsFor(point, pattern),
  answerInputMode: question.answerInputMode || (question.type === 'short' ? 'both' : 'text'),
});

const fallbackSingleQuestion = (point: KnowledgePoint, index: number, pattern: ExamQuestionPattern = '基础概念题'): QuizQuestion => {
  const answer = correctOptionFor(point);
  const options = [answer, ...distractorOptionsFor(point)];
  return withQuality(enrichQuestion({
    id: `q${index + 1}`,
    type: 'single',
    question: questionTemplates[index % questionTemplates.length](point.title),
    options,
    answer,
    explanation: `本题依据材料中的表述：“${evidenceOf(point)}”正确理解应围绕该知识点的含义、依据和考查方式展开。`,
    optionExplanations: Object.fromEntries(options.map((option) => [option, option === answer ? '该选项符合材料依据和考点要求。' : '该选项属于常见误区，忽略了材料条件或考点边界。'])),
    knowledgePointId: point.id,
    difficulty: difficultyByIndex(index),
    sourceEvidence: evidenceOf(point),
  }, point, pattern));
};

const buildJudgeQuestion = (point: KnowledgePoint, index: number, pattern: ExamQuestionPattern = '易错判断题'): QuizQuestion =>
  withQuality(enrichQuestion({
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
  }, point, pattern));

const buildShortQuestion = (point: KnowledgePoint, index: number, pattern: ExamQuestionPattern = '综合解答题'): QuizQuestion =>
  withQuality(enrichQuestion({
    id: `q${index + 1}`,
    type: 'short',
    question: `请结合资料完成“${point.title}”的标准解答：写出关键公式/规则、分析条件，并说明易错点。`,
    answer: `应写出${point.title}的关键公式或规则，结合题干条件分步说明，并指出常见误区。资料依据：${evidenceOf(point)}`,
    explanation: `回答应覆盖公式/规则、条件分析、标准步骤和易错点，不能只复述标题。`,
    knowledgePointId: point.id,
    difficulty: '较难',
    sourceEvidence: evidenceOf(point),
  }, point, pattern));

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
  const pattern = question.examPattern || fallbackPoint.examPatterns?.[index % Math.max(fallbackPoint.examPatterns.length, 1)] || '基础概念题';
  const normalized = withQuality(enrichQuestion({
    ...question,
    id: question.id || `q${index + 1}`,
    knowledgePointId: question.knowledgePointId || fallbackPoint.id,
    sourceEvidence: question.sourceEvidence || fallbackPoint.sourceEvidence || fallbackPoint.description,
  }, fallbackPoint, pattern));
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

const buildTrigMockQuiz = (knowledgePoints: KnowledgePoint[], startIndex = 0): QuizQuestion[] => {
  const point = knowledgePoints.find((item) => /三角|sin|cos|tan|同角/.test(`${item.title}${item.description}${item.sourceEvidence}`)) || knowledgePoints[0] || sampleKnowledgePoints[0];
  const evidence = evidenceOf(point);
  const base = {
    knowledgePointId: point.id,
    sourceEvidence: evidence,
  };
  const q1Answer = '同角三角函数基本关系包括 sin²α + cos²α = 1，以及 tanα = sinα / cosα。';
  const q1Options = [
    q1Answer,
    '同角三角函数只需要记住 sinα + cosα = 1，不需要平方关系。',
    'tanα 与 sinα、cosα 没有关系，考试中只能查表判断。',
    '只要知道角度名称，就可以不考虑象限直接确定所有符号。',
  ].map(cleanOption);

  const questions: QuizQuestion[] = [
    withQuality(enrichQuestion({
      id: `q${startIndex + 1}`,
      type: 'single',
      examPattern: '基础概念题',
      question: '关于同角三角函数基本关系，下列说法正确的是哪一项？',
      options: q1Options,
      answer: cleanOption(q1Answer),
      explanation: '同角三角函数常考两个基本关系：平方关系和商数关系，后续求值、证明和化简都要使用。',
      optionExplanations: Object.fromEntries(q1Options.map((option) => [option, option === cleanOption(q1Answer) ? '正确，完整覆盖平方关系和商数关系。' : '错误，属于公式记忆不完整或忽略象限条件。'])),
      difficulty: '简单',
      ...base,
    }, point, '基础概念题')),
    withQuality(enrichQuestion({
      id: `q${startIndex + 2}`,
      type: 'single',
      examPattern: '条件辨析题',
      question: '已知 tanα > 0，且 α 在第三象限，下列对 sinα、cosα 符号判断正确的是哪一项？',
      options: [
        'sinα < 0，cosα < 0，且 tanα = sinα / cosα > 0。',
        'sinα > 0，cosα > 0，因为 tanα > 0 所以一定在第一象限。',
        'sinα > 0，cosα < 0，因为第三象限只改变 cosα 的符号。',
        'sinα < 0，cosα > 0，因为 tanα > 0 与象限无关。',
      ].map(cleanOption),
      answer: cleanOption('sinα < 0，cosα < 0，且 tanα = sinα / cosα > 0。'),
      explanation: '第三象限中正弦、余弦均为负，二者相除为正，符合 tanα > 0。',
      difficulty: '中等',
      ...base,
    }, point, '条件辨析题')),
    withQuality(enrichQuestion({
      id: `q${startIndex + 3}`,
      type: 'single',
      examPattern: '公式套用题',
      question: '已知 tanα = 3/4，且 α 在第一象限，下列求 sinα、cosα 的结果正确的是哪一项？',
      options: [
        'sinα = 3/5，cosα = 4/5。',
        'sinα = 4/5，cosα = 3/5。',
        'sinα = -3/5，cosα = -4/5。',
        'sinα = 3/4，cosα = 1。',
      ].map(cleanOption),
      answer: cleanOption('sinα = 3/5，cosα = 4/5。'),
      explanation: 'tanα = sinα/cosα = 3/4，可设 sinα=3k、cosα=4k，再由 sin²α+cos²α=1 得 k=1/5；第一象限均为正。',
      difficulty: '中等',
      ...base,
    }, point, '公式套用题')),
    withQuality(enrichQuestion({
      id: `q${startIndex + 4}`,
      type: 'single',
      examPattern: '易错判断题',
      question: '在求 sinα、cosα 时，最容易导致失分的做法是哪一项？',
      options: [
        '只求出 sin²α、cos²α 的值，没有根据象限判断正负号。',
        '先写出 tanα = sinα / cosα，再结合平方关系求解。',
        '代入计算后检查 sin²α + cos²α 是否等于 1。',
        '根据题干象限条件确定 sinα 和 cosα 的符号。',
      ].map(cleanOption),
      answer: cleanOption('只求出 sin²α、cos²α 的值，没有根据象限判断正负号。'),
      explanation: '三角函数求值题常见失分点是忽略象限，从平方值直接开方后漏判正负号。',
      difficulty: '简单',
      ...base,
    }, point, '易错判断题')),
    buildJudgeQuestion(point, startIndex + 4, '易错判断题'),
    withQuality(enrichQuestion({
      id: `q${startIndex + 6}`,
      type: 'judge',
      examPattern: '条件辨析题',
      question: '已知 tanα 的值后，仍然需要结合 α 所在象限确定 sinα、cosα 的正负号。',
      answer: '正确',
      explanation: 'tanα 只确定比值，sinα、cosα 的正负号必须结合象限判断。',
      difficulty: '简单',
      ...base,
    }, point, '条件辨析题')),
    withQuality(enrichQuestion({
      id: `q${startIndex + 7}`,
      type: 'judge',
      examPattern: '易错判断题',
      question: '证明三角恒等式时，可以只写最后结论，不需要展示等式变形过程。',
      answer: '错误',
      explanation: '证明题评分重视变形依据和步骤规范，只写结论会丢失主要得分点。',
      difficulty: '简单',
      ...base,
    }, point, '易错判断题')),
    withQuality(enrichQuestion({
      id: `q${startIndex + 8}`,
      type: 'judge',
      examPattern: '公式套用题',
      question: 'tanα = sinα / cosα 的使用前提之一是 cosα 不等于 0。',
      answer: '正确',
      explanation: '分母不能为 0，这是商数关系的适用条件。',
      difficulty: '中等',
      ...base,
    }, point, '公式套用题')),
    withQuality(enrichQuestion({
      id: `q${startIndex + 9}`,
      type: 'short',
      examPattern: '综合解答题',
      question: '已知 tanα = 3/4，且 α 在第三象限，求 sinα 和 cosα，并写出标准步骤。',
      answer: '设 sinα = 3k，cosα = 4k。由 sin²α + cos²α = 1 得 25k² = 1，所以 |k| = 1/5。因为 α 在第三象限，sinα、cosα 都为负，所以 sinα = -3/5，cosα = -4/5。',
      explanation: '本题得分关键是公式、设参、平方关系、象限符号和最终答案。',
      difficulty: '较难',
      ...base,
    }, point, '综合解答题')),
    withQuality(enrichQuestion({
      id: `q${startIndex + 10}`,
      type: 'short',
      examPattern: '变式迁移题',
      question: '请证明恒等式：1 + tan²α = 1 / cos²α，并说明每一步使用了哪个同角三角函数关系。',
      answer: '由 tanα = sinα / cosα 得 1 + tan²α = 1 + sin²α/cos²α = (sin²α + cos²α)/cos²α。再由 sin²α + cos²α = 1，得到 1 + tan²α = 1/cos²α。',
      explanation: '证明题要从左边出发，使用商数关系和平方关系逐步变形。',
      difficulty: '较难',
      ...base,
    }, point, '变式迁移题')),
  ];
  return questions;
};

const buildChinesePunctuationMockQuiz = (knowledgePoints: KnowledgePoint[], startIndex = 0): QuizQuestion[] => {
  const point = knowledgePoints.find((item) => /标点|冒号|分号|语境/.test(`${item.title}${item.description}${item.sourceEvidence}`)) || knowledgePoints[0] || sampleKnowledgePoints[0];
  const evidence = evidenceOf(point);
  const answer = cleanOption('标点符号使用必须结合句子语境、层次关系和表达意图判断。');
  const options = [
    answer,
    '标点符号只看符号名称，不需要理解句子之间的逻辑关系。',
    '冒号、分号和逗号可以随意互换，只要句子够长即可。',
    '标点题只在作文评分中出现，不会以客观题形式考查。',
  ].map(cleanOption);
  const questions = improvedGenericMockQuiz(knowledgePoints, startIndex);
  questions[0] = withQuality(enrichQuestion({
    id: `q${startIndex + 1}`,
    type: 'single',
    examPattern: '条件辨析题',
    question: '关于标点符号在语境中的考查，下列说法正确的是哪一项？',
    options,
    answer,
    explanation: '标点题的关键不是背符号名称，而是结合语境、层次关系和表达意图判断是否恰当。',
    optionExplanations: Object.fromEntries(options.map((option) => [option, option === answer ? '正确，体现语境判断。' : '错误，属于脱离语境或绝对化理解。'])),
    knowledgePointId: point.id,
    difficulty: '中等',
    sourceEvidence: evidence,
  }, point, '条件辨析题'));
  questions[8] = withQuality(enrichQuestion({
    id: `q${startIndex + 9}`,
    type: 'short',
    examPattern: '材料分析题',
    question: '请结合材料说明做标点符号题时应如何判断冒号、分号或逗号是否使用恰当。',
    answer: '应先看句子内部层次，再判断前后内容是否存在提示、解释、并列或分层关系，最后结合语境确认标点是否服务表达。',
    explanation: '语文标点题的得分点包括规则、语境、层次关系和具体判断理由。',
    knowledgePointId: point.id,
    difficulty: '较难',
    sourceEvidence: evidence,
  }, point, '材料分析题'));
  return questions;
};

const improvedGenericMockQuiz = (knowledgePoints: KnowledgePoint[], startIndex = 0) => {
  const source = knowledgePoints.length > 0 ? knowledgePoints : sampleKnowledgePoints;
  const subjectType = inferSubjectType(source.map((item) => `${item.title}${item.description}${item.sourceEvidence}`).join('\n'));
  const patternPlan = getQuestionPatternPlan(subjectType);
  const questions: QuizQuestion[] = [];
  for (let index = 0; index < 5; index += 1) {
    questions.push(fallbackSingleQuestion(source[index % source.length], startIndex + index, patternPlan[index]));
  }
  for (let index = 0; index < 3; index += 1) {
    questions.push(buildJudgeQuestion(source[index % source.length], startIndex + questions.length, patternPlan[5 + index]));
  }
  for (let index = 0; index < 2; index += 1) {
    questions.push(buildShortQuestion(source[index % source.length], startIndex + questions.length + index, patternPlan[8 + index]));
  }
  return questions.slice(0, 10);
};

const improvedMockQuiz = (knowledgePoints: KnowledgePoint[], startIndex = 0) => {
  const material = knowledgePoints.map((item) => `${item.title}\n${item.description}\n${item.sourceEvidence ?? ''}`).join('\n');
  if (/三角函数|sin|cos|tan|同角/.test(material)) return buildTrigMockQuiz(knowledgePoints, startIndex).slice(0, 10);
  if (/标点|冒号|分号|语境|病句/.test(material)) return buildChinesePunctuationMockQuiz(knowledgePoints, startIndex).slice(0, 10);
  return improvedGenericMockQuiz(knowledgePoints, startIndex);
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
  const subjectType = weakKnowledgePoints[0]?.subjectType || inferSubjectType(focus.join('\n'));
  const strategy = getExamStrategy(subjectType);
  const formulas = [...new Set(weakKnowledgePoints.flatMap((item) => item.formulas ?? []))];
  const mistakes = [...new Set([...weakKnowledgePoints.flatMap((item) => item.commonMistakes ?? []), ...strategy.commonMistakes])].slice(0, 5);
  const isMath = subjectType === '数学';
  return [
    {
      day: 1,
      goal: isMath ? '掌握核心公式、定义和条件限制，建立母题解法框架。' : `巩固${focus.slice(0, 2).join('、')}等基础考点和判断规则。`,
      focusKnowledgePoints: focus.slice(0, 2),
      duration: '35 分钟',
      practiceCount: 6,
      method: isMath ? '先默写公式，再做 2 道母题，最后复盘条件和符号。' : '先整理规则，再做语境/材料判断题，最后用错因表复盘。',
      mustRemember: formulas.length > 0 ? formulas : [`${focus[0]}的定义、适用条件和材料依据`, ...strategy.methods.slice(0, 2)],
      exampleTasks: isMath
        ? ['已知函数关系或公式条件，写出完整代入步骤。', '完成 1 道母题：公式识别 → 条件代入 → 结果检查。']
        : ['完成 2 道基础概念/规则识别题。', '从材料中划出能支撑判断的关键词。'],
      reinforcementTasks: isMath ? ['换数值变式 2 道', '换条件或象限变式 2 道'] : ['新语境判断题 3 道', '易错项辨析题 2 道'],
      commonMistakes: mistakes.slice(0, 3),
      selfCheckCriteria: isMath ? ['能在 5 分钟内写出公式和适用条件。', '能说明每一步推导依据。'] : ['能说出规则依据。', '能用材料原句支持判断。'],
      checklist: [
        { id: 'd1-1', text: '默写必背公式/定义', done: false },
        { id: 'd1-2', text: '完成母题或基础判断题', done: false },
        { id: 'd1-3', text: '记录 2 个易错点', done: false },
      ],
    },
    {
      day: 2,
      goal: isMath ? '强化条件辨析和变式迁移，减少因条件变化导致的失分。' : '强化材料中的应用场景、语境条件和易错辨析。',
      focusKnowledgePoints: focus.length > 2 ? focus.slice(1, 4) : focus,
      duration: '45 分钟',
      practiceCount: 8,
      method: isMath ? '按“已知条件变化、公式不变、符号/范围变化”做变式训练。' : '按“规则、语境、材料依据、易错项”四列制作对比表。',
      mustRemember: formulas.length > 0 ? formulas : strategy.methods,
      exampleTasks: isMath ? ['把第 1 天母题改 2 个条件重新求解。', '用红笔标出每题的条件限制。'] : ['完成 3 道新语境材料判断题。', '说明每个错误选项错在哪里。'],
      reinforcementTasks: isMath ? ['条件辨析题 3 道', '易错判断题 3 道', '综合解答题 2 道'] : ['材料分析题 3 道', '易错判断题 3 道', '简答表达题 2 道'],
      commonMistakes: mistakes,
      selfCheckCriteria: isMath ? ['能主动检查符号、范围、单位或定义域。', '能独立写出至少 3 个得分点。'] : ['能区分规则本身和语境条件。', '能完整写出判断理由。'],
      checklist: [
        { id: 'd2-1', text: '完成至少 6 道同类变式题', done: false },
        { id: 'd2-2', text: '标注每道题的条件变化', done: false },
        { id: 'd2-3', text: '整理错因和缺失得分点', done: false },
      ],
    },
    {
      day: 3,
      goal: '复盘错题并完成二次强化测试。',
      focusKnowledgePoints: diagnosis.length > 0 ? [...new Set(diagnosis.map((item) => item.knowledgePointTitle))] : focus,
      duration: '30 分钟',
      practiceCount: 5,
      method: '先遮住解析重答错题，再完成系统生成的同类变式，最后按得分点自评。',
      mustRemember: formulas.length > 0 ? formulas : [`${focus[0]}的易错边界`, '错题对应的标准步骤和得分点'],
      exampleTasks: ['重做原错题，不看答案写完整步骤。', '把每道错题改成一题同类变式。'],
      reinforcementTasks: ['完成系统生成的强化题 3-5 道', '每题对照标准步骤和得分点打勾'],
      commonMistakes: mistakes,
      selfCheckCriteria: ['能说清原错因。', '能在限定时间内完成同类变式。', '能对照得分点找出缺失项。'],
      checklist: [
        { id: 'd3-1', text: '遮住答案重做错题', done: false },
        { id: 'd3-2', text: '完成二次强化题', done: false },
        { id: 'd3-3', text: '按得分点自评并记录仍需复习项', done: false },
      ],
    },
  ];
};

export const generateReinforcementQuiz = async (
  weakKnowledgePoints: KnowledgePoint[],
  questions: QuizQuestion[] = [],
  result?: QuizResult,
): Promise<ReinforcementQuestion[]> => {
  const weak = weakKnowledgePoints.length > 0 ? weakKnowledgePoints : sampleKnowledgePoints.slice(0, 3);
  const wrongQuestionMap = new Map((result?.wrongQuestions ?? []).map((item) => [item.questionId, questions.find((question) => question.id === item.questionId)]));
  const wrongQuestions = [...wrongQuestionMap.values()].filter(Boolean) as QuizQuestion[];
  const pool = wrongQuestions.length > 0 ? wrongQuestions : questions.filter((item) => weak.some((kp) => kp.id === item.knowledgePointId));
  const subjectType = weak[0]?.subjectType || inferSubjectType(weak.map((item) => item.title + item.description).join('\n'));
  const isTrig = /三角|sin|cos|tan/.test(weak.map((item) => `${item.title}${item.description}${item.sourceEvidence}`).join('\n'));

  return weak.slice(0, 5).map((item, index) => {
    const sourceQuestion = pool[index % Math.max(pool.length, 1)];
    const pattern = sourceQuestion?.examPattern || item.examPatterns?.[index % Math.max(item.examPatterns.length, 1)] || getQuestionPatternPlan(subjectType)[index] || '变式迁移题';
    const formula = item.formulas?.[0] || (isTrig ? 'sin²α + cos²α = 1；tanα = sinα / cosα' : '资料中的关键公式/规则');
    const trigQuestion = index % 2 === 0
      ? '已知 tanα = 5/12，且 α 在第二象限，求 sinα、cosα，并写出完整步骤。'
      : '请证明恒等式：1 - sin²α = cos²α，并说明它与同角三角函数基本关系的联系。';
    const genericQuestion = pattern === '条件辨析题'
      ? `将原题条件换成新语境：围绕“${item.title}”，判断下列表述是否符合材料依据，并说明理由。`
      : `围绕“${item.title}”完成一道同类变式题：先写考点依据，再写标准步骤，最后指出易错点。`;
    const answer = isTrig && index % 2 === 0
      ? '设 sinα = 5k，cosα = 12k，由 sin²α + cos²α = 1 得 169k² = 1，所以 |k| = 1/13。第二象限 sinα > 0、cosα < 0，因此 sinα = 5/13，cosα = -12/13。'
      : isTrig
        ? '由 sin²α + cos²α = 1 移项可得 1 - sin²α = cos²α。证明时要写清使用的是同角三角函数平方关系。'
        : `答案应包含“${item.title}”的考点依据、材料证据、条件分析和规范结论。`;
    return {
      id: `reinforce-${index + 1}`,
      knowledgePointTitle: item.title,
      examPattern: pattern,
      question: isTrig ? trigQuestion : genericQuestion,
      hint: `先定位考点，再写公式/规则：${formula}；最后检查条件和易错项。`,
      answer,
      solutionSteps: isTrig
        ? ['写出 tanα = sinα / cosα', '设 sinα、cosα 的比例参数', '代入 sin²α + cos²α = 1 求参数', '根据象限确定正负号并写结论']
        : defaultStepsFor(item, pattern),
      scoringRubric: isTrig
        ? ['写出正确公式', '正确设参并代入平方关系', '根据象限判断正负号', '最终答案完整']
        : defaultRubricFor(item, pattern),
      commonMistake: item.commonMistakes?.[0] || (isTrig ? '只求平方值，忘记根据象限判断正负号。' : '脱离材料依据，只写泛泛结论。'),
      sourceQuestionId: sourceQuestion?.id,
      sourceEvidence: item.sourceEvidence,
      difficulty: index < 2 ? '中等' : '较难',
    };
  });
};
