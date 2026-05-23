import { FileCheck2, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import type { ReinforcementQuestion } from '../types';

interface ReinforcementQuizProps {
  reinforcementQuiz: ReinforcementQuestion[];
  onReport: () => void;
}

export default function ReinforcementQuiz({ reinforcementQuiz, onReport }: ReinforcementQuizProps) {
  const [visibleAnswers, setVisibleAnswers] = useState<string[]>([]);
  const toggleAnswer = (id: string) => {
    setVisibleAnswers((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-semibold text-white">二次强化练习</h2>
          <p className="mt-2 text-slate-400">题目聚焦薄弱知识点，用于复盘后进行二次检测。</p>
        </div>
        <button onClick={onReport} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">
          <FileCheck2 className="h-5 w-5" />
          生成学习报告
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reinforcementQuiz.map((item, index) => (
          <article key={item.id} className="glass-panel rounded-lg p-5">
            <span className="rounded bg-amber-400/15 px-3 py-1 text-sm text-amber-100">{item.knowledgePointTitle}</span>
            <h3 className="mt-4 font-semibold leading-7 text-white">{index + 1}. {item.question}</h3>
            <p className="mt-4 flex gap-2 rounded-lg bg-white/6 p-3 text-sm text-slate-300">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
              {item.hint}
            </p>
            <button onClick={() => toggleAnswer(item.id)} className="focus-ring mt-4 rounded-lg border border-white/12 px-4 py-2 text-sm text-slate-200 hover:border-cyan-300/50">
              {visibleAnswers.includes(item.id) ? '收起答案' : '查看答案'}
            </button>
            {visibleAnswers.includes(item.id) ? <p className="mt-3 rounded-lg bg-emerald-400/12 p-3 text-sm leading-6 text-emerald-100">{item.answer}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
