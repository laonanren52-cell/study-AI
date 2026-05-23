import type {
  DiagnosisItem,
  Importance,
  KnowledgePoint,
  QuizQuestion,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
  UserAnswer,
} from '../types';
import { evaluateQuizAnswers } from '../utils/scoring';

const AI_PROVIDER = import.meta.env.VITE_AI_PROVIDER ?? 'mock';
const USE_REAL_AI = AI_PROVIDER !== 'mock';

// 真实 API 预留入口：
// 1. 将 .env 中 VITE_AI_PROVIDER 改为 openai / deepseek / qwen。
// 2. 在这里读取 VITE_OPENAI_API_KEY / VITE_DEEPSEEK_API_KEY / VITE_QWEN_API_KEY。
// 3. 把下面 mock 结果替换为真实大模型结构化 JSON 输出。
const realAiPlaceholder = async () => {
  if (USE_REAL_AI) {
    throw new Error('真实 AI API 尚未配置，请先在 aiService.ts 中补充对应 Provider 的请求逻辑。');
  }
};

const signalKeywords = ['是', '包括', '分为', '特点', '作用', '原因', '影响', '应用', '区别', '流程', '原则'];
const lowValuePatterns = [/^第\s*\d+\s*页[:：]?$/, /^目录$/, /^谢谢观看$/, /^THANKS?$/i, /^Q\s*&\s*A$/i, /^页码$/];
const isLowValueSentence = (sentence: string) => lowValuePatterns.some((pattern) => pattern.test(sentence.trim()));
const splitText = (text: string) =>
  text
    .replace(/\r/g, '\n')
    .split(/[\n。！？!?；;]+/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^第\s*\d+\s*页[:：]?\s*/, '').trim())
    .filter((item) => item.length >= 6 && !isLowValueSentence(item));

const cleanTitle = (sentence: string, index: number) => {
  const beforeDefinition = sentence.split(/是|包括|分为|具有|指|：|:/)[0]?.trim();
  const candidate = beforeDefinition || sentence;
  return candidate
    .replace(/^第\s*\d+\s*页[:：]?/, '')
    .replace(/^(首先|其次|最后|因此|其中|例如|通过|对于|关于)/, '')
    .replace(/[，,].*$/, '')
    .slice(0, 16)
    .trim()
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9（）()《》-]/g, '') || `核心知识点 ${index + 1}`;
};

const inferImportance = (sentence: string, index: number): Importance => {
  if (/核心|关键|重要|必须|重点|原则|原因|影响/.test(sentence)) return '高';
  if (index < 3 || /应用|区别|流程|特点/.test(sentence)) return '中';
  return '低';
};

const inferExamType = (sentence: string) => {
  if (/区别|不同|对比/.test(sentence)) return '概念辨析、对比分析';
  if (/应用|场景|用于/.test(sentence)) return '应用场景判断、案例分析';
  if (/流程|步骤|过程/.test(sentence)) return '流程排序、步骤解释';
  if (/原因|影响/.test(sentence)) return '原因分析、影响判断';
  if (/原则|特点/.test(sentence)) return '要点识记、判断题';
  return '概念解释、简答表达';
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
  },
  {
    id: 'kp-ml-dl',
    title: '机器学习与深度学习',
    description: '机器学习通过数据训练模型改进表现，深度学习是机器学习的分支，依赖多层神经网络学习复杂特征。',
    importance: '高',
    masteryTarget: '能辨析人工智能、机器学习、深度学习的层级关系。',
    examType: '概念辨析、关系判断',
  },
  {
    id: 'kp-learning-types',
    title: '三类学习范式',
    description: '监督学习依赖标签，无监督学习发现数据结构，强化学习通过奖励反馈学习策略。',
    importance: '高',
    masteryTarget: '能根据数据标签、反馈方式和应用场景区分三类方法。',
    examType: '场景匹配、判断题',
  },
  {
    id: 'kp-neural-network',
    title: '神经网络组成',
    description: '神经网络通常包含输入层、隐藏层和输出层，训练时通过误差调整连接权重。',
    importance: '中',
    masteryTarget: '理解基本结构和权重调整的作用。',
    examType: '结构识别、流程理解',
  },
  {
    id: 'kp-fit',
    title: '过拟合与欠拟合',
    description: '过拟合泛化能力差，欠拟合无法学习有效规律，两者都影响模型在真实任务中的表现。',
    importance: '高',
    masteryTarget: '能判断模型表现对应的问题类型，并提出改进方向。',
    examType: '现象判断、原因分析',
  },
  {
    id: 'kp-edu',
    title: 'AI 教育应用',
    description: 'AI 可用于智能推荐、自动批改、学习分析、个性化辅导和自适应练习。',
    importance: '中',
    masteryTarget: '能将 AI 能力映射到具体教育应用场景。',
    examType: '应用设计、开放表达',
  },
];

export const extractKnowledgePoints = async (materialText: string): Promise<KnowledgePoint[]> => {
  await realAiPlaceholder();
  if (isSampleAiMaterial(materialText)) return sampleKnowledgePoints;

  const sentences = splitText(materialText);
  const signalSentences = sentences.filter((sentence) => signalKeywords.some((keyword) => sentence.includes(keyword)));
  const candidates = (signalSentences.length >= 4 ? signalSentences : sentences).slice(0, 8);
  while (candidates.length < 4) {
    candidates.push(
      candidates.length === 0
        ? '材料主题是本次学习测评的核心内容，需要先梳理定义、特点、作用和应用场景。'
        : `${candidates[candidates.length - 1]} 这一内容需要结合定义、特点和应用方式进行掌握。`,
    );
  }

  return candidates.slice(0, Math.max(4, Math.min(8, candidates.length))).map((sentence, index) => {
    const rawTitle = cleanTitle(sentence, index);
    const title = rawTitle.length < 2 ? `核心知识点 ${index + 1}` : rawTitle;
    const importance = inferImportance(sentence, index);
    return {
      id: `kp-${index + 1}`,
      title,
      description: sentence.length > 92 ? `${sentence.slice(0, 92)}...` : sentence,
      importance,
      masteryTarget:
        importance === '高'
          ? `能准确解释“${title}”，并能结合材料判断典型考查场景。`
          : `能复述“${title}”的核心含义，并识别常见表述。`,
      examType: inferExamType(sentence),
    };
  });
};

const difficultyByIndex = (index: number): QuizQuestion['difficulty'] => (index < 3 ? '简单' : index < 7 ? '中等' : '较难');

const uniqueDistractors = (knowledgePoints: KnowledgePoint[], current: KnowledgePoint) => {
  const others = knowledgePoints
    .filter((item) => item.id !== current.id)
    .map((item) => item.title)
    .filter((title) => title.length >= 2);
  const generic = ['相关背景概念', '材料中的辅助说明', '延伸应用场景', '复习补充内容'];
  return [...others, ...generic].slice(0, 3);
};

export const generateQuiz = async (knowledgePoints: KnowledgePoint[]): Promise<QuizQuestion[]> => {
  await realAiPlaceholder();
  const source = knowledgePoints.length > 0 ? knowledgePoints : sampleKnowledgePoints;
  const questions: QuizQuestion[] = [];

  source.slice(0, 5).forEach((point, index) => {
    const options = [point.title, ...uniqueDistractors(source, point)].slice(0, 4);
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'single',
      question: `根据资料，以下哪一项最符合“${point.title}”的考查重点？`,
      options,
      answer: point.title,
      explanation: point.description,
      knowledgePointId: point.id,
      difficulty: difficultyByIndex(index),
    });
  });

  source.slice(0, 3).forEach((point, index) => {
    const isPositive = index % 2 === 0;
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'judge',
      question: isPositive
        ? `“${point.title}”可以通过资料中的定义、特点或应用场景进行判断。`
        : `只要记住“${point.title}”这个名称，就不需要理解它的作用和考查方式。`,
      answer: isPositive ? '正确' : '错误',
      explanation: isPositive ? point.description : `资料不仅要求记住名称，还要理解“${point.title}”的含义、作用与考查方式。`,
      knowledgePointId: point.id,
      difficulty: difficultyByIndex(index + 5),
    });
  });

  source.slice(0, 2).forEach((point, index) => {
    questions.push({
      id: `q${questions.length + 1}`,
      type: 'short',
      question: `请结合学习资料，用自己的话说明“${point.title}”的核心含义和可能考查方式。`,
      answer: `${point.title}的核心含义是：${point.description} 常见考查方式包括：${point.examType}。`,
      explanation: `回答应包含“${point.title}”的含义、材料依据，以及“${point.examType}”等考查方向。`,
      knowledgePointId: point.id,
      difficulty: '较难',
    });
  });

  return questions.slice(0, 10);
};

export const evaluateAnswers = async (
  questions: QuizQuestion[],
  answers: UserAnswer[],
  knowledgePoints: KnowledgePoint[],
): Promise<QuizResult> => {
  await realAiPlaceholder();
  return evaluateQuizAnswers(questions, answers, knowledgePoints);
};

export const generateDiagnosis = async (
  result: QuizResult,
  questions: QuizQuestion[],
  answers: UserAnswer[],
): Promise<DiagnosisItem[]> => {
  await realAiPlaceholder();
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
  await realAiPlaceholder();
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
  await realAiPlaceholder();
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
