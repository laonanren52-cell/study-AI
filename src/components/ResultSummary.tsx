import { AlertTriangle, CheckCircle2, Gauge, Trophy } from 'lucide-react';
import type { KnowledgePoint, QuizQuestion, QuizResult } from '../types';
import StatCard from './StatCard';

interface ResultSummaryProps {
  result: QuizResult;
  questions: QuizQuestion[];
  knowledgePoints: KnowledgePoint[];
  onDiagnosis: () => void;
}

export default function ResultSummary({ result, questions, knowledgePoints, onDiagnosis }: ResultSummaryProps) {
  const getQuestion = (id: string) => questions.find((item) => item.id === id);
  const getKnowledgeTitle = (id: string) => knowledgePoints.find((item) => item.id === id)?.title ?? '知识点';

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-semibold text-white">测评结果</h2>
          <p className="mt-2 text-slate-400">系统已完成自动评分，并按知识点计算掌握情况。</p>
        </div>
        <button onClick={onDiagnosis} className="focus-ring rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">生成错因诊断</button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={Trophy} label="总分" value={`${result.score} 分`} tone="cyan" />
        <StatCard icon={Gauge} label="掌握率" value={`${result.masteryRate}%`} tone="green" />
        <StatCard icon={CheckCircle2} label="正确题数" value={`${result.correctCount}`} tone="violet" />
        <StatCard icon={AlertTriangle} label="错误题数" value={`${result.wrongCount}`} tone="red" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div className="glass-panel rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white">各知识点掌握情况</h3>
          <div className="mt-5 space-y-4">
            {result.byKnowledgePoint.map((item) => (
              <div key={item.knowledgePoint.id}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-200">{item.knowledgePoint.title}</span>
                  <span className="text-slate-400">{item.masteryRate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${item.masteryRate >= 75 ? 'bg-emerald-400' : item.masteryRate >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${item.masteryRate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white">错题列表</h3>
          <div className="mt-5 space-y-3">
            {result.wrongQuestions.length === 0 ? (
              <p className="rounded-lg bg-emerald-400/12 p-4 text-emerald-100">本次没有错题，可以进入复习计划做迁移训练。</p>
            ) : (
              result.wrongQuestions.map((wrong) => {
                const question = getQuestion(wrong.questionId);
                return (
                  <div key={wrong.questionId} className="rounded-lg bg-white/6 p-4">
                    <p className="font-medium leading-6 text-white">{question?.question}</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300">
                      <p>用户答案：<span className="text-rose-100">{wrong.userAnswer || '未作答'}</span></p>
                      <p>正确答案：<span className="text-emerald-100">{question?.answer}</span></p>
                      <p>答案解析：<span className="text-slate-200">{question?.explanation}</span></p>
                      {question?.sourceEvidence ? <p>来源依据：<span className="text-cyan-100">{question.sourceEvidence}</span></p> : null}
                      <p>对应知识点：<span className="text-cyan-100">{question ? getKnowledgeTitle(question.knowledgePointId) : '未知'}</span></p>
                      <p>得分情况：<span className="text-amber-100">{wrong.score}/{wrong.maxScore}</span></p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
