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
import { filterQuestionsByQualityGate } from './questionQualityGate';
import { reviewQuestionsQuality } from './questionQualityService';
import { generateFallbackQuestionsFromBlueprints } from './fallbackQuestionFactory';
import { getWebEnhancedReferenceBundle } from './webEnhancedQuestionService';
import { generateKnowledgeCards, generateQuestionBlueprints, validateBlueprint } from './questionBlueprintService';
import { getExamStrategy, inferSubjectType } from './examStrategy';
import { resolveActualSubject } from './subjectConfig';
import { isLikelyXmlGarbage, cleanExtractedText } from '../utils/textCleaner';

// ========== 信号：哪些题型是客观题/主观题 ==========
const OBJECTIVE_TYPES = ['single', 'judge'] as const;
const SUBJECTIVE_TYPES = ['short', 'solution', 'material'] as const;
const ALL_QUESTION_TYPES = ['single', 'judge', 'fill', 'short', 'solution', 'material'] as const;

type QuestionType = typeof ALL_QUESTION_TYPES[number];

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
  const total = difficultyRatio.easy + difficultyRatio.medium + difficultyRatio.hard;
  if (total <= 0) {
    // 默认分配
    return Array.from({ length: targetCount }, (_, i) =>
      (['简单', '中等', '较难'] as Difficulty[])[i % 3]
    );
  }
  const easyCount = Math.round((difficultyRatio.easy / total) * targetCount);
  const mediumCount = Math.round((difficultyRatio.medium / total) * targetCount);
  const hardCount = targetCount - easyCount - mediumCount;

  const slots: Difficulty[] = [];
  for (let i = 0; i < easyCount; i++) slots.push('简单');
  for (let i = 0; i < mediumCount; i++) slots.push('中等');
  for (let i = 0; i < hardCount; i++) slots.push('较难');

  // 打乱顺序，避免连续相同难度
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(((i * 2654435761) >>> 0) % (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
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
  console.log('[ORCHESTRATOR] 难度比例:', settings.difficultyRatio);
  console.log('[ORCHESTRATOR] 考试类型:', settings.examType);
  console.log('[ORCHESTRATOR] 训练模式:', settings.trainingMode);
  console.log('[ORCHESTRATOR] 知识点数:', knowledgePoints.length);
  console.log('[ORCHESTRATOR] 联网增强:', settings.enableWebEnhancedQuestions);
  console.log('[ORCHESTRATOR] 外部AI:', isRealAI);
  console.log('[QUESTION_CONFIG]', {
    targetCount,
    selectedQuestionTypes: settings.questionTypes,
    difficultyRatio: settings.difficultyRatio,
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
        console.log('[WEB_SEARCH_ENABLED] true');
        console.log('[WEB_SEARCH_RESULTS_COUNT]', webReferenceCount);
        console.log('[WEB_REFERENCE_CONTEXT_LENGTH]', referenceContext.length);
        console.log('[WEB_CONTEXT_USED_IN_PROMPT]', true);
      } else if (webBundle.error === 'NO_SEARCH_PROVIDER') {
        webSearchFallbackReason = '联网增强：已开启\n搜索关键词：' + webQuery + '\n参考资料：0 条\n已用于本次出题：否\n搜索服务未配置，已使用上传资料 + 外接 AI 出题。';
        console.log('[WEB_SEARCH_ENABLED] true, searchProvider 未配置');
        console.log('[WEB_SEARCH_RESULTS_COUNT]', 0);
        console.log('[WEB_CONTEXT_USED_IN_PROMPT]', false);
      } else {
        webSearchUsed = true;
        webSearchFallbackReason = '联网增强：已开启\n搜索关键词：' + webQuery + '\n参考资料：0 条\n已用于本次出题：否\n联网增强已开启，已结合上传资料与外接 AI 生成题目。';
        console.log('[WEB_SEARCH_ENABLED] true, 搜索返回 0 条');
        console.log('[WEB_SEARCH_RESULTS_COUNT]', webReferenceCount);
        console.log('[WEB_CONTEXT_USED_IN_PROMPT]', false);
      }
    } catch (err) {
      webSearchFallbackReason = '联网搜索异常，已降级为上传资料 + 外接 AI 出题。';
      console.warn('[WEB_SEARCH_ENABLED] 请求失败:', err);
      console.log('[WEB_SEARCH_RESULTS_COUNT]', 0);
      console.log('[WEB_CONTEXT_USED_IN_PROMPT]', false);
    }
  }

  // 步骤3: 尝试 AI 出题
  let questions: QuizQuestion[] = [];
  let aiGenerationTimeMs = 0;
  let usedFallback = false;
  let fallbackReason = '';

  if (isRealAI) {
    try {
      const aiConfig = getEffectiveAIConfig();
      console.log('[AI_PROVIDER]', aiConfig.provider);
      console.log('[AI_MODEL]', aiConfig.model || getAIStatus().modeLabel);
      console.log('[AI_REQUEST_START]', new Date().toISOString());
      const aiResult = await generateQuestionsWithAI(config, questionPlan, referenceContext);
      questions = aiResult.questions;
      aiGenerationTimeMs = aiResult.timeMs;
      console.log('[AI_GENERATION_TIME]', aiGenerationTimeMs, 'ms');
      console.log('[AI_QUESTIONS_GENERATED]', questions.length);
      console.log('[AI_USED_FALLBACK]', false);
      questions = applyDisplayGate(questions, config);
      if (questions.length < targetCount) {
        const retryPlan = questionPlan.slice(questions.length);
        if (retryPlan.length > 0) {
          console.warn(`[ORCHESTRATOR] AI 题目过质量门后仅 ${questions.length}/${targetCount}，请求外接 AI 补生成`);
          const retryResult = await generateQuestionsWithAI(config, retryPlan, referenceContext);
          const retryPassed = applyDisplayGate(retryResult.questions, config, questions);
          questions = [...questions, ...retryPassed].slice(0, targetCount);
        }
      }
    } catch (err) {
      usedFallback = true;
      fallbackReason = `AI 调用失败: ${err instanceof Error ? err.message : '未知错误'}`;
      console.error('[AI_USED_FALLBACK] true, 原因:', fallbackReason);
    }
  } else {
    usedFallback = true;
    fallbackReason = '未配置外部 AI，使用本地题库出题。';
    console.log('[AI_USED_FALLBACK] true, 原因:', fallbackReason);
  }

  // 步骤4: 如果 AI 出题不足，用 fallback 补齐
  if (questions.length < targetCount) {
    console.log(`[ORCHESTRATOR] AI 出题 ${questions.length}/${targetCount}，需要补题`);
    const fallbackQuestions = generateFallbackFromPlan(config, questionPlan, questions.length);
    questions = [...questions, ...fallbackQuestions];
    if (!usedFallback) {
      usedFallback = true;
      fallbackReason = `AI 仅生成 ${questions.length - fallbackQuestions.length} 道，已用本地题库补齐。`;
    }
  }

  // 步骤5: 主题校验 + 质量门 + 去重
  questions = applyDisplayGate(questions, config);

  // 步骤6: 如果门禁后不足，最多补题 2 次。仍不足则宁可少题，不展示垃圾题。
  for (let retry = 0; retry < 2 && questions.length < targetCount; retry++) {
    console.log(`[ORCHESTRATOR] 门禁后 ${questions.length}/${targetCount}，第 ${retry + 1} 次补题`);
    const extraFallback = generateFallbackFromPlan(config, questionPlan, questions.length);
    const extraPassed = applyDisplayGate(extraFallback, config, questions);
    questions = [...questions, ...extraPassed].slice(0, targetCount);
  }

  // 步骤7: 最终截断到目标数量
  questions = questions.slice(0, targetCount);
  console.log('[AI_USED_FALLBACK]', usedFallback);

  // 构建生成通知
  let generationNotice = '';
  if (questions.length < targetCount) {
    generationNotice = `仅生成 ${questions.length} 道高质量题，其余候选题因题干空泛、解析不足或与资料不匹配已被拦截。`;
  } else if (usedFallback && !isRealAI) {
    generationNotice = fallbackReason;
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

  const systemPrompt = `你是面向初高中家教老师的课后测评命题专家。你必须严格按要求输出 JSON。
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
⚠️ 简答/解答/材料分析题的 answer 必须是具体的分点答案，不能是泛化方法论。`;

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
      type: normalizeType(String(rq.type || planSlot.questionType), planSlot.questionType),
      question: String(rq.question || ''),
      options: options.length > 0 ? options : undefined,
      answer: String(rq.answer || ''),
      correctOptionLabel: extractCorrectLabel(String(rq.answer), String(rq.correctOptionLabel)),
      explanation: String(rq.explanation || ''),
      knowledgePointId: planSlot.knowledgePointId,
      difficulty: normalizeDifficulty(String(rq.difficulty), planSlot.difficulty),
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

function shapeFallbackQuestionForSlot(
  question: QuizQuestion,
  slot: QuestionPlanSlot,
  config: QuestionGenerationConfig,
  absoluteIndex: number,
  sourceText: string
): QuizQuestion {
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
    judge: 'judge', '判断': 'judge', true_false: 'judge',
    fill: 'fill', '填空': 'fill', fill_blank: 'fill',
    short: 'short', '简答': 'short', short_answer: 'short',
    solution: 'solution', '解答': 'solution',
    material: 'material', '材料分析': 'material', material_analysis: 'material',
  };
  return map[raw.toLowerCase()] || map[raw] || fallback;
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
