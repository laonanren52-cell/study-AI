import type {
  DiagnosisItem,
  KnowledgePoint,
  QuizQuestion,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
  UserAnswer,
} from '../types';
import { evaluateQuizAnswers } from '../utils/scoring';

const USE_REAL_AI = false;

// 后续可在此处接入 OpenAI / 通义千问 / 智谱 / DeepSeek 等大模型 API。
const realAiPlaceholder = async () => {
  if (USE_REAL_AI) {
    throw new Error('真实 AI API 尚未配置，请在 aiService.ts 中补充 API Key 和请求逻辑。');
  }
};

export const extractKnowledgePoints = async (materialText: string): Promise<KnowledgePoint[]> => {
  await realAiPlaceholder();
  const hasEducation = materialText.includes('教育') || materialText.includes('学习');
  return [
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
      title: hasEducation ? 'AI 教育应用' : 'AI 应用迁移',
      description: 'AI 可用于智能推荐、自动批改、学习分析、个性化辅导和自适应练习。',
      importance: '中',
      masteryTarget: '能将 AI 能力映射到具体教育应用场景。',
      examType: '应用设计、开放表达',
    },
  ];
};

export const generateQuiz = async (knowledgePoints: KnowledgePoint[]): Promise<QuizQuestion[]> => {
  await realAiPlaceholder();
  const kp = (id: string) => knowledgePoints.find((item) => item.id === id)?.id ?? knowledgePoints[0].id;
  return [
    {
      id: 'q1',
      type: 'single',
      question: '人工智能的核心目标更接近以下哪一项？',
      options: ['只提高计算机硬件速度', '让机器模拟和扩展人类智能能力', '替代所有传统软件', '只处理表格数据'],
      answer: '让机器模拟和扩展人类智能能力',
      explanation: '人工智能关注感知、理解、推理、学习和决策等智能能力。',
      knowledgePointId: kp('kp-ai'),
      difficulty: '简单',
    },
    {
      id: 'q2',
      type: 'single',
      question: '机器学习与深度学习的关系是？',
      options: ['深度学习是机器学习的一个分支', '机器学习是深度学习的一个分支', '二者完全无关', '二者只是同一个概念的不同说法'],
      answer: '深度学习是机器学习的一个分支',
      explanation: '深度学习通常使用多层神经网络，是机器学习中的重要方向。',
      knowledgePointId: kp('kp-ml-dl'),
      difficulty: '简单',
    },
    {
      id: 'q3',
      type: 'single',
      question: '使用带标签数据训练猫狗图片分类模型，最符合哪类学习方式？',
      options: ['监督学习', '无监督学习', '强化学习', '规则检索'],
      answer: '监督学习',
      explanation: '带标签数据训练分类模型是监督学习的典型任务。',
      knowledgePointId: kp('kp-learning-types'),
      difficulty: '简单',
    },
    {
      id: 'q4',
      type: 'single',
      question: '神经网络中用于逐步学习复杂特征的结构通常是？',
      options: ['文件夹', '隐藏层', '数据库表', '浏览器缓存'],
      answer: '隐藏层',
      explanation: '隐藏层负责对输入进行多级变换，是深度学习模型的重要组成。',
      knowledgePointId: kp('kp-neural-network'),
      difficulty: '中等',
    },
    {
      id: 'q5',
      type: 'single',
      question: '模型训练集表现很好，但新数据表现较差，最可能是？',
      options: ['过拟合', '欠拟合', '数据压缩', '无监督学习'],
      answer: '过拟合',
      explanation: '过拟合说明模型过度记住训练数据，泛化能力不足。',
      knowledgePointId: kp('kp-fit'),
      difficulty: '中等',
    },
    {
      id: 'q6',
      type: 'judge',
      question: '无监督学习通常依赖人工标注好的标签数据。',
      answer: '错误',
      explanation: '无监督学习使用未标注数据，主要发现数据中的潜在结构。',
      knowledgePointId: kp('kp-learning-types'),
      difficulty: '简单',
    },
    {
      id: 'q7',
      type: 'judge',
      question: '强化学习强调智能体在环境中通过奖励反馈学习行动策略。',
      answer: '正确',
      explanation: '奖励反馈和策略优化是强化学习的关键特征。',
      knowledgePointId: kp('kp-learning-types'),
      difficulty: '中等',
    },
    {
      id: 'q8',
      type: 'judge',
      question: 'AI 在教育中只能用于自动批改，不能支持个性化复习。',
      answer: '错误',
      explanation: 'AI 可以结合学习分析和推荐算法生成个性化复习路径。',
      knowledgePointId: kp('kp-edu'),
      difficulty: '简单',
    },
    {
      id: 'q9',
      type: 'short',
      question: '请简要说明过拟合的含义，并指出它为什么会影响模型应用。',
      answer: '过拟合是模型在训练数据上表现很好，但在新数据上泛化能力较差，因此会影响真实应用效果。',
      explanation: '回答中应包含训练数据表现好、新数据表现差、泛化能力不足等关键词。',
      knowledgePointId: kp('kp-fit'),
      difficulty: '较难',
    },
    {
      id: 'q10',
      type: 'short',
      question: '结合学习资料，说明 AI 如何帮助学生进行个性化复习。',
      answer: 'AI 可以分析学生答题表现，识别薄弱知识点，推荐复习计划和针对性练习。',
      explanation: '回答中应覆盖表现分析、薄弱点识别、复习推荐或练习生成。',
      knowledgePointId: kp('kp-edu'),
      difficulty: '较难',
    },
  ];
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
    return {
      id: `diag-${question.id}`,
      questionId: question.id,
      question: question.question,
      knowledgePointTitle: kp?.title ?? '相关知识点',
      reasonType,
      diagnosis: `你的答案“${answerMap.get(question.id) || '未作答'}”没有准确命中本题考查点，说明对“${kp?.title ?? '该知识点'}”的理解还不稳定。`,
      correctUnderstanding: question.explanation,
      suggestion:
        reasonType === '表达不完整'
          ? '复习时先列出关键词，再用一句完整的话解释概念、原因和应用影响。'
          : '重新阅读知识点说明，并用“概念定义 + 典型场景 + 易错点”的方式整理笔记。',
    };
  });
};

export const generateReviewPlan = async (
  diagnosis: DiagnosisItem[],
  weakKnowledgePoints: KnowledgePoint[],
): Promise<ReviewPlanDay[]> => {
  await realAiPlaceholder();
  const focus = weakKnowledgePoints.length > 0 ? weakKnowledgePoints.map((item) => item.title) : ['机器学习与深度学习', '三类学习范式'];
  return [
    {
      day: 1,
      goal: '巩固人工智能、机器学习、深度学习的基础概念。',
      focusKnowledgePoints: focus.slice(0, 2),
      duration: '30 分钟',
      practiceCount: 5,
      method: '用层级图整理概念关系，完成概念辨析题并复述核心定义。',
    },
    {
      day: 2,
      goal: '强化监督学习、无监督学习、强化学习的区别。',
      focusKnowledgePoints: focus.length > 2 ? focus.slice(1, 4) : ['三类学习范式', ...focus],
      duration: '40 分钟',
      practiceCount: 6,
      method: '按训练数据、反馈方式、应用场景三列制作对比表，再做场景判断题。',
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
  const weak = weakKnowledgePoints.length > 0 ? weakKnowledgePoints : [
    { title: '机器学习与深度学习' },
    { title: '过拟合与欠拟合' },
    { title: 'AI 教育应用' },
  ] as KnowledgePoint[];

  return weak.slice(0, 5).map((item, index) => ({
    id: `reinforce-${index + 1}`,
    question:
      index % 2 === 0
        ? `请用一个学习场景解释“${item.title}”为什么重要。`
        : `给出一个容易混淆“${item.title}”的错误说法，并进行纠正。`,
    knowledgePointTitle: item.title,
    hint: '先写概念，再写场景，最后写判断依据。',
    answer: `围绕“${item.title}”作答时，应包含核心定义、适用条件和常见误区，并能联系学习资料中的案例说明。`,
  }));
};
