import type {
  DiagnosisItem,
  Difficulty,
  ExamQuestionPattern,
  Importance,
  KnowledgePoint,
  QuizQuestion,
  QuizResult,
  QuizSettings,
  ReinforcementQuestion,
  ReviewPlanDay,
  SubjectType,
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

const subjectOfPoint = (point: KnowledgePoint): SubjectType => point.subjectType || inferSubjectType(`${point.title}\n${point.description}\n${point.sourceEvidence ?? ''}`);

const rotateByIndex = <T,>(items: T[], index: number) => {
  if (items.length === 0) return items;
  const offset = index % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
};

const uniqueOptions = (options: string[]) => {
  const seen = new Set<string>();
  return options
    .map(cleanOption)
    .filter((option) => {
      const key = option.replace(/[A-D][.、]\s*/g, '').replace(/\s+/g, '');
      if (seen.has(key) || option.length < 9) return false;
      seen.add(key);
      return true;
    });
};

const correctOptionFor = (point: KnowledgePoint, pattern: ExamQuestionPattern) => {
  const evidence = (point.description || point.sourceEvidence || '需要结合资料中的定义、条件和例题进行判断').replace(/[。！？.!?]$/, '');
  if (pattern === '公式套用题') return cleanOption(`应先识别适用公式或规则，再把题干条件代入，并检查范围、符号或单位是否符合要求`);
  if (pattern === '条件辨析题') return cleanOption(`应抓住材料给出的限制条件，比较不同情境下结论是否仍然成立，不能只看关键词表面相似`);
  if (pattern === '材料分析题') return cleanOption(`应先定位资料依据，再结合题干情境进行分析，最后用规范语言写出判断理由`);
  if (pattern === '变式迁移题') return cleanOption(`应把“${point.title}”的核心方法迁移到新条件中，保持解题依据不变并重新检查结论`);
  return cleanOption(`应依据资料中关于“${point.title}”的表述理解考点：${evidence}`);
};

const distractorOptionsFor = (point: KnowledgePoint, pattern: ExamQuestionPattern) => {
  const subjectType = subjectOfPoint(point);
  const common = point.commonMistakes?.length ? point.commonMistakes : getExamStrategy(subjectType).commonMistakes;
  const subjectDistractors: Partial<Record<SubjectType, string[]>> = {
    数学: [
      '看到相似公式就直接套用，不需要检查定义域、符号或取值范围',
      '只写出最后结果即可，中间推导和条件判断不会影响得分',
      '把题干中的一个条件当作全部条件，不再验证结论是否满足原式',
      '只要数值计算正确，就可以忽略单位、符号和步骤规范',
    ],
    高等数学: [
      '只记结论公式，不需要说明极限、连续或可导等适用前提',
      '把局部计算结果直接当作最终结论，不再检查定义域和端点条件',
      '只写答案不写推导过程，综合题也不会扣关键步骤分',
      '遇到变式条件时仍按原题套算，不需要重新分析题设',
    ],
    物理: [
      '只选择熟悉公式代入即可，不需要分析研究对象和物理过程',
      '方向、单位和初末状态可以省略，因为它们不影响结论判断',
      '图像或过程题只看数值大小，不需要解释物理意义',
      '不同运动阶段可以合并处理，不需要区分条件变化',
    ],
    电路: [
      '只把元件数值相加即可，不需要判断串并联关系和参考方向',
      '列方程时可以忽略节点电流或回路电压约束',
      '电源方向和电流参考方向不影响结果符号',
      '只给出计算结果即可，不需要标明单位和支路条件',
    ],
    化学: [
      '只看反应物名称即可判断结论，不需要检查条件、配平和离子变化',
      '实验现象和实验结论可以互相替代，不必区分',
      '离子共存题只看单个离子性质，不需要考虑组合反应',
      '方程式中省略反应条件和配平不会影响得分',
    ],
    语文: [
      '只背规则名称即可判断，不需要结合句子语境和表达关系',
      '看到相同词语就使用相同标点或修改方式，不需要看前后层次',
      '阅读题只摘原文关键词即可，不需要说明依据和作用',
      '病句或标点题可以凭语感判断，不必指出具体病因',
    ],
    英语: [
      '只看单个单词含义即可作答，不需要结合时态、语态和句法结构',
      '固定搭配和上下文语境无关，选项中熟悉的词一般就是答案',
      '阅读题可以脱离原文定位，凭常识判断即可',
      '完形填空只需要保证中文意思通顺，不需要检查语法一致性',
    ],
    计算机: [
      '只背概念定义即可，不需要追踪算法过程或边界条件',
      '时间复杂度只看代码行数，不需要分析循环嵌套和数据规模',
      '程序题只要思路大致正确，边界输入和异常情况可以忽略',
      '原理题可以用实现细节替代核心机制说明',
    ],
  };
  const mapped = subjectDistractors[subjectType] || subjectDistractors[subjectType === '程序设计' || subjectType === '数据结构' || subjectType === '操作系统' || subjectType === '计算机网络' || subjectType === '数据库' ? '计算机' : '数学'] || [];
  const patternDistractors = [
    pattern === '条件辨析题' ? `忽略题干条件变化，直接沿用原结论，容易落入“${common[0] ?? '条件遗漏'}”的误区` : '',
    pattern === '材料分析题' ? '脱离材料依据，只用常识或主观判断组织答案' : '',
    pattern === '综合解答题' ? '只写结论，不列得分步骤，也不说明关键依据' : '',
    pattern === '易错判断题' ? `把常见错误“${common[0] ?? '概念混淆'}”当作正确做法` : '',
  ].filter(Boolean);
  return uniqueOptions([...patternDistractors, ...mapped, ...common.map((item) => `本题只要避免“${item}”这个词，其他条件可以不再分析`)]).slice(0, 6);
};

const orderedOptionsFor = (point: KnowledgePoint, pattern: ExamQuestionPattern, index: number) => {
  const answer = correctOptionFor(point, pattern);
  const distractors = distractorOptionsFor(point, pattern).filter((option) => option !== answer);
  const fallback = [
    '只提取资料中的一个关键词，不需要说明它与题干条件之间的关系',
    '把例题中的结论机械搬到新题中，不需要重新验证适用条件',
    '答案只要方向相近即可，标准步骤和评分点可以省略',
  ].map(cleanOption);
  const options = uniqueOptions([answer, ...rotateByIndex([...distractors, ...fallback], index)]).slice(0, 4);
  const filled = uniqueOptions([...options, ...fallback]).slice(0, 4);
  return {
    answer,
    options: rotateByIndex(filled.includes(answer) ? filled : [answer, ...filled].slice(0, 4), index),
  };
};

const questionTemplates = [
  (title: string, pattern: ExamQuestionPattern) => `关于“${title}”这一考点，下列说法正确的是哪一项？`,
  (title: string, pattern: ExamQuestionPattern) => `围绕“${title}”的${pattern}，下列哪一项最符合资料中的解题要求？`,
  (title: string) => `根据资料内容，处理“${title}”相关题目时最应优先关注哪一点？`,
  (title: string) => `如果把“${title}”放入新的考试情境中，下列理解最恰当的是哪一项？`,
  (title: string, pattern: ExamQuestionPattern) => `下列关于“${title}”的${pattern}训练，哪一项最不容易导致失分？`,
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
  answerInputMode: question.answerInputMode || (['short', 'solution', 'material'].includes(question.type) ? 'both' : 'text'),
  recommendedVariant: question.recommendedVariant || `围绕“${point.title}”更换条件、语境或设问方式生成同类变式。`,
});

const fallbackSingleQuestion = (point: KnowledgePoint, index: number, pattern: ExamQuestionPattern = '基础概念题'): QuizQuestion => {
  const { answer, options } = orderedOptionsFor(point, pattern, index);
  return withQuality(enrichQuestion({
    id: `q${index + 1}`,
    type: 'single',
    question: questionTemplates[index % questionTemplates.length](point.title, pattern),
    options,
    answer,
    explanation: `本题依据材料中的表述：“${evidenceOf(point)}”正确解法要围绕考点、条件限制、材料依据和得分步骤展开。`,
    optionExplanations: Object.fromEntries(options.map((option) => [option, option === answer ? '该选项符合材料依据和考点要求。' : '该选项属于常见误区，忽略了材料条件或考点边界。'])),
    knowledgePointId: point.id,
    difficulty: difficultyByIndex(index),
    sourceEvidence: evidenceOf(point),
  }, point, pattern));
};

const buildJudgeQuestion = (point: KnowledgePoint, index: number, pattern: ExamQuestionPattern = '易错判断题'): QuizQuestion =>
  {
    const subjectType = subjectOfPoint(point);
    const positiveStatements: Partial<Record<SubjectType, string>> = {
      数学: `处理“${point.title}”相关题目时，既要写出公式依据，也要检查题干条件、符号或取值范围。`,
      高等数学: `处理“${point.title}”相关题目时，应先确认适用前提，再按定义或定理分步推导。`,
      物理: `处理“${point.title}”相关题目时，应先明确研究对象和物理过程，再选择公式。`,
      化学: `处理“${point.title}”相关题目时，应同时关注反应条件、方程式规范和现象依据。`,
      语文: `处理“${point.title}”相关题目时，应结合语境、规则和材料依据进行判断。`,
      计算机: `处理“${point.title}”相关题目时，应能说明过程、边界条件和关键步骤，而不是只背术语。`,
    };
    const negativeStatements: Partial<Record<SubjectType, string>> = {
      数学: `“${point.title}”只要记住结论即可，解答题不需要写中间步骤和条件判断。`,
      高等数学: `“${point.title}”相关题目中，只要套用熟悉公式，就不需要检查定义域或前提条件。`,
      物理: `“${point.title}”相关题目中，方向、单位和过程阶段可以省略，不会影响评分。`,
      化学: `“${point.title}”相关题目中，方程式是否配平、条件是否完整并不影响答案正确性。`,
      语文: `“${point.title}”相关题目只凭语感判断即可，不需要结合材料中的表达关系。`,
      计算机: `“${point.title}”相关题目只需要写术语定义，不需要分析过程或边界条件。`,
    };
    const positive = positiveStatements[subjectType] || positiveStatements[subjectType === '程序设计' || subjectType === '数据结构' || subjectType === '操作系统' || subjectType === '计算机网络' || subjectType === '数据库' ? '计算机' : '数学'] || `“${point.title}”需要结合资料依据、条件限制和考查方式进行判断。`;
    const negative = negativeStatements[subjectType] || negativeStatements[subjectType === '程序设计' || subjectType === '数据结构' || subjectType === '操作系统' || subjectType === '计算机网络' || subjectType === '数据库' ? '计算机' : '数学'] || `“${point.title}”只要记住标题即可，不需要理解资料依据和应用场景。`;
    const isPositive = index % 2 === 0;
    return withQuality(enrichQuestion({
      id: `q${index + 1}`,
      type: 'judge',
      question: isPositive ? positive : negative,
      answer: isPositive ? '正确' : '错误',
      explanation: isPositive
        ? `判断正确。资料依据是：“${evidenceOf(point)}”`
        : `判断错误。该说法忽略了题干条件、标准步骤或材料依据；资料依据是：“${evidenceOf(point)}”`,
      knowledgePointId: point.id,
      difficulty: difficultyByIndex(index),
      sourceEvidence: evidenceOf(point),
    }, point, pattern));
  };

const buildShortQuestion = (point: KnowledgePoint, index: number, pattern: ExamQuestionPattern = '综合解答题'): QuizQuestion =>
  {
    const formula = point.formulas?.[0];
    const method = point.keyMethods?.[0] || getExamStrategy(subjectOfPoint(point)).methods[0];
    return withQuality(enrichQuestion({
      id: `q${index + 1}`,
      type: 'short',
      question: formula
        ? `请围绕“${point.title}”完成一道步骤型解答：写出公式“${formula}”的使用条件，说明解题步骤，并指出一个易错点。`
        : `请结合资料完成“${point.title}”的考试型作答：先定位材料依据，再说明判断方法“${method}”，最后写出常见失分点。`,
      answer: formula
        ? `应写出公式 ${formula}，说明适用条件，按题干条件分步推导，并检查常见误区。资料依据：${evidenceOf(point)}`
        : `应引用资料依据，说明“${point.title}”的判断方法和得分点，并指出常见误区。资料依据：${evidenceOf(point)}`,
      explanation: `回答应覆盖资料依据、关键方法、标准步骤和易错点，不能只复述标题。`,
      knowledgePointId: point.id,
      difficulty: '较难',
      sourceEvidence: evidenceOf(point),
    }, point, pattern));
  };

const scoreQuestionQuality = (question: QuizQuestion) => {
  let score = 100;
  if (question.question.trim().length <= 12) score -= 30;
  if (!question.sourceEvidence?.trim()) score -= 25;
  if (question.explanation.trim().length <= 10) score -= 20;
  if (/^[/、）).,，。；;]/.test(question.question.trim())) score -= 20;
  if (badFragments.some((fragment) => JSON.stringify(question).includes(fragment))) score -= 30;
  if (question.type === 'single') {
    if (!question.options || question.options.length !== 4) score -= 40;
    if (new Set(question.options?.map((option) => option.replace(/\s+/g, ''))).size !== 4) score -= 30;
    const optionPrefix = question.options?.map((option) => option.replace(/^[A-D][.、]\s*/, '').slice(0, 10));
    if (optionPrefix && optionPrefix.length === 4 && new Set(optionPrefix).size <= 2) score -= 20;
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
    if (new Set(normalized.options.map((option) => option.replace(/\s+/g, ''))).size !== 4) return false;
    const optionPrefix = normalized.options.map((option) => option.replace(/^[A-D][.、]\s*/, '').slice(0, 10));
    if (new Set(optionPrefix).size <= 2) return false;
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

const normalizeLLMQuestions = (input: unknown, knowledgePoints: KnowledgePoint[], settings?: QuizSettings) => {
  const record = input as Record<string, unknown>;
  const list = Array.isArray(record?.questions) ? record.questions : [];
  return list
    .filter(isQuizQuestion)
    .map((question, index) => normalizeQuestion(question, knowledgePoints[index % knowledgePoints.length], index))
    .filter(validateQuestion)
    .slice(0, settings?.questionCount ?? 10);
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

const normalizeDifficultyRatio = (settings?: QuizSettings) => {
  const ratio = settings?.difficultyRatio ?? { easy: 20, medium: 50, hard: 30 };
  const total = ratio.easy + ratio.medium + ratio.hard;
  if (total <= 0) return { easy: 20, medium: 50, hard: 30 };
  const easy = Math.round((ratio.easy / total) * 100);
  const medium = Math.round((ratio.medium / total) * 100);
  return { easy, medium, hard: Math.max(0, 100 - easy - medium) };
};

const difficultyFromSettings = (index: number, total: number, settings?: QuizSettings): Difficulty => {
  if (!settings) return difficultyByIndex(index);
  const ratio = normalizeDifficultyRatio(settings);
  const easyCount = Math.max(0, Math.round(total * ratio.easy / 100));
  const mediumCount = Math.max(1, Math.round(total * ratio.medium / 100));
  if (index < easyCount) return '简单';
  if (index < easyCount + mediumCount) return '中等';
  return '较难';
};

const convertQuestionType = (question: QuizQuestion, targetType: QuizQuestion['type'], point: KnowledgePoint, index: number): QuizQuestion => {
  if (targetType === question.type) return question;
  if (targetType === 'single') return question.options?.length === 4 ? { ...question, type: 'single' } : fallbackSingleQuestion(point, index);
  if (targetType === 'judge') {
    return withQuality(enrichQuestion({
      ...question,
      type: 'judge',
      question: `${point.title}的训练必须结合材料依据、条件限制和常见误区进行判断。`,
      options: undefined,
      answer: '正确',
      explanation: question.explanation || `该判断符合材料依据：${evidenceOf(point)}`,
    }, point, '易错判断题'));
  }
  if (targetType === 'fill') {
    return withQuality(enrichQuestion({
      ...question,
      type: 'fill',
      question: `填空题：围绕“${point.title}”，请写出材料中最关键的公式、规则或判断依据。`,
      options: undefined,
      answer: point.formulas?.[0] || point.keywords?.[0] || point.title,
      explanation: `本题考查是否能从资料中准确提取“${point.title}”的核心依据。`,
    }, point, '基础概念题'));
  }
  if (targetType === 'material') {
    return withQuality(enrichQuestion({
      ...question,
      type: 'material',
      question: `材料分析题：结合资料依据“${evidenceOf(point)}”，说明“${point.title}”在题目语境下应如何判断，并指出一个常见误区。`,
      options: undefined,
      answer: `应先定位材料依据，再结合条件或语境判断“${point.title}”的适用方式，最后排除常见误区。`,
      explanation: '材料分析题重在证据定位、规则应用和错误选项辨析。',
    }, point, '材料分析题'));
  }
  return withQuality(enrichQuestion({
    ...question,
    type: targetType,
    options: undefined,
    question: targetType === 'solution'
      ? `解答题：围绕“${point.title}”完成一道同类变式训练，要求写出公式/规则、条件分析、标准步骤和最终结论。`
      : `简答题：结合资料说明“${point.title}”的考查重点、得分点和常见误区。`,
    answer: question.answer || `围绕“${point.title}”写出材料依据、关键步骤、得分点和结论。`,
    explanation: question.explanation || `答案必须包含材料依据、标准步骤和常见误区。`,
  }, point, targetType === 'solution' ? '综合解答题' : '材料分析题'));
};

const applyQuizSettings = (questions: QuizQuestion[], source: KnowledgePoint[], settings?: QuizSettings): QuizQuestion[] => {
  const targetCount = settings?.questionCount ?? 10;
  const desiredTypes: QuizQuestion['type'][] = settings?.questionTypes?.length ? settings.questionTypes : ['single', 'judge', 'short', 'solution'];
  const expanded = [...questions];
  let round = 0;
  while (expanded.length < targetCount) {
    improvedMockQuiz(source, expanded.length + round * 10).forEach((question) => {
      if (expanded.length < targetCount) expanded.push(question);
    });
    round += 1;
    if (round > 3) break;
  }

  return expanded.slice(0, targetCount).map((question, index) => {
    const point = source[index % source.length] || sampleKnowledgePoints[0];
    const targetType = desiredTypes[index % desiredTypes.length];
    const converted = convertQuestionType(question, targetType, point, index);
    return {
      ...converted,
      id: `q${index + 1}`,
      difficulty: difficultyFromSettings(index, targetCount, settings),
      recommendedVariant: converted.recommendedVariant || `围绕“${point.title}”换条件、换语境或换数值生成同类变式。`,
    };
  });
};

export const generateQuiz = async (knowledgePoints: KnowledgePoint[], materialText: string, settings?: QuizSettings): Promise<QuizQuestion[]> => {
  const source = knowledgePoints.length > 0 ? knowledgePoints : sampleKnowledgePoints;
  const prompt = buildQuizPrompt(materialText, source, settings);
  const llmResult = await callLLMJson(prompt.systemPrompt, prompt.userPrompt);
  const llmQuestions = llmResult ? normalizeLLMQuestions(llmResult, source, settings) : [];
  const mockQuestions = improvedMockQuiz(source, llmQuestions.length);

  const combined = [...llmQuestions];
  mockQuestions.forEach((question) => {
    if (combined.length < (settings?.questionCount ?? 10) && !combined.some((item) => item.question === question.question)) combined.push(question);
  });

  return applyQuizSettings(combined, source, settings);
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
    const reasonType = ['short', 'fill', 'solution', 'material'].includes(question.type) ? '表达不完整' : reasonTypes[index % reasonTypes.length];
    const userAnswer = answerMap.get(question.id) || '未作答';
    const missingRubric = [...new Set([
      ...(wrong.missingRubric?.length ? wrong.missingRubric : []),
      ...(question.scoringRubric ?? []),
    ])].slice(0, 5);
    const commonMistake = question.commonMistake || kp?.commonMistakes?.[0] || '只看结论，没有结合条件、步骤或材料依据。';
    const masteryStatus: DiagnosisItem['masteryStatus'] = wrong.score <= 3 ? '薄弱' : wrong.score <= 7 ? '待加强' : '已掌握';
    const correctUnderstanding = `标准答案/结论：${question.answer}。解析：${question.explanation}${question.solutionSteps?.length ? ` 标准步骤：${question.solutionSteps.join('；')}` : ''}`;
    const targetedSuggestion = `你在本题中主要缺少“${missingRubric.slice(0, 3).join('、') || '关键得分点'}”。建议先回看资料依据“${question.sourceEvidence || kp?.sourceEvidence || kp?.description || '对应材料'}”，再按“${kp?.title ?? '该知识点'}”的标准步骤重做原题，随后完成 3 道同类变式；练习时重点检查：${commonMistake}`;
    return {
      id: `diag-${question.id}`,
      questionId: question.id,
      question: question.question,
      knowledgePointTitle: kp?.title ?? '相关知识点',
      userAnswer,
      reasonType,
      diagnosis: `你的答案“${userAnswer}”与标准答案“${question.answer}”不一致，主要问题是没有完整覆盖本题的条件、依据或得分步骤。`,
      correctUnderstanding,
      suggestion: targetedSuggestion,
      missingRubric: missingRubric.length ? missingRubric : ['关键得分点未命中', '材料依据未写完整'],
      commonMistake,
      masteryStatus,
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
  const missingItems = [...new Set(diagnosis.flatMap((item) => item.missingRubric ?? []))].slice(0, 6);
  const sourceEvidenceTasks = diagnosis.slice(0, 3).map((item, index) => `重做错题 ${index + 1}：先写标准答案，再补齐“${(item.missingRubric ?? missingItems).slice(0, 2).join('、') || '缺失得分点'}”。`);
  const isMath = ['数学', '高等数学', '线性代数', '概率统计'].includes(subjectType);
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
        ? ['已知函数关系或公式条件，写出完整代入步骤。', '完成 1 道母题：公式识别 → 条件代入 → 结果检查。', ...sourceEvidenceTasks.slice(0, 1)]
        : ['完成 2 道基础概念/规则识别题。', '从材料中划出能支撑判断的关键词。', ...sourceEvidenceTasks.slice(0, 1)],
      reinforcementTasks: isMath
        ? ['换数值变式 2 道：只换数字，保持公式体系不变。', '换条件变式 2 道：专门检查符号、范围或单位。', ...(missingItems[0] ? [`补齐得分点专项：${missingItems[0]}`] : [])]
        : ['新语境判断题 3 道：每题必须写材料依据。', '易错项辨析题 2 道：说明每个错误选项错在哪里。', ...(missingItems[0] ? [`补齐得分点专项：${missingItems[0]}`] : [])],
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
      exampleTasks: isMath ? ['把第 1 天母题改 2 个条件重新求解。', '用红笔标出每题的条件限制。', ...sourceEvidenceTasks.slice(1, 2)] : ['完成 3 道新语境材料判断题。', '说明每个错误选项错在哪里。', ...sourceEvidenceTasks.slice(1, 2)],
      reinforcementTasks: isMath
        ? ['条件辨析题 3 道：每题写出“条件变化点”。', '易错判断题 3 道：专查符号、范围、单位或前提。', '综合解答题 2 道：按得分点自评。']
        : ['材料分析题 3 道：每题至少引用 1 处资料依据。', '易错判断题 3 道：写出错误原因。', '简答表达题 2 道：按要点分层作答。'],
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
      exampleTasks: ['重做原错题，不看答案写完整步骤。', '把每道错题改成一题同类变式。', ...sourceEvidenceTasks.slice(2, 3)],
      reinforcementTasks: ['完成系统生成的强化题 3-5 道。', '每题对照标准步骤和得分点自评。', '把仍然缺失的得分点写成下一轮复习清单。'],
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
  variantSeed = 0,
): Promise<ReinforcementQuestion[]> => {
  const weak = weakKnowledgePoints.length > 0 ? weakKnowledgePoints : sampleKnowledgePoints.slice(0, 3);
  const wrongQuestionMap = new Map((result?.wrongQuestions ?? []).map((item) => [item.questionId, questions.find((question) => question.id === item.questionId)]));
  const wrongQuestions = [...wrongQuestionMap.values()].filter(Boolean) as QuizQuestion[];
  const pool = wrongQuestions.length > 0 ? wrongQuestions : questions.filter((item) => weak.some((kp) => kp.id === item.knowledgePointId));
  const subjectType = weak[0]?.subjectType || inferSubjectType(weak.map((item) => item.title + item.description).join('\n'));
  const isTrig = /三角|sin|cos|tan/.test(weak.map((item) => `${item.title}${item.description}${item.sourceEvidence}`).join('\n'));

  return weak.slice(0, 5).map((item, index) => {
    const variantIndex = index + (variantSeed % 7);
    const sourceQuestion = pool[variantIndex % Math.max(pool.length, 1)];
    const pattern = sourceQuestion?.examPattern || item.examPatterns?.[variantIndex % Math.max(item.examPatterns.length, 1)] || getQuestionPatternPlan(subjectType)[variantIndex] || '变式迁移题';
    const formula = item.formulas?.[0] || (isTrig ? 'sin²α + cos²α = 1；tanα = sinα / cosα' : '资料中的关键公式/规则');
    const trigQuestion = variantIndex % 3 === 0
      ? '已知 tanα = 5/12，且 α 在第二象限，求 sinα、cosα，并写出完整步骤。'
      : variantIndex % 3 === 1
        ? '已知 tanα = -8/15，且 α 在第四象限，求 sinα、cosα，并说明如何判断正负号。'
        : '请证明恒等式：1 - sin²α = cos²α，并说明它与同角三角函数基本关系的联系。';
    const genericQuestion = pattern === '条件辨析题'
      ? `将原题条件换成新语境：围绕“${item.title}”，判断下列表述是否符合材料依据，并说明理由。`
      : `围绕“${item.title}”完成一道同类变式题：先写考点依据，再写标准步骤，最后指出易错点。`;
    const answer = isTrig && variantIndex % 3 === 0
      ? '设 sinα = 5k，cosα = 12k，由 sin²α + cos²α = 1 得 169k² = 1，所以 |k| = 1/13。第二象限 sinα > 0、cosα < 0，因此 sinα = 5/13，cosα = -12/13。'
      : isTrig && variantIndex % 3 === 1
        ? '设 sinα = -8k，cosα = 15k，由 sin²α + cos²α = 1 得 289k² = 1，所以 |k| = 1/17。第四象限 sinα < 0、cosα > 0，因此 sinα = -8/17，cosα = 15/17。'
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
