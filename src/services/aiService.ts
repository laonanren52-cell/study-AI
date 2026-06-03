import type {
  DiagnosisItem,
  Difficulty,
  ExamQuestionPattern,
  KnowledgeCard,
  KnowledgePoint,
  QuestionBlueprint,
  ContentType,
  QuizQuestion,
  QuizResult,
  QuizSettings,
  ReinforcementQuestion,
  ReviewPlanDay,
  SubjectType,
  UserAnswer,
} from '../types';
import { evaluateQuizAnswers } from '../utils/scoring';
import { getExamStrategy, inferSubjectType, mapToDisplaySubject } from './examStrategy';
import { resolveActualSubject } from './subjectConfig';
import { isLikelyXmlGarbage, cleanExtractedText as deepCleanText } from '../utils/textCleaner';
import { callLLMJson, getAIStatus } from './llmClient';
import { inferMaterialProfile, inferMaterialTopic, isSpecificTopic, materialProfileToTopic } from './materialTopicService';
import type { MaterialProfile } from './materialTopicService';
import { deduplicateQuestions, normalizedStemHash, verifyQuestionAgainstProfile, verifyQuestionTopicAlignment } from './questionTopicVerifier';
import { buildDiagnosisPrompt, buildKnowledgePrompt, buildQuizPrompt } from './promptTemplates';
import { generateKnowledgeCards, generateQuestionBlueprints, validateBlueprint } from './questionBlueprintService';
import { reviewQuestionQuality, reviewQuestionsQuality } from './questionQualityService';
import { regenerateLowQualityQuestions } from './questionRegenerationService';
import { generateFallbackQuestionsFromBlueprints } from './fallbackQuestionFactory';
import { verifyQuestionAccuracy } from './questionVerifierService';
import { buildFallbackBlueprints } from './questionBlueprintService';
import { generateFallbackReinforcementQuestions } from './reinforcementFactory';
import { generateQuestionsByConfig } from './questionGenerationOrchestrator';
import type { OrchestratorResult } from './questionGenerationOrchestrator';
import { getWebEnhancedReferenceContext } from './webEnhancedQuestionService';

export { getAIStatus };

// 有效的考试题型模式
const VALID_EXAM_PATTERNS: ExamQuestionPattern[] = [
  '基础概念题',
  '公式套用题',
  '条件辨析题',
  '易错判断题',
  '材料分析题',
  '变式迁移题',
  '综合解答题',
];

const SCHOOL_SUBJECTS: SubjectType[] = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '政治', '地理'];

const isSubjectType = (subject: unknown): subject is SubjectType =>
  typeof subject === 'string' && SCHOOL_SUBJECTS.includes(subject as SubjectType);

const resolveSafeSubject = (subject: unknown, fallback: SubjectType = '语文'): SubjectType =>
  isSubjectType(subject) ? subject : fallback;

// ========== 知识点提取：强制使用API，失败则报错 ==========
const isKnowledgePoint = (item: unknown): item is KnowledgePoint => {
  const value = item as Partial<KnowledgePoint>;
  return Boolean(
    value?.id &&
    value.title &&
    value.description &&
    value.importance &&
    value.masteryTarget &&
    value.examType
  );
};

const normalizeKnowledgePoints = (input: unknown): KnowledgePoint[] => {
  const record = input as Record<string, unknown>;
  const list = Array.isArray(record?.knowledgePoints) ? record.knowledgePoints : [];

  return list
    .filter(isKnowledgePoint)
    .map((item, index): KnowledgePoint => {
      const rawPatterns = Array.isArray(item.examPatterns) ? item.examPatterns : [];
      const filteredPatterns: ExamQuestionPattern[] = [];

      for (const p of rawPatterns) {
        if (VALID_EXAM_PATTERNS.includes(p as ExamQuestionPattern)) {
          filteredPatterns.push(p as ExamQuestionPattern);
        }
      }

      return {
        id: item.id || `kp-${index + 1}`,
        title: item.title,
        description: item.description,
        importance: item.importance,
        masteryTarget: item.masteryTarget,
        examType: item.examType,
        sourceEvidence: item.sourceEvidence || item.description,
        keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 5) : [],
        subjectType: isSubjectType(item.subjectType) ? item.subjectType : undefined,
        examPatterns: filteredPatterns.length > 0 ? filteredPatterns : ['基础概念题', '易错判断题'],
        formulas: Array.isArray(item.formulas) ? item.formulas.slice(0, 4) : [],
        commonMistakes: Array.isArray(item.commonMistakes) ? item.commonMistakes.slice(0, 4) : [],
        keyMethods: Array.isArray(item.keyMethods) ? item.keyMethods.slice(0, 4) : [],
      };
    })
    .slice(0, 8);
};

// ========== 试卷自动识别 ==========
export function detectContentType(text: string): ContentType {
  const examKeywords = [
    '考试', '真题', 'Directions', 'Section A', 'Section B', 'Section C',
    'Part I', 'Part II', 'Part III', 'Part IV',
    '选择题', '答案', '听力', '阅读理解', '翻译', '写作',
  ];
  const lowerText = text.toLowerCase();
  let matchCount = 0;
  for (const keyword of examKeywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }
  return matchCount >= 3 ? 'exam' : 'material';
}

export interface ExamPaperResult {
  examType: string;
  questions: QuizQuestion[];
}

export const extractExamPaper = async (materialText: string): Promise<ExamPaperResult> => {
  const systemPrompt = '你是一个专业的考试试题提取助手。你的唯一任务是从试卷内容中提取所有题目。你必须逐行扫描，不放过任何一道题。你只能输出 JSON。';
  const userPrompt = `请从以下内容中提取所有考试题目。

【重要提示】以下内容可能是多页试卷合并而成（通过OCR识别多张图片后拼接）。如果看到 "========== 第X页 ==========" 这样的分页标记，说明这是多页内容，请把所有页的题目合并提取，当作一份完整试卷处理。

【强制规则 - 逐条执行】
1. 遍历全部内容，逐行扫描，找到所有包含 "A) B) C) D)" 或 "A. B. C. D." 或 "1. 2. 3. 4." 选项标记的题目
2. 听力题：只有题目文本+选项，没有原文段落，正常提取，type 为 "single"
3. 阅读题：有文章段落+题目+选项，提取题目和选项，explanation 中注明原文出处
4. 写作题：提取写作要求作为题干（question 字段），type 为 "short"，options 为空数组 []
5. 翻译题：提取翻译要求作为题干，type 为 "short"，options 为空数组 []
6. 填空题：提取填空内容作为题干，type 为 "fill"
7. 多页内容：把所有页的题目全部提取出来，不要遗漏任何一页！忽略分页标记，把所有内容当作一份完整试卷
8. 哪怕只有 1 道题，也要正常返回，绝对不能返回空数组！
9. 如果实在找不到任何题目，返回 {"examType": "fallback", "questions": []}，让系统降级处理

输出格式：
\`\`\`json
{
  "examType": "试卷类型（如：课后小测、单元测或期中期末测评）",
  "questions": [
    {
      "id": "q-1",
      "type": "single",
      "question": "题干内容（听力题直接写题目文本，写作题写写作要求）",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": "正确答案（如果试卷中有答案就填，没有就填\"见解析\"）",
      "explanation": "答案解析或原文出处",
      "difficulty": "中等",
      "qualityScore": 85
    }
  ]
}
\`\`\`

试卷内容（多页合并）：
${materialText.slice(0, 20000)}`;

  const llmResult = await callLLMJson(systemPrompt, userPrompt);
  
  if (!llmResult) {
    throw new Error('AI服务暂时不可用');
  }

  const record = llmResult as Record<string, unknown>;
  const examType = (record.examType as string) || '';
  const questions = Array.isArray(record.questions) 
    ? record.questions.filter((q: any) => Boolean(q?.question)).map((q: any, i: number) => ({
        ...q,
        id: q.id || `exam-q-${i + 1}`,
        type: q.type || 'single',
        difficulty: q.difficulty || '中等',
        qualityScore: q.qualityScore ?? 85,
        sourceEvidence: q.sourceEvidence || materialText.slice(0, 200),
      }))
    : [];

  // 降级保护：如果提取到0道题，标记为 fallback 让前端降级到学习资料模式
  if (questions.length === 0) {
    console.warn('[真题提取] 提取到0道题，触发降级保护');
    return { examType: 'fallback', questions: [] };
  }

  return { examType, questions };
};

export const extractKnowledgePoints = async (materialText: string): Promise<KnowledgePoint[]> => {
  const detectedSubject = inferSubjectType(materialText);
  const resolvedSubject = resolveActualSubject(undefined, detectedSubject);
  const cleanedText = deepCleanText(materialText);
  const prompt = buildKnowledgePrompt(cleanedText, resolvedSubject);
  const llmResult = await callLLMJson(prompt.systemPrompt, prompt.userPrompt);

  if (!llmResult) {
    throw new Error('AI服务暂时不可用，请检查网络连接或稍后重试');
  }

  const knowledgePoints = normalizeKnowledgePoints(llmResult);

  if (knowledgePoints.length === 0) {
    throw new Error('未能从资料中提取到有效的知识点，请检查资料内容是否包含可考查的考点');
  }

    // 过滤包含 XML 垃圾的知识点
  const filtered = knowledgePoints.filter(kp => {
    const fields = [kp.title, kp.description, kp.sourceEvidence || ''];
    return !fields.some(f => isLikelyXmlGarbage(f));
  });
  if (filtered.length < 2 && knowledgePoints.length >= 2) {
    console.warn('[知识点过滤] XML 垃圾知识点过多');
  }
  return filtered.length > 0 ? filtered : knowledgePoints;

return knowledgePoints;
};

// ========== 题目生成：考点卡 → 命题蓝图 → LLM生成 → 质量审查 → 重生成 → fallback ==========

const isQuizQuestion = (item: unknown): item is QuizQuestion => {
  const value = item as Partial<QuizQuestion>;
  return Boolean(
    value?.id &&
    value.type &&
    value.question &&
    value.answer &&
    value.explanation &&
    value.knowledgePointId &&
    value.difficulty
  );
};

const normalizeQuestions = (
  input: unknown,
  knowledgePoints: KnowledgePoint[],
  blueprints: QuestionBlueprint[]
): QuizQuestion[] => {
  const record = input as Record<string, unknown>;
  const list = Array.isArray(record?.questions) ? record.questions : [];

  return list
    .filter(isQuizQuestion)
    .map((item, index) => {
      const point = knowledgePoints[index % knowledgePoints.length];
      const blueprint = blueprints[index % blueprints.length];
      return {
        ...item,
        id: item.id || `q-${index + 1}`,
        knowledgePointId: item.knowledgePointId || point?.id || `kp-${index}`,
        blueprintId: item.blueprintId || blueprint?.id || '',
        templateId: item.templateId || blueprint?.templateId,
        sourceEvidence: item.sourceEvidence || point?.sourceEvidence || '',
        examPattern: item.examPattern || blueprint?.examPattern || '基础概念题',
        targetAbility: item.targetAbility || blueprint?.targetAbility || '',
        requiredMethods: Array.isArray(item.requiredMethods)
          ? item.requiredMethods
          : blueprint?.requiredMethods || [],
        scoringRubric: Array.isArray(item.scoringRubric) ? item.scoringRubric : [],
        solutionSteps: Array.isArray(item.solutionSteps) ? item.solutionSteps : [],
        commonMistake: item.commonMistake || '',
        optionExplanations: item.optionExplanations || {},
        qualityScore: item.qualityScore || 0,
        correctOptionLabel: normalizeCorrectOptionLabel(item as Partial<QuizQuestion>),
      };
    })
    .slice(0, 15);
};

// ========== 答案格式统一辅助函数 ==========

/** 标准化 correctOptionLabel */
function normalizeCorrectOptionLabel(item: Partial<QuizQuestion>): 'A' | 'B' | 'C' | 'D' | undefined {
  if (item.correctOptionLabel && ['A','B','C','D'].includes(item.correctOptionLabel)) {
    return item.correctOptionLabel as 'A' | 'B' | 'C' | 'D';
  }
  if (/^[A-D]$/.test(item.answer || '')) {
    return item.answer as 'A' | 'B' | 'C' | 'D';
  }
  if (item.options && item.answer) {
    const idx = item.options.findIndex(o => {
      const clean = o.replace(/^[A-D][.、]\s*/, '');
      return clean === item.answer || o === item.answer;
    });
    if (idx >= 0) {
      return String.fromCharCode(65 + idx) as 'A' | 'B' | 'C' | 'D';
    }
  }
  return undefined;
}

// ========== 最终质量门禁 ==========

/** 在题目返回前强制执行质量审查，剔除低分题，用 fallback 补齐 */
function applyFinalQualityGate(
  questions: QuizQuestion[],
  blueprints: QuestionBlueprint[],
  knowledgeCards: KnowledgeCard[],
  targetCount: number,
  settings?: QuizSettings,
  materialTopic?: ReturnType<typeof inferMaterialTopic>,
  materialProfile?: MaterialProfile
): QuizQuestion[] {
  const reviewQuestion = (q: QuizQuestion) => {
    const review = reviewQuestionQuality(q);
    const accuracy = verifyQuestionAccuracy(q);
    const topic = materialProfile
      ? verifyQuestionAgainstProfile(q, materialProfile)
      : materialTopic ? verifyQuestionTopicAlignment(q, materialTopic) : { passed: true, problems: [], score: 100 };
    return {
      ...q,
      qualityScore: review.score,
      qualityReview: review,
      isLowQuality: !review.passed || !accuracy.passed || !topic.passed,
    };
  };

  const passesGate = (q: QuizQuestion) => {
    const review = reviewQuestionQuality(q);
    const accuracy = verifyQuestionAccuracy(q);
    const topic = materialProfile
      ? verifyQuestionAgainstProfile(q, materialProfile)
      : materialTopic ? verifyQuestionTopicAlignment(q, materialTopic) : { passed: true, problems: [], score: 100 };
    if (!review.passed || review.score < 80 || !accuracy.passed || !topic.passed) {
      console.warn(`[质量门禁] 题目 ${q.id} 未通过最终审核`, {
        quality: review.problems,
        accuracy: accuracy.problems,
        topic: topic.problems,
      });
      return false;
    }
    return true;
  };

  let finalQuestions = questions.map(reviewQuestion);

  // 2. 同时执行质量、准确性和主题一致性门禁
  const passed = finalQuestions.filter(passesGate);
  const failed = finalQuestions.filter((q) => !passesGate(q));

  console.log(`[质量门禁] 最终审查: 通过 ${passed.length}, 不合格 ${failed.length}, 目标 ${targetCount}`);

  if (failed.length > 0) {
    console.warn(`[质量门禁] 不合格题目详情:`, failed.map((f: any) => ({
      id: f.id,
      score: f.qualityScore,
      problems: f.qualityReview?.problems || [],
    })));
  }

  finalQuestions = passed;

  // 3. 用 fallback 补齐
  if (finalQuestions.length < targetCount && blueprints.length > 0) {
    const needed = targetCount - finalQuestions.length;
    const fallbackBps = blueprints.slice(0, Math.min(needed * 2, blueprints.length));
    const fallbackQs = generateFallbackQuestionsFromBlueprints(fallbackBps, knowledgeCards, settings, materialTopic);

    const qualityFiltered = fallbackQs.map(reviewQuestion).filter(passesGate);

    finalQuestions = [...finalQuestions, ...qualityFiltered].slice(0, targetCount);
  }

  // 4. 过滤全部低分题
  const clean = deduplicateQuestions(finalQuestions.filter(passesGate));

  if (clean.length < targetCount) {
    console.warn(`[质量门禁] 最终题数不足: 目标 ${targetCount}，实际 ${clean.length}`);
  }

  return clean;
}

const difficultyFromSettings = (index: number, total: number, settings?: QuizSettings): Difficulty => {
  if (!settings?.difficultyRatio) return index < 3 ? '简单' : index < 7 ? '中等' : '较难';

  const { easy, medium } = settings.difficultyRatio;
  const totalRatio = easy + medium + (100 - easy - medium);
  const easyCount = Math.max(1, Math.round(total * (easy / totalRatio)));
  const mediumCount = Math.max(1, Math.round(total * (medium / totalRatio)));

  if (index < easyCount) return '简单';
  if (index < easyCount + mediumCount) return '中等';
  return '较难';
};

/**
 * 完整的题目生成流程：
 * 1. 生成考点卡（KnowledgeCard）
 * 2. 生成命题蓝图（QuestionBlueprint）
 * 3. 调用 LLM 生成题目
 * 4. 质量审查（每道题）
 * 5. 低质量题重生成
 * 6. 仍不合格则用 fallback 模板替换
 */
/** 出题结果（包含调度器元数据） */
export interface GenerateQuizResult {
  questions: QuizQuestion[];
  orchestratorResult: OrchestratorResult;
}

/**
 * 统一出题入口 - 委托给 questionGenerationOrchestrator
 * 所有设置（题数、题型、难度、考试类型、训练模式、知识点）通过 QuestionPlan 真实生效
 */
export const generateQuiz = async (
  knowledgePoints: KnowledgePoint[],
  materialText: string,
  settings?: QuizSettings
): Promise<QuizQuestion[]> => {
  const result = await generateQuizWithMeta(knowledgePoints, materialText, settings);
  return result.questions;
};

/** 带调度器元数据的出题入口 */
export const generateQuizWithMeta = async (
  knowledgePoints: KnowledgePoint[],
  materialText: string,
  settings?: QuizSettings
): Promise<GenerateQuizResult> => {
  if (knowledgePoints.length === 0) {
    throw new Error('没有可用的知识点，无法生成题目');
  }

  const effectiveSettings: QuizSettings = settings ?? {
    subjectType: '自动识别',
    examType: '自动识别',
    questionCount: 10,
    difficultyRatio: { easy: 20, medium: 50, hard: 30 },
    questionTypes: ['single'],
    trainingMode: '基础巩固',
    strictSourceMode: true,
    enableWebEnhancedQuestions: false,
  };

  const detectedSubject = inferSubjectType(materialText);
  const materialProfile = inferMaterialProfile(materialText, knowledgePoints, effectiveSettings.subjectType);
  if (!materialProfile) {
    throw new Error('未能识别资料主题，请重新上传资料或手动选择初高中学科。');
  }
  const materialTopic = materialProfileToTopic(materialProfile);

  const orchestratorResult = await generateQuestionsByConfig({
    materialProfile,
    materialTopic,
    sourceText: cleanExtractedText(materialText),
    knowledgePoints,
    settings: effectiveSettings,
  });

  if (orchestratorResult.questions.length === 0) {
    throw new Error('未能生成有效题目，请稍后重试');
  }

  return { questions: orchestratorResult.questions, orchestratorResult };
};
// ========== 答案评估 ==========
export const evaluateAnswers = async (
  questions: QuizQuestion[],
  answers: UserAnswer[],
  knowledgePoints: KnowledgePoint[]
): Promise<QuizResult> => evaluateQuizAnswers(questions, answers, knowledgePoints);

// ========== 诊断生成：强制使用API，失败则使用备用逻辑 ==========
const isDiagnosisItem = (item: unknown): item is DiagnosisItem => {
  const value = item as Partial<DiagnosisItem>;
  return Boolean(
    value?.id &&
    value.questionId &&
    value.question &&
    value.knowledgePointTitle &&
    value.reasonType &&
    value.diagnosis &&
    value.correctUnderstanding &&
    value.suggestion
  );
};

export const generateDiagnosis = async (
  result: QuizResult,
  questions: QuizQuestion[],
  answers: UserAnswer[]
): Promise<DiagnosisItem[]> => {
  const prompt = buildDiagnosisPrompt(result, questions, answers);
  const llmResult = await callLLMJson(prompt.systemPrompt, prompt.userPrompt);

  if (llmResult && Array.isArray((llmResult as Record<string, unknown>).diagnosis)) {
    const diagnosis = ((llmResult as Record<string, unknown>).diagnosis as unknown[])
      .filter(isDiagnosisItem);
    if (diagnosis.length > 0) return diagnosis;
  }

  // API失败时使用备用逻辑生成诊断
  const answerMap = new Map(answers.map((item) => [item.questionId, item.answer]));
  const reasonTypes: DiagnosisItem['reasonType'][] = [
    '概念不清',
    '公式误用',
    '象限判断错误',
    '计算失误',
    '审题错误',
    '材料理解偏差',
  ];

  return result.wrongQuestions.map((wrong, index) => {
    const question = questions.find((item) => item.id === wrong.questionId);
    if (!question) {
      return {
        id: `diag-${wrong.questionId}`,
        questionId: wrong.questionId,
        question: '未知题目',
        knowledgePointTitle: '未知知识点',
        userAnswer: answerMap.get(wrong.questionId) || '未作答',
        reasonType: '审题错误',
        diagnosis: '无法定位题目信息',
        correctUnderstanding: '请查看原题和答案',
        suggestion: '请重新进行测评',
      };
    }

    const kp = result.byKnowledgePoint.find(
      (item) => item.knowledgePoint.id === question.knowledgePointId
    )?.knowledgePoint;

    const reasonType = ['short', 'fill', 'solution', 'material'].includes(question.type)
      ? '材料理解偏差'
      : reasonTypes[index % reasonTypes.length];

    const userAnswer = answerMap.get(question.id) || '未作答';

    const missingRubric = [
      ...(wrong.missingRubric?.length ? wrong.missingRubric : []),
      ...(question.scoringRubric ?? []),
    ].slice(0, 5);

    const commonMistake =
      question.commonMistake ||
      kp?.commonMistakes?.[0] ||
      '只看结论，没有结合条件、步骤或材料依据。';

    const masteryStatus: DiagnosisItem['masteryStatus'] =
      wrong.score <= 3 ? '薄弱' : wrong.score <= 7 ? '待加强' : '已掌握';

    const correctUnderstanding = `标准答案/结论：${question.answer}。解析：${question.explanation}${
      question.solutionSteps?.length ? ` 标准步骤：${question.solutionSteps.join('；')}` : ''
    }`;

    const targetedSuggestion = `你在本题中主要缺少"${
      missingRubric.slice(0, 3).join('、') || '关键得分点'
    }"，建议先回看资料依据"${
      question.sourceEvidence || kp?.sourceEvidence || kp?.description || '对应材料'
    }"，再按"${kp?.title ?? '该知识点'}"的标准步骤重做原题，随后完成 3 道同类变式；练习时重点检查：${commonMistake}`;

    return {
      id: `diag-${question.id}`,
      questionId: question.id,
      question: question.question,
      knowledgePointTitle: kp?.title ?? '相关知识点',
      userAnswer,
      reasonType,
      diagnosis: `你的答案"${userAnswer}"与标准答案"${question.answer}"不一致，主要问题是没有完整覆盖本题的条件、依据或得分步骤。`,
      correctUnderstanding,
      suggestion: targetedSuggestion,
      missingRubric: missingRubric.length ? missingRubric : ['关键得分点未命中', '材料依据未写完整'],
      commonMistake,
      masteryStatus,
    };
  });
};

// ========== 复习计划生成 ==========
export const generateReviewPlan = async (
  diagnosis: DiagnosisItem[],
  weakKnowledgePoints: KnowledgePoint[]
): Promise<ReviewPlanDay[]> => {
  if (!diagnosis || diagnosis.length === 0 || !weakKnowledgePoints || weakKnowledgePoints.length === 0) {
    return [];
  }
  const validWeakPoints = weakKnowledgePoints.filter(kp => {
    return !isLikelyXmlGarbage(kp.title) && !isLikelyXmlGarbage(kp.description);
  });
  if (validWeakPoints.length === 0) {
    return [];
  }
  const focus = validWeakPoints.map((item) => item.title);

  const subjectType = resolveSafeSubject(weakKnowledgePoints[0]?.subjectType);
  const strategy = getExamStrategy(subjectType);
  const formulas = [...new Set(weakKnowledgePoints.flatMap((item) => item.formulas ?? []))];
  const mistakes = [
    ...new Set([
      ...weakKnowledgePoints.flatMap((item) => item.commonMistakes ?? []),
      ...strategy.commonMistakes,
    ]),
  ].slice(0, 5);

  const missingItems = [...new Set(diagnosis.flatMap((item) => item.missingRubric ?? []))].slice(
    0,
    6
  );

  const sourceEvidenceTasks = diagnosis.slice(0, 3).map(
    (item, index) =>
      `重做错题 ${index + 1}：先写标准答案，再补齐"${
        (item.missingRubric ?? missingItems).slice(0, 2).join('、') || '缺失得分点'
      }"`
  );

  const isMath = subjectType === '数学';

  return [
    {
      day: 1,
      goal: isMath
        ? '掌握核心公式、定义和条件限制，建立母题解法框架。'
        : `巩固${focus.slice(0, 2).join('、')}等基础考点和判断规则。`,
      focusKnowledgePoints: focus.slice(0, 2),
      duration: '35 分钟',
      practiceCount: 6,
      method: isMath
        ? '先默写公式，再做 2 道母题，最后复盘条件和符号。'
        : '先整理规则，再做语境/材料判断题，最后用错因表复盘。',
      mustRemember:
        formulas.length > 0
          ? formulas
          : [`${focus[0]}的定义、适用条件和材料依据`, ...strategy.methods.slice(0, 2)],
      exampleTasks: isMath
        ? [
            '已知函数关系或公式条件，写出完整代入步骤。',
            '完成 1 道母题：公式识别 → 条件代入 → 结果检查。',
            ...sourceEvidenceTasks.slice(0, 1),
          ]
        : [
            '完成 2 道基础概念/规则识别题。',
            '从材料中划出能支撑判断的关键词。',
            ...sourceEvidenceTasks.slice(0, 1),
          ],
      reinforcementTasks: isMath
        ? [
            '换数值变式 2 道：只换数字，保持公式体系不变。',
            '换条件变式 2 道：专门检查符号、范围或单位。',
            ...(missingItems[0] ? [`补齐得分点专项：${missingItems[0]}`] : []),
          ]
        : [
            '新语境判断题 3 道：每题必须写材料依据。',
            '易错项辨析题 2 道：说明每个错误选项错在哪里。',
            ...(missingItems[0] ? [`补齐得分点专项：${missingItems[0]}`] : []),
          ],
      commonMistakes: mistakes.slice(0, 3),
      selfCheckCriteria: isMath
        ? ['能在 5 分钟内写出公式和适用条件。', '能说明每一步推导依据。']
        : ['能说出规则依据。', '能用材料原句支持判断。'],
      checklist: [
        { id: 'd1-1', text: '默写必背公式/定义', done: false },
        { id: 'd1-2', text: '完成母题或基础判断题', done: false },
        { id: 'd1-3', text: '记录 2 个易错点', done: false },
      ],
    },
    {
      day: 2,
      goal: isMath
        ? '强化条件辨析和变式迁移，减少因条件变化导致的失分。'
        : '强化材料中的应用场景、语境条件和易错辨析。',
      focusKnowledgePoints: focus.length > 2 ? focus.slice(1, 4) : focus,
      duration: '45 分钟',
      practiceCount: 8,
      method: isMath
        ? '按"已知条件变化、公式不变、符号/范围变化"做变式训练。'
        : '按"规则、语境、材料依据、易错项"四列制作对比表。',
      mustRemember: formulas.length > 0 ? formulas : strategy.methods,
      exampleTasks: isMath
        ? [
            '把第 1 天母题改 2 个条件重新求解。',
            '用红笔标出每题的条件限制。',
            ...sourceEvidenceTasks.slice(1, 2),
          ]
        : [
            '完成 3 道新语境材料判断题。',
            '说明每个错误选项错在哪里。',
            ...sourceEvidenceTasks.slice(1, 2),
          ],
      reinforcementTasks: isMath
        ? [
            '条件辨析题 3 道：每题写出"条件变化点"。',
            '易错判断题 3 道：专查符号、范围、单位或前提。',
            '综合解答题 2 道：按得分点自评。',
          ]
        : [
            '材料分析题 3 道：每题至少引用 1 处资料依据。',
            '易错判断题 3 道：写出错误原因。',
            '简答表达题 2 道：按要点分层作答。',
          ],
      commonMistakes: mistakes,
      selfCheckCriteria: isMath
        ? ['能主动检查符号、范围、单位或定义域。', '能独立写出至少 3 个得分点。']
        : ['能区分规则本身和语境条件。', '能完整写出判断理由。'],
      checklist: [
        { id: 'd2-1', text: '完成至少 6 道同类变式题', done: false },
        { id: 'd2-2', text: '标注每道题的条件变化', done: false },
        { id: 'd2-3', text: '整理错因和缺失得分点', done: false },
      ],
    },
    {
      day: 3,
      goal: '复盘错题并完成二次强化测试。',
      focusKnowledgePoints:
        diagnosis.length > 0
          ? [...new Set(diagnosis.map((item) => item.knowledgePointTitle))]
          : focus,
      duration: '30 分钟',
      practiceCount: 5,
      method: '先遮住解析重答错题，再完成系统生成的同类变式，最后按得分点自评。',
      mustRemember:
        formulas.length > 0
          ? formulas
          : [`${focus[0]}的易错边界`, '错题对应的标准步骤和得分点'],
      exampleTasks: [
        '重做原错题，不看答案写完整步骤。',
        '把每道错题改成一题同类变式。',
        ...sourceEvidenceTasks.slice(2, 3),
      ],
      reinforcementTasks: [
        '完成系统生成的强化题 3-5 道。',
        '每题对照标准步骤和得分点自评。',
        '把仍然缺失的得分点写成下一轮复习清单。',
      ],
      commonMistakes: mistakes,
      selfCheckCriteria: [
        '能说清原错因。',
        '能在限定时间内完成同类变式。',
        '能对照得分点找出缺失项。',
      ],
      checklist: [
        { id: 'd3-1', text: '遮住答案重做错题', done: false },
        { id: 'd3-2', text: '完成二次强化题', done: false },
        { id: 'd3-3', text: '按得分点自评并记录仍需复习项', done: false },
      ],
    },
  ];
};

// ========== 错题变式题生成 ==========
export const generateVariantQuestions = async (
  wrongQuestion: QuizQuestion,
  knowledgePoint: KnowledgePoint,
  actualSubject: string,
  materialText: string
): Promise<QuizQuestion[]> => {
  const materialTopic = inferMaterialTopic(materialText, [knowledgePoint]);
  const systemPrompt = '你是高考命题专家。你必须只输出 JSON。';
  const userPrompt = `基于以下错题的知识点，生成3道考察同一原理但题干形式不同的变式题，难度略高于原题，帮助用户彻底掌握这个知识点。

原题：
${wrongQuestion.question}
${wrongQuestion.options ? wrongQuestion.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n') : ''}
正确答案：${wrongQuestion.answer}
知识点：${knowledgePoint.title}
实际学科：${actualSubject}
资料主题：${materialTopic.topicTag}
禁止跨章节内容：${materialTopic.bannedKeywords.join('、')}

要求：
1. 3道题必须考察同一核心原理，但题干场景、数值、条件不同
2. 难度略高于原题
3. 每道题包含完整题干、4个选项、正确答案、详细解析
4. 输出 JSON 格式：
{
  "questions": [
    {
      "id": "v-1",
      "type": "single",
      "question": "变式题题干",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "answer": "正确答案",
      "explanation": "详细解析",
      "difficulty": "中等",
      "qualityScore": 85
    }
  ]
}

资料原文参考：
${materialText.slice(0, 3000)}`;

  const llmResult = await callLLMJson(systemPrompt, userPrompt);
  if (!llmResult) return [];

  const record = llmResult as Record<string, unknown>;
  const questions = Array.isArray(record.questions)
    ? record.questions.map((q: any, i: number) => ({
        ...q,
        id: q.id || `variant-${i + 1}`,
        type: q.type || 'single',
        difficulty: q.difficulty || '中等',
        qualityScore: q.qualityScore ?? 85,
        knowledgePointId: knowledgePoint.id,
        templateId: wrongQuestion.templateId,
        sourceEvidence: materialText.slice(0, 200),
      }))
    : [];

  return questions.filter((question) => verifyQuestionTopicAlignment(question, materialTopic).passed);
};

// ========== 强化题生成（优先 LLM，失败用 fallback） ==========
export const generateReinforcementQuiz = async (
  weakKnowledgePoints: KnowledgePoint[],
  questions: QuizQuestion[] = [],
  result?: QuizResult,
  variantSeed = 0,
  materialProfile?: MaterialProfile,
  previousQuestions: ReinforcementQuestion[] = []
): Promise<ReinforcementQuestion[]> => {
  const weak = weakKnowledgePoints.length > 0 ? weakKnowledgePoints : [];

  if (weak.length === 0) {
    return [];
  }

  const wrongQuestionMap = new Map(
    (result?.wrongQuestions ?? []).map((item) => [
      item.questionId,
      questions.find((question) => question.id === item.questionId),
    ])
  );

  const wrongQuestions = [...wrongQuestionMap.values()].filter(Boolean) as QuizQuestion[];
  const targetCount = Math.min(5, Math.max(3, weak.length, wrongQuestions.length * 2));

  // 优先尝试 LLM 生成
  try {
    const subjectType = resolveSafeSubject(materialProfile?.subject || weak[0]?.subjectType);
    const isMath = subjectType === '数学';

    const basePrompt = isMath
      ? '你是一位数学强化训练命题专家。请为以下薄弱知识点生成同类变式题（换数值/换条件/换表述）。'
      : '你是一位学科强化训练命题专家。请为以下薄弱知识点生成同类变式题（换语境/换角度/换材料）。';

    const questionList = Array.from({ length: targetCount }, (_, index) => weak[index % weak.length]).map((kp) => ({
      knowledgePoint: kp.title,
      description: kp.description,
      formula: kp.formulas?.[0] || '',
      keyMethod: kp.keyMethods?.[0] || '',
      commonMistake: kp.commonMistakes?.[0] || '',
      sourceEvidence: kp.sourceEvidence || kp.description,
    }));

    const llmResult = await callLLMJson(
      `${basePrompt} 每个知识点生成 1 道变式题，包含题干、选项、答案、解析、提示、得分点。输出 JSON 格式：{"questions": [...]}`,
      JSON.stringify({ knowledgePoints: questionList, seed: variantSeed }, null, 2)
    );

    if (llmResult && Array.isArray((llmResult as Record<string, unknown>).questions)) {
      const llmQuestions = (llmResult as Record<string, unknown>).questions as ReinforcementQuestion[];
      if (llmQuestions.length > 0) {
        const previousHashes = new Set(previousQuestions.map((question) => normalizedStemHash(question.question)));
        const verifiedQuestions = deduplicateQuestions(llmQuestions.map((q, i) => ({
          ...q,
          id: q.id || `rq-llm-${Date.now()}-${i}`,
          subject: materialProfile?.subject,
          normalizedStemHash: normalizedStemHash(q.question),
          knowledgePointId: weak[i % weak.length]?.id || '',
          knowledgePointTitle: weak[i % weak.length]?.title || '',
          sourceWrongQuestionId: wrongQuestions[i]?.id,
          difficulty: (i < 2 ? '中等' : '较难') as Difficulty,
        })).filter((question) => {
          if (previousHashes.has(question.normalizedStemHash || '')) return false;
          if (!materialProfile) return true;
          return verifyQuestionAgainstProfile({
            ...question,
            type: 'short',
            knowledgePointId: weak[0]?.id || '',
            qualityScore: 90,
            templateId: materialProfile.allowedTemplateIds[0],
          } as QuizQuestion, materialProfile).passed;
        }), previousQuestions).slice(0, targetCount);
        if (verifiedQuestions.length >= 3) return verifiedQuestions;
      }
    }
  } catch {
    console.warn('[智学闭环] LLM 强化题生成失败，使用 fallback');
  }

  // Fallback: 使用高质量模板生成
  const previousHashes = new Set(previousQuestions.map((question) => normalizedStemHash(question.question)));
  return deduplicateQuestions(generateFallbackReinforcementQuestions(weak, wrongQuestions, result, variantSeed, materialProfile)
    .filter((question) => {
      if (previousHashes.has(normalizedStemHash(question.question))) return false;
      if (!materialProfile) return true;
      return verifyQuestionAgainstProfile({
        ...question,
        type: 'short',
        knowledgePointId: weak[0]?.id || '',
        qualityScore: 90,
        templateId: materialProfile.allowedTemplateIds[0],
      } as QuizQuestion, materialProfile).passed;
    }), previousQuestions).slice(0, targetCount);
};



