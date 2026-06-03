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
import { callLLMJson, getAIStatus, hasRealAIConfig } from './llmClient';
import { buildQuizPrompt } from './promptTemplates';
import {
  deduplicateQuestions,
  verifyQuestionAgainstProfile,
  verifyQuestionTopicAlignment,
} from './questionTopicVerifier';
import { reviewQuestionsQuality } from './questionQualityService';
import { generateFallbackQuestionsFromBlueprints } from './fallbackQuestionFactory';
import { getWebEnhancedReferenceContext } from './webEnhancedQuestionService';
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

  // 步骤1: 构建 QuestionPlan
  const questionPlan = buildQuestionPlan(config);
  console.log('[ORCHESTRATOR] QuestionPlan 已生成:', questionPlan.length, '个 slot');

  // 步骤2: 联网增强
  let referenceContext = '';
  let webSearchUsed = false;
  let webSearchFallbackReason = '';
  if (settings.enableWebEnhancedQuestions) {
    try {
      const stage = materialProfile.stage === '初中' ? '初中' : '高中';
      referenceContext = await getWebEnhancedReferenceContext(
        true,
        materialProfile,
        []
      );
      if (referenceContext) {
        webSearchUsed = true;
        console.log('[WEB_SEARCH_ENABLED] true');
        console.log('[WEB_SEARCH_QUERY]', `${stage}${materialProfile.subject}${materialTopic.topicTag} 例题 考点`);
        console.log('[WEB_REFERENCE_CONTEXT_LENGTH]', referenceContext.length);
      } else {
        webSearchFallbackReason = '联网增强未获得有效资料，已使用上传资料出题。';
        console.log('[WEB_SEARCH_ENABLED] true, 但无有效结果');
      }
    } catch (err) {
      webSearchFallbackReason = '联网增强请求失败，已使用上传资料出题。';
      console.warn('[WEB_SEARCH_ENABLED] 请求失败:', err);
    }
  }

  // 步骤3: 尝试 AI 出题
  let questions: QuizQuestion[] = [];
  let aiGenerationTimeMs = 0;
  let usedFallback = false;
  let fallbackReason = '';

  if (isRealAI) {
    try {
      const aiResult = await generateQuestionsWithAI(config, questionPlan, referenceContext);
      questions = aiResult.questions;
      aiGenerationTimeMs = aiResult.timeMs;
      console.log('[AI_PROVIDER]', getAIStatus().provider);
      console.log('[AI_GENERATION_TIME]', aiGenerationTimeMs, 'ms');
      console.log('[AI_QUESTIONS_GENERATED]', questions.length);
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

  // 步骤5: 主题校验 + 去重
  if (isSpecificTopic(materialTopic)) {
    questions = questions.filter(q => {
      const result = verifyQuestionTopicAlignment(q, materialTopic);
      if (!result.passed) {
        console.warn('[ORCHESTRATOR] 主题校验不通过:', q.id, result.problems);
      }
      return result.passed;
    });
  }
  questions = deduplicateQuestions(questions);

  // 步骤6: 如果去重后不足，再次补齐
  if (questions.length < targetCount) {
    console.log(`[ORCHESTRATOR] 去重后 ${questions.length}/${targetCount}，再次补题`);
    const extraFallback = generateFallbackFromPlan(config, questionPlan, questions.length);
    const extraDeduped = deduplicateQuestions(extraFallback, questions);
    questions = [...questions, ...extraDeduped];
  }

  // 步骤7: 最终截断到目标数量
  questions = questions.slice(0, targetCount);

  // 构建生成通知
  let generationNotice = '';
  if (questions.length < targetCount) {
    generationNotice = `当前仅生成 ${questions.length} / ${targetCount} 道高相关题，未使用跨资料题目凑数。`;
  } else if (usedFallback && !isRealAI) {
    generationNotice = fallbackReason;
  }
  if (webSearchFallbackReason) {
    generationNotice += (generationNotice ? '\n' : '') + webSearchFallbackReason;
  }

  console.log('[ORCHESTRATOR] 最终题目数:', questions.length);
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

  console.time('[AI_GENERATION_TIME]');
  const temperature = 0.5;
  const maxTokens = Math.max(3000, plan.length * 500);

  console.log('[AI_REQUEST] temperature:', temperature, 'max_tokens:', maxTokens);

  const llmResult = await callLLMJson(systemPrompt, userPrompt, { temperature, max_tokens: maxTokens });

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

  const timeMs = Date.now(); // 会被外层覆盖
  return { questions, timeMs };
}

// ========== Fallback 出题（基于 Plan） ==========
function generateFallbackFromPlan(
  config: QuestionGenerationConfig,
  plan: QuestionPlanSlot[],
  existingCount: number
): QuizQuestion[] {
  const { materialProfile, materialTopic, knowledgePoints, settings } = config;

  // 为每个 plan slot 生成 blueprint
  const blueprints: QuestionBlueprint[] = plan.map((slot, i) => {
    const kp = knowledgePoints.find(k => k.id === slot.knowledgePointId) || knowledgePoints[0];
    return {
      id: `bp-fallback-${i}`,
      templateId: materialTopic.allowedTemplateIds[i % Math.max(materialTopic.allowedTemplateIds.length, 1)],
      knowledgeCardId: slot.knowledgePointId,
      knowledgePoint: slot.knowledgePointTitle,
      targetAbility: kp?.masteryTarget || `理解并掌握"${slot.knowledgePointTitle}"`,
      requiredMethods: kp?.keyMethods?.slice(0, 3) || ['理解核心概念'],
      examPattern: getExamPatternForType(slot.questionType),
      difficulty: slot.difficulty,
      scoringPoints: kp?.description ? [kp.description.slice(0, 50)] : ['核心概念正确'],
      commonWrongMethods: kp?.commonMistakes?.slice(0, 3) || ['概念理解模糊'],
      sourceEvidence: kp?.sourceEvidence || kp?.description || '',
      estimatedTime: 3,
    };
  });

  const fallbackQuestions = generateFallbackQuestionsFromBlueprints(
    blueprints,
    [],
    settings,
    materialTopic
  );

  // 强制应用 plan 中的题型和难度
  return fallbackQuestions.map((q, i) => {
    const slot = plan[existingCount + i] || plan[plan.length - 1];
    return {
      ...q,
      id: `q-fb-${existingCount + i + 1}`,
      type: slot ? getQuestionTypeForPlan(slot.questionType) : q.type,
      difficulty: slot?.difficulty || q.difficulty,
      knowledgePointId: slot?.knowledgePointId || q.knowledgePointId,
    };
  });
}

// ========== 辅助函数 ==========
function isSpecificTopic(topic: MaterialTopic): boolean {
  return topic.topicTag !== '通用知识';
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
