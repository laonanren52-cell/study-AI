import { ArrowRight, BookOpenCheck, FileText, LineChart, MapPinned, Target, TriangleAlert } from 'lucide-react';
import TeacherDashboardPreview from './TeacherDashboardPreview';

interface HeroSectionProps {
  onStart: () => void;
}

const features = [
  {
    icon: FileText,
    title: '资料驱动',
    description: '上传自己的笔记、课件或复习资料，生成专属题库。',
  },
  {
    icon: LineChart,
    title: '测评闭环',
    description: '完成从知识点到答题反馈的完整学习闭环。',
  },
  {
    icon: Target,
    title: '个性复习',
    description: '根据错题自动生成薄弱点分析和复习计划。',
  },
];

const painPoints = ['资料难整理', '重点难提取', '掌握难评估', '错因难定位', '复习难规划'];
const solutions = [
  { icon: FileText, title: '资料驱动', text: '围绕自己的课件、笔记和复习资料生成专属题库。' },
  { icon: LineChart, title: '测评闭环', text: '从知识点提取、答题到反馈诊断形成完整闭环。' },
  { icon: TriangleAlert, title: '错因诊断', text: '把错题转化为概念混淆、关键词遗漏等可行动原因。' },
  { icon: Target, title: '个性复习', text: '根据薄弱点生成短周期复习计划和强化练习。' },
];
const scenarios = ['学生期末复习', '教师随堂测', '考证备考', '培训机构题库生成'];

export default function HeroSection({ onStart }: HeroSectionProps) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-12">
      <div className="grid min-h-[calc(100vh-92px)] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-5 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
            资料上传 → 知识点提取 → 智能出题 → 在线测评 → 错题诊断 → 个性复习
          </div>
          <h1 className="text-5xl font-semibold leading-tight text-white md:text-7xl">智学闭环</h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-300">基于 AI 的学习资料智能测评与个性化复习工具</p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">
            第二版支持半动态资料解析和一键演示答卷，不再只能展示固定 AI 示例，更适合黑客松评委现场更换材料验证。
          </p>
          <button
            onClick={onStart}
            className="focus-ring mt-9 inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            开始体验
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        <div className="glass-panel rounded-lg p-5">
          <div className="grid gap-4">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-white/10 bg-white/6 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-200">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">{feature.title}</h2>
                    <p className="mt-2 leading-6 text-slate-400">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center gap-3 text-white">
            <TriangleAlert className="h-5 w-5 text-amber-200" />
            <h2 className="text-lg font-semibold">学习痛点</h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {painPoints.map((item) => <span key={item} className="rounded-full bg-amber-300/10 px-3 py-1 text-sm text-amber-100">{item}</span>)}
          </div>
        </div>
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center gap-3 text-white">
            <BookOpenCheck className="h-5 w-5 text-cyan-200" />
            <h2 className="text-lg font-semibold">解决方案</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {solutions.map((item) => (
              <div key={item.title} className="flex gap-3 rounded-lg bg-white/6 p-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                <p className="text-sm leading-6 text-slate-300"><span className="text-white">{item.title}：</span>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center gap-3 text-white">
            <MapPinned className="h-5 w-5 text-emerald-200" />
            <h2 className="text-lg font-semibold">应用场景</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {scenarios.map((item) => <div key={item} className="rounded-lg bg-emerald-300/10 p-3 text-sm text-emerald-100">{item}</div>)}
          </div>
        </div>
      </div>
      <TeacherDashboardPreview />
    </section>
  );
}
