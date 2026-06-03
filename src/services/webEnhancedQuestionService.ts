import type { Difficulty } from '../types';
import type { MaterialProfile } from './materialTopicService';

export interface WebReference {
  title: string;
  summary: string;
  url?: string;
}

export interface SearchProvider {
  search(query: string): Promise<WebReference[]>;
}

let searchProvider: SearchProvider | null = null;

export function configureSearchProvider(provider: SearchProvider | null): void {
  searchProvider = provider;
}

export function buildWebEnhancedQuery(profile: MaterialProfile, difficulty: Difficulty): string {
  return `${profile.stage}${profile.subject}${profile.topic} ${difficulty} 试题 考点 例题`;
}

export async function getWebEnhancedReferenceContext(
  enabled: boolean,
  profile: MaterialProfile,
  difficulty: Difficulty
): Promise<string> {
  if (!enabled || !searchProvider) return '';
  try {
    const references = await searchProvider.search(buildWebEnhancedQuery(profile, difficulty));
    return references
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.title}：${item.summary}`)
      .join('\n');
  } catch (error) {
    console.warn('[联网增强出题] 搜索失败，已自动降级为普通资料出题', error);
    return '';
  }
}
