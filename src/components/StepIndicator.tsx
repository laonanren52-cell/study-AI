import type { AppStep } from '../types';

interface StepIndicatorProps {
  currentStep: AppStep;
  visitedSteps: AppStep[];
  onStepClick: (step: AppStep) => void;
}

const steps: Array<{ key: AppStep; label: string }> = [
  { key: 'material', label: '资料输入' },
  { key: 'knowledge', label: '知识提取' },
  { key: 'quiz', label: '智能出题' },
  { key: 'taking', label: '在线测评' },
  { key: 'result', label: '结果分析' },
  { key: 'diagnosis', label: '错因诊断' },
  { key: 'plan', label: '复习计划' },
  { key: 'reinforcement', label: '强化练习' },
  { key: 'report', label: '学习报告' },
];

export default function StepIndicator({ currentStep, visitedSteps, onStepClick }: StepIndicatorProps) {
  const activeIndex = steps.findIndex((item) => item.key === currentStep);
  if (currentStep === 'home') return null;

  return (
    <div className="no-print mx-auto max-w-7xl px-5 pt-6">
      <div className="glass-panel overflow-x-auto rounded-2xl p-3">
        <div className="flex min-w-max items-center gap-2">
          {steps.map((item, index) => {
            const isActive = item.key === currentStep;
            const isDone = index < activeIndex;
            const canClick = visitedSteps.includes(item.key) && !isActive;
            return (
              <div key={item.key} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => onStepClick(item.key)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm'
                      : isDone
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-slate-50 text-slate-400'
                  } ${canClick ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'}`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${isActive ? 'bg-white/20' : 'bg-white'}`}>
                    {index + 1}
                  </span>
                  {item.label}
                </button>
                {index < steps.length - 1 ? <div className="h-px w-6 bg-slate-200" /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
