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

const stripMarkdown = (value: string): string =>
  value.replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[#>*_`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseSearchResults = (text: string): WebReference[] => {
  const htmlResults: WebReference[] = [];
  const linkPattern = /<a[^>]+class=["'][^"']*result-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) && htmlResults.length < 5) {
    const url = match[1].replace(/&amp;/g, '&');
    const title = stripMarkdown(match[2]).slice(0, 80);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 800);
    const snippetMatch = after.match(/<td[^>]+class=["']result-snippet["'][^>]*>([\s\S]*?)<\/td>/i);
    const summary = stripMarkdown(snippetMatch?.[1] || title).slice(0, 180);
    if (title) htmlResults.push({ title, summary, url });
  }
  if (htmlResults.length > 0) return htmlResults;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const results: WebReference[] = [];
  for (let index = 0; index < lines.length && results.length < 5; index++) {
    const line = lines[index];
    const markdownLink = line.match(/\[([^\]]{4,})\]\((https?:\/\/[^)]+)\)/);
    if (!markdownLink) continue;
    const title = stripMarkdown(markdownLink[1]).slice(0, 80);
    const url = markdownLink[2];
    const next = stripMarkdown(lines.slice(index + 1, index + 4).join(' ')).slice(0, 180);
    results.push({
      title,
      url,
      summary: next || title,
    });
  }
  if (results.length > 0) return results;
  const fallbackSummary = stripMarkdown(text).slice(0, 500);
  return fallbackSummary
    ? [{ title: '联网搜索摘要', summary: fallbackSummary, url: 'https://s.jina.ai/' }]
    : [];
};

const defaultSearchProvider: SearchProvider = {
  async search(query: string): Promise<WebReference[]> {
    const localProxyUrl = `/web-search?q=${encodeURIComponent(query)}`;
    const directUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const url = typeof window !== 'undefined' ? localProxyUrl : directUrl;
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,text/plain',
      },
    });
    if (!response.ok) {
      throw new Error(`PUBLIC_SEARCH_FAILED_${response.status}`);
    }
    return parseSearchResults(await response.text());
  },
};

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
  const provider = searchProvider || defaultSearchProvider;
  try {
    const searchPromise = provider.search(query);
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
