import type { Difficulty } from '../types';

export interface DifficultyRatio {
  easy: number;
  medium: number;
  hard: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export function normalizeDifficultyRatio(ratio: Partial<DifficultyRatio> | undefined): DifficultyRatio {
  const easy = clamp(ratio?.easy || 0);
  const medium = clamp(ratio?.medium || 0);
  const hard = clamp(ratio?.hard || 0);
  const total = easy + medium + hard;
  if (total === 0) return { easy: 30, medium: 50, hard: 20 };
  const normalizedEasy = Math.round((easy / total) * 100);
  const normalizedMedium = Math.round((medium / total) * 100);
  return {
    easy: normalizedEasy,
    medium: normalizedMedium,
    hard: Math.max(0, 100 - normalizedEasy - normalizedMedium),
  };
}

export function allocateDifficultyCounts(targetCount: number, ratio: Partial<DifficultyRatio> | undefined): DifficultyRatio {
  const normalized = normalizeDifficultyRatio(ratio);
  const easy = Math.round((targetCount * normalized.easy) / 100);
  const medium = Math.round((targetCount * normalized.medium) / 100);
  return {
    easy,
    medium,
    hard: Math.max(0, targetCount - easy - medium),
  };
}

export function allocateDifficultySlots(targetCount: number, ratio: Partial<DifficultyRatio> | undefined): Difficulty[] {
  const counts = allocateDifficultyCounts(targetCount, ratio);
  return [
    ...Array.from({ length: counts.easy }, () => '简单' as Difficulty),
    ...Array.from({ length: counts.medium }, () => '中等' as Difficulty),
    ...Array.from({ length: counts.hard }, () => '较难' as Difficulty),
  ].slice(0, targetCount);
}

export function rebalanceDifficultyRatio(
  ratio: DifficultyRatio,
  changedKey: keyof DifficultyRatio,
  rawValue: number
): DifficultyRatio {
  const value = clamp(rawValue);
  const otherKeys = (['easy', 'medium', 'hard'] as Array<keyof DifficultyRatio>).filter((key) => key !== changedKey);
  const remaining = 100 - value;
  const currentOtherTotal = otherKeys.reduce((sum, key) => sum + clamp(ratio[key]), 0);
  if (currentOtherTotal <= 0) {
    const first = Math.floor(remaining / 2);
    return {
      easy: changedKey === 'easy' ? value : otherKeys[0] === 'easy' ? first : remaining - first,
      medium: changedKey === 'medium' ? value : otherKeys[0] === 'medium' ? first : remaining - first,
      hard: changedKey === 'hard' ? value : otherKeys[0] === 'hard' ? first : remaining - first,
    };
  }
  const firstOther = Math.round((clamp(ratio[otherKeys[0]]) / currentOtherTotal) * remaining);
  return {
    ...ratio,
    [changedKey]: value,
    [otherKeys[0]]: firstOther,
    [otherKeys[1]]: remaining - firstOther,
  };
}
