import { CalendarDays, Dumbbell } from 'lucide-react';
import type { ReviewPlanDay } from '../types';

interface ReviewPlanProps {
  reviewPlan: ReviewPlanDay[];
  onGenerateReinforcement: () => void;
}

export default function ReviewPlan({ reviewPlan, onGenerateReinforcement }: ReviewPlanProps) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-semibold text-white">3 天个性化复习计划</h2>
          <p className="mt-2 text-slate-400">结合错因和薄弱知识点，生成可执行的短周期复习安排。</p>
        </div>
        <button onClick={onGenerateReinforcement} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">
          <Dumbbell className="h-5 w-5" />
          生成强化练习
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {reviewPlan.map((day) => (
          <article key={day.day} className="glass-panel rounded-lg p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-100">
                <CalendarDays className="h-5 w-5" />
              </span>
              <h3 className="text-xl font-semibold text-white">第 {day.day} 天</h3>
            </div>
            <p className="mt-5 leading-7 text-slate-300">{day.goal}</p>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p className="rounded-lg bg-white/6 p-3">重点：{day.focusKnowledgePoints.join('、')}</p>
              <p className="rounded-lg bg-white/6 p-3">建议时长：{day.duration}</p>
              <p className="rounded-lg bg-white/6 p-3">推荐练习：{day.practiceCount} 道</p>
              <p className="rounded-lg bg-white/6 p-3 leading-6">方法：{day.method}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
