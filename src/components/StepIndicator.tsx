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
  const activeIndex = steps.findIndex((step) => step.key === currentStep);
  if (currentStep === 'home') return null;

  return (
    <div className="mx-auto max-w-7xl px-5 pt-6">
      <div className="glass-panel overflow-x-auto rounded-lg p-3">
        <div className="flex min-w-max items-center gap-2">
          {steps.map((step, index) => {
            const isActive = step.key === currentStep;
            const isDone = index < activeIndex;
            const canClick = visitedSteps.includes(step.key) && !isActive;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => onStepClick(step.key)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-cyan-400 text-slate-950'
                      : isDone
                        ? 'bg-emerald-400/12 text-emerald-200 hover:bg-emerald-400/18'
                        : 'bg-white/6 text-slate-400'
                  } ${canClick ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/12 text-xs">{index + 1}</span>
                  {step.label}
                </button>
                {index < steps.length - 1 ? <div className="h-px w-6 bg-white/14" /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
