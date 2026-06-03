import { ArrowRight } from 'lucide-react';
import type { KnowledgePoint, QuizQuestion, QuizResult } from '../types';

interface ResultSummaryProps {
  result: QuizResult;
  questions: QuizQuestion[];
  knowledgePoints: KnowledgePoint[];
  onDiagnosis: () => void;
}

export default function ResultSummary({ result, questions, onDiagnosis }: ResultSummaryProps) {
  const getQuestion = (id: string) => questions.find((item) => item.id === id);
  const recommendedPatterns = [...new Set(
    result.wrongQuestions
      .map((wrong) => getQuestion(wrong.questionId)?.examPattern)
      .filter(Boolean)
  )].slice(0, 3);

  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-blue-700">学习分析</p>
          <h2 className="mt-2 text-3xl font-semibold text-gray-900">测评结果</h2>
        </div>
        <button onClick={onDiagnosis} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
          查看错因诊断 <ArrowRight className="inline h-4 w-4" />
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">总览</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><p className="text-3xl font-bold text-blue-700">{result.score}</p><p className="mt-1 text-sm text-gray-500">总分</p></div>
          <div><p className="text-3xl font-bold text-gray-900">{result.masteryRate}%</p><p className="mt-1 text-sm text-gray-500">正确率</p></div>
          <div><p className="text-3xl font-bold text-green-700">{result.correctCount}</p><p className="mt-1 text-sm text-gray-500">正确题数</p></div>
          <div><p className="text-3xl font-bold text-red-600">{result.wrongCount}</p><p className="mt-1 text-sm text-gray-500">错题数</p></div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">薄弱知识点</p>
        <div className="mt-3 space-y-2 text-sm text-gray-700">
          {result.weakKnowledgePoints.length > 0
            ? result.weakKnowledgePoints.slice(0, 3).map((point) => <p key={point.id}>- {point.title}</p>)
            : <p className="text-green-700">本次没有明显薄弱知识点。</p>}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">错题回顾</p>
        {result.wrongQuestions.length === 0 ? (
          <p className="mt-3 text-sm text-green-700">本次没有错题，可以继续做迁移训练。</p>
        ) : (
          <div className="mt-3 divide-y divide-gray-100">
            {result.wrongQuestions.map((wrong) => {
              const question = getQuestion(wrong.questionId);
              if (!question) return null;
              return (
                <div key={wrong.questionId} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-medium leading-6 text-gray-900">{question.question}</p>
                  <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    <p className="text-red-600">我的答案：{wrong.userAnswer || '未作答'}</p>
                    <p className="text-green-700">正确答案：{question.answer}</p>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">错因：{wrong.feedback || question.commonMistake || '需要重新核对条件和解题步骤。'}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <p className="text-sm font-semibold text-blue-800">下一步建议</p>
        <p className="mt-2 text-sm leading-6 text-gray-700">
          推荐复习：{result.weakKnowledgePoints.slice(0, 3).map((point) => point.title).join('、') || '继续巩固当前知识点'}
        </p>
        <p className="text-sm leading-6 text-gray-700">
          推荐训练：{recommendedPatterns.join('、') || '同类变式题'}
        </p>
        <button onClick={onDiagnosis} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          进入诊断并生成强化练习 <ArrowRight className="inline h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
