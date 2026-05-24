import { ArrowRight, Stethoscope } from 'lucide-react';
import type { DiagnosisItem } from '../types';

interface DiagnosisPanelProps {
  diagnosis: DiagnosisItem[];
  onGeneratePlan: () => void;
}

export default function DiagnosisPanel({ diagnosis, onGeneratePlan }: DiagnosisPanelProps) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-sky-700">错题复盘</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">AI 错因诊断</h2>
          <p className="mt-2 text-slate-600">从错误题目、用户答案和知识点掌握情况中识别主要错因。</p>
        </div>
        <button onClick={onGeneratePlan} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-sky-700">
          生成个性化复习计划
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        {diagnosis.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-xl font-semibold text-slate-950">暂无明显错因</h3>
            <p className="mt-3 text-slate-600">本次测评表现稳定，建议进入复习计划继续做迁移应用和综合表达训练。</p>
          </div>
        ) : (
          diagnosis.map((item) => (
            <article key={item.id} className="glass-panel rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">{item.reasonType}</span>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">{item.knowledgePointTitle}</span>
              </div>
              <h3 className="mt-4 font-semibold leading-7 text-slate-950">{item.question}</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-slate-700">
                  <p className="mb-1 font-semibold text-rose-700">用户答案</p>
                  {item.userAnswer || '见测评结果'}
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  <p className="mb-1 font-semibold text-slate-900">诊断说明</p>
                  {item.diagnosis}
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-slate-700">
                  <p className="mb-1 font-semibold text-emerald-700">正确理解</p>
                  {item.correctUnderstanding}
                </div>
                <div className="rounded-xl bg-sky-50 p-4 text-sm leading-6 text-slate-700">
                  <p className="mb-1 font-semibold text-sky-700">复习建议</p>
                  {item.suggestion}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
