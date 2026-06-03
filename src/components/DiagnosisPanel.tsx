import { useState } from 'react';
import { ArrowRight, CheckCircle, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type { DiagnosisItem, QuizQuestion } from '../types';

interface DiagnosisPanelProps {
  diagnosis: DiagnosisItem[];
  onGeneratePlan: () => void;
  onGenerateVariants?: (item: DiagnosisItem) => Promise<void>;
  variantQuestions?: QuizQuestion[];
  activeVariantQuestionId?: string;
}

const normalizeReasonType = (reasonType: string): string => {
  if (/象限/.test(reasonType)) return '象限判断错误';
  if (/公式/.test(reasonType)) return '公式误用';
  if (/计算/.test(reasonType)) return '计算失误';
  if (/材料|关键词|表达/.test(reasonType)) return '材料理解偏差';
  if (/审题|场景/.test(reasonType)) return '审题错误';
  return '概念不清';
};

export default function DiagnosisPanel({
  diagnosis,
  onGeneratePlan,
  onGenerateVariants,
  variantQuestions = [],
  activeVariantQuestionId,
}: DiagnosisPanelProps) {
  const [loadingId, setLoadingId] = useState('');
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const generateVariants = async (item: DiagnosisItem) => {
    if (!onGenerateVariants) return;
    setLoadingId(item.questionId);
    setError('');
    setAnswers({});
    setSubmitted(false);
    try {
      await onGenerateVariants(item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '变式题生成失败，请稍后重试。');
    } finally {
      setLoadingId('');
    }
  };

  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-blue-700">错题复盘</p>
          <h2 className="mt-2 text-3xl font-semibold text-gray-900">AI 错因诊断</h2>
        </div>
        <button onClick={onGeneratePlan} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          生成复习计划 <ArrowRight className="inline h-4 w-4" />
        </button>
      </div>

      {diagnosis.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
          <p className="font-semibold text-gray-900">暂无明显错因</p>
          <p className="mt-2 text-sm text-gray-500">本次测评表现稳定，可以进入复习计划继续训练。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {diagnosis.map((item) => {
            const isActive = activeVariantQuestionId === item.questionId;
            return (
              <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <div>
                    <h3 className="font-semibold leading-6 text-gray-900">{item.question}</h3>
                    <p className="mt-1 text-sm text-gray-500">{item.knowledgePointTitle}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-y border-gray-100 py-4 sm:grid-cols-2">
                  <p className="text-sm text-gray-600"><span className="font-semibold text-red-600">我的答案：</span>{item.userAnswer || '未作答'}</p>
                  <p className="text-sm text-gray-600"><span className="font-semibold text-green-700">正确答案：</span>{item.correctUnderstanding}</p>
                </div>

                <div className="mt-4">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    {normalizeReasonType(item.reasonType)}
                  </span>
                </div>

                <div className="mt-4 rounded-xl bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-800">核心讲解</p>
                  <p className="mt-1 text-sm leading-6 text-gray-700">{item.diagnosis}</p>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-800">纠正步骤</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-gray-600">
                    {(item.missingRubric?.length ? item.missingRubric : ['回到原题标出已知条件', '对照正确思路完成推导', '检查答案和题目要求是否一致']).slice(0, 5).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className="mt-4 border-t border-gray-100 pt-4">
                  <button
                    onClick={() => generateVariants(item)}
                    disabled={loadingId === item.questionId}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                  >
                    {loadingId === item.questionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {isActive ? '重新生成一组' : '举一反三'}
                  </button>

                  {isActive && error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
                  {isActive && !loadingId && variantQuestions.length === 0 && !error ? (
                    <p className="mt-3 text-sm text-gray-500">暂无可用变式题，请点击按钮生成。</p>
                  ) : null}

                  {isActive && variantQuestions.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {variantQuestions.map((question, index) => {
                        const selected = answers[question.id] || '';
                        const isCorrect = selected === question.answer;
                        return (
                          <div key={question.id} className="rounded-xl border border-gray-200 p-4">
                            <p className="text-sm font-semibold leading-6 text-gray-900">变式 {index + 1}：{question.question}</p>
                            <div className="mt-3 grid gap-2">
                              {(question.options || []).map((option, optionIndex) => (
                                <label key={option} className="flex cursor-pointer gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                  <input
                                    type="radio"
                                    name={question.id}
                                    value={option}
                                    checked={selected === option}
                                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                                  />
                                  <span>{String.fromCharCode(65 + optionIndex)}. {option}</span>
                                </label>
                              ))}
                            </div>
                            {submitted ? (
                              <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-700">
                                <p className={isCorrect ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}>
                                  {isCorrect ? '回答正确' : `回答错误。正确答案：${question.answer}`}
                                </p>
                                <p className="mt-1">{question.explanation}</p>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      <button
                        onClick={() => setSubmitted(true)}
                        disabled={variantQuestions.some((question) => !answers[question.id])}
                        className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        提交变式答案并查看解析
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
