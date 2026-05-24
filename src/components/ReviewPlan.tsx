import { CalendarDays, CheckSquare, Dumbbell } from 'lucide-react';
import { useState } from 'react';
import type { ReviewPlanDay } from '../types';

interface ReviewPlanProps {
  reviewPlan: ReviewPlanDay[];
  onGenerateReinforcement: () => void;
}

const ListBlock = ({ title, items, tone = 'slate' }: { title: string; items?: string[]; tone?: 'slate' | 'sky' | 'amber' | 'rose' | 'emerald' }) => {
  if (!items?.length) return null;
  const toneClass = {
    slate: 'bg-slate-50 text-slate-700',
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[tone];
  return (
    <div className={`rounded-xl p-3 text-sm leading-6 ${toneClass}`}>
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
};

export default function ReviewPlan({ reviewPlan, onGenerateReinforcement }: ReviewPlanProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const toggleItem = (id: string) => setCheckedItems((current) => ({ ...current, [id]: !current[id] }));

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-sky-700">复习路径</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">3 天个性化复习计划</h2>
          <p className="mt-2 text-slate-600">每天细化到公式/定义、例题、强化练习、易错点、自测标准和任务清单。</p>
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
            <p className="mt-5 rounded-xl bg-slate-50 p-4 leading-7 text-slate-700"><span className="font-semibold text-slate-950">今日目标：</span>{day.goal}</p>
            <div className="mt-5 space-y-3">
              <p className="rounded-xl bg-white p-3 text-sm text-slate-700 shadow-sm"><span className="font-semibold text-slate-950">重点知识点：</span>{day.focusKnowledgePoints.join('、')}</p>
              <p className="rounded-xl bg-white p-3 text-sm text-slate-700 shadow-sm"><span className="font-semibold text-slate-950">建议时长：</span>{day.duration}；推荐练习：{day.practiceCount} 道</p>
              <ListBlock title="必背公式/定义" items={day.mustRemember} tone="sky" />
              <ListBlock title="例题任务" items={day.exampleTasks} />
              <ListBlock title="强化练习" items={day.reinforcementTasks} tone="emerald" />
              <ListBlock title="常见误区" items={day.commonMistakes} tone="rose" />
              <ListBlock title="自测标准" items={day.selfCheckCriteria} tone="amber" />
              {day.checklist?.length ? (
                <div className="rounded-xl bg-white p-3 text-sm leading-6 text-slate-700 shadow-sm">
                  <p className="mb-2 font-semibold text-slate-950">勾选清单</p>
                  <div className="space-y-2">
                    {day.checklist.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={checkedItems[item.id] ?? item.done}
                          onChange={() => toggleItem(item.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                        <span className={checkedItems[item.id] ? 'text-slate-400 line-through' : ''}>{item.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
