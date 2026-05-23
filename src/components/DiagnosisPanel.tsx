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
          <h2 className="text-3xl font-semibold text-white">AI 错因诊断</h2>
          <p className="mt-2 text-slate-400">从错误题目、知识点和作答表现中识别主要错因。</p>
        </div>
        <button onClick={onGeneratePlan} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">
          生成个性化复习计划
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        {diagnosis.length === 0 ? (
          <div className="glass-panel rounded-lg p-6">
            <h3 className="text-xl font-semibold text-white">暂无明显错因</h3>
            <p className="mt-3 text-slate-400">本次测评表现稳定，建议进入复习计划继续做迁移应用和综合表达训练。</p>
          </div>
        ) : (
          diagnosis.map((item) => (
            <article key={item.id} className="glass-panel rounded-lg p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-400/12 text-rose-100">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <span className="rounded bg-rose-400/15 px-3 py-1 text-sm text-rose-100">{item.reasonType}</span>
                <span className="rounded bg-cyan-300/12 px-3 py-1 text-sm text-cyan-100">{item.knowledgePointTitle}</span>
              </div>
              <h3 className="mt-4 font-semibold leading-7 text-white">{item.question}</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <p className="rounded-lg bg-white/6 p-4 text-sm leading-6 text-slate-300">诊断：{item.diagnosis}</p>
                <p className="rounded-lg bg-white/6 p-4 text-sm leading-6 text-slate-300">正确理解：{item.correctUnderstanding}</p>
                <p className="rounded-lg bg-white/6 p-4 text-sm leading-6 text-slate-300">建议：{item.suggestion}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
