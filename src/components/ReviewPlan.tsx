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
          <p className="text-sm font-semibold text-sky-700">复习路径</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">3 天个性化复习计划</h2>
          <p className="mt-2 text-slate-600">结合错因和薄弱知识点，生成可执行的短周期复习安排。</p>
        </div>
        <button onClick={onGenerateReinforcement} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-sky-700">
          <Dumbbell className="h-5 w-5" />
          生成强化练习
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {reviewPlan.map((day) => (
          <article key={day.day} className="glass-panel rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-500">Day {day.day}</p>
                <h3 className="text-xl font-semibold text-slate-950">第 {day.day} 天</h3>
              </div>
            </div>
            <p className="mt-5 rounded-xl bg-slate-50 p-4 leading-7 text-slate-700">{day.goal}</p>
            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <p className="rounded-xl bg-white p-3 shadow-sm"><span className="font-semibold text-slate-950">重点知识点：</span>{day.focusKnowledgePoints.join('、')}</p>
              <p className="rounded-xl bg-white p-3 shadow-sm"><span className="font-semibold text-slate-950">建议时长：</span>{day.duration}</p>
              <p className="rounded-xl bg-white p-3 shadow-sm"><span className="font-semibold text-slate-950">推荐练习：</span>{day.practiceCount} 道</p>
              <p className="rounded-xl bg-white p-3 leading-6 shadow-sm"><span className="font-semibold text-slate-950">复习方法：</span>{day.method}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
