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
          <p className="text-sm font-semibold text-sky-700">二次训练</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">二次强化练习</h2>
          <p className="mt-2 text-slate-600">题目聚焦薄弱知识点，用于复盘后进行二次检测。</p>
        </div>
        <button onClick={onReport} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-sky-700">
          <FileCheck2 className="h-5 w-5" />
          生成学习报告
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reinforcementQuiz.map((item, index) => (
          <article key={item.id} className="glass-panel rounded-2xl p-5">
            <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">{item.knowledgePointTitle}</span>
            <h3 className="mt-4 font-semibold leading-7 text-slate-950">{index + 1}. {item.question}</h3>
            <p className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              {item.hint}
            </p>
            <button onClick={() => toggleAnswer(item.id)} className="focus-ring mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50">
              {visibleAnswers.includes(item.id) ? '收起答案' : '查看答案'}
            </button>
            {visibleAnswers.includes(item.id) ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">{item.answer}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
