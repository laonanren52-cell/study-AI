import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  tone?: 'cyan' | 'green' | 'yellow' | 'red' | 'violet';
}

const toneClass = {
  cyan: 'from-cyan-400/18 text-cyan-200 border-cyan-300/20',
  green: 'from-emerald-400/18 text-emerald-200 border-emerald-300/20',
  yellow: 'from-amber-400/18 text-amber-200 border-amber-300/20',
  red: 'from-rose-400/18 text-rose-200 border-rose-300/20',
  violet: 'from-violet-400/18 text-violet-200 border-violet-300/20',
};

export default function StatCard({ label, value, description, icon: Icon, tone = 'cyan' }: StatCardProps) {
  return (
    <div className={`rounded-lg border bg-gradient-to-br ${toneClass[tone]} to-slate-900/70 p-5`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-300">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/8">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {description ? <p className="mt-3 text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}
