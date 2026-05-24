import { Cpu, WifiOff } from 'lucide-react';
import type { AIStatus } from '../types';

interface AIStatusBadgeProps {
  status: AIStatus;
}

export default function AIStatusBadge({ status }: AIStatusBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        status.isRealAI
          ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
          : 'border-amber-300/30 bg-amber-400/10 text-amber-100'
      }`}
      title={status.isRealAI ? '当前正在使用真实外部大模型 API' : '当前使用本地 Mock 规则生成，适合离线演示'}
    >
      {status.isRealAI ? <Cpu className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {status.modeLabel}
    </div>
  );
}
