import { ArrowRight } from 'lucide-react';

interface LoginCardProps {
  onStart: () => void;
}

export default function LoginCard({ onStart }: LoginCardProps) {
  return (
    <div className="mx-auto mt-12 w-full max-w-md rounded-[2.25rem] bg-slate-950/[0.04] p-2 ring-1 ring-slate-950/[0.06] shadow-[0_36px_110px_rgba(15,23,42,0.14)]">
      <div className="rounded-[1.75rem] bg-white px-6 py-7 ring-1 ring-white shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] sm:px-7">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Private Study Workspace</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">进入学习工作台</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
            路演 Demo 可直接进入体验；后续可扩展为学生端、教师端和班级管理入口。
          </p>
        </div>

        <div className="mt-7 space-y-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Account</span>
            <input
              className="focus-ring w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-900 ring-1 ring-slate-200 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-slate-400 focus:bg-white focus:ring-sky-300"
              defaultValue="demo@zhixue.ai"
              aria-label="演示账号"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Password</span>
            <input
              className="focus-ring w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-900 ring-1 ring-slate-200 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] placeholder:text-slate-400 focus:bg-white focus:ring-sky-300"
              defaultValue="competition-demo"
              type="password"
              aria-label="演示密码"
            />
          </label>
        </div>

        <button
          onClick={onStart}
          className="group mt-6 flex w-full items-center justify-between rounded-full bg-[#07111f] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_54px_rgba(7,17,31,0.28)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 active:scale-[0.98]"
        >
          进入完整闭环体验
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px] group-hover:bg-white/18">
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-500">
          <span className="rounded-full bg-slate-50 px-2 py-2">学生端</span>
          <span className="rounded-full bg-slate-50 px-2 py-2">教师端</span>
          <span className="rounded-full bg-slate-50 px-2 py-2">路演版</span>
        </div>
      </div>
    </div>
  );
}
