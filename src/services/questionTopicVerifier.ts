import type { QuizQuestion } from '../types';
import type { MaterialProfile, MaterialTopic } from './materialTopicService';
import { materialProfileToTopic } from './materialTopicService';

export interface TopicVerificationResult {
  passed: boolean;
  problems: string[];
  score: number;
}

export type MaterialRiskType =
  | 'subject_mismatch'
  | 'chapter_mismatch'
  | 'banned_keyword'
  | 'too_generic'
  | 'duplicate';

export const normalizeQuestionStem = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[a-d][.、]/g, '')
    .replace(/\d+/g, '#')
    .replace(/[，。！？、：；,.!?;:（）()[\]{}]/g, '')
    .slice(0, 100);

export const normalizeStem = normalizeQuestionStem;

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

export function deduplicateQuestions<T extends Pick<QuizQuestion, 'question' | 'normalizedStemHash'>>(
  newQuestions: T[],
  existingQuestions: T[] = []
): T[] {
  const normalizedStems = existingQuestions.map((question) => normalizeQuestionStem(question.question));
  return newQuestions.filter((question) => {
    const normalized = normalizeQuestionStem(question.question);
    if (normalizedStems.some((stem) => stem === normalized || stemSimilarity(stem, normalized) >= 0.9)) return false;
    question.normalizedStemHash = normalizedStemHash(question.question);
    normalizedStems.push(normalized);
    return true;
  });
}

export const normalizedStemHash = (text: string): string => {
  let hash = 2166136261;
  for (const char of normalizeStem(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `stem-${(hash >>> 0).toString(16)}`;
};

export function verifyQuestionAgainstMaterial(
  question: Pick<QuizQuestion, 'subject' | 'question' | 'options' | 'explanation' | 'templateId'>,
  materialProfile: MaterialProfile,
  existingStemHashes: Set<string> = new Set()
): { passed: boolean; reason?: string; riskType?: MaterialRiskType } {
  const content = [question.question, ...(question.options || []), question.explanation || ''].join(' ').toLowerCase();
  if (existingStemHashes.has(normalizedStemHash(question.question))) {
    return { passed: false, reason: '题干与已有题目重复', riskType: 'duplicate' };
  }
  if (question.subject && question.subject !== materialProfile.subject) {
    return { passed: false, reason: `题目学科"${question.subject}"与资料学科"${materialProfile.subject}"不一致`, riskType: 'subject_mismatch' };
  }
  const forbidden = materialProfile.forbiddenTopics.find((keyword) => content.includes(keyword.toLowerCase()));
  if (forbidden) return { passed: false, reason: `题目出现禁用内容：${forbidden}`, riskType: 'banned_keyword' };
  const tooGenericPatterns = [
    /关于[“"]?.{0,20}[”"]?的理解正确的是/,
    /关于概念的判断正确的是/,
    /根据材料[，,]?下列说法正确的是/,
    /下列说法符合材料的是/,
  ];
  if (tooGenericPatterns.some((pattern) => pattern.test(question.question))) {
    return { passed: false, reason: '题干过于空泛，缺少具体材料、条件或设问', riskType: 'too_generic' };
  }
  const subjectSpecificBans: Partial<Record<MaterialProfile['subject'], string[]>> = {
    化学: ['sin', 'cos', 'tan', '函数', '二次函数', '几何', '概率', '数列', '导数', '最小正周期'],
    地理: ['sin', 'cos', 'tan', '化学方程式', '离子反应', '牛顿第二定律', 'f=ma', '遗传规律', '细胞结构'],
    历史: ['公民权利', '监督权', '法治观念', '等高线', '语文阅读'],
    政治: ['历史时间线', '朝代排序', '洋务运动', '辛亥革命'],
  };
  const crossSubject = subjectSpecificBans[materialProfile.subject]?.find((keyword) => content.includes(keyword));
  if (crossSubject) return { passed: false, reason: `${materialProfile.subject}资料中出现跨学科内容：${crossSubject}`, riskType: 'subject_mismatch' };
  if (materialProfile.subject === '化学' && /(?:一元|二元|解)?方程(?!式)/.test(content)) {
    return { passed: false, reason: '化学资料中出现数学方程内容', riskType: 'subject_mismatch' };
  }
  if (!materialProfile.coreConcepts.some((keyword) => content.includes(keyword.toLowerCase()))) {
    return { passed: false, reason: '题目与资料核心概念缺少关联', riskType: 'too_generic' };
  }
  if (materialProfile.allowedTemplateIds.length && question.templateId && !materialProfile.allowedTemplateIds.includes(question.templateId)) {
    return { passed: false, reason: `题目模板"${question.templateId}"不属于当前章节`, riskType: 'chapter_mismatch' };
  }
  return { passed: true };
}

/**
 * 校验题目主题与资料主题的一致性。
 * 防止跨章节乱出题（如同角三角函数资料生成二次函数题）。
 */
export function verifyQuestionTopicAlignment(
  question: QuizQuestion,
  materialTopic: MaterialTopic
): TopicVerificationResult {
  const problems: string[] = [];
  let score = 100;

  // 如果没有具体的 materialTopic（通用），则放行
  if (materialTopic.topicTag === '通用知识' || materialTopic.allowedKeywords.length === 0) {
    return { passed: true, problems: [], score: 100 };
  }

  const questionText = [
    question.question,
    ...(question.options || []),
    question.explanation || '',
    question.commonMistake || '',
  ].join(' ').toLowerCase();

  // 1. bannedKeywords 检查：包含任意禁用词 → 直接不通过
  if (materialTopic.bannedKeywords.length > 0) {
    const foundBanned = materialTopic.bannedKeywords.filter((bk) =>
      questionText.includes(bk.toLowerCase())
    );
    if (foundBanned.length > 0) {
      score -= 100;
      problems.push(`题目包含禁用词汇：${foundBanned.join('、')}，与资料主题"${materialTopic.topicTag}"不一致`);
      return { passed: false, problems, score: Math.max(0, score) };
    }
  }

  // 2. allowedKeywords 检查：未包含任何允许的关键词 → 严重扣分
  if (materialTopic.allowedKeywords.length > 0) {
    const foundAllowed = materialTopic.allowedKeywords.filter((ak) =>
      questionText.includes(ak.toLowerCase())
    );
    if (foundAllowed.length === 0) {
      score -= 50;
      problems.push(`题目未包含资料主题"${materialTopic.topicTag}"的任何关键字，疑似跨章节题目`);
    }
  }

  // 3. templateId 检查：具体主题必须绑定到允许的模板。
  if (materialTopic.allowedTemplateIds.length > 0) {
    if (!question.templateId) {
      score -= 50;
      problems.push(`题目缺少模板标识，无法确认是否属于"${materialTopic.topicTag}"`);
    } else if (!materialTopic.allowedTemplateIds.includes(question.templateId)) {
      score -= 100;
      problems.push(`模板"${question.templateId}"不在资料主题"${materialTopic.topicTag}"的允许范围内`);
      return { passed: false, problems, score: 0 };
    }
  }

  return {
    passed: score >= 80,
    problems,
    score: Math.max(0, score),
  };
}

export function verifyQuestionAgainstProfile(
  question: QuizQuestion,
  profile: MaterialProfile,
  existingStemHashes: Set<string> = new Set()
): TopicVerificationResult {
  const legacyReview = verifyQuestionTopicAlignment(question, materialProfileToTopic(profile));
  const profileReview = verifyQuestionAgainstMaterial(question, profile, existingStemHashes);
  return {
    passed: legacyReview.passed && profileReview.passed,
    problems: [...legacyReview.problems, ...(profileReview.reason ? [profileReview.reason] : [])],
    score: legacyReview.passed && profileReview.passed ? legacyReview.score : 0,
  };
}
