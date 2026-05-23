import { ArrowRight, BadgeCheck } from 'lucide-react';
import type { KnowledgePoint } from '../types';

interface KnowledgePointListProps {
  knowledgePoints: KnowledgePoint[];
  onGenerateQuiz: () => void;
}

const importanceClass = {
  高: 'bg-rose-400/15 text-rose-100 border-rose-300/25',
  中: 'bg-amber-400/15 text-amber-100 border-amber-300/25',
  低: 'bg-emerald-400/15 text-emerald-100 border-emerald-300/25',
};

export default function KnowledgePointList({ knowledgePoints, onGenerateQuiz }: KnowledgePointListProps) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-semibold text-white">AI 知识点提取结果</h2>
          <p className="mt-2 text-slate-400">已从资料中抽取核心概念、掌握目标与可能考查方式。</p>
        </div>
        <button onClick={onGenerateQuiz} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">
          生成测评题目
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {knowledgePoints.map((item) => (
          <article key={item.id} className="glass-panel rounded-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-200">
                  <BadgeCheck className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs ${importanceClass[item.importance]}`}>{item.importance}</span>
            </div>
            <p className="mt-4 min-h-[72px] leading-6 text-slate-400">{item.description}</p>
            <div className="mt-5 space-y-3 text-sm">
              <p className="rounded-lg bg-white/6 p-3 text-slate-300">建议掌握：{item.masteryTarget}</p>
              <p className="rounded-lg bg-white/6 p-3 text-slate-300">考查方式：{item.examType}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
