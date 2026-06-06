import type { QuizQuestion } from '../types';
import type { MaterialProfile } from './materialTopicService';
import { normalizeQuestionStem, normalizedStemHash } from './questionTopicVerifier';

export interface QuestionQualityGateResult {
  passed: boolean;
  reason: string;
  level?: 'hard' | 'soft';
}

type QualityGateQuestion = Partial<QuizQuestion> & {
  correctAnswer?: string;
  sourceBasis?: string;
  knowledgePoint?: string;
  scoringPoints?: string[];
};

const genericStemPatterns = [
  /关于.{0,20}(正确|不正确|恰当|不恰当)的是/,
  /关于.{0,20}的理解(正确|恰当)的是/,
  /下列(说法|选项|理解|表述).{0,10}(正确|恰当)的是/,
  /以下(说法|选项|理解|表述).{0,10}(正确|恰当)的是/,
  /根据资料，?关于.{0,20}的理解正确/,
  /资料依据/,
  /阅读资料依据/,
  /能结合资料条件完成具体判断/,
  /完成具体判断/,
  /写出关键条件/,
  /请说明.{0,30}判断依据/,
  /指出一个易错点/,
  /请结合资料分析.{0,20}$/,
];

const concreteSignals = [
  /\d/,
  /[A-Za-z]\s*[=<>]/,
  /(sin|cos|tan|Na|H₂|O₂|COOH|CH₃|DNA|RNA|Ω|V|A|kg|m\/s|℃|mm|π)/i,
  /“[^”]{2,}”|"[^"]{2,}"/,
  /(已知|若|当|给出|材料|阅读|实验|溶液|加入|反应|观察|区域|城市|河流|气候|等高线|事件|革命|运动|年份|社区|学校|学生|商家|句子|诗句|文章|passage|sentence)/i,
  /(甲|乙|丙|丁|第[一二三四五六七八九十]\s*象限|第一秒|第二秒|1\s*月|7\s*月)/,
];

const vagueAnswerPatterns = [
  /应从.{0,12}(区域位置|自然条件|人文条件).{0,12}分析/,
  /需要结合.{0,10}(材料|实际|具体情况).{0,10}分析/,
  /从多个角度分析/,
  /言之有理即可/,
  /答案不唯一/,
  /理解并掌握/,
  /以上都/,
  /核心概念正确/,
  /根据材料作答/,
  /根据资料作答/,
  /写出判断依据/,
  /结合材料形成结论/,
  /应从资料条件分析/,
];

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const getAnswer = (question: QualityGateQuestion): string =>
  normalizeText(question.correctAnswer ?? question.answer);

const getSourceBasis = (question: QualityGateQuestion): string =>
  normalizeText(question.sourceBasis ?? question.sourceEvidence);

const getKnowledgePoint = (question: QualityGateQuestion): string =>
  normalizeText(question.knowledgePoint ?? question.knowledgePointId ?? question.learningObjective ?? question.targetAbility);

const getScoringPoints = (question: QualityGateQuestion): string[] =>
  Array.isArray(question.scoringPoints)
    ? question.scoringPoints
    : Array.isArray(question.scoringRubric)
      ? question.scoringRubric
      : [];

const hasConcreteSignal = (question: QualityGateQuestion): boolean => {
  const content = [
    question.question,
    ...(question.options || []),
    question.explanation,
    question.commonMistake,
    getSourceBasis(question),
  ].join(' ');
  return concreteSignals.some((pattern) => pattern.test(content));
};

const hasCoreConceptMatch = (question: QualityGateQuestion, materialProfile: MaterialProfile): boolean => {
  const content = [
    question.question,
    ...(question.options || []),
    question.explanation,
    question.commonMistake,
    getSourceBasis(question),
    getKnowledgePoint(question),
  ].join(' ').toLowerCase();

  const concepts = materialProfile.coreConcepts
    .map((concept) => concept.trim().toLowerCase())
    .filter((concept) => concept.length >= 2);

  if (concepts.some((concept) => content.includes(concept))) return true;
  if (materialProfile.topic && content.includes(materialProfile.topic.toLowerCase())) return true;
  if (materialProfile.chapter && content.includes(materialProfile.chapter.toLowerCase())) return true;
  return false;
};

const hasMathConcreteExpression = (stem: string): boolean =>
  /([a-zA-Zαβθ]\s*[=<>]|[xy]\s*[²^2]|sin|cos|tan|Δ|b²-4ac|方程|不等式|函数|解集|根|象限|π|\d+\s*[+\-*/]\s*\d+)/i.test(stem);

export function validateQuestionQuality(
  question: QualityGateQuestion,
  materialProfile: MaterialProfile
): QuestionQualityGateResult {
  return evaluateQuestionQuality(question, materialProfile).passed
    ? { passed: true, reason: '通过' }
    : evaluateQuestionQuality(question, materialProfile);
}

export function evaluateQuestionQuality(
  question: QualityGateQuestion,
  materialProfile: MaterialProfile
): QuestionQualityGateResult {
  const stem = normalizeText(question.question);
  const answer = getAnswer(question);
  const explanation = normalizeText(question.explanation);
  const sourceBasis = getSourceBasis(question);
  const knowledgePoint = getKnowledgePoint(question);

  if (!stem) return { passed: false, reason: '题干为空', level: 'hard' };
  if (/[�]{1,}|锛|绗|鐨|鍦|鈥|�/.test(stem + explanation + answer)) {
    return { passed: false, reason: '题目包含乱码', level: 'hard' };
  }
  if (question.subject && question.subject !== materialProfile.subject) {
    return { passed: false, reason: `题目学科${question.subject}与资料学科${materialProfile.subject}不一致`, level: 'hard' };
  }
  if (!answer) return { passed: false, reason: '标准答案为空', level: 'hard' };
  if (!hasCoreConceptMatch(question, materialProfile)) {
    return { passed: false, reason: '题目与上传资料核心知识点无关', level: 'hard' };
  }
  if (vagueAnswerPatterns.some((pattern) => pattern.test(answer))) {
    return { passed: false, reason: '标准答案是泛化方法论，不是具体答案', level: 'hard' };
  }
  if (!knowledgePoint) return { passed: false, reason: '知识点为空', level: 'hard' };

  if (stem.length < 20) return { passed: false, reason: '题干少于20字，缺少真实考试条件', level: 'soft' };
  if (genericStemPatterns.some((pattern) => pattern.test(stem))) {
    return { passed: false, reason: '题干是空泛模板句式', level: 'soft' };
  }
  if (!hasConcreteSignal(question)) {
    return { passed: false, reason: '题目缺少具体材料、数据、条件、句子、实验、区域或事件', level: 'soft' };
  }
  if (materialProfile.subject === '数学' && !hasMathConcreteExpression(stem)) {
    return { passed: false, reason: '数学题缺少具体公式、函数、方程、不等式或计算条件', level: 'soft' };
  }
  if (explanation.length < 30) return { passed: false, reason: '解析少于30字，不能指导学生', level: 'soft' };
  if (!sourceBasis) return { passed: false, reason: '资料依据为空', level: 'soft' };
  if (['short', 'solution', 'material'].includes(normalizeText(question.type)) && getScoringPoints(question).length === 0) {
    return { passed: false, reason: '主观题缺少 scoringPoints/scoringRubric', level: 'soft' };
  }

  return { passed: true, reason: '通过' };
}

export function filterQuestionsByQualityGate<T extends QualityGateQuestion>(
  questions: T[],
  materialProfile: MaterialProfile,
  existingQuestions: T[] = []
): T[] {
  const seen = existingQuestions.map((question) => normalizeQuestionStem(question.question || ''));
  const accepted: T[] = [];

  for (const question of questions) {
    const review = validateQuestionQuality(question, materialProfile);
    if (!review.passed) {
      console.warn('[题目质量门] 已拦截题目:', review.reason, question.question);
      continue;
    }

    const normalized = normalizeQuestionStem(question.question || '');
    const isSimilar = seen.some((previous) => previous === normalized || stemSimilarity(previous, normalized) >= 0.9);
    if (isSimilar) {
      console.warn('[题目质量门] 已拦截题目: 多道题题干结构高度相似', question.question);
      continue;
    }

    question.normalizedStemHash = normalizedStemHash(question.question || '');
    seen.push(normalized);
    accepted.push(question);
  }

  return accepted;
}

const bigrams = (text: string): Set<string> => {
  const result = new Set<string>();
  for (let index = 0; index < text.length - 1; index++) result.add(text.slice(index, index + 2));
  return result;
};

const stemSimilarity = (left: string, right: string): number => {
  if (left === right) return 1;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.size || !rightPairs.size) return 0;
  const overlap = [...leftPairs].filter((pair) => rightPairs.has(pair)).length;
  return (2 * overlap) / (leftPairs.size + rightPairs.size);
};
