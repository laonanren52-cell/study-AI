/**
 * 高质量 fallback 工厂 - 基于命题蓝图生成考试级题目
 * 当 API 不可用时，仍能生成有考试价值的题目
 * 新增：strictSourceMode + materialTopic 约束，禁止跨章节乱出题
 */
import type {
  KnowledgeCard,
  KnowledgePoint,
  QuestionBlueprint,
  QuizQuestion,
  QuizSettings,
  SubjectType,
  ExamQuestionPattern,
  Difficulty,
} from '../types';
import type { MaterialTopic } from './materialTopicService';
import { normalizedStemHash, verifyQuestionTopicAlignment } from './questionTopicVerifier';

// ========== 学科判断 ==========

const isMathSubject = (subject: string): boolean =>
  subject === '数学';

const isChineseSubject = (subject: string): boolean =>
  subject === '语文';

const isEnglishSubject = (subject: string): boolean =>
  subject === '英语';

const isPhysicsSubject = (subject: string): boolean =>
  subject === '物理';

const isChemistrySubject = (subject: string): boolean =>
  subject === '化学';

const isBiologySubject = (subject: string): boolean =>
  subject === '生物';

const isGeographySubject = (subject: string): boolean =>
  subject === '地理';

const isHistorySubject = (subject: string): boolean =>
  subject === '历史';

const isPoliticsSubject = (subject: string): boolean =>
  subject === '政治';

// ========== 三角函数相关模板（仅三角函数） ==========

/** 严格按同角三角函数基本关系出题 */
const TRIG_BASIC_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string; tags: string[] }> = [
  {
    q: '已知 tanα = -3/4，且α是第二象限角，则 sinα =（  ）',
    opts: ['A. 3/5', 'B. -3/5', 'C. 4/5', 'D. -4/5'],
    ans: 'A. 3/5', ansIdx: 0, pattern: '公式套用题' as ExamQuestionPattern,
    steps: ['设sinα=3k, cosα=-4k', '代入 sin²α+cos²α=1', '解k=1/5', '第二象限 sinα>0，故 sinα=3/5'],
    mistake: '忽略象限判断正负号',
    tags: ['tan', '象限', 'sin', 'cos'],
  },
  {
    q: '已知 sinα = 3/5，且α是第二象限角，则 tanα =（  ）',
    opts: ['A. 3/4', 'B. -3/4', 'C. 4/3', 'D. -4/3'],
    ans: 'B. -3/4', ansIdx: 1, pattern: '公式套用题' as ExamQuestionPattern,
    steps: ['sinα=3/5, α是第二象限，cosα<0', 'cosα=-√(1-9/25)=-4/5', 'tanα=sinα/cosα=-3/4'],
    mistake: '第二象限余弦为负忽略',
    tags: ['sin', 'cos', 'tan', '象限'],
  },
  {
    q: '已知 sinα = 1/2，且α是锐角，则 cosα =（  ）',
    opts: ['A. √3/2', 'B. 1/2', 'C. √2/2', 'D. √3/3'],
    ans: 'A. √3/2', ansIdx: 0, pattern: '公式套用题' as ExamQuestionPattern,
    steps: ['cosα=√(1-sin²α)=√(1-1/4)=√(3/4)=√3/2', '锐角cosα>0'],
    mistake: '忘记开平方或符号判断错误',
    tags: ['sin', 'cos'],
  },
  {
    q: '在同角三角函数化简中，若 α 为任意角且表达式有意义，下列等式恒成立的是（  ）',
    opts: ['A. sin²α + cos²α = 1', 'B. sin²α - cos²α = 1', 'C. sinα + cosα = 1', 'D. tanα × cotα = 0'],
    ans: 'A. sin²α + cos²α = 1', ansIdx: 0, pattern: '基础概念题' as ExamQuestionPattern,
    steps: ['A是同角三角函数平方关系，恒成立', 'B、C、D均不恒成立'],
    mistake: '混淆同角三角函数基本关系',
    tags: ['sin²α', 'cos²α', '恒等式'],
  },
  {
    q: '若 α 是第三象限角，且 sinα = -3/5，则 cosα 的值为（  ）',
    opts: ['A. -4/5', 'B. 4/5', 'C. -3/5', 'D. 3/5'],
    ans: 'A. -4/5', ansIdx: 0, pattern: '条件辨析题' as ExamQuestionPattern,
    steps: ['cosα=±√(1-9/25)=±4/5', 'α是第三象限角，cosα<0', '所以cosα=-4/5'],
    mistake: '象限符号判断错误',
    tags: ['sin', 'cos', '象限', '第三象限'],
  },
  {
    q: '化简：sin²α + cos²α + tan²α · cos²α =（  ）',
    opts: ['A. 1 + sin²α', 'B. 1 + cos²α', 'C. 2', 'D. 1'],
    ans: 'A. 1 + sin²α', ansIdx: 0, pattern: '变式迁移题' as ExamQuestionPattern,
    steps: ['sin²α+cos²α=1', 'tan²α·cos²α=sin²α', '原式=1+sin²α'],
    mistake: '忘记tanα·cosα=sinα',
    tags: ['sin²α', 'cos²α', 'tan', '化简'],
  },
  {
    q: '已知 tanα = 4/3，且α是第一象限角，则 sinα 和 cosα 的值分别为（  ）',
    opts: ['A. 4/5, 3/5', 'B. 3/5, 4/5', 'C. 4/5, -3/5', 'D. -4/5, 3/5'],
    ans: 'A. 4/5, 3/5', ansIdx: 0, pattern: '公式套用题' as ExamQuestionPattern,
    steps: ['tanα=4/3, 设sinα=4k, cosα=3k', '代入sin²α+cos²α=1得25k²=1, k=1/5', '第一象限sinα>0, cosα>0', 'sinα=4/5, cosα=3/5'],
    mistake: '忽略第一象限为正的条件',
    tags: ['tan', 'sin', 'cos', '象限'],
  },
  {
    q: '判断正误：若 α 是第二象限角，则 sinα > 0，cosα < 0。（  ）',
    opts: ['A. 正确', 'B. 错误'],
    ans: 'A. 正确', ansIdx: 0, pattern: '易错判断题' as ExamQuestionPattern,
    steps: ['第二象限：sinα>0, cosα<0, tanα<0', '结论正确'],
    mistake: '混淆各象限三角函数值的正负号',
    tags: ['象限', 'sin', 'cos', '正负号'],
  },
  {
    q: '已知 cotα = 3/4，且 α 是第三象限角，则 sinα =（  ）',
    opts: ['A. -4/5', 'B. 4/5', 'C. -3/5', 'D. 3/5'],
    ans: 'A. -4/5', ansIdx: 0, pattern: '条件辨析题' as ExamQuestionPattern,
    steps: ['cotα=cosα/sinα=3/4', '设cosα=3k, sinα=4k', '代入sin²α+cos²α=1得25k²=1, k=1/5', '第三象限sinα<0，所以sinα=-4/5'],
    mistake: '第三象限正弦为负',
    tags: ['sin', 'cos', 'cot', '象限', '第三象限'],
  },
  {
    q: '若 sinθ + cosθ = 1/5，且 θ 在 0~π 之间，则 sinθ - cosθ =（  ）',
    opts: ['A. 7/5', 'B. -7/5', 'C. ±7/5', 'D. 1/5'],
    ans: 'A. 7/5', ansIdx: 0, pattern: '变式迁移题' as ExamQuestionPattern,
    steps: ['(sinθ+cosθ)²=1+2sinθcosθ=1/25', '2sinθcosθ=-24/25', '(sinθ-cosθ)²=1-2sinθcosθ=49/25', 'θ在0~π且sinθcosθ<0说明θ在第二象限', 'sinθ-cosθ>0, 所以sinθ-cosθ=7/5'],
    mistake: '忽略符号判断',
    tags: ['sin', 'cos', '象限', '平方关系'],
  },
];

// ========== 通用数学题（仅当 strictSourceMode=false 时使用） ==========

const GENERAL_MATH_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string; tags: string[] }> = [
  {
    q: '已知函数 f(x)=sin(2x+π/3)，则函数的最小正周期为（  ）',
    opts: ['A. π', 'B. 2π', 'C. π/2', 'D. 4π'],
    ans: 'A. π', ansIdx: 0, pattern: '公式套用题' as ExamQuestionPattern,
    steps: ['T=2π/|ω|', 'ω=2', 'T=π'],
    mistake: '混淆正弦函数周期公式',
    tags: ['三角函数', '周期'],
  },
  {
    q: '已知 210° 位于第三象限，且参考角为 30°，则 sin 210° 的值等于（  ）',
    opts: ['A. -1/2', 'B. 1/2', 'C. -√3/2', 'D. √3/2'],
    ans: 'A. -1/2', ansIdx: 0, pattern: '基础概念题' as ExamQuestionPattern,
    steps: ['210°在第三象限', 'sin210°=-sin30°=-1/2'],
    mistake: '诱导公式符号错误',
    tags: ['三角函数', '诱导公式'],
  },
];

const QUADRATIC_QUESTIONS: typeof GENERAL_MATH_QUESTIONS = [
  { q: '已知二次函数 y=x²-4x+3，则该函数图像的顶点坐标为（  ）', opts: ['A. (2,-1)', 'B. (-2,-1)', 'C. (2,1)', 'D. (-2,1)'], ans: 'A. (2,-1)', ansIdx: 0, pattern: '公式套用题', steps: ['配方得y=(x-2)²-1', '顶点坐标为(2,-1)'], mistake: '配方时常数项处理错误', tags: ['二次函数', '顶点', '配方'] },
  { q: '抛物线 y=-2(x+1)²+5 的开口方向和最大值分别为（  ）', opts: ['A. 向下，5', 'B. 向上，5', 'C. 向下，-1', 'D. 向上，-1'], ans: 'A. 向下，5', ansIdx: 0, pattern: '条件辨析题', steps: ['二次项系数-2<0，开口向下', '顶点为(-1,5)，最大值为5'], mistake: '忽略二次项系数符号', tags: ['二次函数', '抛物线', '最值'] },
  { q: '二次函数 y=x²+2x-8 与 x 轴的交点横坐标为（  ）', opts: ['A. 2和-4', 'B. -2和4', 'C. 1和-8', 'D. -1和8'], ans: 'A. 2和-4', ansIdx: 0, pattern: '变式迁移题', steps: ['令y=0', '分解(x+4)(x-2)=0', '得到x=-4或x=2'], mistake: '因式分解或符号判断错误', tags: ['二次函数', '零点', '因式分解'] },
];

const EQUATION_QUESTIONS: typeof GENERAL_MATH_QUESTIONS = [
  { q: '某同学解一元一次方程 3x-7=11，需要先移项再合并同类项，则 x 的值为（  ）', opts: ['A. 6', 'B. 4', 'C. -6', 'D. -4'], ans: 'A. 6', ansIdx: 0, pattern: '公式套用题', steps: ['移项得3x=18', '两边除以3得x=6'], mistake: '移项时符号错误', tags: ['方程', '移项', '未知数'] },
  { q: '方程组 x+y=7，x-y=1 的解为（  ）', opts: ['A. x=4,y=3', 'B. x=3,y=4', 'C. x=6,y=1', 'D. x=1,y=6'], ans: 'A. x=4,y=3', ansIdx: 0, pattern: '条件辨析题', steps: ['两式相加得2x=8', 'x=4', '代回得y=3'], mistake: '消元后代回错误', tags: ['方程组', '消元', '未知数'] },
  { q: '不等式 2x+3>9 的解集为（  ）', opts: ['A. x>3', 'B. x<3', 'C. x>6', 'D. x<6'], ans: 'A. x>3', ansIdx: 0, pattern: '公式套用题', steps: ['移项得2x>6', '除以正数2，不等号方向不变', 'x>3'], mistake: '不等号方向判断错误', tags: ['不等式', '移项', '解集'] },
];

const GEOMETRY_QUESTIONS: typeof GENERAL_MATH_QUESTIONS = [
  { q: '在直角三角形 ABC 中，∠C=90°，AC=3，BC=4，则 AB 的长度为（  ）', opts: ['A. 5', 'B. 6', 'C. 7', 'D. 8'], ans: 'A. 5', ansIdx: 0, pattern: '公式套用题', steps: ['使用勾股定理AB²=AC²+BC²', 'AB²=9+16=25', 'AB=5'], mistake: '混淆直角边与斜边', tags: ['几何', '三角形', '定理'] },
  { q: '在△ABC 和△DEF 中，已知∠A=∠D、∠B=∠E，仅凭这两组对应角相等，可判断两个三角形（  ）', opts: ['A. 相似', 'B. 全等', 'C. 面积一定相等', 'D. 周长一定相等'], ans: 'A. 相似', ansIdx: 0, pattern: '条件辨析题', steps: ['两组对应角相等可判定两三角形相似', '不能直接推出全等'], mistake: '混淆相似与全等判定', tags: ['几何', '三角形', '相似'] },
  { q: '在圆形花坛设计中，若花坛半径为 3 米，则该圆形花坛的面积为（  ）', opts: ['A. 9π', 'B. 6π', 'C. 3π', 'D. 18π'], ans: 'A. 9π', ansIdx: 0, pattern: '公式套用题', steps: ['圆面积S=πr²', '代入r=3得S=9π'], mistake: '混淆圆面积与周长公式', tags: ['几何', '圆', '面积'] },
];

// ========== 主入口 ==========

/**
 * 从蓝图生成 fallback 题目。
 * @param blueprints 命题蓝图列表
 * @param knowledgeCards 考点卡列表
 * @param settings 出题设置（含 strictSourceMode）
 * @param materialTopic 资料主题（用于严格模式下的模板过滤）
 * @returns 生成的题目列表
 */
export const generateFallbackQuestionsFromBlueprints = (
  blueprints: QuestionBlueprint[],
  knowledgeCards: KnowledgeCard[],
  settings?: QuizSettings,
  materialTopic?: MaterialTopic,
  seed = Date.now()
): QuizQuestion[] => {
  const targetCount = settings?.questionCount ?? blueprints.length;
  const strictMode = settings?.strictSourceMode !== false; // 默认开启
  const result: QuizQuestion[] = [];

  // 判断是否应该是三角函数相关的题库
  const isTrigTopic = materialTopic?.topicTag?.includes('三角函数') || 
    materialTopic?.topicTag === '同角三角函数基本关系' ||
    blueprints.some(bp => bp.knowledgePoint?.includes('三角函数') || bp.knowledgePoint?.includes('sin'));

  for (let i = 0; i < Math.min(blueprints.length, targetCount); i++) {
    const blueprint = blueprints[i];
    const card = knowledgeCards.find(kc => kc.id === blueprint.knowledgeCardId);
    const subject = materialTopic?.subject || card?.subject || (settings?.subjectType as string) || '';
    
    let question: QuizQuestion | null;
    const strategyIdx = Math.abs(seed + i) % 1000;

    if (isTrigTopic) {
      // 资料主题优先级高于知识卡的学科标签，避免 Mock 提取为“通用”后退回泛题。
      question = buildMathFallbackQuestion(blueprint, card, strategyIdx, strictMode, true, materialTopic);
    } else if (isMathSubject(subject)) {
      // 数学：严格模式下只使用主题匹配的题库
      question = buildMathFallbackQuestion(blueprint, card, strategyIdx, strictMode, isTrigTopic, materialTopic);
    } else if (isChineseSubject(subject)) {
      question = buildChineseFallbackQuestion(blueprint, card, strategyIdx);
    } else if (isEnglishSubject(subject)) {
      question = buildEnglishFallbackQuestion(blueprint, card, strategyIdx);
    } else if (isPhysicsSubject(subject)) {
      question = buildPhysicsFallbackQuestion(blueprint, card, strategyIdx);
    } else if (isChemistrySubject(subject)) {
      question = buildChemistryFallbackQuestion(blueprint, card, strategyIdx);
    } else if (isBiologySubject(subject)) {
      question = buildBiologyFallbackQuestion(blueprint, card, strategyIdx);
    } else if (isGeographySubject(subject)) {
      question = buildGeographyFallbackQuestion(blueprint, card, strategyIdx);
    } else if (isHistorySubject(subject)) {
      question = buildHistoryFallbackQuestion(blueprint, card, strategyIdx);
    } else if (isPoliticsSubject(subject)) {
      question = buildPoliticsFallbackQuestion(blueprint, card, strategyIdx);
    } else {
      continue;
    }

    if (!question) continue;
    question.templateId = question.templateId || materialTopic?.allowedTemplateIds[0];
    question.qualityScore = 90;
    question.subject = subject as SubjectType;
    question.isLowQuality = false;
    result.push(question);
  }

  return result.filter((question) => {
    if (materialTopic && materialTopic.topicTag !== '通用知识' && !verifyQuestionTopicAlignment(question, materialTopic).passed) {
      return false;
    }
    return true;
  }).map((question) => ({
    ...question,
    normalizedStemHash: normalizedStemHash(question.question),
  }));
};

// ========== 生成 helper 函数 ==========

const buildQuestionBase = (
  bp: QuestionBlueprint,
  question: string,
  type: QuizQuestion['type'],
  options: string[] | undefined,
  answer: string,
  answerIdx: number,
  explanation: string,
  examPattern: ExamQuestionPattern,
  scoringPoints: string[],
  solutionSteps: string[],
  commonMistake: string,
): QuizQuestion => {
  const cleanOpts = options ? options.map(o => o.replace(/^[A-D][.、]\s*/, '')) : undefined;
  const cleanAns = String(answer).replace(/^[A-D][.、]\s*/, '');
  const ansIdx = cleanOpts ? cleanOpts.findIndex(o => o === cleanAns) : answerIdx;
  return {
    id: `fallback-${bp.id}`,
    type,
    question,
    options: cleanOpts,
    answer: cleanAns,
    correctOptionLabel: ansIdx >= 0 && cleanOpts ? (String.fromCharCode(65 + ansIdx) as 'A' | 'B' | 'C' | 'D') : undefined,
    explanation,
    knowledgePointId: bp.knowledgeCardId,
    difficulty: bp.difficulty,
    examPattern,
    blueprintId: bp.id,
    templateId: bp.templateId,
    targetAbility: bp.targetAbility,
    requiredMethods: bp.requiredMethods,
    scoringRubric: scoringPoints,
    solutionSteps,
    commonMistake,
    sourceEvidence: bp.sourceEvidence,
    optionExplanations: cleanOpts ? Object.fromEntries(cleanOpts.map((o, i) => [
      String.fromCharCode(65 + i),
      i === ansIdx ? '正确' : `错误：${bp.commonWrongMethods?.[Math.min(i - 1, bp.commonWrongMethods.length - 1)] || '判断有误'}`
    ])) : undefined,
    qualityScore: 0,
  };
};

// ========== 数学类 fallback ==========

/**
 * 构建数学 fallback 题目。
 * strictMode=true 且是三角函数主题时，只从 TRIG_BASIC_QUESTIONS 出题。
 */
const buildMathFallbackQuestion = (
  bp: QuestionBlueprint,
  card: KnowledgeCard | undefined,
  idx: number,
  strictMode: boolean,
  isTrigTopic: boolean,
  materialTopic?: MaterialTopic
): QuizQuestion | null => {
  let pool: typeof TRIG_BASIC_QUESTIONS;

  if (strictMode && isTrigTopic) {
    // 严格模式 + 三角函数主题：只使用三角函数题库
    pool = TRIG_BASIC_QUESTIONS;
  } else if (!strictMode && isTrigTopic) {
    // 非严格模式 + 三角函数主题：三角函数 + 少量相关数学题
    pool = [...TRIG_BASIC_QUESTIONS, ...GENERAL_MATH_QUESTIONS];
  } else if (materialTopic?.topicTag.includes('二次函数')) {
    pool = QUADRATIC_QUESTIONS;
  } else if (materialTopic?.chapterTag.includes('方程')) {
    pool = EQUATION_QUESTIONS;
  } else if (materialTopic?.chapterTag.includes('几何')) {
    pool = GEOMETRY_QUESTIONS;
  } else if (!strictMode) {
    pool = GENERAL_MATH_QUESTIONS;
  } else {
    return null;
  }

  const qi = pool[idx % pool.length];
  return buildQuestionBase(bp, qi.q, 'single', qi.opts, qi.ans, qi.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${qi.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    qi.pattern, bp.scoringPoints, qi.steps, qi.mistake);
};

// ========== 语文类 ==========

const CHINESE_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '在修改作文片段时，需要判断引号和冒号的用法。下列各句中，标点符号使用正确的一项是（  ）', opts: ['A. "到底去不去？"小明问。', 'B. 我喜欢读《读者》、《青年文摘》等杂志。', 'C. "好，"他笑着说，"我答应你。"', 'D. 她终于明白了：原来如此！'], ans: 'D. 她终于明白了：原来如此！', ansIdx: 3, pattern: '基础概念题' as ExamQuestionPattern, steps: ['A中问号应在引号内', 'B中顿号多余', 'C中逗号应在引号内', 'D正确'], mistake: '引号与标点位置混淆' },
  { q: '老师要求修改病句并保留原意，下列四个句子中，没有语病的一项是（  ）', opts: ['A. 通过这次学习，使我的认识有了很大提高。', 'B. 能否坚持锻炼是身体健康的重要保证。', 'C. 我们要养成认真读书的习惯。', 'D. 这篇文章的内容和见解都很丰富。'], ans: 'C. 我们要养成认真读书的习惯。', ansIdx: 2, pattern: '基础概念题' as ExamQuestionPattern, steps: ['A缺主语', 'B两面对一面', 'C正确', 'D搭配不当'], mistake: '未能识别成分残缺' },
  { q: '阅读诗句“春风又绿江南岸”，其中“绿”字的表达效果最恰当的是（  ）', opts: ['A. 化静为动，写出春风使江南焕发生机', 'B. 说明江岸只剩绿色', 'C. 强调春风颜色鲜艳', 'D. 表达诗人对夏日炎热的不满'], ans: 'A. 化静为动，写出春风使江南焕发生机', ansIdx: 0, pattern: '材料分析题', steps: ['联系诗句语境', '分析“绿”字的动词用法', '判断表达效果'], mistake: '只解释字面意思，忽略炼字效果' },
];

const buildChineseFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = CHINESE_QUESTIONS[idx % CHINESE_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 英语类 ==========

const ENGLISH_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: 'Tom exercises for thirty minutes every day because it helps him stay energetic in class. What is the main idea of the sentence?', opts: ['A. Regular exercise helps Tom stay energetic.', 'B. Tom dislikes his classes.', 'C. Tom exercises only on weekends.', 'D. Exercise makes Tom feel sleepy.'], ans: 'A. Regular exercise helps Tom stay energetic.', ansIdx: 0, pattern: '材料分析题' as ExamQuestionPattern, steps: ['Read the complete context', 'Identify the cause and effect', 'Choose the matching summary'], mistake: '选择与语境细节不一致的选项' },
  { q: 'The new reading plan can enhance students’ confidence because they finish one short article each day. The word "enhance" is closest in meaning to（  ）', opts: ['A. improve', 'B. reduce', 'C. replace', 'D. ignore'], ans: 'A. improve', ansIdx: 0, pattern: '条件辨析题' as ExamQuestionPattern, steps: ['Read the full sentence', 'Use the positive result as a context clue', 'Match enhance with improve'], mistake: '忽略上下文中的积极语境' },
  { q: '—Where is Tom?\n—He ______ to the library. He will be back soon.', opts: ['A. has gone', 'B. has been', 'C. went', 'D. goes'], ans: 'A. has gone', ansIdx: 0, pattern: '基础概念题', steps: ['“He will be back soon”说明Tom去了图书馆还没回来', '使用has gone to'], mistake: '混淆has gone to与has been to' },
];

const buildEnglishFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = ENGLISH_QUESTIONS[idx % ENGLISH_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 物理类 ==========

const PHYSICS_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '一个质量为2kg的物体静止在水平面上，受到大小为10N的水平拉力，物体与水平面的动摩擦因数为0.2，则物体的加速度为（  ）（g=10m/s²）', opts: ['A. 3 m/s²', 'B. 5 m/s²', 'C. 2 m/s²', 'D. 4 m/s²'], ans: 'A. 3 m/s²', ansIdx: 0, pattern: '公式套用题' as ExamQuestionPattern, steps: ['f=μmg=0.2×2×10=4N', 'F合=F-f=10-4=6N', 'a=F合/m=6/2=3m/s²'], mistake: '忘记计算摩擦力' },
  { q: '自由下落的物体，第1秒内的位移与第2秒内的位移之比为（  ）', opts: ['A. 1:2', 'B. 1:3', 'C. 1:4', 'D. 1:5'], ans: 'B. 1:3', ansIdx: 1, pattern: '条件辨析题' as ExamQuestionPattern, steps: ['h1=½gt1²=5m', 'h2=½gt2²-½gt1²=15m', 'h1:h2=1:3'], mistake: '混淆第n秒内与前n秒' },
  { q: '某导体两端电压为 6V，通过它的电流为 0.3A。该导体的电阻为（  ）', opts: ['A. 20Ω', 'B. 2Ω', 'C. 1.8Ω', 'D. 0.05Ω'], ans: 'A. 20Ω', ansIdx: 0, pattern: '公式套用题', steps: ['根据欧姆定律R=U/I', '代入6V÷0.3A=20Ω'], mistake: '混淆欧姆定律中的物理量和单位' },
];

const buildPhysicsFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = PHYSICS_QUESTIONS[idx % PHYSICS_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 化学类 ==========

const CHEMISTRY_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '在氢气和氧气点燃生成水的反应中，需要同时检查反应物、生成物和配平。下列化学方程式正确的是（  ）', opts: ['A. 2H₂ + O₂ = 2H₂O', 'B. H₂ + O₂ = H₂O', 'C. 2H₂ + O₂ → H₂O', 'D. H₂ + O₂ → 2H₂O'], ans: 'A. 2H₂ + O₂ = 2H₂O', ansIdx: 0, pattern: '基础概念题' as ExamQuestionPattern, steps: ['检查配平', '检查产物', '检查反应条件'], mistake: '配平系数错误' },
  { q: '在无色透明的溶液中，能大量共存的是（  ）', opts: ['A. Fe³⁺、Cl⁻、SO₄²⁻', 'B. Cu²⁺、NO₃⁻、Cl⁻', 'C. K⁺、OH⁻、NO₃⁻', 'D. H⁺、CO₃²⁻、Na⁺'], ans: 'C. K⁺、OH⁻、NO₃⁻', ansIdx: 2, pattern: '条件辨析题' as ExamQuestionPattern, steps: ['A中Fe³⁺有色', 'B中Cu²⁺有色', 'C无色且不反应', 'D中H⁺与CO₃²⁻反应'], mistake: '忽略溶液颜色或离子反应' },
  { q: '在一定温度下，CH₃COOH 溶液中存在电离平衡。加入少量 CH₃COONa 固体后，CH₃COOH 的电离程度将（  ）', opts: ['A. 减小', 'B. 增大', 'C. 不变', 'D. 先增大后减小'], ans: 'A. 减小', ansIdx: 0, pattern: '条件辨析题', steps: ['CH₃COONa提供CH₃COO⁻', '同离子效应使电离平衡向左移动', '弱酸电离程度减小'], mistake: '忽略同离子效应对电离平衡的影响' },
];

const buildChemistryFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = CHEMISTRY_QUESTIONS[idx % CHEMISTRY_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 生物类 ==========

const BIOLOGY_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '在孟德尔分离定律中，一对相对性状的杂合子自交，后代表现型比例为（  ）', opts: ['A. 1:1', 'B. 3:1', 'C. 9:3:3:1', 'D. 1:2:1'], ans: 'B. 3:1', ansIdx: 1, pattern: '基础概念题' as ExamQuestionPattern, steps: ['Aa × Aa → AA:Aa:aa = 1:2:1', '显性:隐性 = 3:1'], mistake: '混淆分离比与自由组合比' },
  { q: '在观察绿色植物叶肉细胞结构时，若要判断光合作用发生的主要场所，应选择（  ）', opts: ['A. 线粒体', 'B. 叶绿体', 'C. 内质网', 'D. 高尔基体'], ans: 'B. 叶绿体', ansIdx: 1, pattern: '基础概念题' as ExamQuestionPattern, steps: ['光合作用在叶绿体中进行', '线粒体是有氧呼吸场所'], mistake: '混淆不同细胞器的功能' },
  { q: '学习遗传物质结构时，若题目要求判断 DNA 分子的基本组成单位，应选择（  ）', opts: ['A. 核糖核苷酸', 'B. 脱氧核糖核苷酸', 'C. 氨基酸', 'D. 单糖'], ans: 'B. 脱氧核糖核苷酸', ansIdx: 1, pattern: '基础概念题' as ExamQuestionPattern, steps: ['DNA组成单位是脱氧核糖核苷酸', 'RNA组成单位是核糖核苷酸'], mistake: '混淆DNA与RNA的基本组成单位' },
  { q: '某植物进行光合作用实验时，先在黑暗处放置 24 小时，再进行照光处理。暗处理的主要目的是（  ）', opts: ['A. 消耗叶片中原有淀粉', 'B. 增加叶片中叶绿素含量', 'C. 促进根部吸收无机盐', 'D. 提高植物呼吸速率'], ans: 'A. 消耗叶片中原有淀粉', ansIdx: 0, pattern: '材料分析题', steps: ['暗处理期间植物不能进行光合作用', '呼吸作用消耗原有淀粉', '排除实验前淀粉干扰'], mistake: '没有理解暗处理对实验变量的控制作用' },
];

const buildBiologyFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = BIOLOGY_QUESTIONS[idx % BIOLOGY_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 地理类 ==========

const GEOGRAPHY_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '某地等高线地形图中，甲处等高线比乙处密集。根据等高线疏密与坡度的关系，应判断（  ）', opts: ['A. 甲处坡度较陡', 'B. 乙处坡度较陡', 'C. 两处坡度相同', 'D. 无法根据等高线判断'], ans: 'A. 甲处坡度较陡', ansIdx: 0, pattern: '条件辨析题', steps: ['读取等高线疏密', '等高线越密集坡度越陡', '判断甲处坡度较陡'], mistake: '混淆等高线疏密与坡度关系' },
  { q: '分析某区域农业发展条件时，下列属于自然地理条件的是（  ）', opts: ['A. 气候与河流水源', 'B. 市场需求与交通', 'C. 劳动力数量', 'D. 政策支持'], ans: 'A. 气候与河流水源', ansIdx: 0, pattern: '材料分析题', steps: ['区分自然与人文因素', '气候和河流属于自然条件', '选择A'], mistake: '自然因素与人文因素混淆' },
  { q: '某城市位于河流交汇处且交通便利。该城市早期形成和发展的主要区位优势是（  ）', opts: ['A. 水运和交通条件较好', 'B. 矿产资源一定丰富', 'C. 海拔一定较高', 'D. 气候一定寒冷'], ans: 'A. 水运和交通条件较好', ansIdx: 0, pattern: '材料分析题', steps: ['提取河流交汇和交通便利', '对应城市区位条件', '形成结论'], mistake: '脱离材料添加不存在的区域条件' },
  { q: '某地 1 月均温 5℃，7 月均温 27℃，年降水量约 900mm，降水集中在夏季。该地最可能属于（  ）', opts: ['A. 亚热带季风气候', 'B. 热带雨林气候', 'C. 温带海洋性气候', 'D. 地中海气候'], ans: 'A. 亚热带季风气候', ansIdx: 0, pattern: '材料分析题', steps: ['分析冬夏气温特点', '识别降水集中在夏季', '判断为亚热带季风气候'], mistake: '只看降水总量，忽略季节分配' },
];

const buildGeographyFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = GEOGRAPHY_QUESTIONS[idx % GEOGRAPHY_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 历史类 ==========

const HISTORY_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '阅读材料：“自强以练兵为要，练兵又以制器为先。”该材料最能反映洋务运动的哪一主张？（  ）', opts: ['A. 学习西方先进技术', 'B. 建立民主共和制度', 'C. 废除封建土地制度', 'D. 实行闭关锁国政策'], ans: 'A. 学习西方先进技术', ansIdx: 0, pattern: '材料分析题', steps: ['提取“练兵”“制器”关键词', '对应洋务运动学习西方技术的主张'], mistake: '忽略材料关键词，混淆近代化探索事件' },
  { q: '1911 年爆发的辛亥革命产生的重要影响是（  ）', opts: ['A. 推翻清王朝统治', 'B. 完成反帝反封建任务', 'C. 建立社会主义制度', 'D. 结束中国半殖民地社会'], ans: 'A. 推翻清王朝统治', ansIdx: 0, pattern: '条件辨析题', steps: ['定位1911年辛亥革命', '判断直接历史影响'], mistake: '夸大辛亥革命的历史作用' },
  { q: '将下列世界史事件按时间先后排序：①法国大革命爆发 ②工业革命开始 ③第一次世界大战爆发。（  ）', opts: ['A. ②①③', 'B. ①②③', 'C. ③①②', 'D. ②③①'], ans: 'A. ②①③', ansIdx: 0, pattern: '易错判断题', steps: ['工业革命开始于18世纪60年代', '法国大革命爆发于1789年', '第一次世界大战爆发于1914年'], mistake: '历史时间线记忆混乱' },
];

const buildHistoryFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = HISTORY_QUESTIONS[idx % HISTORY_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【历史考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 政治类 ==========

const POLITICS_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '某中学生发现商家出售盗版书籍后，向有关部门举报。该行为主要体现了公民在行使（  ）', opts: ['A. 监督权', 'B. 人身自由权', 'C. 财产权', 'D. 受教育权'], ans: 'A. 监督权', ansIdx: 0, pattern: '材料分析题', steps: ['提取“向有关部门举报”', '对应公民依法行使监督权'], mistake: '混淆监督权与其他公民权利' },
  { q: '某社区组织居民参与垃圾分类志愿服务，并共同制定文明公约。该活动有利于（  ）', opts: ['A. 增强社会责任意识', 'B. 代替国家法律实施', 'C. 取消公民法定义务', 'D. 限制居民参与公共事务'], ans: 'A. 增强社会责任意识', ansIdx: 0, pattern: '材料分析题', steps: ['识别社区志愿服务情境', '判断其社会价值'], mistake: '把社会公约与国家法律混为一谈' },
  { q: '某校开展宪法宣传活动，强调任何组织和个人都不得有超越宪法和法律的特权。这体现了（  ）', opts: ['A. 法律面前人人平等', 'B. 权利可以脱离义务', 'C. 规则只约束未成年人', 'D. 法律由个人意愿决定'], ans: 'A. 法律面前人人平等', ansIdx: 0, pattern: '条件辨析题', steps: ['提取“不得有超越法律的特权”', '对应法律面前人人平等'], mistake: '忽略法治观念中的平等原则' },
];

const buildPoliticsFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = POLITICS_QUESTIONS[idx % POLITICS_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【政治考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};

// ========== 通用 fallback ==========

const GENERAL_QUESTIONS: Array<{ q: string; opts: string[]; ans: string; ansIdx: number; pattern: ExamQuestionPattern; steps: string[]; mistake: string }> = [
  { q: '阅读资料中给出的具体定义和适用条件后，若要判断该概念能否脱离材料使用，应选择（  ）', opts: ['A. 必须结合具体语境和资料依据理解', 'B. 可以完全脱离材料独立判断', 'C. 不需要原文依据也能判定', 'D. 只有一个固定不变的解释'], ans: 'A. 必须结合具体语境和资料依据理解', ansIdx: 0, pattern: '基础概念题' as ExamQuestionPattern, steps: ['定位材料中的定义', '结合语境分析', '判断是否符合材料本意'], mistake: '脱离材料凭主观印象判断' },
  { q: '阅读资料中“原因—结论”的论述片段后，需要判断论据与结论的关系，应选择（  ）', opts: ['A. 观点需要由材料中的具体证据支撑', 'B. 材料的主要目的只是介绍背景信息', 'C. 作者一定对论述话题持否定态度', 'D. 结论与前提之间必然存在矛盾'], ans: 'A. 观点需要由材料中的具体证据支撑', ansIdx: 0, pattern: '材料分析题' as ExamQuestionPattern, steps: ['找出材料主旨', '分析论据与结论的关系', '判断选项是否符合推理逻辑'], mistake: '过度推断或偷换概念' },
];

const buildGeneralFallbackQuestion = (bp: QuestionBlueprint, card: KnowledgeCard | undefined, idx: number): QuizQuestion => {
  const q = GENERAL_QUESTIONS[idx % GENERAL_QUESTIONS.length];
  return buildQuestionBase(bp, q.q, 'single', q.opts, q.ans, q.ansIdx,
    `【考点】${bp.knowledgePoint}。【解析】${q.steps.join('；')}。【材料依据】${bp.sourceEvidence}。`,
    q.pattern, bp.scoringPoints, q.steps, q.mistake);
};
