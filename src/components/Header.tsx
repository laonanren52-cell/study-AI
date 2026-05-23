import { BrainCircuit, RotateCcw } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
}

export default function Header({ onReset }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/78 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <button onClick={onReset} className="focus-ring flex items-center gap-3 rounded-lg text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/12 text-cyan-200">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-base font-semibold text-white">智学闭环</span>
            <span className="block text-xs text-slate-400">AI 学习测评与复习工具</span>
          </span>
        </button>
        <button
          onClick={onReset}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-white/12 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/50 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
          重新演示
        </button>
      </div>
    </header>
  );
}
