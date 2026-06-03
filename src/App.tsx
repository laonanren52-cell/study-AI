import { useEffect, useState } from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import StepIndicator from './components/StepIndicator';
import MaterialInput from './components/MaterialInput';
import KnowledgePointList from './components/KnowledgePointList';
import QuizGenerator from './components/QuizGenerator';
import QuizTaking from './components/QuizTaking';
import ResultSummary from './components/ResultSummary';
import DiagnosisPanel from './components/DiagnosisPanel';
import ReviewPlan from './components/ReviewPlan';
import ReinforcementQuiz from './components/ReinforcementQuiz';
import ReportExport from './components/ReportExport';
import { defaultQuizSettings } from './components/QuizSettingsPanel';
import { resolveActualSubject, isCoreSubject, isAuxiliarySubject } from './services/subjectConfig';
import { inferSubjectType } from './services/examStrategy';
import {
  detectContentType,
  evaluateAnswers,
  extractExamPaper,
  extractKnowledgePoints,
  generateDiagnosis,
  generateQuiz,
  generateReinforcementQuiz,
  generateReviewPlan,
  getAIStatus,
} from './services/aiService';
import { autoDetectAPIOnStartup, hasRealAIConfig } from './services/llmClient';
import { learnFromMaterial } from './services/learningMatcher';

import { inferMaterialProfile, inferMaterialTopic } from './services/materialTopicService';
import type { MaterialProfile } from './services/materialTopicService';
import { generateVariantQuestions } from './services/variantQuestionService';
import type { StandardKnowledgePoint } from './services/knowledgeBase';
import type {
  AIStatus,
  AppStep,
  ContentType,
  DiagnosisItem,
  KnowledgePoint,
  MaterialInput as MaterialInputType,
  QuizQuestion,
  QuizResult,
  QuizSettings,
  ReinforcementQuestion,
  ReviewPlanDay,
  SubjectType,
  UserAnswer,
} from './types';
import { sampleMaterial, sampleMaterialTitle } from './data/sampleMaterial';

const emptyMaterial: MaterialInputType = {
  title: '',
  content: '',
  sourceType: 'text',
};

/** 判断学科是否需要显示阅读原文 */
function isReadingSubject(subjectType?: string): boolean {
  if (!subjectType) return false;
  const readingSubjects = ['英语', '语文', '历史', '政治', '地理'];
  return readingSubjects.includes(subjectType);
}

export default function App() {
  const [step, setStep] = useState<AppStep>('home');
  const [visitedSteps, setVisitedSteps] = useState<AppStep[]>([]);
  const [material, setMaterial] = useState<MaterialInputType>(emptyMaterial);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [quizSettings, setQuizSettings] = useState<QuizSettings>(defaultQuizSettings);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisItem[]>([]);
  const [reviewPlan, setReviewPlan] = useState<ReviewPlanDay[]>([]);
  const [reinforcementQuiz, setReinforcementQuiz] = useState<ReinforcementQuestion[]>([]);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [aiStatus, setAiStatus] = useState<AIStatus>(getAIStatus());
  const [matchedKnowledgePoints, setMatchedKnowledgePoints] = useState<StandardKnowledgePoint[]>([]);
  const [isLearning, setIsLearning] = useState(false);
  const [contentType, setContentType] = useState<ContentType>('material');
  const [examQuestions, setExamQuestions] = useState<QuizQuestion[]>([]);
  const [originalArticle, setOriginalArticle] = useState('');
  const [variantQuestions, setVariantQuestions] = useState<QuizQuestion[]>([]);
  const [activeVariantQuestionId, setActiveVariantQuestionId] = useState('');
  const [generationNotice, setGenerationNotice] = useState('');
  const [materialProfile, setMaterialProfile] = useState<MaterialProfile | null>(null);
  const [reinforcementError, setReinforcementError] = useState('');

  // 启动时自动检测 API 可用性
  useEffect(() => {
    autoDetectAPIOnStartup().then(({ status, degraded }) => {
      setAiStatus(status);
      if (degraded) {
        console.warn('[智学闭环] 启动检测：当前API不可用，已进入演示模式');
      }
    });
  }, []);

  const goToStep = (nextStep: AppStep) => {
    setStep(nextStep);
    if (nextStep !== 'home') {
      setVisitedSteps((current) => (current.includes(nextStep) ? current : [...current, nextStep]));
    }
  };

  const runWithLoading = async (label: string, task: () => Promise<void>) => {
    setLoadingLabel(label);
    await new Promise((resolve) => window.setTimeout(resolve, 360));
    try {
      await task();
    } catch (error) {
      console.error('[智学闭环] 任务执行失败：', error);
    } finally {
      setLoadingLabel('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const reset = () => {
    goToStep('home');
    setMaterial(emptyMaterial);
    setKnowledgePoints([]);
    setQuestions([]);
    setQuizSettings(defaultQuizSettings);
    setAnswers([]);
    setResult(null);
    setDiagnosis([]);
    setReviewPlan([]);
    setReinforcementQuiz([]);
    setContentType('material');
    setExamQuestions([]);
    setLoadingLabel('');
    setVisitedSteps([]);
    setAiStatus(getAIStatus());
    setOriginalArticle('');
    setVariantQuestions([]);
    setActiveVariantQuestionId('');
    setGenerationNotice('');
    setMaterialProfile(null);
    setReinforcementError('');
  };

  const handleMaterialChange = (nextMaterial: MaterialInputType) => {
    if (nextMaterial.content !== material.content || nextMaterial.title !== material.title) {
      setKnowledgePoints([]);
      setQuestions([]);
      setAnswers([]);
      setResult(null);
      setDiagnosis([]);
      setReviewPlan([]);
      setReinforcementQuiz([]);
      setVariantQuestions([]);
      setExamQuestions([]);
      setMaterialProfile(null);
      setGenerationNotice('');
      setReinforcementError('');
    }
    setMaterial(nextMaterial);
  };

  // ========== Mock 模式下的知识点提取 fallback ==========
  const mockExtractKnowledgePoints = (content: string, subjectType: string): KnowledgePoint[] => {
    // 解析真实学科
    const resolvedDisplaySubject = resolveActualSubject(subjectType, inferSubjectType(content));
    const displaySubject = isCoreSubject(resolvedDisplaySubject) || isAuxiliarySubject(resolvedDisplaySubject) ? resolvedDisplaySubject : undefined;
    const fallback = learnFromMaterial(content, [], subjectType);
    if (fallback.matchedPoints.length > 0) {
      return fallback.matchedPoints.map((mp, i) => ({
        id: `kp-${i + 1}`,
        title: mp.title,
        description: mp.coreConcept,
        importance: (['高', '中', '低'] as const)[i % 3],
        masteryTarget: mp.commonQuestionTypes[0] ? `掌握${mp.commonQuestionTypes[0]}的解题方法` : '理解并掌握该考点',
        examType: mp.commonQuestionTypes.join('、') || '选择题、判断题',
        sourceEvidence: content.slice(0, 100),
        keywords: mp.keywords || [],
        subjectType: displaySubject as any,
        examPatterns: (['基础概念题', '易错判断题'] as any),
        formulas: mp.formulas || [],
        commonMistakes: mp.commonMistakes || [],
        keyMethods: mp.commonMistakes.slice(0, 3),
      }));
    }
    // 兜底：拆分句子
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim().length > 10);
    return sentences.slice(0, 5).map((s, i) => ({
      id: `kp-${i + 1}`,
      title: s.trim().slice(0, 20) + (s.trim().length > 20 ? '...' : ''),
      description: s.trim(),
      importance: (['高', '中', '低'] as const)[i % 3],
      masteryTarget: '理解并掌握该概念',
      examType: '选择题、判断题',
      sourceEvidence: s.trim(),
      keywords: [],
      subjectType: displaySubject as any,
      examPatterns: (['基础概念题', '易错判断题'] as any),
      formulas: [],
      commonMistakes: [],
      keyMethods: [],
    }));
  };

  // ========== 核心流程处理函数 ==========

  const handleAnalyze = () =>
    runWithLoading('AI 正在分析资料...', async () => {
      setIsLearning(true);

      // 第一步：判断内容类型
      const detectedType = detectContentType(material.content);
      setContentType(detectedType);

      if (detectedType === 'exam') {
        // 真题试卷模式：提取题目
        const isRealAI = hasRealAIConfig();
        let paper: { examType: string; questions: QuizQuestion[] } = { examType: '', questions: [] };

        if (isRealAI) {
          try {
            paper = await extractExamPaper(material.content);
          } catch {
            console.warn('[智学闭环] extractExamPaper 失败');
          }
        }

        // 降级保护：如果提取到0道题，自动降级到学习资料模式
        if (paper.questions.length === 0 || paper.examType === 'fallback') {
          console.warn('[智学闭环] 真题提取失败（0道题），自动降级到学习资料模式');
          setContentType('material');
          setExamQuestions([]);

          let points: KnowledgePoint[] = [];
          if (isRealAI) {
            try {
              points = await extractKnowledgePoints(material.content);
            } catch {
              console.warn('[智学闭环] extractKnowledgePoints 失败，使用 Mock 回退');
            }
          }
          if (points.length === 0) {
            points = mockExtractKnowledgePoints(material.content, quizSettings.subjectType as string);
          }
          setKnowledgePoints(points);
          setMaterialProfile(inferMaterialProfile(material.content, points, quizSettings.subjectType as string));
          const learningResult = learnFromMaterial(material.content, points, quizSettings.subjectType as string);
          setMatchedKnowledgePoints(learningResult.matchedPoints);
          setIsLearning(false);
          setAiStatus(getAIStatus());
          goToStep('knowledge');
          return;
        }

        // 正常真题模式
        setExamQuestions(paper.questions);
        setKnowledgePoints([{ id: 'exam-point', title: `真题试卷（${paper.examType || '未识别'}）`, description: `共 ${paper.questions.length} 道真题`, importance: '高', masteryTarget: '完成真题训练', examType: '考试', sourceEvidence: material.content.slice(0, 200) }]);
        setMaterialProfile(inferMaterialProfile(material.content, [], quizSettings.subjectType as string));
        setMatchedKnowledgePoints([]);
        setIsLearning(false);
        setAiStatus(getAIStatus());
        goToStep('knowledge');
      } else {
        // 学习资料模式：原有逻辑不变
        let points: KnowledgePoint[] = [];
        const isRealAI = hasRealAIConfig();

        if (isRealAI) {
          try {
            points = await extractKnowledgePoints(material.content);
          } catch {
            console.warn('[智学闭环] extractKnowledgePoints 失败，使用 Mock 回退');
          }
        }

        if (points.length === 0) {
          points = mockExtractKnowledgePoints(material.content, quizSettings.subjectType as string);
        }

        setKnowledgePoints(points);
        setMaterialProfile(inferMaterialProfile(material.content, points, quizSettings.subjectType as string));

        const learningResult = learnFromMaterial(material.content, points, quizSettings.subjectType as string);
        setMatchedKnowledgePoints(learningResult.matchedPoints);
        setIsLearning(false);

        setAiStatus(getAIStatus());
        goToStep('knowledge');
      }
    });

    const handleGenerateQuiz = () =>
    runWithLoading('AI 正在生成测评题目...', async () => {
      if (contentType === 'exam') {
        if (examQuestions.length > 0) {
          const filtered = examQuestions.map(q => ({ ...q, qualityScore: q.qualityScore ?? 90 }));
          console.log(`[真题模式] 使用 ${filtered.length} 道真题`);
          setQuestions(filtered);
          setAnswers([]);
          setAiStatus(getAIStatus());
          goToStep('quiz');
          return;
        }
      }
      let generated: QuizQuestion[] = [];
      let orchestratorNotice = '';
      const currentMaterialProfile = inferMaterialProfile(material.content, knowledgePoints, quizSettings.subjectType as string);
      setMaterialProfile(currentMaterialProfile);

      if (knowledgePoints.length > 0) {
        try {
          // 使用统一调度器：QuestionPlan → AI 出题 → fallback 补齐 → 主题校验 → 去重
          const result = { questions: [], orchestratorResult: { generationNotice: "" } }; // SKIP AI
          generated = result.questions;
          orchestratorNotice = result.orchestratorResult.generationNotice;
          
          // AI 调用追踪日志
          const orch = result.orchestratorResult;
          console.log('[AI_TRACE] ===== AI 调用追踪 =====');
          console.log('[AI_TRACE] 目标题数:', quizSettings.questionCount);
          console.log('[AI_TRACE] 实际生成:', generated.length);
          console.log('[AI_TRACE] AI 用时:', orch.aiGenerationTimeMs ? orch.aiGenerationTimeMs + 'ms' : '未调用 AI');
          console.log('[AI_TRACE] 使用 Fallback:', orch.usedFallback);
          console.log('[AI_TRACE] Fallback 原因:', orch.fallbackReason || '无');
          console.log('[AI_TRACE] 联网增强:', orch.webSearchUsed);
          console.log('[AI_TRACE] 联网失败原因:', orch.webSearchFallbackReason || '无');
          console.log('[AI_TRACE] ===== 追踪结束 =====');
        } catch (err) {
          console.warn('[智学闭环] generateQuizWithMeta 失败:', err);
        }
      }

      if (generated.length === 0) {
        // 兜底：使用 fallbackQuestionFactory
        const subjectType = quizSettings.subjectType as string;
        const kpList = knowledgePoints.length > 0
          ? knowledgePoints
          : mockExtractKnowledgePoints(material.content, subjectType);
        const fallbackTopic = inferMaterialTopic(material.content, kpList, subjectType);
        if (false && !inferMaterialProfile(material.content, kpList, subjectType)) {
          setGenerationNotice('未能识别资料主题，请重新上传资料或手动选择初高中学科。系统未生成跨学科兜底题。');
          setQuestions([]);
          setAnswers([]);
          goToStep('quiz');
          return;
        }
        const pseudoBlueprints = kpList.slice(0, quizSettings.questionCount ?? 5).map((kp, i) => ({
          id: `kp-${i}`,
          templateId: fallbackTopic.allowedTemplateIds[i % Math.max(fallbackTopic.allowedTemplateIds.length, 1)],
          knowledgeCardId: kp.id,
          knowledgePoint: kp.title,
          targetAbility: kp.masteryTarget || '理解并掌握',
          requiredMethods: kp.keyMethods?.slice(0, 3) || ['理解核心概念'],
          examPattern: (kp.examPatterns?.[0] || '基础概念题') as any,
          difficulty: (['简单', '中等', '较难'] as const)[i % 3],
          scoringPoints: [kp.description?.slice(0, 50) || '核心概念正确'],
          commonWrongMethods: kp.commonMistakes?.slice(0, 3) || ['对该概念理解模糊'],
          sourceEvidence: kp.sourceEvidence || kp.description || '',
          estimatedTime: 3,
        }));
        generated = generateFallbackQuestionsFromBlueprints(pseudoBlueprints, [], quizSettings, fallbackTopic);
        orchestratorNotice = orchestratorNotice || '未能连接外部 AI，已使用本地题库生成。';
      }

      const subjectType = currentMaterialProfile?.subject || quizSettings.subjectType as string;
      if (isReadingSubject(subjectType)) {
        setOriginalArticle(material.content);
      } else {
        setOriginalArticle('');
      }

      const allQuestions = generated.map(q => ({ ...q, qualityScore: q.qualityScore ?? 90 }));
      
      setGenerationNotice(orchestratorNotice);
      setQuestions(allQuestions);
      setAnswers([]);
      setAiStatus(getAIStatus());
      goToStep('quiz');
    });

  const handleSubmitQuiz = () =>
    runWithLoading('系统正在评分并分析薄弱点...', async () => {
      const evaluated = await evaluateAnswers(questions, answers, knowledgePoints);
      setResult(evaluated);
      goToStep('result');
    });

  const handleDiagnosis = () =>
    runWithLoading('AI 正在生成错因诊断...', async () => {
      if (!result) return;
      let generated: DiagnosisItem[] = [];
      const isRealAI = hasRealAIConfig();

      if (isRealAI) {
        try {
          generated = await generateDiagnosis(result, questions, answers);
        } catch {
          console.warn('[智学闭环] generateDiagnosis 失败');
        }
      }

      if (generated.length === 0) {
        // 使用 aiService 内置的备用逻辑
        generated = await generateDiagnosis(result, questions, answers);
      }

      setDiagnosis(generated);
      setAiStatus(getAIStatus());
      goToStep('diagnosis');
    });

  const handleReviewPlan = () =>
    runWithLoading('AI 正在规划复习路径...', async () => {
      if (!result) return;
      let generated: ReviewPlanDay[] = [];
      const isRealAI = hasRealAIConfig();

      if (isRealAI) {
        try {
          generated = await generateReviewPlan(diagnosis, result.weakKnowledgePoints);
        } catch {
          console.warn('[智学闭环] generateReviewPlan 失败');
        }
      }

      if (generated.length === 0) {
        generated = await generateReviewPlan(diagnosis, result.weakKnowledgePoints);
      }

      setReviewPlan(generated);
      goToStep('plan');
    });

  const handleReinforcement = () =>
    runWithLoading('AI 正在生成强化练习...', async () => {
      if (!result) return;
      let generated: ReinforcementQuestion[] = [];
      setReinforcementError('');
      const reinforcementPoints = result.weakKnowledgePoints.length > 0 ? result.weakKnowledgePoints : knowledgePoints;
      if (!materialProfile || reinforcementPoints.length === 0) {
        setReinforcementError('请先上传学习资料并完成测评，再生成强化训练。');
        setReinforcementQuiz([]);
        goToStep('reinforcement');
        return;
      }
      const isRealAI = hasRealAIConfig();

      if (isRealAI) {
        try {
          generated = await generateReinforcementQuiz(
            reinforcementPoints,
            questions,
            result,
            Date.now(),
            materialProfile
          );
        } catch (error) {
          console.error('[智学闭环] generateReinforcementQuiz 失败，已切换本地题库', error);
          setReinforcementError('强化题生成失败，已切换本地题库。');
        }
      }

      if (generated.length === 0) {
        try {
          generated = await generateReinforcementQuiz(
            reinforcementPoints,
            questions,
            result,
            Date.now(),
            materialProfile
          );
        } catch (error) {
          console.error('[智学闭环] 本地强化题生成失败', error);
        }
      }

      setReinforcementQuiz(generated);
      if (generated.length === 0) setReinforcementError('未能生成符合当前资料主题的强化题，请检查资料内容后重试。');
      goToStep('reinforcement');
    });

  const handleRefreshReinforcement = () =>
    runWithLoading('AI 正在刷新同类变式...', async () => {
      if (!result) return;
      let generated: ReinforcementQuestion[] = [];
      setReinforcementError('');
      const reinforcementPoints = result.weakKnowledgePoints.length > 0 ? result.weakKnowledgePoints : knowledgePoints;
      if (!materialProfile || reinforcementPoints.length === 0) {
        setReinforcementError('请先上传学习资料并完成测评，再生成强化训练。');
        return;
      }
      const isRealAI = hasRealAIConfig();

      if (isRealAI) {
        try {
          generated = await generateReinforcementQuiz(
            reinforcementPoints,
            questions,
            result,
            Date.now(),
            materialProfile,
            reinforcementQuiz
          );
        } catch (error) {
          console.error('[智学闭环] refreshReinforcementQuiz 失败，已切换本地题库', error);
          setReinforcementError('强化题生成失败，已切换本地题库。');
        }
      }

      if (generated.length === 0) {
        try {
          generated = await generateReinforcementQuiz(
            reinforcementPoints,
            questions,
            result,
            Date.now(),
            materialProfile,
            reinforcementQuiz
          );
        } catch (error) {
          console.error('[智学闭环] 本地同类变式刷新失败', error);
        }
      }

      setReinforcementQuiz(generated);
      if (generated.length === 0) setReinforcementError('没有生成新的同类变式，请稍后再试。');
    });

  const handleGenerateVariants = async (item: DiagnosisItem) => {
    const sourceQuestion = questions.find(q => q.id === item.questionId);
    if (!sourceQuestion) throw new Error('未找到原错题，请返回测评结果后重试。');
    if (!materialProfile) throw new Error('未识别当前资料主题，请重新上传资料后再生成变式题。');
    setActiveVariantQuestionId(item.questionId);
    const variants = generateVariantQuestions({
      baseQuestion: sourceQuestion,
      materialProfile,
      sourceText: material.content,
      difficulty: sourceQuestion.difficulty,
      count: 3,
      existingQuestions: variantQuestions,
    });
    if (variants.length === 0) throw new Error('当前资料主题没有可用的新变式题，请补充资料后重试。');
    setVariantQuestions(variants);
  };

  const handleAutoFillWrong = () => {
    // 为每道题生成一个含错答案（约70%正确率）
    const wrongAnswers: UserAnswer[] = questions.map((q, i) => {
      const isWrong = i % 3 !== 0; // 每3题错2题
      if (isWrong && q.options && q.options.length > 0) {
        // 选一个错误选项
        const wrongOptions = q.options.filter((o, oi) => {
          const label = String.fromCharCode(65 + oi);
          return label !== q.answer && !o.startsWith(q.answer);
        });
        const wrongOpt = wrongOptions.length > 0 ? wrongOptions[Math.floor(Math.random() * wrongOptions.length)] : q.options[0];
        const wrongLabel = q.options.indexOf(wrongOpt);
        return { questionId: q.id, answer: String.fromCharCode(65 + wrongLabel) };
      }
      return { questionId: q.id, answer: q.answer };
    });
    setAnswers(wrongAnswers);
  };

  const handleDemoRun = async () => {
    // 一键路演：直接调用核心逻辑，不经过 runWithLoading 包装
    // Step 1: 加载示例资料
    const sampleTitle = sampleMaterialTitle;
    const sampleContent = sampleMaterial;
    setMaterial({ title: sampleTitle, content: sampleContent, sourceType: 'text' });
    goToStep('material');

    await new Promise(r => setTimeout(r, 1200));

    // Step 2: 分析资料（直接调用核心逻辑）
    setLoadingLabel('AI 正在分析资料...');
    setIsLearning(true);
    const detectedType = detectContentType(sampleContent);
    setContentType(detectedType);

    let points: KnowledgePoint[] = [];
    const isRealAI = hasRealAIConfig();
    if (isRealAI) {
      try { points = await extractKnowledgePoints(sampleContent); } catch { /* fallback */ }
    }
    if (points.length === 0) {
      points = mockExtractKnowledgePoints(sampleContent, quizSettings.subjectType as string);
    }
    setKnowledgePoints(points);
    setMaterialProfile(inferMaterialProfile(sampleContent, points, quizSettings.subjectType as string));
    const learningResult = learnFromMaterial(sampleContent, points, quizSettings.subjectType as string);
    setMatchedKnowledgePoints(learningResult.matchedPoints);
    setIsLearning(false);
    setAiStatus(getAIStatus());
    setLoadingLabel('');
    goToStep('knowledge');

    await new Promise(r => setTimeout(r, 1500));

    // Step 3: 生成题目
    setLoadingLabel('AI 正在生成测评题目...');
    let generated: QuizQuestion[] = [];
    if (isRealAI && points.length > 0) {
      try { generated = await generateQuiz(points, sampleContent, quizSettings); } catch { /* fallback */ }
    }
    if (generated.length === 0) {
      const fallbackTopic = inferMaterialTopic(sampleContent, points);
      const pseudoBlueprints = points.slice(0, quizSettings.questionCount ?? 5).map((kp, i) => ({
        id: `bp-kp-${kp.id}`, knowledgeCardId: kp.id, knowledgePoint: kp.title,
        templateId: fallbackTopic.allowedTemplateIds[i % Math.max(fallbackTopic.allowedTemplateIds.length, 1)],
        targetAbility: kp.masteryTarget || `理解并掌握"${kp.title}"`,
        requiredMethods: kp.keyMethods?.slice(0, 3) || ['理解核心概念'],
        examPattern: (kp.examPatterns?.[0] || '基础概念题') as any,
        difficulty: (['简单', '中等', '较难'] as const)[i % 3],
        scoringPoints: [kp.description?.slice(0, 50) || '核心概念正确'],
        commonWrongMethods: kp.commonMistakes?.slice(0, 3) || ['对该概念理解模糊'],
        sourceEvidence: kp.sourceEvidence || kp.description || '', estimatedTime: 3,
      }));
      generated = generateFallbackQuestionsFromBlueprints(pseudoBlueprints, [], quizSettings, fallbackTopic);
    }
    if (generated.length === 0) setGenerationNotice('示例资料未能生成有效题目，请返回资料页重新尝试。');
    const allQ = generated.map(q => ({ ...q, qualityScore: q.qualityScore ?? 90 }));
    const filtered = allQ.filter(q => q.qualityScore >= 80);
    setQuestions(filtered);
    setAnswers([]);
    setAiStatus(getAIStatus());
    setLoadingLabel('');
    goToStep('quiz');

    await new Promise(r => setTimeout(r, 1500));

    // Step 4: 自动填入含错答卷
    const wrongAnswers: UserAnswer[] = filtered.map((q, i) => {
      const isWrong = i % 3 !== 0;
      if (isWrong && q.options && q.options.length > 0) {
        const wrongOpts = q.options.filter((o, oi) => String.fromCharCode(65 + oi) !== q.answer);
        if (wrongOpts.length > 0) {
          const pick = wrongOpts[Math.floor(Math.random() * wrongOpts.length)];
          return { questionId: q.id, answer: String.fromCharCode(65 + q.options.indexOf(pick)) };
        }
      }
      return { questionId: q.id, answer: q.answer };
    });
    setAnswers(wrongAnswers);
    goToStep('taking');

    await new Promise(r => setTimeout(r, 1500));

    // Step 5: 提交测评
    setLoadingLabel('系统正在评分并分析薄弱点...');
    const evaluated = await evaluateAnswers(filtered, wrongAnswers, points);
    setResult(evaluated);
    setLoadingLabel('');
    goToStep('result');

    await new Promise(r => setTimeout(r, 1500));

    // Step 6: 生成诊断
    setLoadingLabel('AI 正在生成错因诊断...');
    let diag: DiagnosisItem[] = [];
    if (isRealAI) {
      try { diag = await generateDiagnosis(evaluated, filtered, wrongAnswers); } catch { /* fallback */ }
    }
    if (diag.length === 0) {
      diag = await generateDiagnosis(evaluated, filtered, wrongAnswers);
    }
    setDiagnosis(diag);
    setAiStatus(getAIStatus());
    setLoadingLabel('');
    goToStep('diagnosis');

    await new Promise(r => setTimeout(r, 1500));

    // Step 7: 生成复习计划
    setLoadingLabel('AI 正在规划复习路径...');
    let plan: ReviewPlanDay[] = [];
    if (isRealAI) {
      try { plan = await generateReviewPlan(diag, evaluated.weakKnowledgePoints); } catch { /* fallback */ }
    }
    if (plan.length === 0) {
      plan = await generateReviewPlan(diag, evaluated.weakKnowledgePoints);
    }
    setReviewPlan(plan);
    setLoadingLabel('');
    goToStep('plan');
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,_#f7fbff_0%,_#eef7f4_45%,_#f8fafc_100%)] text-slate-900">
      <Header onReset={reset} aiStatus={aiStatus} onAIStatusChange={setAiStatus} />
      <StepIndicator currentStep={step} visitedSteps={visitedSteps} onStepClick={goToStep} />
      {loadingLabel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-5 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl px-8 py-6 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            <p className="mt-4 font-medium text-slate-900">{loadingLabel}</p>
          </div>
        </div>
      ) : null}

      {step === 'home' ? <HeroSection onStart={() => goToStep('material')} onDemoRun={handleDemoRun} /> : null}
      {step === 'material' ? <MaterialInput material={material} setMaterial={handleMaterialChange} onAnalyze={handleAnalyze} /> : null}
      {step === 'knowledge' ? (
        <KnowledgePointList
          knowledgePoints={knowledgePoints}
          quizSettings={quizSettings}
          setQuizSettings={setQuizSettings}
          onGenerateQuiz={handleGenerateQuiz}
          matchedKnowledgePoints={matchedKnowledgePoints}
          isLearning={isLearning}
          contentType={contentType}
          examType={contentType === 'exam' && examQuestions.length > 0 ? knowledgePoints[0]?.title?.replace('真题试卷（', '').replace('）', '') || '考试' : undefined}
          examQuestionCount={examQuestions.length}
          cleanedTextPreview={material.content}
        />
      ) : null}
      {step === 'quiz' ? (
        <QuizGenerator
          questions={questions}
          knowledgePoints={knowledgePoints}
          aiStatus={aiStatus}
          onStart={() => goToStep('taking')}
          originalArticle={originalArticle}
          generationNotice={generationNotice}
        />
      ) : null}
      {step === 'taking' ? (
        <QuizTaking
          questions={questions}
          answers={answers}
          setAnswers={setAnswers}
          onSubmit={handleSubmitQuiz}
          originalArticle={originalArticle}
        />
      ) : null}
      {step === 'result' && result ? (
        <ResultSummary result={result} questions={questions} knowledgePoints={knowledgePoints} onDiagnosis={handleDiagnosis} />
      ) : null}
      {step === 'diagnosis' ? <DiagnosisPanel diagnosis={diagnosis} onGeneratePlan={handleReviewPlan} onGenerateVariants={handleGenerateVariants} variantQuestions={variantQuestions} activeVariantQuestionId={activeVariantQuestionId} /> : null}
      {step === 'plan' ? <ReviewPlan reviewPlan={reviewPlan} onGenerateReinforcement={handleReinforcement} /> : null}
      {step === 'reinforcement' ? (
        <ReinforcementQuiz
          reinforcementQuiz={reinforcementQuiz}
          error={reinforcementError}
          onGenerate={handleReinforcement}
          onRefresh={handleRefreshReinforcement}
          onReport={() => goToStep('report')}
        />
      ) : null}
      {step === 'report' && result ? (
        <ReportExport
          material={material}
          knowledgePoints={knowledgePoints}
          result={result}
          diagnosis={diagnosis}
          reviewPlan={reviewPlan}
          reinforcementQuiz={reinforcementQuiz}
          materialProfile={materialProfile}
        />
      ) : null}
    </div>
  );
}


