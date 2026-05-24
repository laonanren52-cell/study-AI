import { ArrowRight, BookOpenCheck, ClipboardCheck, FileText, LineChart, MapPinned, Target, TriangleAlert } from 'lucide-react';
import TeacherDashboardPreview from './TeacherDashboardPreview';

interface HeroSectionProps {
  onStart: () => void;
}

const features = [
  {
    icon: FileText,
    title: '资料驱动',
    description: '上传自己的笔记、课件或复习资料，生成更贴近真实学习内容的专属题库。',
  },
  {
    icon: ClipboardCheck,
    title: '智能测评',
    description: '从知识点提取到单选、判断、简答题生成，形成可直接答题的测评任务。',
  },
  {
    icon: Target,
    title: '个性复习',
    description: '根据错题证据定位薄弱点，自动生成 3 天复习计划和二次强化练习。',
  },
];

const painPoints = ['资料难整理', '重点难提取', '掌握难评估', '错因难定位', '复习难规划'];
const solutions = [
  { icon: FileText, title: '资料驱动', text: '围绕课件、笔记、讲义和复习资料生成专属知识点。' },
  { icon: LineChart, title: '测评闭环', text: '把知识提取、在线答题、评分反馈连接成完整学习流程。' },
  { icon: TriangleAlert, title: '错因诊断', text: '将错题归因到概念混淆、关键词遗漏、场景判断等可行动原因。' },
  { icon: Target, title: '个性复习', text: '根据薄弱点生成短周期计划和聚焦型强化练习。' },
];
const scenarios = ['学生期末复习', '教师随堂测', '考证备考', '培训机构题库生成'];
const flow = ['资料上传', '智能测评', '错因诊断', '个性复习'];

export default function HeroSection({ onStart }: HeroSectionProps) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 lg:py-14">
      <div className="grid min-h-[calc(100vh-92px)] items-center gap-10 lg:grid-cols-[1.04fr_0.96fr]">
        <div>
          <div className="mb-5 inline-flex rounded-full border border-sky-100 bg-white px-4 py-2 text-sm font-medium text-sky-700 shadow-sm">
            资料上传 → 智能测评 → 错因诊断 → 个性复习
          </div>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight text-slate-950 md:text-7xl">智学闭环</h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-700">基于 AI 的学习资料智能测评与个性化复习工具</p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600">
            面向黑客松路演的完整学习闭环 Demo：支持多格式资料输入，自动提取知识点，生成高质量测评题，并把结果沉淀为错因诊断、复习计划和学习报告。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={onStart}
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              开始体验
              <ArrowRight className="h-5 w-5" />
            </button>
            <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">
              支持 TXT / PDF / DOCX / PPTX
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">学习闭环工作台</p>
            <div className="mt-4 grid gap-3">
              {flow.map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-semibold text-sky-700">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{item}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${48 + index * 14}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">{feature.title}</h2>
                    <p className="mt-2 leading-6 text-slate-600">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-3 text-slate-950">
            <TriangleAlert className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold">学习痛点</h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {painPoints.map((item) => <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">{item}</span>)}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-3 text-slate-950">
            <BookOpenCheck className="h-5 w-5 text-sky-700" />
            <h2 className="text-lg font-semibold">解决方案</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {solutions.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                <p className="text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-900">{item.title}：</span>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center gap-3 text-slate-950">
            <MapPinned className="h-5 w-5 text-emerald-700" />
            <h2 className="text-lg font-semibold">应用场景</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {scenarios.map((item) => <div key={item} className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{item}</div>)}
          </div>
        </div>
      </div>
      <TeacherDashboardPreview />
    </section>
  );
}
