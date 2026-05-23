import { ArrowRight, FileText, LineChart, Target } from 'lucide-react';

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

export default function HeroSection({ onStart }: HeroSectionProps) {
  return (
    <section className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr]">
      <div>
        <div className="mb-5 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100">
          资料上传 → 知识点提取 → 智能出题 → 在线测评 → 错题诊断 → 个性复习
        </div>
        <h1 className="text-5xl font-semibold leading-tight text-white md:text-7xl">智学闭环</h1>
        <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-300">基于 AI 的学习资料智能测评与个性化复习工具</p>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">
          将学习资料、知识抽取、测评、错因诊断和复习计划串成一个可演示的闭环，让比赛路演能直接展示从输入到结果的完整价值。
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
    </section>
  );
}
