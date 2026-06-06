import type { AIProvider } from '../types';

export type UniversalAIProvider =
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'kimi'
  | 'zhipu'
  | 'baichuan'
  | 'claude'
  | 'ollama'
  | 'lmstudio'
  | 'custom';

export type UniversalAIFormat = 'openai-compatible' | 'claude' | 'zhipu' | 'ollama' | 'custom';

export interface AIProviderConfig {
  provider: UniversalAIProvider;
  baseURL: string;
  apiKey?: string;
  model: string;
  apiFormat: UniversalAIFormat;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface UniversalAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class UniversalAIError extends Error {
  constructor(
    message: string,
    public reason: string,
    public statusCode?: number,
    public rawPreview?: string
  ) {
    super(message);
    this.name = 'UniversalAIError';
  }
}

const normalizeBaseURL = (baseURL: string): string => baseURL.trim().replace(/\/+$/, '');

const withTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      throw new UniversalAIError('网络超时，请检查 baseURL、模型服务或本机网络。', '网络超时');
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(err.message)) {
      throw new UniversalAIError(`网络或 CORS 限制：${err.message}`, 'CORS 或浏览器限制');
    }
    throw new UniversalAIError(`网络请求失败：${err.message}`, 'baseURL 错误或网络不可达');
  } finally {
    clearTimeout(timeout);
  }
};

const readText = async (response: Response): Promise<string> => {
  const text = await response.text();
  console.log('[AI_STATUS_CODE]', response.status);
  console.log('[AI_RAW_RESPONSE_PREVIEW]', text.slice(0, 500));
  if (response.status === 401 || response.status === 403) {
    throw new UniversalAIError('API Key 缺失、无效或无权限。', 'API Key 缺失或无效', response.status, text.slice(0, 500));
  }
  if (response.status === 404) {
    throw new UniversalAIError('模型不存在或 baseURL 路径错误。', 'model 不存在或 baseURL 错误', response.status, text.slice(0, 500));
  }
  if (!response.ok) {
    throw new UniversalAIError(`API 请求失败：${response.status} ${text.slice(0, 200)}`, `HTTP ${response.status}`, response.status, text.slice(0, 500));
  }
  return text;
};

const parseJSON = (text: string): Record<string, unknown> => {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new UniversalAIError('返回格式无法解析为 JSON。', '返回格式无法解析', undefined, text.slice(0, 500));
  }
};

const authHeaders = (config: AIProviderConfig): Record<string, string> => {
  const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(config.baseURL);
  if (!config.apiKey && config.apiFormat !== 'ollama' && !isLocal && !['ollama', 'lmstudio'].includes(config.provider)) {
    throw new UniversalAIError('API Key 缺失。', 'API Key 缺失');
  }
  return {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };
};

const extractOpenAIText = (data: Record<string, unknown>): string => {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const content = (choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
  if (typeof content?.content === 'string') return content.content;
  throw new UniversalAIError('OpenAI-compatible 响应中没有 choices[0].message.content。', '返回格式无法解析');
};

const extractClaudeText = (data: Record<string, unknown>): string => {
  const content = Array.isArray(data.content) ? data.content : [];
  const parts = content
    .map((item) => (item as Record<string, unknown>).text)
    .filter((value): value is string => typeof value === 'string');
  if (parts.length > 0) return parts.join('\n');
  throw new UniversalAIError('Claude 响应中没有 content[].text。', '返回格式无法解析');
};

const extractOllamaText = (data: Record<string, unknown>): string => {
  const message = data.message as Record<string, unknown> | undefined;
  if (typeof message?.content === 'string') return message.content;
  if (typeof data.response === 'string') return data.response;
  throw new UniversalAIError('Ollama 响应中没有 message.content 或 response。', '返回格式无法解析');
};

const endpointFor = (config: AIProviderConfig): string => {
  const baseURL = normalizeBaseURL(config.baseURL);
  if (config.apiFormat === 'claude') return `${baseURL}/v1/messages`;
  if (config.apiFormat === 'ollama') return `${baseURL}/api/chat`;
  if (config.apiFormat === 'zhipu') return `${baseURL}/chat/completions`;
  return `${baseURL}/chat/completions`;
};

export const inferAIFormat = (provider: AIProvider | UniversalAIProvider, baseUrl = ''): UniversalAIFormat => {
  if (provider === 'claude') return 'claude';
  if (provider === 'ollama') return 'ollama';
  if (provider === 'zhipu') return 'zhipu';
  if (provider === 'custom' && /ollama/i.test(baseUrl)) return 'ollama';
  if (provider === 'custom' && /anthropic|claude/i.test(baseUrl)) return 'claude';
  return 'openai-compatible';
};

export async function callUniversalAI({
  config,
  messages,
  taskType,
}: {
  config: AIProviderConfig;
  messages: UniversalAIMessage[];
  taskType: string;
}): Promise<string> {
  const startedAt = Date.now();
  const apiFormat = config.apiFormat || inferAIFormat(config.provider, config.baseURL);
  const url = endpointFor({ ...config, apiFormat });
  const system = messages.find((message) => message.role === 'system')?.content || '';
  const userMessages = messages.filter((message) => message.role !== 'system');

  console.log('[AI_PROVIDER]', config.provider);
  console.log('[AI_BASE_URL]', config.baseURL);
  console.log('[AI_MODEL]', config.model);
  console.log('[AI_FORMAT]', apiFormat);
  console.log('[AI_REQUEST_START]', new Date().toISOString());

  try {
    let body: Record<string, unknown>;
    if (apiFormat === 'claude') {
      body = {
        model: config.model,
        system,
        messages: userMessages.map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })),
        max_tokens: config.maxTokens ?? 4096,
        temperature: config.temperature ?? 0.2,
      };
    } else if (apiFormat === 'ollama') {
      body = {
        model: config.model,
        messages,
        stream: false,
        options: { temperature: config.temperature ?? 0.2 },
      };
    } else {
      body = {
        model: config.model,
        messages,
        temperature: config.temperature ?? 0.2,
        max_tokens: config.maxTokens ?? 4096,
      };
    }

    const response = await withTimeout(url, {
      method: 'POST',
      headers: authHeaders({ ...config, apiFormat }),
      body: JSON.stringify(body),
    }, config.timeoutMs ?? 30000);
    const text = await readText(response);
    const data = parseJSON(text);
    console.log('[AI_GENERATION_TIME]', Date.now() - startedAt, 'ms');
    if (apiFormat === 'claude') return extractClaudeText(data);
    if (apiFormat === 'ollama') return extractOllamaText(data);
    return extractOpenAIText(data);
  } catch (error) {
    const reason = error instanceof UniversalAIError ? error.reason : (error as Error).message;
    console.log('[AI_ERROR_REASON]', reason);
    console.log('[AI_GENERATION_TIME]', Date.now() - startedAt, 'ms');
    console.log('[AI_TASK_TYPE]', taskType);
    throw error;
  }
}
