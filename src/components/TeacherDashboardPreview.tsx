import { BarChart3, FileUp, Layers3, ListChecks, TrendingDown } from 'lucide-react';

const masteryData = [
  { name: '核心概念', rate: 86 },
  { name: '流程理解', rate: 74 },
  { name: '场景应用', rate: 62 },
  { name: '综合表达', rate: 55 },
];

const weakRank = ['概念层级混淆', '应用场景判断', '关键词遗漏', '简答表达不完整'];

export default function TeacherDashboardPreview() {
  return (
    <section className="mt-10 rounded-lg border border-white/10 bg-slate-950/45 p-5">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-cyan-100">教师端扩展预览</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">从个人复习工具扩展到班级学情平台</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            教师上传课件后可生成随堂测，系统汇总班级知识点掌握率、薄弱知识点排行，并自动分发分层复习任务。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full bg-cyan-300/12 px-3 py-1">班级测评</span>
          <span className="rounded-full bg-violet-300/12 px-3 py-1">学情分析</span>
          <span className="rounded-full bg-emerald-300/12 px-3 py-1">分层任务</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr_0.8fr]">
        <div className="rounded-lg border border-white/10 bg-white/6 p-4">
          <div className="flex items-center gap-3 text-white">
            <FileUp className="h-5 w-5 text-cyan-200" />
            上传课件
          </div>
          <div className="mt-4 rounded-lg border border-dashed border-cyan-300/25 bg-cyan-300/8 p-4 text-sm leading-6 text-slate-300">
            高一物理-牛顿运动定律.pptx
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-4/5 rounded-full bg-cyan-300" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-white/6 p-3 text-sm text-slate-300">
            <ListChecks className="h-4 w-4 text-emerald-200" />
            已生成 12 道随堂测题
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/6 p-4">
          <div className="flex items-center gap-3 text-white">
            <BarChart3 className="h-5 w-5 text-cyan-200" />
            班级知识点掌握率
          </div>
          <div className="mt-4 space-y-4">
            {masteryData.map((item) => (
              <div key={item.name}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-300">{item.name}</span>
                  <span className={item.rate >= 75 ? 'text-emerald-200' : item.rate >= 60 ? 'text-amber-200' : 'text-rose-200'}>{item.rate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${item.rate >= 75 ? 'bg-emerald-400' : item.rate >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${item.rate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/6 p-4">
          <div className="flex items-center gap-3 text-white">
            <TrendingDown className="h-5 w-5 text-rose-200" />
            薄弱知识点排行
          </div>
          <div className="mt-4 space-y-2">
            {weakRank.map((item, index) => (
              <div key={item} className="flex items-center justify-between rounded-lg bg-white/6 px-3 py-2 text-sm">
                <span className="text-slate-300">{index + 1}. {item}</span>
                <span className="text-amber-200">{68 - index * 7}%</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-violet-300/10 p-3 text-sm text-violet-100">
            <Layers3 className="h-4 w-4" />
            自动生成 A/B/C 三层复习任务
          </div>
        </div>
      </div>
    </section>
  );
}
