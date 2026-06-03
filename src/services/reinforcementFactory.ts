/**
 * 寮哄寲璁粌棰樺伐鍘?- 鐢熸垚鍚岀被鍙樺紡棰?
 * 褰?API 涓嶅彲鐢ㄦ椂锛岀敓鎴愭湁浠峰€肩殑寮哄寲璁粌棰?
 */
import type {
  KnowledgePoint,
  QuizQuestion,
  QuizResult,
  ReinforcementQuestion,
  SubjectType,
  ExamQuestionPattern,
} from '../types';
import type { MaterialProfile } from './materialTopicService';
import { deduplicateQuestions, verifyQuestionAgainstProfile } from './questionTopicVerifier';

const VALID_PATTERNS: ExamQuestionPattern[] = [
  '基础概念题', '公式套用题', '条件辨析题',
  '易错判断题', '材料分析题', '变式迁移题', '综合解答题',
];

const isMathSubject = (subject: SubjectType): boolean =>
  subject === '数学';

const isChineseSubject = (subject: SubjectType): boolean =>
  subject === '语文';

const isEnglishSubject = (subject: SubjectType): boolean =>
  subject === '英语';

const isPhysicsSubject = (subject: SubjectType): boolean =>
  subject === '物理';

const isChemistrySubject = (subject: SubjectType): boolean =>
  subject === '化学';

const isGeographySubject = (subject: SubjectType): boolean =>
  subject === '地理';

const isBiologySubject = (subject: SubjectType): boolean =>
  subject === '生物';

const isHistorySubject = (subject: SubjectType): boolean =>
  subject === '历史';

const isPoliticsSubject = (subject: SubjectType): boolean =>
  subject === '政治';

const ensureString = (val: string | undefined, fallback: string): string =>
  val || fallback;

const displayNumber = (index: number): number => (index % 5) + 1;

const ensurePattern = (pattern: string | undefined): ExamQuestionPattern => {
  if (pattern && VALID_PATTERNS.includes(pattern as ExamQuestionPattern)) {
    return pattern as ExamQuestionPattern;
  }
  return '基础概念题';
};

export const generateFallbackReinforcementQuestions = (
  weakKnowledgePoints: KnowledgePoint[],
  wrongQuestions: QuizQuestion[],
  result: QuizResult | undefined,
  seed?: number,
  materialProfile?: MaterialProfile
): ReinforcementQuestion[] => {
  const resolvedSeed = seed || Date.now();
  const random = createSeededRandom(resolvedSeed);
  const subject = (materialProfile?.subject || inferSubjectFromWrongQuestions(wrongQuestions)) as SubjectType;
  const targetCount = Math.min(5, Math.max(3, weakKnowledgePoints.length, wrongQuestions.length * 2));
  const rotation = Math.abs(resolvedSeed * 3) % 997;
  const practicePoints = Array.from({ length: targetCount }, (_, index) => weakKnowledgePoints[index % weakKnowledgePoints.length]);

  const generated = practicePoints.map((wp, i) => {
    const relatedWrong = wrongQuestions.find(q =>
      q.knowledgePointId === wp.id || q.knowledgePointId.includes(wp.id)
    );

    const rawQuestion = buildCleanReinforcement(wp, relatedWrong, subject, i + rotation);

    return repairReinforcementQuestion(rawQuestion, wp, relatedWrong, subject, materialProfile, i);
  });
  const unique = deduplicateQuestions(generated);
  return unique.filter((question) => {
    question.subject = subject;
    if (!materialProfile) return true;
    const review = verifyQuestionAgainstProfile({
      ...question,
      type: 'short',
      qualityScore: 90,
      knowledgePointId: question.sourceQuestionId || question.knowledgePointTitle,
      templateId: materialProfile.allowedTemplateIds[0],
    } as QuizQuestion, materialProfile);
    if (!review.passed) console.warn('[强化题校验] 已丢弃不符合资料主题的题目', review.problems);
    return review.passed;
  });
};

const looksGarbled = (value: unknown): boolean =>
  /�|鍙|鐨|绗|鏁|璇|鑻|鐗|鍖|鍦|寮|涔|紝|锛|宸|糮|宐/.test(String(value ?? ''));

const isAbstractPracticeStem = (value: string): boolean =>
  /阅读资料依据|完成具体判断|写出关键条件|请说明.{0,30}判断依据|指出一个易错点|请结合资料分析/.test(value);

const cleanSource = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  materialProfile?: MaterialProfile
): string => {
  const raw = wp.sourceEvidence || relatedWrong?.sourceEvidence || materialProfile?.sourceSummary || wp.description || wp.title;
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 120);
};

const buildConcreteReinforcementAnswer = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  source: string,
  subject?: SubjectType,
  index = 0
): string => {
  if (subject === '化学') {
    return index % 2 === 0
      ? '参考答案：NaCl 固体和熔融 KNO3 属于电解质；酒精和蔗糖属于非电解质；稀盐酸是混合物，不属于电解质或非电解质。依据：电解质和非电解质都必须是化合物，且电解质在水溶液或熔融状态下能导电。'
      : '参考答案：有气泡产生的是稀盐酸与碳酸钠反应，生成二氧化碳；无明显现象的不能据此判断为不反应，还要结合离子是否能生成沉淀、气体或水。';
  }
  if (subject === '地理') {
    return '参考答案：应判断该区域的具体自然条件和人文条件，例如气温、降水、河流、交通和市场；结论必须对应题干给出的区域信息，不能泛泛写“自然和人文条件”。';
  }
  if (relatedWrong?.type === 'single' && relatedWrong.answer) {
    return `参考答案：${relatedWrong.answer}。理由：本题仍围绕“${wp.title}”，关键依据是“${source}”，需要先提取条件再判断选项。`;
  }
  return `参考答案：${wp.title}的结论应与题干条件一致。依据“${source}”，需要写出对应对象、条件变化和最终结论，不能只写方法。`;
};

const buildConcreteReinforcementStem = (
  wp: KnowledgePoint,
  subject: SubjectType,
  index: number
): string => {
  if (subject === '化学') {
    const chemistry = [
      `在下列物质中：NaCl 固体、酒精、稀盐酸、熔融 KNO3、蔗糖溶液。属于电解质的是哪些？属于非电解质的是哪些？说明判断依据。`,
      `向两支试管中分别加入稀盐酸和稀硫酸，再分别滴入碳酸钠溶液。观察到有气泡产生。请写出产生气泡的原因，并说明该现象对应的离子反应条件。`,
      `某同学判断“氯化钠溶液是电解质”。请判断该说法是否正确，并说明 NaCl 固体、NaCl 溶液在概念归类上的区别。`,
    ];
    return `[变式训练 ${displayNumber(index)}] ${chemistry[index % chemistry.length]}`;
  }
  if (subject === '地理') {
    const geo = [
      `某地 1 月均温 4℃，7 月均温 28℃，年降水量 900mm 且夏季降水集中。判断该地最可能的气候类型，并说明两条依据。`,
      `某城市位于河流交汇处，附近有铁路经过，周边平原面积较大。分析该城市早期形成的两个主要区位优势。`,
    ];
    return `[变式训练 ${displayNumber(index)}] ${geo[index % geo.length]}`;
  }
  if (subject === '数学') {
    return `[变式训练 ${displayNumber(index)}] 已知 tanA = -5/12，且 A 是第四象限角，求 sinA 和 cosA，并写出符号判断依据。`;
  }
  if (subject === '物理') {
    return `[变式训练 ${displayNumber(index)}] 一个 2kg 物体在水平面上受 10N 拉力，动摩擦因数为 0.2，g=10m/s²。求摩擦力和加速度。`;
  }
  return `[变式训练 ${displayNumber(index)}] 题干材料：“${wp.sourceEvidence || wp.description || wp.title}”。请根据这段具体材料回答与“${wp.title}”有关的设问，并写出明确结论。`;
};

const repairReinforcementQuestion = (
  question: ReinforcementQuestion,
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  subject: SubjectType,
  materialProfile: MaterialProfile | undefined,
  index: number
): ReinforcementQuestion => {
  const source = cleanSource(wp, relatedWrong, materialProfile);
  const sourceText = source || `${subject}${wp.title}`;
  const repairedQuestion = looksGarbled(question.question) || question.question.length < 20 || isAbstractPracticeStem(question.question)
    ? buildConcreteReinforcementStem(wp, subject, index)
    : question.question.includes(sourceText.slice(0, 12))
      ? question.question
      : `${question.question}（资料依据：“${sourceText}”）`;

  const answerIsFake = !question.answer || question.answer.trim() === 'A' || looksGarbled(question.answer);
  const steps = [
    `定位资料依据：“${sourceText.slice(0, 70)}”`,
    relatedWrong ? '对照原错题，找出条件或设问变化' : `明确“${wp.title}”的考查要求`,
    `围绕“${wp.title}”完成推理并写出结论`,
  ];
  const rubric = [
    `准确写出“${wp.title}”对应资料依据：3分`,
    '分析过程具体，不使用空泛套话：3分',
    '结论与题干条件一致：3分',
    '表达清晰、术语规范：1分',
  ];

  return {
    ...question,
    subject,
    question: repairedQuestion,
    answer: answerIsFake || /应从|结合材料|写出判断依据|根据材料作答/.test(question.answer)
      ? buildConcreteReinforcementAnswer(wp, relatedWrong, sourceText, subject, index)
      : question.answer,
    explanation: looksGarbled(question.explanation) || !question.explanation
      ? `【解析】本题依据“${sourceText}”，考查“${wp.title}”。作答时先找材料条件，再判断条件如何支持结论，不能只写“结合材料分析”。`
      : question.explanation,
    hint: looksGarbled(question.hint) || !question.hint
      ? `提示：先回到资料中找“${wp.title}”的条件，再写答案。`
      : question.hint,
    solutionSteps: question.solutionSteps?.length && !question.solutionSteps.some(looksGarbled) ? question.solutionSteps : steps,
    scoringRubric: question.scoringRubric?.length && !question.scoringRubric.some(looksGarbled) ? question.scoringRubric : rubric,
    commonMistake: looksGarbled(question.commonMistake) || !question.commonMistake
      ? (wp.commonMistakes?.[0] || `没有结合资料中的具体条件理解“${wp.title}”。`)
      : question.commonMistake,
    sourceEvidence: sourceText,
    knowledgePointTitle: wp.title,
    sourceQuestionId: relatedWrong?.id || question.sourceQuestionId,
  };
};

const buildCleanReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  subject: SubjectType,
  index: number
): ReinforcementQuestion => {
  const question = buildConcreteReinforcementStem(wp, subject, index);
  const source = cleanSource(wp, relatedWrong);
  const answer = buildConcreteReinforcementAnswer(wp, relatedWrong, source, subject, index);
  const sourceEvidence = source || wp.description || wp.title;
  const subjectStep = subject === '化学'
    ? '写出物质类别、反应现象或离子变化'
    : subject === '数学'
      ? '写出公式、代入和符号判断'
      : subject === '地理'
        ? '提取区域条件并形成因果判断'
        : `提取与“${wp.title}”直接相关的题干条件`;
  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    subject,
    knowledgePointTitle: wp.title,
    examPattern: ensurePattern(wp.examPatterns?.[0]) || '变式迁移题',
    question,
    hint: `提示：先找题干中的具体对象或数据，再对应“${wp.title}”作答。`,
    answer,
    explanation: `【解析】本题考查“${wp.title}”。题干给出了具体对象和条件，作答时要先判断条件是否满足概念或规律，再写出结论。资料依据：${sourceEvidence}`,
    solutionSteps: [
      `识别题干对象：${question.slice(0, 45)}...`,
      subjectStep,
      `回扣“${wp.title}”写出明确结论`,
    ],
    scoringRubric: [
      `准确识别“${wp.title}”：3分`,
      '写出题干中的具体对象或数据：2分',
      '推理过程与资料依据一致：3分',
      '结论明确且表达规范：2分',
    ],
    commonMistake: wp.commonMistakes?.[0] || '只背概念名称，没有结合题干对象和条件判断。',
    difficulty: index % 3 === 0 ? '简单' : index % 3 === 1 ? '中等' : '较难',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence,
  };
};

// ========== 鏁板寮哄寲棰?==========

const buildMathReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const seed = random();
  const baseValue = 15 + Math.floor(seed * 50);
  if (/三角函数|sin|cos|tan|象限/.test(`${wp.title} ${wp.description}`)) {
    const trigVariants = [
      { question: '已知 tanA = -5/12，且 A 是第四象限角，求 cosA。', answer: 'cosA = 12/13', steps: ['设 sinA=-5k，cosA=12k', '代入 sin²A+cos²A=1', '得到k=1/13', '第四象限cosA>0，所以cosA=12/13'] },
      { question: '已知 sinA = 8/17，且 A 是第二象限角，求 tanA。', answer: 'tanA = -8/15', steps: ['由平方关系求得|cosA|=15/17', '第二象限cosA<0', 'tanA=sinA/cosA=-8/15'] },
      { question: '已知 cosA = -7/25，且 A 是第三象限角，求 sinA。', answer: 'sinA = -24/25', steps: ['由平方关系求得|sinA|=24/25', '第三象限sinA<0', '所以sinA=-24/25'] },
      { question: '已知 tanB = 5/12，且 B 是第一象限角，求 sinB。', answer: 'sinB = 5/13', steps: ['设 sinB=5k，cosB=12k', '代入平方关系得k=1/13', '第一象限sinB>0'] },
      { question: '已知 sinC = -12/13，且 C 是第四象限角，求 cosC。', answer: 'cosC = 5/13', steps: ['由平方关系得|cosC|=5/13', '第四象限cosC>0', '所以cosC=5/13'] },
      { question: '已知 cosG = 15/17，且 G 是第四象限角，求 tanG。', answer: 'tanG = -8/15', steps: ['由平方关系得|sinG|=8/17', '第四象限sinG<0', 'tanG=sinG/cosG=-8/15'] },
    ];
    const variant = trigVariants[index % trigVariants.length];
    return {
      id: `rq-fallback-${Date.now()}-${index}`,
      knowledgePointTitle: wp.title,
      examPattern: '变式迁移题',
      question: `[鍙樺紡璁粌 ${displayNumber(index)}] ${variant.question}`,
      answer: variant.answer,
      explanation: `【解析】${variant.steps.join('；')}。`,
      hint: '提示：先写出同角三角函数基本关系，再结合象限判断正负号。',
      solutionSteps: variant.steps,
      scoringRubric: ['写出平方关系：2分', '正确代入：3分', '象限符号判断：2分', '结论正确：3分'],
      commonMistake: ensureString(wp.commonMistakes?.[0], '忽略象限导致正负号错误'),
      difficulty: '中等',
      sourceQuestionId: relatedWrong?.id,
      sourceEvidence: wp.sourceEvidence || wp.description,
    };
  }

  const variants = [
    `宸茬煡 x = ${baseValue}锛屾眰 ${wp.title} 鐨勫€糮`,
    `宸茬煡 y = ${baseValue + 10}锛屾眰 ${wp.title} 鐩稿叧琛ㄨ揪寮忕殑鍊糮`,
    `璁z = ${baseValue - 5}锛屾眰 ${wp.title} 鐨勭粨鏋渀`,
    `鑻a = ${baseValue * 2}锛宐 = ${baseValue}锛屾眰 ${wp.title}`,
    `缁欏畾鍙傛暟涓${baseValue}锛岃绠${wp.title}`,
    `鍦ㄥ疄闄呮儏澧冧腑鍙傛暟鍙${baseValue + 3}锛屾眰 ${wp.title} 鐨勭粨鏋渀`,
  ];

  const variant = variants[index % variants.length];

  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    knowledgePointTitle: wp.title,
    examPattern: ensurePattern(wp.examPatterns?.[0]),
    question: `[变式训练 ${displayNumber(index)}] ${variant}，下列计算结果正确的是（  ）`,
    answer: buildConcreteReinforcementAnswer(wp, relatedWrong, wp.sourceEvidence || wp.description || wp.title),
    explanation: `【解题思路】${wp.description?.slice(0, 100) || wp.title}。${wp.formulas?.[0] ? `【公式】${wp.formulas[0]}。` : ''}【关键步骤】${ensureString(wp.keyMethods?.[0], '按公式代入计算')}`,
    hint: `提示：注意ensureString(wp.keyMethods?.[0], '公式的适用条件')}，先判断再计算。`,
    solutionSteps: [
      `识别 ${wp.title} 的核心要点`,
      ensureString(wp.keyMethods?.[0], '根据已知条件列出相关公式'),
      ensureString(wp.commonMistakes?.[0], '按正确步骤代入计算'),
      '检验结果正确性',
    ],
    scoringRubric: [
      '正确识别考点：2分',
      '选择正确方法：3分',
      '计算正确：3分',
      '规范书写：2分',
    ],
    commonMistake: ensureString(wp.commonMistakes?.[0], '注意理解题意'),
    difficulty: '中等',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence: wp.sourceEvidence || wp.description,
  };
};

// ========== 璇枃寮哄寲棰?==========

const buildChineseReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const materials = [
    `鍦${(wp.description || wp.title).slice(0, 30)}"鐨勮澧冧腑`,
    `缁撳悎浠ヤ笅鏂囨锛${(wp.sourceEvidence || wp.title).slice(0, 50)}"`,
    `鍦ㄥ叿浣撶殑璇█杩愮敤鍦烘櫙涓紝鍏充簬"${wp.title}"`,
    `闃呰涓嬮潰鐨勮娈碉紝鍒嗘瀽鍏朵腑"${wp.title}"鐨勭敤娉昤`,
    `闃呰鍙ュ瓙鈥滄槬椋庡張缁挎睙鍗楀哺鈥濓紝缁撳悎"${wp.title}"鍒嗘瀽鍏抽敭璇嶇殑琛ㄨ揪鏁堟灉`,
    `闃呰鏂囪█璇鈥滃鑰屾椂涔犱箣锛屼笉浜﹁涔庘€濓紝缁撳悎"${wp.title}"瀹屾垚杈ㄦ瀽`,
  ];

  const question = `[变式训练 ${displayNumber(index)}] ${materials[index % materials.length]}，以下判断正确的是（  ）`;

  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    knowledgePointTitle: wp.title,
    examPattern: ensurePattern(wp.examPatterns?.[0]),
    question,
    answer: buildConcreteReinforcementAnswer(wp, relatedWrong, wp.sourceEvidence || wp.description || wp.title),
       explanation: `【解析】${wp.description?.slice(0, 100) || wp.title}。${wp.keyMethods?.[0] ? `【方法】${wp.keyMethods[0]}。` : ''}${wp.commonMistakes?.[0] ? `【常见错误】${wp.commonMistakes[0]}。` : ''}`,
    hint: '提示：仔细分析题意后作答。',
    solutionSteps: [
      `理解 ${wp.title} 的题意要求`,
      ensureString(wp.keyMethods?.[0], '定位题目中的关键词句'),
      ensureString(wp.commonMistakes?.[0], '结合语境分析选项正误'),
      '规范作答，表述完整',
    ],
    scoringRubric: [
      '鍑嗙‘鐞嗚В棰樻剰锛鍒',
      '姝ｇ‘杈ㄦ瀽姒傚康锛鍒',
      '缁撳悎璇鍒嗘瀽锛鍒',
      '琛ㄨ堪瑙勮寖瀹屾暣锛鍒',
    ],
    commonMistake: ensureString(wp.commonMistakes?.[0], '注意理解题意'),
    difficulty: '中等',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence: wp.sourceEvidence || wp.description,
  };
};

// ========== 鑻辫寮哄寲棰?==========

const buildEnglishReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const contexts = [
    `Tom has gone to the library and will return soon. Which sentence best applies "${wp.title}"`,
    `Lucy reads one short article every day to improve her English. Which option best explains "${wp.title}" in this context`,
    `The school reading club meets every Friday. Choose the sentence that correctly uses "${wp.title}".`,
    `Mike has finished his homework, so he can join the reading club. Which option matches "${wp.title}"`,
    `Students read the passage twice before answering the question. Which statement best applies "${wp.title}"`,
    `The teacher gave a clear context for the new word. Choose the correct use of "${wp.title}".`,
  ];
  const question = `[Variation ${displayNumber(index)}] ${contexts[index % contexts.length]}`;
  const material = (wp.sourceEvidence || wp.description || wp.title).slice(0, 150);

  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    knowledgePointTitle: wp.title,
    examPattern: '鏉愭枡鍒嗘瀽棰 as ExamQuestionPattern',
    question: `${question}\n\nContext: ${material}`,
    answer: buildConcreteReinforcementAnswer(wp, relatedWrong, wp.sourceEvidence || wp.description || wp.title),
    explanation: `【解析】${wp.description || wp.title}。${wp.keyMethods?.[0] ? `【方法】${wp.keyMethods[0]}。` : ''}${wp.commonMistakes?.[0] ? `【常见错误】${wp.commonMistakes[0]}。` : ''}`,
    hint: 'Hint: Consider both the literal meaning and the contextual implication.',
    solutionSteps: [
      `Read about ${wp.title} in context`,
      `Identify key points of ensureString(wp.keyMethods.[0], 'the passage')}`,
      `Avoid: ensureString(wp.commonMistakes.[0], 'careless comparison')}`,
      'Select the best answer with evidence',
    ],
    scoringRubric: [
      'Accurate comprehension: 3pts',
      'Correct inference: 3pts',
      'Grammatical awareness: 2pts',
      'Vocabulary accuracy: 2pts',
    ],
    commonMistake: ensureString(wp.commonMistakes?.[0], 'Misinterpretation of the passage'),
    difficulty: '中等',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence: wp.sourceEvidence || wp.description,
  };
};

// ========== 鐗╃悊寮哄寲棰?==========

const buildPhysicsReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const baseValue = 2 + Math.floor(random() * 8);
  const scenarios = [
    `璐ㄩ噺涓${baseValue}kg 鐨勭墿浣撳彈鍒${baseValue * 3}N 鐨勬按骞虫亽鍔涗綔鐢紝蹇界暐鎽╂摝锛岀粨鍚${wp.title}"姹傚姞閫熷害銆俙`,
    `鏌愬浣撲袱绔數鍘嬩负 ${baseValue * 2}V锛岄€氳繃瀹冪殑鐢垫祦涓${baseValue / 2}A锛岀粨鍚${wp.title}"姹傜數闃汇€俙`,
    `灏忚溅鍦${baseValue}s 鍐呴€熷害鐢0 澧炲姞鍒${baseValue * 4}m/s锛岀粨鍚${wp.title}"姹傚钩鍧囧姞閫熷害銆俙`,
    `涓€涓${baseValue}kg 鐨勭瀛愬湪姘村钩闈笂鍖€閫熻繍鍔紝鍙楀埌 ${baseValue * 2}N 鎷夊姏锛岀粨鍚${wp.title}"鍒嗘瀽鎽╂摝鍔涖€俙`,
    `鐢甸樆涓${baseValue}惟 鐨勫浣撻€氳繃 ${baseValue / 2}A 鐢垫祦锛岀粨鍚${wp.title}"姹備袱绔數鍘嬨€俙`,
    `鐗╀綋浠庨潤姝㈠紑濮嬭嚜鐢变笅钀${baseValue}s锛屽彇 g=10m/s虏锛岀粨鍚${wp.title}"鍒嗘瀽鏈€熷害銆俙`,
  ];
  const question = `[鍙樺紡璁粌 ${displayNumber(index)}] ${scenarios[index % scenarios.length]}`;

  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    knowledgePointTitle: wp.title,
    examPattern: '鏉′欢杈ㄦ瀽棰 as ExamQuestionPattern',
    question,
    answer: buildConcreteReinforcementAnswer(wp, relatedWrong, wp.sourceEvidence || wp.description || wp.title),
      explanation: `【解析】${wp.description?.slice(0, 100) || wp.title}。${wp.keyMethods?.[0] ? `【方法】${wp.keyMethods[0]}。` : ''}${wp.commonMistakes?.[0] ? `【常见错误】${wp.commonMistakes[0]}。` : ''}`,
    hint: `鎻愮ず锛氭敞鎰{ensureString(wp.keyMethods.[0], '鐗╃悊鏉′欢')}锛屼笉瑕佸拷鐣ュ崟浣嶃€俙`,
    solutionSteps: [
      `分析 ${wp.title} 的已知条件`,
      ensureString(wp.keyMethods?.[0], '选择正确的物理公式'),
      ensureString(wp.commonMistakes?.[0], '注意单位换算和量的符号'),
      '检验结果合理性',
    ],
    scoringRubric: [
      '姝ｇ‘璇嗗埆鐗╃悊閲忥細2鍒',
      '閫夋嫨姝ｇ‘鍏紡锛鍒',
      '鍗曚綅鎹㈢畻姝ｇ‘锛鍒',
      '璁＄畻缁撴灉姝ｇ‘锛鍒',
    ],
    commonMistake: ensureString(wp.commonMistakes?.[0], '注意理解题意'),
    difficulty: '中等',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence: wp.sourceEvidence || wp.description,
  };
};

// ========== 鍖栧寮哄寲棰?==========

const buildChemistryReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const scenarios = [
    `鍦CH鈧僀OOH 婧舵恫鐨勭數绂诲钩琛′腑鍔犲叆灏戦噺 CH鈧僀OONa 鍥轰綋锛岀粨鍚${wp.title}"鍒ゆ柇骞宠　绉诲姩鏂瑰悜銆俙`,
    `鍦ㄦ棤鑹查€忔槑婧舵恫涓楠K鈦恒€丯O鈧冣伝銆丆l鈦鑳藉惁澶ч噺鍏卞瓨锛岀粨鍚${wp.title}"璇存槑鐞嗙敱銆俙`,
    `鍚Na鈧侰O鈧婧舵恫涓€愭淮鍔犲叆绋€鐩愰吀锛岃瀵熷埌鏈夋皵娉′骇鐢燂紝缁撳悎"${wp.title}"鍐欏嚭鍒ゆ柇渚濇嵁銆俙`,
    `鍚BaCl鈧婧舵恫涓姞鍏Na鈧係O鈧婧舵恫锛岃瀵熷埌鐧借壊娌夋穩锛岀粨鍚${wp.title}"璇存槑绂诲瓙鍙嶅簲銆俙`,
    `鍦NH鈧兟稨鈧侽 婧舵恫涓姞鍏ュ皯閲NH鈧凜l 鍥轰綋锛岀粨鍚${wp.title}"鍒ゆ柇寮辩數瑙ｈ川鐢电鍙樺寲銆俙`,
    `灏嗛搧鐗囨斁鍏CuSO鈧婧舵恫锛岃瀵熷埌閾佺墖琛ㄩ潰鏈夌孩鑹插浐浣撴瀽鍑猴紝缁撳悎"${wp.title}"鍒嗘瀽鍙嶅簲銆俙`,
  ];
  const question = `[鍙樺紡璁粌 ${displayNumber(index)}] ${scenarios[index % scenarios.length]}`;

  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    knowledgePointTitle: wp.title,
    examPattern: '鏉′欢杈ㄦ瀽棰 as ExamQuestionPattern',
    question,
    answer: buildConcreteReinforcementAnswer(wp, relatedWrong, wp.sourceEvidence || wp.description || wp.title),
      explanation: `【解析】${wp.description?.slice(0, 100) || wp.title}。${wp.keyMethods?.[0] ? `【方法】${wp.keyMethods[0]}。` : ''}${wp.commonMistakes?.[0] ? `【常见错误】${wp.commonMistakes[0]}。` : ''}`,
    hint: `鎻愮ず锛氭敞鎰{ensureString(wp.keyMethods.[0], '鍙嶅簲鏉′欢鍜岀墿璐ㄦ€ц川')}锛屼笉瑕佹璁扮‖鑳屻€俙`,
    solutionSteps: [
      `识别 ${wp.title} 涉及的化学物质`,
      ensureString(wp.keyMethods?.[0], '判断反应类型和化学方程式'),
      ensureString(wp.commonMistakes?.[0], '考虑反应条件与量的关系'),
      '得出结论并检验',
    ],
    scoringRubric: [
      '姝ｇ‘璇嗗埆鐗╄川锛鍒',
      '鍒ゆ柇鍙嶅簲绫诲瀷锛鍒',
      '鑰冭檻鍙嶅簲鏉′欢锛鍒',
      '涔﹀啓瑙勮寖瀹屾暣锛鍒',
    ],
    commonMistake: ensureString(wp.commonMistakes?.[0], '注意理解题意'),
    difficulty: '中等',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence: wp.sourceEvidence || wp.description,
  };
};

// ========== 鍦扮悊寮哄寲棰?==========

const buildGeographyReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const regions = ['河流交汇区域', '沿海城市', '山地丘陵区', '季风气候区', '等高线密集山区', '城市近郊农业区'];
  const region = regions[index % regions.length];
  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    knowledgePointTitle: wp.title,
    examPattern: '鏉愭枡鍒嗘瀽棰',
    question: `[鍙樺紡璁粌 ${displayNumber(index)}] 缁撳悎${region}鐨勫尯鍩熸潯浠讹紝鍒嗘瀽"${wp.title}"鏃跺簲浼樺厛鍏虫敞鍝簺鑷劧鎴栦汉鏂囧洜绱狅紵`,
    answer: '搴斾粠鍖哄煙浣嶇疆銆佽嚜鐒舵潯浠跺拰浜烘枃鏉′欢鍒嗗眰鍒嗘瀽锛屽苟缁撳悎鏉愭枡褰㈡垚鍥犳灉閾俱€',
      explanation: `【解析】${wp.description?.slice(0, 100) || wp.title}。${wp.keyMethods?.[0] ? `【方法】${wp.keyMethods[0]}。` : ''}${wp.commonMistakes?.[0] ? `【常见错误】${wp.commonMistakes[0]}。` : ''}`,
    hint: '鎻愮ず锛氬厛瀹氫綅鍖哄煙锛屽啀鍖哄垎鑷劧鍥犵礌涓庝汉鏂囧洜绱犮€',
    solutionSteps: [
      `定位 ${wp.title} 涉及的区域或尺度`,
      ensureString(wp.keyMethods?.[0], '提取材料中的地理位置和信息'),
      ensureString(wp.commonMistakes?.[0], '区分自然地理与人文地理因素'),
      '形成完整的因果链和结论',
    ],
    scoringRubric: ['正确识别：2分', '方法正确：3分', '计算准确：3分', '书写规范：2分'],
    commonMistake: ensureString(wp.commonMistakes?.[0], '注意理解题意'),
    difficulty: '中等',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence: wp.sourceEvidence || wp.description,
  };
};

// ========== 鐢熺墿寮哄寲棰?==========

const buildBiologyReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const scenarios = [
    `鏌愭鐗╁厛鏆楀鐞24 灏忔椂锛屽啀杩涜鐓у厜瀹為獙銆傜粨鍚${wp.title}"璇存槑鏆楀鐞嗙殑鐩殑銆俙`,
    `閬椾紶瀹為獙涓紝鏉傚悎瀛Aa 鑷氦寰楀埌瀛愪唬銆傜粨鍚${wp.title}"鍒嗘瀽琛ㄧ幇鍨嬫瘮渚嬨€俙`,
    `瑙傚療妞嶇墿鍙剁墖鍦ㄥ厜鐓у拰榛戞殫鏉′欢涓嬬殑姘斾綋鍙樺寲銆傜粨鍚${wp.title}"鍒ゆ柇鐢熷懡娲诲姩宸紓銆俙`,
    `鏌愮敓鎬佺郴缁熶腑鑽夈€佸厰鍜岄拱鏋勬垚椋熺墿閾俱€傜粨鍚${wp.title}"鍒嗘瀽鏁伴噺鍙樺寲鐨勫奖鍝嶃€俙`,
    `瑙傚療浜哄彛鑵斾笂鐨粏鑳炲拰妞嶇墿琛ㄧ毊缁嗚優瑁呯墖銆傜粨鍚${wp.title}"姣旇緝缁嗚優缁撴瀯銆俙`,
    `浜哄湪杩愬姩鍚庡懠鍚搁鐜囧姞蹇€傜粨鍚${wp.title}"璇存槑鐢熷懡娲诲姩涓殑璋冭妭鏈哄埗銆俙`,
  ];
  return buildContextualReinforcement(wp, relatedWrong, index, scenarios[index % scenarios.length], '生物实验要结合具体生命活动和生活情境分析。');
};

// ========== 鍘嗗彶寮哄寲棰?==========

const buildHistoryReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const scenarios = [
    `闃呰鏉愭枡锛氣€滆嚜寮轰互缁冨叺涓鸿锛岀粌鍏靛張浠ュ埗鍣ㄤ负鍏堛€傗€濈粨鍚${wp.title}"鍒ゆ柇鏉愭枡鍙嶆槧鐨勫巻鍙蹭簨浠跺強涓诲紶銆俙`,
    `1911 骞存鏄岃捣涔夊悗锛屽悇鐪佺悍绾峰搷搴斻€傜粨鍚${wp.title}"鍒嗘瀽杩欎竴鍘嗗彶浜嬩欢鐨勯噸瑕佸奖鍝嶃€俙`,
    `姣旇緝宸ヤ笟闈╁懡銆佹硶鍥藉ぇ闈╁懡鍜岀涓€娆′笘鐣屽ぇ鎴樼殑鏃堕棿椤哄簭锛岀粨鍚${wp.title}"瀹屾垚鏃堕棿绾垮垽鏂€俙`,
    `闃呰銆婂崡浜潯绾︺€嬮儴鍒嗘潯娆撅紝缁撳悎"${wp.title}"鍒嗘瀽杩戜唬涓浗绀句細鍙楀埌鐨勫奖鍝嶃€俙`,
    `姣旇緝娲嬪姟杩愬姩鍜岃緵浜ラ潻鍛界殑鐩爣涓庣粨鏋滐紝缁撳悎"${wp.title}"璇存槑杩戜唬鍖栨帰绱㈢殑鐗圭偣銆俙`,
    `缁撳悎绗簩娆′笘鐣屽ぇ鎴樺悗鐨勫浗闄呮牸灞€鍙樺寲锛屽洿缁${wp.title}"鎻愬彇鏉愭枡涓殑鍥犳灉鍏崇郴銆俙`,
  ];
  return buildContextualReinforcement(wp, relatedWrong, index, scenarios[index % scenarios.length], '历史题要依据具体事件、时间和背景分析因果关系。');
};

// ========== 鏀挎不寮哄寲棰?==========

const buildPoliticsReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const scenarios = [
    `鏌愪腑瀛︾敓鍙戠幇鍟嗗鍑哄敭鐩楃増涔︾睄鍚庡悜鏈夊叧閮ㄩ棬涓炬姤銆傜粨鍚${wp.title}"鍒ゆ柇鍏惰浣跨殑鍏皯鏉冨埄銆俙`,
    `绀惧尯缁勭粐灞呮皯鍙傚姞鍨冨溇鍒嗙被蹇楁効鏈嶅姟銆傜粨鍚${wp.title}"鍒嗘瀽杩欎竴娲诲姩浣撶幇鐨勭ぞ浼氳矗浠汇€俙`,
    `瀛︽牎寮€灞曞娉曞浼犳椿鍔紝寮鸿皟浠讳綍浜洪兘涓嶅緱鏈夎秴瓒婃硶寰嬬殑鐗规潈銆傜粨鍚${wp.title}"璇存槑娉曟不鍘熷垯銆俙`,
    `娑堣垂鑰呰喘涔板埌璐ㄩ噺涓嶅悎鏍煎晢鍝佸悗渚濇硶缁存潈銆傜粨鍚${wp.title}"鍒嗘瀽鍏舵潈鍒╁拰閫斿緞銆俙`,
    `鏌愬湴鍙紑灞呮皯璁簨浼氳璁哄叕鍏辫鏂藉缓璁俱€傜粨鍚${wp.title}"璇存槑鍙備笌鍏叡浜嬪姟鐨勬剰涔夈€俙`,
    `缃戠粶骞冲彴娌荤悊铏氬亣淇℃伅鏃跺己璋冩潈鍒╀笌涔夊姟缁熶竴銆傜粨鍚${wp.title}"鍒嗘瀽鍏皯琛屼负杈圭晫銆俙`,
  ];
  return buildContextualReinforcement(wp, relatedWrong, index, scenarios[index % scenarios.length], '政治题要联系具体生活情境、法律案例和社会现象。');
};

const buildContextualReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  scenario: string,
  hint: string
): ReinforcementQuestion => ({
  id: `rq-fallback-${Date.now()}-${index}`,
  knowledgePointTitle: wp.title,
  examPattern: '鏉愭枡鍒嗘瀽棰',
  question: `[鍙樺紡璁粌 ${displayNumber(index)}] ${scenario}`,
  answer: `搴旂粨鍚堟潗鏂欎腑鐨勫叿浣撴潯浠讹紝鍥寸粫"${wp.title}"鎻愬彇渚濇嵁骞跺舰鎴愬畬鏁寸粨璁恒€俙`,
      explanation: `【解析】${wp.description || wp.title}。`,
  hint,
  solutionSteps: [
    `定位材料中关于 ${wp.title} 的关键信息`,
    `联系 ensureString(wp.keyMethods.[0], '当前知识点的核心内容')}`,
    `注意避免：ensureString(wp.commonMistakes.[0], '脱离材料空泛作答')}`,
    '分点分析并形成完整结论',
  ],
    scoringRubric: ['正确识别：2分', '方法正确：3分', '计算准确：3分', '书写规范：2分'],
  commonMistake: ensureString(wp.commonMistakes?.[0], '鑴辩鏉愭枡绌烘硾浣滅瓟'),
  difficulty: '中等',
  sourceQuestionId: relatedWrong?.id,
  sourceEvidence: wp.sourceEvidence || wp.description,
});

// ========== 閫氱敤寮哄寲棰?==========

const buildGeneralReinforcement = (
  wp: KnowledgePoint,
  relatedWrong: QuizQuestion | undefined,
  index: number,
  random: () => number
): ReinforcementQuestion => {
  const question = `[变式训练 ${displayNumber(index)}] 阅读资料中与"${wp.title}"相关的具体条件后，最符合材料依据的分析是（  ）`;

  return {
    id: `rq-fallback-${Date.now()}-${index}`,
    knowledgePointTitle: wp.title,
    examPattern: ensurePattern(wp.examPatterns?.[0]),
    question,
    answer: buildConcreteReinforcementAnswer(wp, relatedWrong, wp.sourceEvidence || wp.description || wp.title),
      explanation: `【解析】${wp.description?.slice(0, 100) || wp.title}。${wp.keyMethods?.[0] ? `【方法】${wp.keyMethods[0]}。` : ''}${wp.commonMistakes?.[0] ? `【常见错误】${wp.commonMistakes[0]}。` : ''}`,
    hint: '提示：仔细分析题意后作答。',
    solutionSteps: [
      `识别 ${wp.title} 的考查方向`,
      ensureString(wp.keyMethods?.[0], '分析题目给出的条件'),
      ensureString(wp.commonMistakes?.[0], '按照逻辑步骤逐步推理'),
      '验证结论是否完整准确',
    ],
    scoringRubric: [
      '鍑嗙‘璇嗗埆鑰冪偣锛鍒',
      '姝ｇ‘杩愮敤鏂规硶锛鍒',
      '閫昏緫娓呮櫚瀹屾暣锛鍒',
    ],
    commonMistake: ensureString(wp.commonMistakes?.[0], '注意理解题意'),
    difficulty: '中等',
    sourceQuestionId: relatedWrong?.id,
    sourceEvidence: wp.sourceEvidence || wp.description,
  };
};

// ========== 杈呭姪鍑芥暟 ==========

const inferSubjectFromWrongQuestions = (wrongQuestions: QuizQuestion[]): SubjectType => {
  if (wrongQuestions.length === 0) return '语文';
  const explicitSubject = wrongQuestions.find((question) => question.subject)?.subject;
  if (explicitSubject) return explicitSubject;

  const patterns: string[] = wrongQuestions
    .map(q => q.examPattern)
    .filter(Boolean) as string[];

  const matchAny = (arr: string[], targets: string[]) => targets.some(t => arr.includes(t));

  if (matchAny(patterns, ['公式套用题', '条件辨析题', '综合解答题'])) {
    return '数学';
  }
  if (matchAny(patterns, ['材料分析题'])) {
    const hasEnglish = wrongQuestions.some(q =>
      (q.explanation || '').includes('passage') || (q.question || '').includes('Read the')
    );
    return hasEnglish ? '英语' : '语文';
  }
  if (matchAny(patterns, ['受力分析题', '电路分析题'])) {
    return '物理';
  }
  if (matchAny(patterns, ['反应方程式', '物质推断题'])) {
    return '化学';
  }

  return '语文';
};

const createSeededRandom = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
};

