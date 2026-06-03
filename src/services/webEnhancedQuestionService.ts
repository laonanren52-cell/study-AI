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

export async function getWebEnhancedReferenceBundle(
  enabled: boolean,
  profile: MaterialProfile,
  difficulty: Difficulty,
  queryOverride?: string
): Promise<{ query: string; references: WebReference[]; context: string; error?: string }> {
  const query = queryOverride || buildWebEnhancedQuery(profile, difficulty);
  if (!enabled) return { query, references: [], context: '' };
  if (!searchProvider) {
    console.warn('[联网增强出题] searchProvider 未配置，无法执行真实联网搜索');
    return { query, references: [], context: '', error: 'NO_SEARCH_PROVIDER' };
  }
  try {
    const searchPromise = searchProvider.search(query);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SEARCH_TIMEOUT")), 5000));
    const references = (await Promise.race([searchPromise, timeoutPromise]) as WebReference[])
      .filter((item) => item.title || item.summary)
      .slice(0, 5);
    const context = references
      .map((item, index) => `${index + 1}. ${item.title}：${item.summary}${item.url ? `（${item.url}）` : ''}`)
      .join('\n');
    return { query, references, context };
  } catch (error) {
    console.warn('[联网增强出题] 搜索失败，已自动降级为上传资料 + 外接 AI 出题', error);
    return { query, references: [], context: '', error: error instanceof Error ? error.message : 'SEARCH_FAILED' };
  }
}

export async function getWebEnhancedReferenceContext(
  enabled: boolean,
  profile: MaterialProfile,
  difficulty: Difficulty,
  queryOverride?: string
): Promise<string> {
  return (await getWebEnhancedReferenceBundle(enabled, profile, difficulty, queryOverride)).context;
}
