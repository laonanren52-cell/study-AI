import { ArrowRight, BookOpenCheck, ClipboardCheck, FileText, LineChart, MapPinned, Target, TriangleAlert } from 'lucide-react';
import TeacherDashboardPreview from './TeacherDashboardPreview';

interface HeroSectionProps {
  onStart: () => void;
}

const flow = ['资料上传', '智能测评', '错因诊断', '个性复习'];

const features = [
  {
    icon: FileText,
    title: '资料驱动',
    description: '上传自己的笔记、课件或复习资料，生成更贴近真实学习内容的专属题库。',
  },
  {
    icon: ClipboardCheck,
    title: '测评闭环',
    description: '从知识点提取、在线答题到评分反馈，形成可复盘、可追踪的完整训练链路。',
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

export default function HeroSection({ onStart }: HeroSectionProps) {
  return (
    <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="pointer-events-none absolute inset-x-8 top-10 -z-10 h-72 rounded-full bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.20),_rgba(16,185,129,0.10)_42%,_transparent_70%)]" />

      <div className="mx-auto max-w-4xl text-center">
        <div className="inline-flex rounded-full border border-sky-100 bg-white/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 shadow-[0_18px_60px_rgba(14,116,144,0.10)]">
          资料上传 → 智能测评 → 错因诊断 → 个性复习
        </div>
        <h1 className="mt-8 text-5xl font-semibold leading-[0.95] tracking-tight text-slate-950 sm:text-6xl md:text-7xl">
          智学闭环
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-xl leading-9 text-slate-700">
          基于 AI 的学习资料智能测评与个性化复习工具
        </p>
        <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-slate-600">
          面向中国考试训练场景，把多格式资料输入、知识点提取、高质量测评、错因诊断、复习计划和学习报告串成一个稳定可演示的学习闭环。
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={onStart}
            className="group focus-ring inline-flex items-center gap-4 rounded-full bg-slate-950 px-6 py-3 text-base font-semibold text-white shadow-[0_18px_50px_rgba(15,23,42,0.20)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 active:scale-[0.98]"
          >
            开始体验
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:bg-white/18">
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-[0_16px_48px_rgba(15,23,42,0.07)]">
            支持 TXT / PDF / DOCX / PPTX
          </span>
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-6xl rounded-[2.2rem] border border-white bg-slate-900/5 p-2 shadow-[0_32px_90px_rgba(15,23,42,0.11)]">
        <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-7">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Learning Loop Console</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">学习闭环工作台</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              从导入资料到生成复习任务，核心流程集中呈现，路演时评委可以一眼看懂产品闭环。
            </p>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-4">
            {flow.map((item, index) => (
              <div
                key={item}
                className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4 text-center shadow-[0_16px_44px_rgba(15,23,42,0.06)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:bg-white"
              >
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">{index + 1}</span>
                <p className="mt-3 font-semibold text-slate-950">{item}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${56 + index * 12}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-[1.5rem] border border-slate-200 bg-white p-5 text-center shadow-[0_18px_54px_rgba(15,23,42,0.07)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-14 grid gap-5 lg:grid-cols-[0.9fr_1.2fr_0.9fr]">
        <div className="rounded-[2rem] border border-white bg-slate-900/5 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="h-full rounded-[1.5rem] border border-slate-200 bg-white p-5 text-center">
            <TriangleAlert className="mx-auto h-5 w-5 text-amber-600" />
            <h2 className="mt-3 text-lg font-semibold text-slate-950">学习痛点</h2>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {painPoints.map((item) => (
                <span key={item} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white bg-slate-900/5 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="h-full rounded-[1.5rem] border border-slate-200 bg-white p-5 text-center">
            <BookOpenCheck className="mx-auto h-5 w-5 text-sky-700" />
            <h2 className="mt-3 text-lg font-semibold text-slate-950">解决方案</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {solutions.map((item) => (
                <div key={item.title} className="rounded-2xl bg-slate-50 p-4 text-center">
                  <item.icon className="mx-auto h-4 w-4 text-sky-700" />
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    <span className="font-semibold text-slate-900">{item.title}：</span>
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white bg-slate-900/5 p-2 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="h-full rounded-[1.5rem] border border-slate-200 bg-white p-5 text-center">
            <MapPinned className="mx-auto h-5 w-5 text-emerald-700" />
            <h2 className="mt-3 text-lg font-semibold text-slate-950">应用场景</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {scenarios.map((item) => (
                <div key={item} className="rounded-2xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <TeacherDashboardPreview />
    </section>
  );
}
