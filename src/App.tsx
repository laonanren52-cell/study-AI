import { useState } from 'react';
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
import {
  evaluateAnswers,
  extractKnowledgePoints,
  generateDiagnosis,
  generateQuiz,
  generateReinforcementQuiz,
  generateReviewPlan,
  getAIStatus,
} from './services/aiService';
import type {
  AIStatus,
  AppStep,
  DiagnosisItem,
  KnowledgePoint,
  MaterialInput as MaterialInputType,
  QuizQuestion,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
  UserAnswer,
} from './types';

const emptyMaterial: MaterialInputType = {
  title: '',
  content: '',
  sourceType: 'text',
};

export default function App() {
  const [step, setStep] = useState<AppStep>('home');
  const [visitedSteps, setVisitedSteps] = useState<AppStep[]>([]);
  const [material, setMaterial] = useState<MaterialInputType>(emptyMaterial);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisItem[]>([]);
  const [reviewPlan, setReviewPlan] = useState<ReviewPlanDay[]>([]);
  const [reinforcementQuiz, setReinforcementQuiz] = useState<ReinforcementQuestion[]>([]);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [aiStatus, setAiStatus] = useState<AIStatus>(getAIStatus());

  const goToStep = (nextStep: AppStep) => {
    setStep(nextStep);
    if (nextStep !== 'home') {
      setVisitedSteps((current) => (current.includes(nextStep) ? current : [...current, nextStep]));
    }
  };

  const runWithLoading = async (label: string, task: () => Promise<void>) => {
    setLoadingLabel(label);
    await new Promise((resolve) => window.setTimeout(resolve, 360));
    await task();
    setLoadingLabel('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => {
    goToStep('home');
    setMaterial(emptyMaterial);
    setKnowledgePoints([]);
    setQuestions([]);
    setAnswers([]);
    setResult(null);
    setDiagnosis([]);
    setReviewPlan([]);
    setReinforcementQuiz([]);
    setLoadingLabel('');
    setVisitedSteps([]);
    setAiStatus(getAIStatus());
  };

  const handleAnalyze = () =>
    runWithLoading('AI 正在提取知识点...', async () => {
      const points = await extractKnowledgePoints(material.content);
      setKnowledgePoints(points);
      setAiStatus(getAIStatus());
      goToStep('knowledge');
    });

  const handleGenerateQuiz = () =>
    runWithLoading('AI 正在生成测评题目...', async () => {
      const generated = await generateQuiz(knowledgePoints, material.content);
      setQuestions(generated);
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
      const generated = await generateDiagnosis(result, questions, answers);
      setDiagnosis(generated);
      setAiStatus(getAIStatus());
      goToStep('diagnosis');
    });

  const handleReviewPlan = () =>
    runWithLoading('AI 正在规划复习路径...', async () => {
      if (!result) return;
      const generated = await generateReviewPlan(diagnosis, result.weakKnowledgePoints);
      setReviewPlan(generated);
      goToStep('plan');
    });

  const handleReinforcement = () =>
    runWithLoading('AI 正在生成强化练习...', async () => {
      if (!result) return;
      const generated = await generateReinforcementQuiz(result.weakKnowledgePoints);
      setReinforcementQuiz(generated);
      goToStep('reinforcement');
    });

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_34%),linear-gradient(135deg,_#07111f_0%,_#0f172a_48%,_#111827_100%)]">
      <Header onReset={reset} aiStatus={aiStatus} />
      <StepIndicator currentStep={step} visitedSteps={visitedSteps} onStepClick={goToStep} />
      {loadingLabel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="glass-panel rounded-lg px-8 py-6 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
            <p className="mt-4 font-medium text-white">{loadingLabel}</p>
          </div>
        </div>
      ) : null}

      {step === 'home' ? <HeroSection onStart={() => goToStep('material')} /> : null}
      {step === 'material' ? <MaterialInput material={material} setMaterial={setMaterial} onAnalyze={handleAnalyze} /> : null}
      {step === 'knowledge' ? <KnowledgePointList knowledgePoints={knowledgePoints} onGenerateQuiz={handleGenerateQuiz} /> : null}
      {step === 'quiz' ? <QuizGenerator questions={questions} knowledgePoints={knowledgePoints} aiStatus={aiStatus} onStart={() => goToStep('taking')} /> : null}
      {step === 'taking' ? <QuizTaking questions={questions} answers={answers} setAnswers={setAnswers} onSubmit={handleSubmitQuiz} /> : null}
      {step === 'result' && result ? <ResultSummary result={result} questions={questions} knowledgePoints={knowledgePoints} onDiagnosis={handleDiagnosis} /> : null}
      {step === 'diagnosis' ? <DiagnosisPanel diagnosis={diagnosis} onGeneratePlan={handleReviewPlan} /> : null}
      {step === 'plan' ? <ReviewPlan reviewPlan={reviewPlan} onGenerateReinforcement={handleReinforcement} /> : null}
      {step === 'reinforcement' ? <ReinforcementQuiz reinforcementQuiz={reinforcementQuiz} onReport={() => goToStep('report')} /> : null}
      {step === 'report' && result ? (
        <ReportExport
          material={material}
          knowledgePoints={knowledgePoints}
          result={result}
          diagnosis={diagnosis}
          reviewPlan={reviewPlan}
          reinforcementQuiz={reinforcementQuiz}
        />
      ) : null}
    </div>
  );
}
