/**
 * 统一出题调度器 - 所有出题必须经过此模块
 * 职责：QuestionPlan 生成、题数保证、题型分配、难度分配、知识点轮询、
 *       考试类型/训练模式注入、外部 AI 调用追踪、联网增强处理
 */

import type {
  Difficulty,
  ExamQuestionPattern,
  KnowledgeCard,
  KnowledgePoint,
  QuestionBlueprint,
  QuizQuestion,
  QuizSettings,
  SubjectType,
  TrainingMode,
} from '../types';
import type { MaterialProfile, MaterialTopic } from './materialTopicService';
import { materialProfileToTopic } from './materialTopicService';
import { callExternalAIWithConfig, getAIStatus, getEffectiveAIConfig, hasRealAIConfig } from './llmClient';
import { buildQuizPrompt } from './promptTemplates';
import {
  deduplicateQuestions,
  verifyQuestionAgainstProfile,
  verifyQuestionTopicAlignment,
} from './questionTopicVerifier';
import { evaluateQuestionQuality, filterQuestionsByQualityGate } from './questionQualityGate';
import { reviewQuestionsQuality } from './questionQualityService';
import { generateFallbackQuestionsFromBlueprints } from './fallbackQuestionFactory';
import { getWebEnhancedReferenceBundle } from './webEnhancedQuestionService';
import { generateKnowledgeCards, generateQuestionBlueprints, validateBlueprint } from './questionBlueprintService';
import { getExamStrategy, inferSubjectType } from './examStrategy';
import { resolveActualSubject } from './subjectConfig';
import { isLikelyXmlGarbage, cleanExtractedText } from '../utils/textCleaner';
import { allocateDifficultySlots as allocateDifficultySlotsByRatio, normalizeDifficultyRatio } from './difficultyRatio';

// ========== 信号：哪些题型是客观题/主观题 ==========
const OBJECTIVE_TYPES = ['single', 'judge'] as const;
const SUBJECTIVE_TYPES = ['short', 'solution', 'material'] as const;
const ALL_QUESTION_TYPES = ['single', 'judge', 'fill', 'short', 'solution', 'material'] as const;

type QuestionType = typeof ALL_QUESTION_TYPES[number];
type UserQuestionType =
  | QuestionType
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'material_analysis'
  | 'reading'
  | 'composition';

// ========== QuestionPlan 相关类型 ==========
export interface QuestionPlanSlot {
  slotIndex: number;
  knowledgePointId: string;
  knowledgePointTitle: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  examType: string;
  trainingMode: TrainingMode;
  sourceBasis: string;
}

// ========== 调度器配置 ==========
export interface QuestionGenerationConfig {
  materialProfile: MaterialProfile;
  materialTopic: MaterialTopic;
  sourceText: string;
  knowledgePoints: KnowledgePoint[];
  settings: QuizSettings;
}

export interface UserQuestionGenerationConfig {
  materialProfile: MaterialProfile;
  sourceText: string;
  selectedSubject: SubjectType;
  targetCount: 5 | 10 | 15;
  selectedQuestionTypes: UserQuestionType[];
  difficultyRatio: { easy: number; medium: number; hard: number };
  examType: QuizSettings['examType'];
  trainingMode: TrainingMode;
  coreKnowledgePoints: KnowledgePoint[];
  enableWebEnhanced: boolean;
  useExternalAI: boolean;
  aiModelConfig?: unknown;
}

// ========== 调度结果 ==========
export interface OrchestratorResult {
  questions: QuizQuestion[];
  questionPlan: QuestionPlanSlot[];
  aiGenerationTimeMs?: number;
  usedFallback: boolean;
  fallbackReason?: string;
  generationNotice: string;
  webSearchUsed: boolean;
  webSearchFallbackReason?: string;
  webSearchQuery?: string;
  webReferenceCount?: number;
  webContextUsedInPrompt?: boolean;
}

// ========== 难度分配 ==========
function allocateDifficultySlots(
  targetCount: number,
  difficultyRatio: { easy: number; medium: number; hard: number }
): Difficulty[] {
  return allocateDifficultySlotsByRatio(targetCount, difficultyRatio);
}

// ========== 题型分配 ==========
function allocateQuestionTypeSlots(
  targetCount: number,
  selectedTypes: QuestionType[]
): QuestionType[] {
  if (selectedTypes.length === 0) return Array(targetCount).fill('single');
  if (selectedTypes.length === 1) return Array(targetCount).fill(selectedTypes[0]);

  // 均匀轮询分配
  return Array.from({ length: targetCount }, (_, i) => selectedTypes[i % selectedTypes.length]);
}

// ========== 知识点轮询分配 ==========
function allocateKnowledgePointSlots(
  targetCount: number,
  knowledgePoints: KnowledgePoint[]
): Array<{ id: string; title: string }> {
  if (knowledgePoints.length === 0) return Array(targetCount).fill({ id: 'kp-unknown', title: '未指定知识点' });
  return Array.from({ length: targetCount }, (_, i) => {
    const kp = knowledgePoints[i % knowledgePoints.length];
    return { id: kp.id, title: kp.title };
  });
}

// ========== 构建 QuestionPlan ==========
export function buildQuestionPlan(config: QuestionGenerationConfig): QuestionPlanSlot[] {
  const { settings, knowledgePoints, materialTopic } = config;
  const targetCount = settings.questionCount;

  const difficultySlots = allocateDifficultySlots(targetCount, settings.difficultyRatio);
  const typeSlots = allocateQuestionTypeSlots(targetCount, settings.questionTypes as QuestionType[]);
  const kpSlots = allocateKnowledgePointSlots(targetCount, knowledgePoints);

  return Array.from({ length: targetCount }, (_, i) => ({
    slotIndex: i,
    knowledgePointId: kpSlots[i].id,
    knowledgePointTitle: kpSlots[i].title,
    questionType: typeSlots[i],
    difficulty: difficultySlots[i],
    examType: settings.examType === '自动识别' ? '课后小测' : (settings.customExamType || settings.examType),
    trainingMode: settings.trainingMode,
    sourceBasis: `基于上传资料"${materialTopic.topicTag}"章节，围绕"${kpSlots[i].title}"知识点出题`,
  }));
}

// ========== 主调度函数 ==========
export async function generateQuestionsByConfig(
  config: QuestionGenerationConfig
): Promise<OrchestratorResult> {
  const { materialProfile, materialTopic, sourceText, knowledgePoints, settings } = config;
  const targetCount = settings.questionCount;
  const isRealAI = hasRealAIConfig();

  console.log('[ORCHESTRATOR] ===== 出题调度开始 =====');
  console.log('[ORCHESTRATOR] 目标题数:', targetCount);
  console.log('[ORCHESTRATOR] 学科:', materialProfile.subject);
  console.log('[ORCHESTRATOR] 题型:', settings.questionTypes);
  const normalizedDifficultyRatio = normalizeDifficultyRatio(settings.difficultyRatio);
  console.log('[ORCHESTRATOR] 难度比例:', normalizedDifficultyRatio);
  console.log('[ORCHESTRATOR] 考试类型:', settings.examType);
  console.log('[ORCHESTRATOR] 训练模式:', settings.trainingMode);
  console.log('[ORCHESTRATOR] 知识点数:', knowledgePoints.length);
  console.log('[ORCHESTRATOR] 联网增强:', settings.enableWebEnhancedQuestions);
  console.log('[ORCHESTRATOR] 外部AI:', isRealAI);
  console.log('[QUESTION_CONFIG]', {
    targetCount,
    selectedQuestionTypes: settings.questionTypes,
    difficultyRatio: normalizedDifficultyRatio,
    trainingMode: settings.trainingMode,
    examType: settings.examType === '自定义' ? settings.customExamType : settings.examType,
    materialProfile: {
      subject: materialProfile.subject,
      stage: materialProfile.stage,
      chapter: materialProfile.chapter,
      topic: materialProfile.topic,
      coreConcepts: materialProfile.coreConcepts,
      sourceFingerprint: materialProfile.sourceFingerprint,
    },
    coreKnowledgePoints: knowledgePoints.map((kp) => kp.title),
    enableWebEnhanced: Boolean(settings.enableWebEnhancedQuestions),
    aiProvider: getAIStatus().provider,
  });

  // 步骤1: 构建 QuestionPlan
  const questionPlan = buildQuestionPlan(config);
  console.log('[ORCHESTRATOR] QuestionPlan 已生成:', questionPlan.length, '个 slot');

  // 步骤2: 联网增强
  let referenceContext = '';
  let webSearchUsed = false;
  let webSearchFallbackReason = '';
  let webSearchQuery = '';
  let webReferenceCount = 0;
  let webContextUsedInPrompt = false;
  if (settings.enableWebEnhancedQuestions) {
    try {
      const stage = materialProfile.stage === '初中' ? '初中' : '高中';
      const webQuery = `${stage}${materialProfile.subject}${knowledgePoints.map((kp) => kp.title).slice(0, 3).join(' ')} ${settings.examType} ${settings.questionTypes.join(' ')} 真题 例题 考点`;
      webSearchQuery = webQuery;
      console.log('[WEB_SEARCH_ENABLED]', true);
      console.log('[WEB_SEARCH_QUERY]', webQuery);
      const webBundle = await getWebEnhancedReferenceBundle(
        true,
        materialProfile,
        '中等',
        webQuery
      );
      referenceContext = webBundle.context;
      webReferenceCount = webBundle.references.length;
      if (referenceContext) {
        webSearchUsed = true;
        webContextUsedInPrompt = true;
        console.log('[WEB_SEARCH_RESULTS_COUNT]', webReferenceCount);
        console.log('[WEB_REFERENCE_CONTEXT_LENGTH]', referenceContext.length);
        console.log('[WEB_CONTEXT_USED_IN_PROMPT]', true);
      } else if (webBundle.error === 'NO_SEARCH_PROVIDER') {
        webSearchFallbackReason = '联网搜索未配置，仅使用上传资料 + 外接 AI 出题。\n搜索关键词：' + webQuery + '\n参考资料：0 条\n已用于本次出题：否';
        console.log('[WEB_SEARCH_ENABLED] true, searchProvider 未配置');
        console.log('[WEB_SEARCH_RESULTS_COUNT]', 0);
        console.log('[WEB_REFERENCE_CONTEXT_LENGTH]', 0);
        console.log('[WEB_CONTEXT_USED_IN_PROMPT]', false);
      } else if (webBundle.error) {
        webSearchFallbackReason = `联网搜索失败：${webBundle.error}，已降级为上传资料 + 外接 AI 出题。\n搜索关键词：${webQuery}\n参考资料：0 条\n已用于本次出题：否`;
        console.warn('[WEB_SEARCH_ENABLED] 搜索失败:', webBundle.error);
        console.log('[WEB_SEARCH_RESULTS_COUNT]', 0);
        console.log('[WEB_REFERENCE_CONTEXT_LENGTH]', 0);
        console.log('[WEB_CONTEXT_USED_IN_PROMPT]', false);
      } else {
        webSearchUsed = true;
        webSearchFallbackReason = '联网增强：已开启\n搜索关键词：' + webQuery + '\n参考资料：0 条\n已用于本次出题：否\n联网增强已开启，已结合上传资料与外接 AI 生成题目。';
        console.log('[WEB_SEARCH_ENABLED] true, 搜索返回 0 条');
        console.log('[WEB_SEARCH_RESULTS_COUNT]', webReferenceCount);
        console.log('[WEB_REFERENCE_CONTEXT_LENGTH]', 0);
        console.log('[WEB_CONTEXT_USED_IN_PROMPT]', false);
      }
    } catch (err) {
      webSearchFallbackReason = `联网搜索异常：${err instanceof Error ? err.message : '未知错误'}，已降级为上传资料 + 外接 AI 出题。`;
      console.warn('[WEB_SEARCH_ENABLED] 请求失败:', err);
      console.log('[WEB_SEARCH_RESULTS_COUNT]', 0);
      console.log('[WEB_REFERENCE_CONTEXT_LENGTH]', 0);
      console.log('[WEB_CONTEXT_USED_IN_PROMPT]', false);
    }
  }

  // 步骤3-6: AI 候选题循环补生成，最后才 fallback
  const generationResult = await generateUntilTargetCount(config, questionPlan, referenceContext, isRealAI);
  let questions = generationResult.questions;
  const aiGenerationTimeMs = generationResult.aiGenerationTimeMs;
  const usedFallback = generationResult.usedFallback;
  const fallbackReason = generationResult.fallbackReason;
  const rejectedCount = generationResult.rejectedCount;
  const autoSupplementedCount = generationResult.autoSupplementedCount;

  // 步骤7: 最终截断到目标数量
  questions = questions.slice(0, targetCount);
  console.log('[AI_USED_FALLBACK]', usedFallback);

  // 构建生成通知
  let generationNotice = '';
  if (questions.length < targetCount) {
    generationNotice = questions.length === 0
      ? '部分候选题质量不足，系统正在自动修复并补生成。'
      : `已生成 ${questions.length}/${targetCount} 道可用题；部分候选题质量不足，系统已自动修复并补生成。`;
  } else if (usedFallback) {
    generationNotice = isRealAI
      ? `外接 AI 候选题不足，已使用同知识点题库补齐。${fallbackReason ? `原因：${fallbackReason}` : ''}`
      : fallbackReason;
  }
  if (rejectedCount > 0 || autoSupplementedCount > 0) {
    generationNotice += `${generationNotice ? '\n' : ''}已拦截 ${rejectedCount} 道低质量候选题，并自动补生成 ${autoSupplementedCount} 道。`;
  }
  if (settings.enableWebEnhancedQuestions && webSearchUsed && webContextUsedInPrompt) {
    generationNotice += `${generationNotice ? '\n' : ''}联网增强：已开启\n搜索关键词：${webSearchQuery}\n参考资料：${webReferenceCount} 条\n已用于本次出题：是\n联网增强已开启，已结合上传资料与联网参考生成题目。`;
  }
  if (webSearchFallbackReason) {
    generationNotice += (generationNotice ? '\n' : '') + webSearchFallbackReason;
  }

  console.log('[ORCHESTRATOR] 最终题目数:', questions.length);
  console.log('[FINAL_QUESTIONS_COUNT]', questions.length);
  console.log('[ORCHESTRATOR] ===== 出题调度结束 =====');

  return {
    questions,
    questionPlan,
    aiGenerationTimeMs,
    usedFallback,
    fallbackReason,
    generationNotice,
    webSearchUsed,
    webSearchFallbackReason,
    webSearchQuery,
    webReferenceCount,
    webContextUsedInPrompt,
  };
}

export async function generateQuestionsByUserConfig(
  userConfig: UserQuestionGenerationConfig
): Promise<QuizQuestion[]> {
  const materialTopic = materialProfileToTopic(userConfig.materialProfile);
  const normalizedTypes = userConfig.selectedQuestionTypes.map(normalizeUserQuestionType);
  const result = await generateQuestionsByConfig({
    materialProfile: userConfig.materialProfile,
    materialTopic,
    sourceText: userConfig.sourceText,
    knowledgePoints: userConfig.coreKnowledgePoints,
    settings: {
      subjectType: resolveActualSubject(userConfig.selectedSubject, userConfig.materialProfile.subject),
      examType: userConfig.examType === '自动识别' ? '课后小测' : userConfig.examType,
      questionCount: userConfig.targetCount,
      difficultyRatio: userConfig.difficultyRatio,
      questionTypes: normalizedTypes,
      trainingMode: userConfig.trainingMode,
      strictSourceMode: true,
      enableWebEnhancedQuestions: userConfig.enableWebEnhanced,
    },
  });
  return result.questions;
}

export async function ensureQuestionCount({
  questions,
  targetCount,
  config,
  questionPlan,
}: {
  questions: QuizQuestion[];
  targetCount: number;
  config: QuestionGenerationConfig;
  questionPlan: QuestionPlanSlot[];
}): Promise<QuizQuestion[]> {
  if (questions.length >= targetCount) return questions.slice(0, targetCount);
  const extra = generateFallbackFromPlan(config, questionPlan, questions.length);
  return applyDisplayGate([...questions, ...extra], config).slice(0, targetCount);
}

function buildCandidatePlan(plan: QuestionPlanSlot[], startIndex: number, count: number): QuestionPlanSlot[] {
  if (plan.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const source = plan[(startIndex + index) % plan.length];
    return { ...source, slotIndex: index };
  });
}

async function validateAndFilterQuestions(
  candidates: QuizQuestion[],
  config: QuestionGenerationConfig,
  existingQuestions: QuizQuestion[] = [],
  options: { relaxed?: boolean; allowRepair?: boolean } = {}
): Promise<{ valid: QuizQuestion[]; rejected: QuizQuestion[] }> {
  const valid: QuizQuestion[] = [];
  const rejected: QuizQuestion[] = [];
  const seen = new Set(existingQuestions.map((question) => question.normalizedStemHash || question.question));

  for (const candidate of candidates) {
    const topicReview = verifyQuestionAgainstProfile(candidate, config.materialProfile);
    if (!topicReview.passed) {
      rejected.push(candidate);
      continue;
    }

    const quality = evaluateQuestionQuality(candidate, config.materialProfile);
    if (quality.passed) {
      valid.push(candidate);
      continue;
    }

    if (quality.level === 'soft') {
      if (options.relaxed) {
        valid.push(candidate);
        continue;
      }
      if (options.allowRepair !== false && hasRealAIConfig()) {
        const repaired = await repairQuestionByAI(candidate, config, quality.reason);
        if (repaired) {
          const repairedTopic = verifyQuestionAgainstProfile(repaired, config.materialProfile);
          const repairedQuality = evaluateQuestionQuality(repaired, config.materialProfile);
          if (repairedTopic.passed && (repairedQuality.passed || repairedQuality.level === 'soft')) {
            valid.push(repaired);
            continue;
          }
        }
      }
    }

    rejected.push(candidate);
  }

  const deduped = deduplicateQuestions(valid, existingQuestions).filter((question) => {
    const key = question.normalizedStemHash || question.question;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const acceptedKeys = new Set(deduped.map((question) => question.normalizedStemHash || question.question));
  for (const candidate of valid) {
    const key = candidate.normalizedStemHash || candidate.question;
    if (!acceptedKeys.has(key)) rejected.push(candidate);
  }
  return { valid: deduped, rejected };
}

async function repairQuestionByAI(
  question: QuizQuestion,
  config: QuestionGenerationConfig,
  reason: string
): Promise<QuizQuestion | null> {
  const prompt = `你是高中命题老师。下面这道题质量不够，请在不改变学科和知识点的前提下重写成真实可用题。

问题原因：${reason}

要求：
1. 保留当前知识点
2. 增加具体条件、公式、材料或情境
3. 给出明确标准答案
4. 补充详细解析
5. 不要生成“阅读资料依据xxx”“请说明判断依据”这类空泛题
6. 题目必须符合上传资料
7. 只输出 JSON：{"question": {...}}

原题：
${JSON.stringify(question)}`;

  try {
    const result = await callExternalAIWithConfig({
      taskType: 'question_repair',
      prompt,
      modelConfig: getEffectiveAIConfig(),
      materialProfile: config.materialProfile,
    });
    const raw = result as Record<string, unknown> | null;
    const repaired = (raw?.question || raw) as Record<string, unknown> | null;
    if (!repaired) return null;
    return {
      ...question,
      question: String(repaired.question || question.question),
      answer: String(repaired.answer || repaired.correctAnswer || question.answer),
      explanation: String(repaired.explanation || question.explanation),
      sourceEvidence: String(repaired.sourceEvidence || question.sourceEvidence || config.materialProfile.sourceSummary),
      scoringRubric: Array.isArray(repaired.scoringPoints)
        ? repaired.scoringPoints.map(String)
        : Array.isArray(repaired.scoringRubric)
          ? repaired.scoringRubric.map(String)
          : question.scoringRubric,
      solutionSteps: Array.isArray(repaired.solutionSteps) ? repaired.solutionSteps.map(String) : question.solutionSteps,
      commonMistake: repaired.commonMistake ? String(repaired.commonMistake) : question.commonMistake,
      qualityScore: 90,
    };
  } catch (error) {
    console.warn('[QUESTION_REPAIR_FAILED]', error);
    return null;
  }
}

async function generateUntilTargetCount(
  config: QuestionGenerationConfig,
  questionPlan: QuestionPlanSlot[],
  referenceContext: string,
  isRealAI: boolean
): Promise<{
  questions: QuizQuestion[];
  rejectedCount: number;
  autoSupplementedCount: number;
  aiGenerationTimeMs: number;
  usedFallback: boolean;
  fallbackReason: string;
}> {
  const targetCount = config.settings.questionCount;
  let validQuestions: QuizQuestion[] = [];
  let rejectedCount = 0;
  let autoSupplementedCount = 0;
  let aiGenerationTimeMs = 0;
  let usedFallback = false;
  let fallbackReason = '';

  if (!isRealAI) {
    usedFallback = true;
    fallbackReason = '未配置外部 AI，使用本地题库出题。';
    console.log('[AI_USED_FALLBACK] true, 原因:', fallbackReason);
  }

  if (isRealAI) {
    for (let round = 1; round <= 4 && validQuestions.length < targetCount; round++) {
      const need = targetCount - validQuestions.length;
      const candidateCount = Math.max(need * 3, 10);
      const candidatePlan = buildCandidatePlan(questionPlan, validQuestions.length, candidateCount);
      try {
        console.log('[GEN_ROUND]', round);
        console.log('[NEED_VALID_QUESTIONS]', need);
        console.log('[CANDIDATE_COUNT]', candidateCount);
        const aiResult = await generateQuestionsWithAI(config, candidatePlan, referenceContext);
        aiGenerationTimeMs += aiResult.timeMs;
        const checked = await validateAndFilterQuestions(aiResult.questions, config, validQuestions, { allowRepair: true });
        rejectedCount += checked.rejected.length;
        const before = validQuestions.length;
        validQuestions = deduplicateQuestions([...validQuestions, ...checked.valid]).slice(0, targetCount);
        const added = validQuestions.length - before;
        if (round > 1) autoSupplementedCount += added;
        console.log('[VALID_COUNT_AFTER_ROUND]', validQuestions.length);
        console.log('[REJECTED_COUNT_AFTER_ROUND]', rejectedCount);
      } catch (err) {
        usedFallback = true;
        fallbackReason = `AI 调用失败: ${err instanceof Error ? err.message : '未知错误'}`;
        console.error('[AI_USED_FALLBACK] true, 原因:', fallbackReason);
        break;
      }
    }
  }

  if (validQuestions.length < targetCount) {
    const beforeFallback = validQuestions.length;
    usedFallback = true;
    fallbackReason = fallbackReason || `AI 过质量门后仅 ${validQuestions.length}/${targetCount}，已使用同学科同知识点题库补齐。`;
    const need = targetCount - validQuestions.length;
    console.warn('[USE_FALLBACK_TO_FILL_COUNT]', need);
    const fallbackQuestions = generateFallbackFromPlan(config, questionPlan, validQuestions.length);
    const checkedFallback = await validateAndFilterQuestions(fallbackQuestions, config, validQuestions, { relaxed: true, allowRepair: false });
    rejectedCount += checkedFallback.rejected.length;
    validQuestions = deduplicateQuestions([...validQuestions, ...checkedFallback.valid]).slice(0, targetCount);
    autoSupplementedCount += Math.max(0, validQuestions.length - beforeFallback);

    const minimumCount = Math.min(3, targetCount);
    if (validQuestions.length < minimumCount) {
      const emergency = pickEmergencyUsableQuestions(fallbackQuestions, config, validQuestions, minimumCount - validQuestions.length);
      const beforeEmergency = validQuestions.length;
      validQuestions = deduplicateQuestions([...validQuestions, ...emergency]).slice(0, targetCount);
      autoSupplementedCount += Math.max(0, validQuestions.length - beforeEmergency);
      if (validQuestions.length > beforeEmergency) {
        fallbackReason = '外接 AI 候选题不足，已使用同知识点题库补齐。';
        console.warn('[EMERGENCY_FALLBACK_ACCEPTED]', validQuestions.length - beforeEmergency);
      }
    }
  }

  console.log('[AI_USED_FALLBACK]', usedFallback);
  return {
    questions: validQuestions.slice(0, targetCount),
    rejectedCount,
    autoSupplementedCount,
    aiGenerationTimeMs,
    usedFallback,
    fallbackReason,
  };
}

function pickEmergencyUsableQuestions(
  candidates: QuizQuestion[],
  config: QuestionGenerationConfig,
  existingQuestions: QuizQuestion[],
  count: number
): QuizQuestion[] {
  const seen = new Set(existingQuestions.map((question) => question.normalizedStemHash || question.question));
  const accepted: QuizQuestion[] = [];
  for (const candidate of candidates) {
    if (accepted.length >= count) break;
    if (!candidate.question?.trim() || !candidate.answer?.trim()) continue;
    if (candidate.subject && candidate.subject !== config.materialProfile.subject) continue;
    const quality = evaluateQuestionQuality(candidate, config.materialProfile);
    if (!quality.passed && quality.level === 'hard') continue;
    const key = candidate.normalizedStemHash || candidate.question;
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push({
      ...candidate,
      subject: config.materialProfile.subject,
      sourceEvidence: candidate.sourceEvidence || config.materialProfile.sourceSummary || `资料主题：${config.materialProfile.topic}`,
      qualityScore: Math.max(candidate.qualityScore || 0, 80),
    });
  }
  return accepted;
}

// ========== AI 出题 ==========
async function generateQuestionsWithAI(
  config: QuestionGenerationConfig,
  plan: QuestionPlanSlot[],
  referenceContext: string
): Promise<{ questions: QuizQuestion[]; timeMs: number }> {
  const { materialProfile, materialTopic, sourceText, knowledgePoints, settings } = config;
  const subject = materialProfile.subject as SubjectType;
  const strategy = getExamStrategy(subject);

  // 构建包含 QuestionPlan 详情的增强 prompt
  const planDetails = plan.map((slot, i) =>
    `第${i + 1}题：知识点="${slot.knowledgePointTitle}"，题型=${slot.questionType}，难度=${slot.difficulty}，考试类型=${slot.examType}，训练模式=${slot.trainingMode}`
  ).join('\n');

  const examTypeInstructions = getExamTypeInstructions(settings.examType === '自动识别' ? '课后小测' : (settings.customExamType || settings.examType));
  const trainingModeInstructions = getTrainingModeInstructions(settings.trainingMode);

  let constrainedMaterial = sourceText;
  if (isSpecificTopic(materialTopic) && settings.strictSourceMode !== false) {
    constrainedMaterial = [
      '【主题约束 - 绝对遵守】',
      '当前资料主题：' + materialTopic.topicTag,
      '学科：' + materialTopic.subject,
      '允许关键字：' + materialTopic.allowedKeywords.join('、'),
      '禁用章节和内容：' + materialTopic.bannedKeywords.join('、'),
      '⚠️ 只能围绕当前资料的具体章节和知识点出题。禁止跨章节。',
      referenceContext ? `\n【联网增强参考摘要，仅作命题角度参考】\n${referenceContext}` : '',
      '',
      sourceText,
    ].join('\n');
  }

  const systemPrompt = `你是高中学科命题老师。请严格围绕上传资料和联网参考内容生成真实可练习的考试题。
禁止生成空泛题，禁止生成“资料依据xxx”“阅读资料依据xxx”“能结合资料条件完成具体判断”“请说明判断依据”“指出一个易错点”这类模板题。
每道题必须有具体条件、明确设问、标准答案、详细解析、常见误区。
题目必须像真实高中课堂练习/周测/考试题。
如果资料是数学，必须出现具体表达式、函数、方程、不等式、条件或计算目标。
如果资料是化学，必须出现具体物质、反应、实验或条件。
联网资料只用于参考题型风格，不得复制原题。
你必须严格按要求输出 JSON。
${examTypeInstructions}
${trainingModeInstructions}
学科守卫：所有题目必须属于 ${subject}，不得跨学科。
难度守卫：简单题考基础概念/直接识记；中等题需1-2步推理或情境分析；困难题需综合应用/多条件/多步骤。
${referenceContext ? '联网内容仅用于参考题型风格和考法，最终题目必须围绕上传资料原创生成。' : ''}`;

  const userPrompt = `请严格按照以下出题计划生成 ${plan.length} 道题。

## 出题计划（必须严格执行）
${planDetails}

## 知识点列表
${knowledgePoints.map((kp, i) => `${i + 1}. ${kp.title}：${kp.description}`).join('\n')}

## 学习资料
${constrainedMaterial.slice(0, 8000)}

## 输出格式
{
  "questions": [
    {
      "id": "q-1",
      "subject": "${subject}",
      "knowledgePoint": "对应知识点标题",
      "type": "${plan[0]?.questionType || 'single'}",
      "question": "具体题干",
      "options": ["A.选项1", "B.选项2", "C.选项3", "D.选项4"],
      "answer": "A",
      "explanation": "具体解析，必须说明为什么选这个答案",
      "difficulty": "简单/中等/较难",
      "sourceEvidence": "资料中的依据",
      "solutionSteps": ["步骤1", "步骤2"],
      "scoringPoints": ["得分点1", "得分点2"],
      "commonMistake": "常见错误",
      "examPattern": "基础概念题"
    }
  ]
}

⚠️ 必须生成 ${plan.length} 道题，不能多也不能少。
⚠️ 每道题的 type 必须严格按计划。
⚠️ 每道题的 difficulty 必须严格按计划。
⚠️ 每道题的 knowledgePoint 必须严格按计划。
⚠️ 简答/解答/材料分析题的 answer 必须是具体的分点答案，不能是泛化方法论。
⚠️ 禁止出现“资料依据xxx”“阅读资料依据xxx”“能结合资料条件完成具体判断”“请说明判断依据”“指出一个易错点”。
⚠️ 数学题必须包含具体公式/函数/方程/不等式/条件，例如“已知 sinα=3/5，且 α 为第二象限角，求 cosα 和 tanα”。`;

  const requestStart = Date.now();
  console.time('[AI_GENERATION_TIME]');
  const temperature = 0.5;
  const maxTokens = Math.max(3000, plan.length * 500);

  console.log('[AI_REQUEST] temperature:', temperature, 'max_tokens:', maxTokens);

  const llmResult = await callExternalAIWithConfig({
    taskType: 'question_generation',
    prompt: { systemPrompt, userPrompt },
    modelConfig: getEffectiveAIConfig(),
    materialProfile,
    webReferenceContext: referenceContext,
    options: { temperature, max_tokens: maxTokens },
  });

  console.timeEnd('[AI_GENERATION_TIME]');

  if (!llmResult) {
    throw new Error('AI 返回 null，可能是 API 配置问题或请求失败');
  }

  const rawResult = llmResult as Record<string, unknown>;
  const rawQuestions = Array.isArray(rawResult.questions) ? rawResult.questions : [];

  console.log('[AI_RAW_RESPONSE_LENGTH]', JSON.stringify(llmResult).length);
  console.log('[AI_RAW_RESPONSE_PREVIEW]', JSON.stringify(llmResult).slice(0, 500));

  // 规范化 AI 返回的题目
  const questions: QuizQuestion[] = [];
  for (let i = 0; i < rawQuestions.length; i++) {
    const rq = rawQuestions[i] as Record<string, unknown>;
    const planSlot = plan[i] || plan[plan.length - 1];
    const options = Array.isArray(rq.options) ? rq.options.map(String) : [];

    questions.push({
      id: rq.id ? String(rq.id) : `q-ai-${i + 1}`,
      subject: subject,
      type: planSlot.questionType,
      question: String(rq.question || ''),
      options: options.length > 0 ? options : undefined,
      answer: String(rq.answer || ''),
      correctOptionLabel: extractCorrectLabel(String(rq.answer), String(rq.correctOptionLabel)),
      explanation: String(rq.explanation || ''),
      knowledgePointId: planSlot.knowledgePointId,
      difficulty: planSlot.difficulty,
      sourceEvidence: String(rq.sourceEvidence || ''),
      qualityScore: 90,
      examPattern: (rq.examPattern as ExamQuestionPattern) || '基础概念题',
      scoringRubric: Array.isArray(rq.scoringPoints) ? rq.scoringPoints.map(String) : undefined,
      solutionSteps: Array.isArray(rq.solutionSteps) ? rq.solutionSteps.map(String) : undefined,
      commonMistake: rq.commonMistake ? String(rq.commonMistake) : undefined,
      templateId: undefined,
    });
  }

  // 质量审查
  const reviews = reviewQuestionsQuality(questions);
  for (let i = 0; i < questions.length; i++) {
    questions[i].qualityScore = reviews[i]?.score ?? 90;
  }

  const timeMs = Date.now() - requestStart;
  return { questions, timeMs };
}

// ========== Fallback 出题（基于 Plan） ==========
function generateFallbackFromPlan(
  config: QuestionGenerationConfig,
  plan: QuestionPlanSlot[],
  existingCount: number
): QuizQuestion[] {
  const { materialProfile, materialTopic, sourceText, knowledgePoints, settings } = config;
  const remainingPlan = plan.slice(existingCount);
  if (remainingPlan.length === 0) return [];

  // 为每个剩余 plan slot 生成 blueprint，避免补题从第 1 题重新开始导致重复
  const blueprints: QuestionBlueprint[] = remainingPlan.map((slot, i) => {
    const kp = knowledgePoints.find(k => k.id === slot.knowledgePointId) || knowledgePoints[0];
    return {
      id: `bp-fallback-${existingCount + i}`,
      templateId: materialTopic.allowedTemplateIds[i % Math.max(materialTopic.allowedTemplateIds.length, 1)],
      knowledgeCardId: slot.knowledgePointId,
      knowledgePoint: slot.knowledgePointTitle,
      targetAbility: kp?.masteryTarget || `围绕"${slot.knowledgePointTitle}"完成具体条件判断`,
      requiredMethods: kp?.keyMethods?.slice(0, 3) || ['定位资料依据', '分析具体条件'],
      examPattern: getExamPatternForType(slot.questionType),
      difficulty: slot.difficulty,
      scoringPoints: kp?.description ? [kp.description.slice(0, 50)] : [`能结合资料说明${slot.knowledgePointTitle}`],
      commonWrongMethods: kp?.commonMistakes?.slice(0, 3) || ['概念理解模糊'],
      sourceEvidence: kp?.sourceEvidence || kp?.description || '',
      estimatedTime: 3,
    };
  });

  const fallbackQuestions = generateFallbackQuestionsFromBlueprints(
    blueprints,
    [],
    settings,
    materialTopic,
    Date.now() + existingCount * 17
  );

  // 强制应用 plan 中的题型、难度、知识点和训练模式
  return fallbackQuestions.map((q, i) => {
    const slot = remainingPlan[i] || remainingPlan[remainingPlan.length - 1];
    return shapeFallbackQuestionForSlot(q, slot, config, existingCount + i, sourceText);
  });
}

function isQuadraticInequalityTopic(config: QuestionGenerationConfig, slot?: QuestionPlanSlot): boolean {
  const text = [
    config.materialProfile.subject,
    config.materialProfile.chapter,
    config.materialProfile.topic,
    config.materialProfile.coreConcepts.join(' '),
    slot?.knowledgePointTitle || '',
  ].join(' ');
  return config.materialProfile.subject === '数学'
    && /二次函数|一元二次方程|一元二次不等式|判别式|解集|恒成立|零点/.test(text);
}

function buildQuadraticFallbackQuestionForSlot(
  slot: QuestionPlanSlot,
  config: QuestionGenerationConfig,
  absoluteIndex: number
): QuizQuestion {
  const type = getQuestionTypeForPlan(slot.questionType);
  const kpTitle = slot.knowledgePointTitle || '二次函数与一元二次方程、不等式';
  const sourceBasis = `课件主题：${config.materialProfile.topic || '二次函数与一元二次方程、不等式'}；知识点：${kpTitle}`;
  const base = {
    id: `q-quad-${absoluteIndex + 1}`,
    subject: '数学' as SubjectType,
    type,
    difficulty: slot.difficulty,
    knowledgePointId: kpTitle,
    sourceEvidence: sourceBasis,
    learningObjective: `围绕“${kpTitle}”完成${slot.difficulty}难度训练`,
    examPattern: getExamPatternForType(type),
    qualityScore: 92,
    commonMistake: '只看不等号方向或只代公式，忘记结合抛物线开口方向、根的位置和图像在 x 轴上方/下方的区间。',
  };

  const pool = [
    {
      question: '已知二次函数 y=x²-5x+6，关于方程 x²-5x+6=0 的根与函数图像的说法正确的是（  ）',
      options: ['方程有两个不相等实根，图像与 x 轴交于 (2,0)、(3,0)', '方程没有实根，图像与 x 轴无交点', '方程有两个相等实根，图像与 x 轴只有一个交点', '方程根为 -2 和 -3，图像与 x 轴交于 (-2,0)、(-3,0)'],
      answer: '方程有两个不相等实根，图像与 x 轴交于 (2,0)、(3,0)',
      correctOptionLabel: 'A' as const,
      explanation: '令 y=0 得 x²-5x+6=0，分解为 (x-2)(x-3)=0，所以方程根为 x=2、x=3。二次函数图像与 x 轴交点横坐标正是对应方程的根，因此交点为 (2,0)、(3,0)。',
      steps: ['令函数值 y=0', '分解 x²-5x+6=(x-2)(x-3)', '把方程根转化为图像与 x 轴交点'],
      rubric: ['写出 y=0 对应方程', '正确求出两个根', '能说明根与 x 轴交点横坐标的关系'],
    },
    {
      question: '判断正误：若二次函数 y=ax²+bx+c（a>0）的判别式 Δ<0，则不等式 ax²+bx+c>0 的解集为全体实数。',
      answer: '正确',
      explanation: '当 a>0 时抛物线开口向上。Δ<0 表示图像与 x 轴没有交点，整个图像都在 x 轴上方，因此 ax²+bx+c 的值恒大于 0，不等式 ax²+bx+c>0 的解集为 R。',
      steps: ['判断开口方向为向上', '由 Δ<0 得图像与 x 轴无交点', '结合图像位置写出不等式解集'],
      rubric: ['说明 a>0 时开口向上', '说明 Δ<0 与 x 轴无交点', '得出解集为全体实数'],
    },
    {
      question: '填空：若 a>0 且方程 ax²+bx+c=0 的两根为 x1<x2，则不等式 ax²+bx+c>0 的解集是 ______。',
      answer: 'x<x1 或 x>x2',
      explanation: 'a>0 时抛物线开口向上，两根 x1、x2 是图像与 x 轴交点。图像在两根外侧位于 x 轴上方，在两根之间位于 x 轴下方，所以 ax²+bx+c>0 的解集为 x<x1 或 x>x2。',
      steps: ['确定抛物线开口向上', '把 x1、x2 标在数轴上', '选取图像在 x 轴上方的区间'],
      rubric: ['写出两根外侧区间', '不把 >0 写成两根之间', '使用正确的不等号方向'],
    },
    {
      question: '简答：求不等式 x²-12x+20<0 的解集，并用二次函数图像说明为什么答案是 2<x<10。',
      answer: 'x²-12x+20=(x-2)(x-10)，对应抛物线开口向上，与 x 轴交于 x=2 和 x=10。小于 0 表示图像在 x 轴下方，所以解集为 2<x<10。',
      explanation: '先把二次三项式因式分解，得到两个零点 2 和 10。由于二次项系数为正，图像开口向上，只有在两个零点之间图像低于 x 轴，因此不等式小于 0 的区间是 2<x<10。',
      steps: ['因式分解得到两个零点', '判断开口方向', '结合图像在 x 轴下方的区间写解集'],
      rubric: ['正确分解或求根', '说明开口向上', '写出 2<x<10 并说明图像依据'],
    },
    {
      question: '解不等式 x²-5x+6>0，并说明其与函数 y=x²-5x+6 图像位置的关系。',
      answer: 'x²-5x+6=(x-2)(x-3)。抛物线开口向上，与 x 轴交于 x=2、x=3。>0 表示图像在 x 轴上方，因此解集为 x<2 或 x>3。',
      explanation: '一元二次不等式可以转化为二次函数图像问题。先求方程 x²-5x+6=0 的根，再根据开口向上判断两根外侧函数值为正，因此解集为 (-∞,2)∪(3,+∞)。',
      steps: ['求对应方程根 2、3', '判断二次项系数为正，开口向上', '取图像在 x 轴上方的两侧区间'],
      rubric: ['正确求根', '正确判断开口方向', '正确写出 x<2 或 x>3'],
    },
    {
      question: '解不等式 9x²-6x+1>0，并说明为什么 x=1/3 不能包含在解集中。',
      answer: '9x²-6x+1=(3x-1)²。不等式 (3x-1)²>0 对除 x=1/3 外的所有实数成立，所以解集为 x≠1/3，即 (-∞,1/3)∪(1/3,+∞)。',
      explanation: '该二次式是完全平方，判别式 Δ=0，图像与 x 轴只有一个切点 x=1/3。平方大于 0 时不能取等号，所以切点处函数值为 0，不满足 >0，其余位置都满足。',
      steps: ['配方或因式分解为 (3x-1)²', '求出唯一零点 x=1/3', '根据 >0 排除零点'],
      rubric: ['识别完全平方', '排除 x=1/3', '写出完整解集'],
    },
    {
      question: '材料分析：某园艺小组用 24 m 篱笆围成长方形花圃，设一边长为 x m，面积不少于 32 m²。建立关于 x 的不等式，并求 x 的取值范围。',
      answer: '另一边长为 12-x，面积为 x(12-x)。由面积不少于 32 得 x(12-x)≥32，即 x²-12x+32≤0，分解为 (x-4)(x-8)≤0，所以 4≤x≤8。',
      explanation: '这是一元二次不等式的实际应用。先根据周长 24 m 得两边和为 12 m，再把面积条件转化为不等式，最后结合开口向上的二次函数图像，≤0 取两根之间的区间。',
      steps: ['由周长求另一边 12-x', '建立面积不等式 x(12-x)≥32', '化为 x²-12x+32≤0 并求解'],
      rubric: ['正确建立面积表达式', '正确化为一元二次不等式', '写出 4≤x≤8'],
    },
    {
      question: '已知不等式 ax²-bx+2<0 的解集为 1<x<2，求实数 a、b 的值。',
      answer: '因为 ax²-bx+2<0 的解集在两根之间，所以 a>0，且对应方程两根为 1、2。设 ax²-bx+2=a(x-1)(x-2)=ax²-3ax+2a，对比常数项 2a=2 得 a=1，再由 b=3a 得 b=3。',
      explanation: '由解集 1<x<2 可以反推二次函数开口向上，方程根为 1 和 2。把二次式写成 a(x-1)(x-2)，再与 ax²-bx+2 比较系数即可确定参数。',
      steps: ['由解集确定两根为 1、2 且 a>0', '设二次式为 a(x-1)(x-2)', '比较系数求 a=1、b=3'],
      rubric: ['正确反推根和开口方向', '正确设出因式形式', '正确比较系数'],
    },
    {
      question: '填空：当 a>0 时，不等式 ax²-x>0 可化为 x(ax-1)>0，因此解集是 ______。',
      answer: 'x<0 或 x>1/a',
      explanation: '因为 a>0，所以两个零点为 0 和 1/a，且 0<1/a。二次项系数 a>0，抛物线开口向上，函数值大于 0 的区间在两根外侧，因此解集是 x<0 或 x>1/a。',
      steps: ['提取公因式 x 得 x(ax-1)>0', '确定两个零点 0 和 1/a', '根据开口向上取两根外侧'],
      rubric: ['正确因式分解', '正确比较 0 与 1/a', '写出两根外侧区间'],
    },
    {
      question: '较难解答：若不等式 x²-2mx+4>0 对一切实数 x 恒成立，求实数 m 的取值范围。',
      answer: '二次项系数 1>0，抛物线开口向上。要使 x²-2mx+4>0 对一切实数成立，需要图像与 x 轴没有交点，即 Δ<0。Δ=(-2m)²-16=4m²-16<0，得 m²<4，所以 -2<m<2。',
      explanation: '恒成立问题要转化为二次函数图像始终在 x 轴上方。由于开口向上，严格大于 0 要求最小值也大于 0，等价于判别式 Δ<0。计算 Δ 后解参数不等式即可。',
      steps: ['确认开口向上', '把恒大于 0 转化为 Δ<0', '解 4m²-16<0 得 -2<m<2'],
      rubric: ['正确使用恒成立条件', '正确计算判别式', '正确求出参数范围'],
    },
  ];

  const item = pool[absoluteIndex % pool.length];
  const common = {
    ...base,
    question: item.question,
    answer: item.answer,
    explanation: item.explanation,
    solutionSteps: item.steps,
    scoringRubric: item.rubric,
  };

  if (type === 'single') {
    return {
      ...common,
      type,
      options: item.options || ['正确', '错误', '无法判断', '条件不足'],
      correctOptionLabel: item.correctOptionLabel || 'A',
    };
  }
  if (type === 'judge') {
    return {
      ...common,
      type,
      question: item.question.startsWith('判断正误') ? item.question : `判断正误：${item.question.replace(/（  ）/g, '')}`,
      options: undefined,
      correctOptionLabel: undefined,
      answer: item.answer.includes('正确') || absoluteIndex % 2 === 0 ? '正确' : '错误',
    };
  }
  if (type === 'fill') {
    return {
      ...common,
      type,
      question: item.question.includes('______') ? item.question : `填空：${item.question.replace(/（  ）/g, '')}，结果为 ______。`,
      options: undefined,
      correctOptionLabel: undefined,
    };
  }
  return {
    ...common,
    type,
    options: undefined,
    correctOptionLabel: undefined,
    answerInputMode: type === 'solution' || type === 'material' ? 'both' : 'text',
  };
}

function shapeFallbackQuestionForSlot(
  question: QuizQuestion,
  slot: QuestionPlanSlot,
  config: QuestionGenerationConfig,
  absoluteIndex: number,
  sourceText: string
): QuizQuestion {
  if (isQuadraticInequalityTopic(config, slot)) {
    return buildQuadraticFallbackQuestionForSlot(slot, config, absoluteIndex);
  }

  const { materialProfile } = config;
  const type = getQuestionTypeForPlan(slot.questionType);
  const kpTitle = slot.knowledgePointTitle;
  const sourceBasis = buildSourceBasis(question, config, sourceText);
  const plainStem = question.question.replace(/（\s*）/g, '').replace(/\s+/g, ' ').trim();
  const modePrefix = getTrainingModeStemPrefix(slot.trainingMode);
  const commonMistake = buildModeCommonMistake(slot.trainingMode, question.commonMistake, kpTitle);
  const baseSteps = buildSlotSteps(slot, question, sourceBasis);
  const baseRubric = buildSlotRubric(slot, kpTitle);
  const objectiveAnswer = question.answer || question.options?.[0] || kpTitle;
  const concreteAnswer = buildConcreteAnswer(slot, objectiveAnswer, sourceBasis, baseSteps);
  const scenario = getVariationScenario(materialProfile.subject, absoluteIndex, slot.trainingMode);

  const base: QuizQuestion = {
    ...question,
    id: `q-fb-${absoluteIndex + 1}`,
    subject: materialProfile.subject,
    type,
    difficulty: slot.difficulty,
    knowledgePointId: kpTitle,
    sourceEvidence: sourceBasis,
    learningObjective: `${modePrefix}：围绕“${kpTitle}”完成${slot.difficulty}难度训练`,
    examPattern: getExamPatternForType(slot.questionType),
    scoringRubric: baseRubric,
    solutionSteps: baseSteps,
    commonMistake,
    qualityScore: 90,
  };

  if (type === 'single') {
    return {
      ...base,
      question: `${modePrefix}${scenario}资料依据：“${sourceBasis}”。${plainStem}`,
      options: question.options,
      answer: objectiveAnswer,
      correctOptionLabel: question.correctOptionLabel,
      explanation: ensureLongExplanation(question.explanation, kpTitle, sourceBasis, baseSteps),
    };
  }

  if (type === 'judge') {
    const isTrue = absoluteIndex % 2 === 0;
    const statement = isTrue
      ? `${kpTitle}需要结合资料中的具体条件判断，不能只凭关键词作答`
      : `${kpTitle}只要记住名称即可，不需要回到资料条件中验证`;
    return {
      ...base,
      question: `${modePrefix}${scenario}判断正误：资料依据为“${sourceBasis}”。${statement}。（正确/错误）`,
      options: undefined,
      answer: isTrue ? '正确' : '错误',
      correctOptionLabel: undefined,
      explanation: `【解析】本题围绕“${kpTitle}”。资料给出的关键依据是“${sourceBasis}”，作答时必须先定位条件，再判断结论是否成立。${isTrue ? '该说法强调了资料依据和条件判断，因此正确。' : '该说法把知识点变成机械记忆，忽略资料条件，因此错误。'}${commonMistake ? `常见误区是：${commonMistake}。` : ''}`,
    };
  }

  if (type === 'fill') {
    return {
      ...base,
      question: `${modePrefix}${scenario}填空：资料依据“${sourceBasis}”表明，解决“${kpTitle}”相关题目时，应先抓住的关键条件是____。`,
      options: undefined,
      answer: extractFillAnswer(sourceBasis, kpTitle),
      correctOptionLabel: undefined,
      explanation: `【解析】本题考查“${kpTitle}”的资料定位能力。先从资料中找出直接条件“${sourceBasis}”，再把它概括为可用于解题的关键词。填空答案必须具体，不能只写“结合材料”。`,
    };
  }

  const subjectiveQuestion = type === 'short'
    ? `${modePrefix}${scenario}简答：阅读资料依据“${sourceBasis}”。请说明“${kpTitle}”在本题情境中的判断依据，并指出一个易错点。`
    : type === 'solution'
      ? `${modePrefix}${scenario}解答：阅读资料依据“${sourceBasis}”。围绕“${kpTitle}”完成推理或计算，写出结论、过程和检验。原题芯：${plainStem}`
      : `${modePrefix}${scenario}材料分析：阅读材料“${sourceBasis}”。结合“${kpTitle}”回答：材料中的关键条件是什么？它如何支持本题结论？`;

  return {
    ...base,
    question: subjectiveQuestion,
    options: undefined,
    answer: concreteAnswer,
    correctOptionLabel: undefined,
    explanation: ensureLongExplanation(question.explanation, kpTitle, sourceBasis, baseSteps),
    answerInputMode: type === 'solution' || type === 'material' ? 'both' : 'text',
  };
}

// ========== 辅助函数 ==========
function isSpecificTopic(topic: MaterialTopic): boolean {
  return topic.topicTag !== '通用知识';
}

function applyDisplayGate(
  questions: QuizQuestion[],
  config: QuestionGenerationConfig,
  existingQuestions: QuizQuestion[] = []
): QuizQuestion[] {
  const { materialProfile, materialTopic } = config;
  const topicPassed = questions.filter((question) => {
    const result = verifyQuestionAgainstProfile(question, materialProfile);
    if (!result.passed) {
      console.warn('[ORCHESTRATOR] 主题校验不通过:', question.id, result.problems);
    }
    return result.passed;
  });

  const qualityPassed = filterQuestionsByQualityGate(topicPassed, materialProfile, existingQuestions);
  return deduplicateQuestions(qualityPassed, existingQuestions);
}

function normalizeType(raw: string, fallback: QuestionType): QuestionType {
  const map: Record<string, QuestionType> = {
    single: 'single', '单选': 'single', single_choice: 'single',
    multiple_choice: 'single', '多选': 'single',
    judge: 'judge', '判断': 'judge', true_false: 'judge',
    fill: 'fill', '填空': 'fill', fill_blank: 'fill',
    short: 'short', '简答': 'short', short_answer: 'short',
    solution: 'solution', '解答': 'solution',
    material: 'material', '材料分析': 'material', material_analysis: 'material',
    reading: 'material', '阅读理解': 'material',
    composition: 'short', '作文': 'short',
  };
  return map[raw.toLowerCase()] || map[raw] || fallback;
}

function normalizeUserQuestionType(type: UserQuestionType): QuestionType {
  return normalizeType(String(type), 'single');
}

function normalizeDifficulty(raw: string, fallback: Difficulty): Difficulty {
  const map: Record<string, Difficulty> = {
    '简单': '简单', easy: '简单', '基础': '简单',
    '中等': '中等', medium: '中等',
    '较难': '较难', hard: '较难', '困难': '较难', '难': '较难',
  };
  return map[raw] || fallback;
}

function extractCorrectLabel(answer: string, explicit?: string): 'A' | 'B' | 'C' | 'D' | undefined {
  if (explicit && ['A', 'B', 'C', 'D'].includes(explicit)) return explicit as 'A' | 'B' | 'C' | 'D';
  if (answer && ['A', 'B', 'C', 'D'].includes(answer.trim().charAt(0).toUpperCase())) {
    return answer.trim().charAt(0).toUpperCase() as 'A' | 'B' | 'C' | 'D';
  }
  return undefined;
}

function getExamPatternForType(type: QuestionType): ExamQuestionPattern {
  const map: Record<QuestionType, ExamQuestionPattern> = {
    single: '基础概念题',
    judge: '易错判断题',
    fill: '条件辨析题',
    short: '材料分析题',
    solution: '综合解答题',
    material: '材料分析题',
  };
  return map[type] || '基础概念题';
}

function getQuestionTypeForPlan(type: QuestionType): QuestionType {
  return type;
}

function buildSourceBasis(
  question: QuizQuestion,
  config: QuestionGenerationConfig,
  sourceText: string
): string {
  const { materialProfile, materialTopic } = config;
  const candidates = [
    question.sourceEvidence,
    materialProfile.sourceSummary,
    sourceText,
    `${materialProfile.chapter || materialTopic.chapterTag} ${materialProfile.topic}`,
  ].filter(Boolean).map(String);

  const raw = candidates.find((item) => item.trim().length > 0) || materialProfile.topic;
  const compact = raw.replace(/\s+/g, ' ').replace(/[{}[\]<>]/g, '').trim();
  const coreConcept = materialProfile.coreConcepts.find((concept) => compact.includes(concept)) || materialProfile.coreConcepts[0] || materialProfile.topic;
  const withCoreConcept = compact.includes(coreConcept) ? compact : `${coreConcept}：${compact}`;
  return withCoreConcept.slice(0, 120) || `${materialProfile.subject}${materialProfile.topic}`;
}

function getTrainingModeStemPrefix(mode: TrainingMode): string {
  const map: Record<TrainingMode, string> = {
    '基础巩固': '【基础巩固】',
    '错题强化': '【错题强化】',
    '考前冲刺': '【考前冲刺】',
    '变式训练': '【辨识训练】',
    '母题改编': '【母题改编】',
  };
  return map[mode] || '【训练】';
}

function getVariationScenario(subject: SubjectType, index: number, mode: TrainingMode): string {
  const modeAction: Record<TrainingMode, string> = {
    '基础巩固': '课堂即时练习中，',
    '错题强化': '订正同类错题时，',
    '考前冲刺': '模拟考试第' + ((index % 6) + 1) + '题中，',
    '变式训练': '辨析相近条件时，',
    '母题改编': '把母题改成新条件后，',
  };
  const subjectScenarios: Record<SubjectType, string[]> = {
    '数学': ['已知条件发生数值变化，', '函数或图形条件改变后，', '同一公式换成新参数时，'],
    '语文': ['阅读句子材料后，', '分析文段表达效果时，', '修改具体语句时，'],
    '英语': ['阅读短句语境后，', '比较选项含义时，', '完成课堂语法练习时，'],
    '物理': ['实验数据变化后，', '受力或电路条件改变时，', '单位换算完成后，'],
    '化学': ['观察实验现象后，', '改变反应物或溶液条件后，', '检查化学式和方程式时，'],
    '生物': ['观察实验材料后，', '比较生命现象时，', '分析图表数据时，'],
    '历史': ['阅读史料片段后，', '比较历史事件时，', '定位时间线后，'],
    '政治': ['阅读校园或社会情境后，', '判断权利义务关系时，', '分析法治案例时，'],
    '地理': ['分析区域材料后，', '读取图表或等高线信息时，', '比较自然与人文条件时，'],
  };
  const scenario = subjectScenarios[subject]?.[index % (subjectScenarios[subject]?.length || 1)] || '结合资料情境，';
  return `${modeAction[mode] || '训练中，'}${scenario}`;
}

function buildModeCommonMistake(
  mode: TrainingMode,
  originalMistake: string | undefined,
  kpTitle: string
): string {
  const map: Record<TrainingMode, string> = {
    '基础巩固': `只记住“${kpTitle}”名称，没有落实到资料中的具体条件。`,
    '错题强化': originalMistake || `沿用原错题的错误判断，没有重新核对“${kpTitle}”的适用条件。`,
    '考前冲刺': `正式考试中审题过快，遗漏“${kpTitle}”相关的限定条件。`,
    '变式训练': `把相似概念混为一谈，没有辨认“${kpTitle}”与干扰信息的差别。`,
    '母题改编': `条件或设问改变后仍套用原题答案，没有重新分析“${kpTitle}”。`,
  };
  return map[mode] || originalMistake || `对“${kpTitle}”理解不够具体。`;
}

function buildSlotSteps(
  slot: QuestionPlanSlot,
  question: QuizQuestion,
  sourceBasis: string
): string[] {
  const originalSteps = question.solutionSteps?.filter(Boolean).slice(0, 2) || [];
  const modeStep = slot.trainingMode === '母题改编'
    ? '比较改编后的条件、数据或设问角度'
    : slot.trainingMode === '错题强化'
      ? '先指出原错因，再重新定位资料依据'
      : slot.trainingMode === '考前冲刺'
        ? '按正式考试步骤组织答案，避免跳步'
        : slot.trainingMode === '变式训练'
          ? '找出易混条件和干扰信息'
          : '定位资料中的直接依据';
  return [
    modeStep,
    `提取资料依据：“${sourceBasis.slice(0, 60)}”`,
    `围绕“${slot.knowledgePointTitle}”作出判断或推理`,
    ...originalSteps,
    '写出明确结论并回扣资料',
  ].slice(0, 5);
}

function buildSlotRubric(slot: QuestionPlanSlot, kpTitle: string): string[] {
  if (slot.questionType === 'single' || slot.questionType === 'judge') {
    return [
      `能准确识别“${kpTitle}”：2分`,
      '能用资料条件排除干扰项：3分',
      '答案判断正确：5分',
    ];
  }
  if (slot.questionType === 'fill') {
    return [
      `填出“${kpTitle}”对应关键词：4分`,
      '答案与资料条件一致：4分',
      '表述完整无歧义：2分',
    ];
  }
  return [
    `准确定位“${kpTitle}”的资料依据：3分`,
    '分析过程有步骤且不跳结论：3分',
    '答案具体，能回扣题干条件：3分',
    '表达规范、无泛化套话：1分',
  ];
}

function buildConcreteAnswer(
  slot: QuestionPlanSlot,
  objectiveAnswer: string,
  sourceBasis: string,
  steps: string[]
): string {
  if (slot.questionType === 'short') {
    return `参考答案：${slot.knowledgePointTitle}的判断依据是“${sourceBasis.slice(0, 70)}”。作答时应先定位资料条件，再说明结论；易错点是脱离资料只背概念。`;
  }
  if (slot.questionType === 'solution') {
    return `参考答案：结论为“${objectiveAnswer}”。过程：${steps.join('；')}。最后用资料依据“${sourceBasis.slice(0, 60)}”检验结论。`;
  }
  if (slot.questionType === 'material') {
    return `参考答案：材料中的关键条件是“${sourceBasis.slice(0, 80)}”。它对应“${slot.knowledgePointTitle}”，因此应围绕该条件组织分析，不能套用其他章节结论。`;
  }
  return objectiveAnswer;
}

function extractFillAnswer(sourceBasis: string, kpTitle: string): string {
  const quoted = sourceBasis.match(/[“"]([^”"]{2,20})[”"]/);
  if (quoted?.[1]) return quoted[1];
  const clean = sourceBasis.replace(/[，。；：,.、]/g, ' ').split(/\s+/).find((part) => part.length >= 2 && part.length <= 16);
  return clean || kpTitle;
}

function ensureLongExplanation(
  explanation: string | undefined,
  kpTitle: string,
  sourceBasis: string,
  steps: string[]
): string {
  const raw = (explanation || '').trim();
  if (raw.length >= 45) return raw;
  return `【解析】本题考查“${kpTitle}”，资料依据是“${sourceBasis}”。解题时应按“${steps.join('；')}”推进，先判断条件是否匹配，再写出结论。这样可以避免只背概念、答案空泛的问题。`;
}

// ========== 考试类型指令 ==========
function getExamTypeInstructions(examType: string): string {
  const map: Record<string, string> = {
    '课后小测': '【课后小测风格】紧贴本节资料，题量适中，以基础和中等题为主，检查本节掌握情况。题干简洁直接。',
    '周测': '【周测风格】覆盖一周学习内容，有基础题和少量综合题，适当增加知识点交叉。',
    '单元测试': '【单元测试风格】覆盖多个知识点，题目综合性更强，需要跨知识点的分析和应用。',
    '期中考试': '【期中考试风格】更像正式考试，题干规范，难度分层明显，从基础到综合递进。',
    '期末考试': '【期末考试风格】综合性强，覆盖全册重点，题干规范，有明确的难度梯度。',
    '中考': '【中考风格】题目表述正式，情境化、材料化，关注综合能力，不能太幼稚。有完整的题目要求和评分标准。',
    '高考': '【高考风格】题目表述严谨正式，情境化、材料化，注重学科素养和综合能力考查。题目有层次，从识记到应用递进。',
    '专题训练': '【专题训练风格】围绕一个核心知识点反复变式，适合母题改编和错因修复，题目间有关联性。',
  };
  return map[examType] || map['课后小测'] || '';
}

// ========== 训练模式指令 ==========
function getTrainingModeInstructions(mode: TrainingMode): string {
  const map: Record<TrainingMode, string> = {
    '基础巩固': '【基础巩固模式】以基础概念、公式识记、直接应用为主。适合刚学完。题目不要太绕，重点考查核心概念的理解和基本运用。',
    '错题强化': '【错题强化模式】针对学生容易犯错的知识点出题。每道题要有明确的目标错因（targetMistake），选项和干扰项要有迷惑性。',
    '考前冲刺': '【考前冲刺模式】题目更接近正式考试，综合性更强，要覆盖多个核心知识点，适合中等和困难题。',
    '变式训练': '【变式训练模式】重点考易混概念、相似条件、易错选项。选项要有迷惑性，适合判断题、选择题、材料辨析题。',
    '母题改编': '【母题改编模式】基于核心题型改变数据、条件或设问角度。必须保留同知识点，不能复制原题，适合变式训练。',
  };
  return map[mode] || '';
}
