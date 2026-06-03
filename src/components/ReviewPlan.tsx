import { BookOpenCheck, CalendarDays, Dumbbell, Timer } from 'lucide-react';
import type { KnowledgePoint, QuestionResult, ReviewPlanDay } from '../types';
import type { MaterialProfile } from '../services/materialTopicService';

interface ReviewPlanProps {
  reviewPlan: ReviewPlanDay[];
  onGenerateReinforcement: () => void;
  materialProfile?: MaterialProfile | null;
  wrongQuestions?: QuestionResult[];
  weakKnowledgePoints?: KnowledgePoint[];
}

const ListBlock = ({ title, items, tone = 'slate' }: { title: string; items?: string[]; tone?: 'slate' | 'sky' | 'amber' | 'rose' | 'emerald' }) => {
  if (!items?.length) return null;
  const toneClass = {
    slate: 'bg-white text-slate-700 ring-slate-200',
    sky: 'bg-sky-50 text-slate-700 ring-sky-100',
    amber: 'bg-amber-50 text-slate-700 ring-amber-100',
    rose: 'bg-rose-50 text-slate-700 ring-rose-100',
    emerald: 'bg-emerald-50 text-slate-700 ring-emerald-100',
  }[tone];
  return (
    <div className={`rounded-2xl p-4 text-sm leading-6 ring-1 ${toneClass}`}>
      <p className="mb-2 font-semibold text-slate-950">{title}</p>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
};

const compactList = (items: string[], fallback: string): string =>
  items.filter(Boolean).slice(0, 4).join('、') || fallback;

const buildFallbackPlan = (
  materialProfile?: MaterialProfile | null,
  wrongQuestions: QuestionResult[] = [],
  weakKnowledgePoints: KnowledgePoint[] = []
): ReviewPlanDay[] => {
  const focus = weakKnowledgePoints.map((item) => item.title).filter(Boolean);
  const concepts = materialProfile?.coreConcepts || [];
  const topic = materialProfile?.topic || focus[0] || concepts[0] || '本次资料核心知识点';
  const focusPoints = [...new Set([...focus, ...concepts])].slice(0, 4);
  const safeFocus = focusPoints.length > 0 ? focusPoints : [topic];
  const wrongCount = wrongQuestions.length;

  return [
    {
      day: 1,
      goal: '错题重做',
      focusKnowledgePoints: safeFocus,
      duration: '30 分钟',
      practiceCount: 3,
      method: `重做本次${wrongCount ? ` ${wrongCount} 道` : ''}错题，重点回看 ${compactList(safeFocus, topic)}。`,
      mustRemember: safeFocus.map((item) => `${item} 的定义、适用条件和资料依据`),
      exampleTasks: ['重做本次错题', `重点复习薄弱知识点：${compactList(safeFocus, topic)}`, '完成 3 道同知识点基础题'],
      reinforcementTasks: ['错题遮住答案重写一遍', '对照标准答案补齐得分点', '记录仍然不会的步骤'],
      commonMistakes: ['只看答案结论，没有写出题干条件和资料依据'],
      selfCheckCriteria: ['能独立重做错题', `能说清 ${safeFocus[0]} 的判断依据`],
    },
    {
      day: 3,
      goal: '变式练习',
      focusKnowledgePoints: safeFocus,
      duration: '35 分钟',
      practiceCount: 5,
      method: `围绕 ${compactList(safeFocus, topic)} 做 3-5 道变式题，检查同类错误是否复现。`,
      mustRemember: [`${safeFocus[0]} 与 ${safeFocus[1] || materialProfile?.chapter || '易混条件'} 的区别`],
      exampleTasks: ['针对薄弱知识点生成 3-5 道变式题', `重点区分易混概念：${safeFocus[0]} 与 ${safeFocus[1] || materialProfile?.chapter || '易混条件'}`, '检查是否还会犯同类错误'],
      reinforcementTasks: ['每题标出条件变化', '写出错误选项错在哪里', '把新错题加入错题本'],
      commonMistakes: ['母题条件变化后仍套用原答案'],
      selfCheckCriteria: ['能识别条件变化', '同类变式正确率达到 80%'],
    },
    {
      day: 7,
      goal: '知识点回顾',
      focusKnowledgePoints: safeFocus,
      duration: '30 分钟',
      practiceCount: 5,
      method: `回顾资料主题「${topic}」，完成 5 题小测并标记未掌握点。`,
      mustRemember: safeFocus,
      exampleTasks: ['回顾本次资料中的核心知识点', '完成一次 5 题小测', '标记仍未掌握的知识点'],
      reinforcementTasks: ['按知识点逐项复述', '重新做一组基础+中等题', '把不会的题标为下轮重点'],
      commonMistakes: ['只复习错题，不回到资料核心知识点'],
      selfCheckCriteria: [`能完整说出 ${compactList(safeFocus, topic)} 的核心内容`, '5 题小测至少做对 4 题'],
    },
    {
      day: 15,
      goal: '综合复测',
      focusKnowledgePoints: safeFocus,
      duration: '45 分钟',
      practiceCount: 10,
      method: `生成 10 道综合复测题，检查 ${compactList(safeFocus, topic)} 的掌握率是否提升。`,
      mustRemember: [`${materialProfile?.subject || '当前学科'}「${topic}」的核心知识点和错因`],
      exampleTasks: ['生成 10 道综合复测题', '检查掌握率是否提升', '生成家长反馈或教师复盘建议'],
      reinforcementTasks: ['完成 10 题复测', '统计正确率和错因类型', '形成家长反馈或教师复盘建议'],
      commonMistakes: ['复测后只看分数，没有分析薄弱知识点是否改善'],
      selfCheckCriteria: ['综合复测掌握率提升', '能说清仍需复习的知识点'],
    },
  ];
};

const buildNodeTasks = (
  day: ReviewPlanDay,
  materialProfile?: MaterialProfile | null,
  wrongQuestions: QuestionResult[] = [],
  weakKnowledgePoints: KnowledgePoint[] = []
): { title: string; tasks: string[] } => {
  const weakNames = weakKnowledgePoints.map((item) => item.title);
  const planNames = day.focusKnowledgePoints || [];
  const concepts = materialProfile?.coreConcepts || [];
  const topic = materialProfile?.topic || planNames[0] || weakNames[0] || '本次资料核心知识点';
  const focusText = compactList([...weakNames, ...planNames, ...concepts], topic);
  const mixLeft = weakNames[0] || concepts[0] || topic;
  const mixRight = weakNames[1] || concepts[1] || materialProfile?.chapter || '易混条件';
  const wrongCount = wrongQuestions.length;

  if (day.day === 1) {
    return {
      title: '1天后：错题重做',
      tasks: [
        wrongCount > 0 ? `重做本次 ${wrongCount} 道错题` : '重做本次错题，遮住答案独立写步骤',
        `重点复习薄弱知识点：${focusText}`,
        `完成 3 道同知识点基础题：${compactList([mixLeft, mixRight], topic)}`,
      ],
    };
  }
  if (day.day === 3) {
    return {
      title: '3天后：变式练习',
      tasks: [
        `针对薄弱知识点生成 3-5 道变式题：${focusText}`,
        `重点区分易混概念：${mixLeft} 与 ${mixRight}`,
        wrongCount > 0 ? `检查是否还会犯同类错误：对照 ${wrongCount} 道错题的错因` : '检查是否还会犯同类错误',
      ],
    };
  }
  if (day.day === 7) {
    return {
      title: '7天后：知识点回顾',
      tasks: [
        `回顾本次资料中的核心知识点：${compactList(concepts, topic)}`,
        `完成一次 5 题小测，覆盖：${focusText}`,
        `标记仍未掌握的知识点：${compactList(weakNames, topic)}`,
      ],
    };
  }
  return {
    title: '15天后：综合复测',
    tasks: [
      `生成 10 道综合复测题，覆盖：${focusText}`,
      `检查掌握率是否提升，重点看 ${compactList(weakNames, topic)} 的正确率`,
      `生成家长反馈或教师复盘建议：围绕 ${materialProfile?.subject || '当前学科'}「${topic}」`,
    ],
  };
};

export default function ReviewPlan({ reviewPlan, onGenerateReinforcement, materialProfile, wrongQuestions = [], weakKnowledgePoints = [] }: ReviewPlanProps) {
  const displayPlan = reviewPlan.length > 0
    ? reviewPlan
    : buildFallbackPlan(materialProfile, wrongQuestions, weakKnowledgePoints);

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-sky-700">复习路径</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">艾宾浩斯智能复习计划</h2>
          <p className="mt-2 text-slate-600">基于遗忘曲线自动安排复习节点：1天后错题重做 → 3天后变式练习 → 7天后知识点回顾 → 15天后综合测试。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={onGenerateReinforcement} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-sky-700">
            <Dumbbell className="h-5 w-5" />
            生成强化练习
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {displayPlan.map((day) => {
          const node = buildNodeTasks(day, materialProfile, wrongQuestions, weakKnowledgePoints);
          return (
          <article key={day.day} className="glass-panel rounded-[2rem] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-500">Day {day.day}</p>
                  <h3 className="text-2xl font-semibold text-slate-950">第 {day.day} 天：{day.goal}</h3>
                  {/* 艾宾浩斯复习节点 */}
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      day.day === 1 ? 'bg-red-100 text-red-700' :
                      day.day === 3 ? 'bg-orange-100 text-orange-700' :
                      day.day === 7 ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {day.day === 1 ? '1天后 · 错题重做' :
                       day.day === 3 ? '3天后 · 变式练习' :
                       day.day === 7 ? '7天后 · 知识点回顾' :
                       '15天后 · 综合测试'}
                    </span>
                    <span className="text-xs text-slate-400">
                      距复习还有 {day.day} 天
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
                  <Timer className="h-4 w-4" />
                  {day.duration} · {day.practiceCount} 道练习
                </span>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <span className="font-semibold text-slate-950">重点抓手：</span>{day.focusKnowledgePoints.join('、')}。
              <span className="ml-2 font-semibold text-slate-950">方法：</span>{day.method}
            </div>
            <div className="mt-5 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700 ring-1 ring-slate-200">
              <p className="mb-2 font-semibold text-slate-950">{node.title}</p>
              <ul className="list-disc space-y-1 pl-5">
                {node.tasks.map((task) => <li key={task}>{task}</li>)}
              </ul>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {/* 今日目标 */}
              <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 ring-1 ring-blue-100">
                <p className="mb-2 font-semibold text-blue-800">今日目标</p>
                <p className="text-slate-700">{day.goal}</p>
                <p className="mt-1 text-slate-500 text-xs">方法：{day.method}</p>
              </div>

              {/* 必背内容 */}
              <div className="rounded-2xl bg-purple-50 p-4 text-sm leading-6 ring-1 ring-purple-100">
                <p className="mb-2 font-semibold text-purple-800">必背内容</p>
                {day.mustRemember && day.mustRemember.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-slate-700">
                    {day.mustRemember.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="text-slate-500">暂无必背内容</p>
                )}
              </div>

              {/* 推荐练习 */}
              <div className="rounded-2xl bg-green-50 p-4 text-sm leading-6 ring-1 ring-green-100">
                <p className="mb-2 font-semibold text-green-800">推荐练习</p>
                {day.exampleTasks && day.exampleTasks.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-slate-700">
                    {day.exampleTasks.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="text-slate-500">暂无推荐练习</p>
                )}
                {day.reinforcementTasks && day.reinforcementTasks.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-green-700 mb-1">强化训练：</p>
                    <ul className="list-disc space-y-1 pl-5 text-slate-700">
                      {day.reinforcementTasks.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* 自测标准 */}
              <div className="rounded-2xl bg-orange-50 p-4 text-sm leading-6 ring-1 ring-orange-100">
                <p className="mb-2 font-semibold text-orange-800">自测标准</p>
                {day.selfCheckCriteria && day.selfCheckCriteria.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-slate-700">
                    {day.selfCheckCriteria.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="text-slate-500">暂无自测标准</p>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
              <p className="mb-2 inline-flex items-center gap-2 font-semibold text-slate-950">
                <BookOpenCheck className="h-4 w-4" />
                今天最容易丢分的地方
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {(day.commonMistakes?.length ? day.commonMistakes : ['只写结论，缺少材料依据和得分步骤。']).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
