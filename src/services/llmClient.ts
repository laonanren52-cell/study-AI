import type { AIProvider, AIStatus } from '../types';

import type { MaterialProfile } from './materialTopicService';
import { callUniversalAI, inferAIFormat, type UniversalAIFormat } from './universalAIProvider';

export interface RuntimeAIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  apiFormat?: UniversalAIFormat;
  /** 自定义配置的显示名称 */
  label?: string;
  /** 自定义配置的唯一ID */
  customId?: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  modelConfirmed?: string;
}

const STORAGE_KEY = 'zhixue-loop-ai-config';
const CUSTOM_CONFIGS_KEY = 'zhixue-loop-custom-configs';

const providerLabels: Record<AIProvider, string> = {
  mock: 'Mock 演示模式',
  openai: 'OpenAI API 已启用',
  deepseek: 'DeepSeek API 已启用',
  qwen: 'Qwen API 已启用',
  kimi: 'Moonshot/Kimi API 已启用',
  zhipu: '智谱 GLM API 已启用',
  baichuan: '百川 API 已启用',
  claude: 'Claude API 已启用',
  ollama: 'Ollama 本地模型已启用',
  lmstudio: 'LM Studio 本地模型已启用',
  custom: '自定义模型已启用',
};

const defaultProviderConfig: Record<Exclude<AIProvider, 'mock' | 'custom'>, Omit<RuntimeAIConfig, 'provider' | 'apiKey'>> = {
  openai: {
    model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4.1-mini',
    baseUrl: import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },
  deepseek: {
    model: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  },
  qwen: {
    model: import.meta.env.VITE_QWEN_MODEL || 'qwen-plus',
    baseUrl: import.meta.env.VITE_QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  kimi: {
    model: import.meta.env.VITE_KIMI_MODEL || 'moonshot-v1-8k',
    baseUrl: import.meta.env.VITE_KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
  },
  zhipu: {
    model: import.meta.env.VITE_ZHIPU_MODEL || 'glm-4-flash',
    baseUrl: import.meta.env.VITE_ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    apiFormat: 'zhipu',
  },
  baichuan: {
    model: import.meta.env.VITE_BAICHUAN_MODEL || 'Baichuan4',
    baseUrl: import.meta.env.VITE_BAICHUAN_BASE_URL || 'https://api.baichuan-ai.com/v1',
  },
  claude: {
    model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-3-5-sonnet-latest',
    baseUrl: import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com',
    apiFormat: 'claude',
  },
  ollama: {
    model: import.meta.env.VITE_OLLAMA_MODEL || 'qwen2.5:7b',
    baseUrl: import.meta.env.VITE_OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    apiFormat: 'ollama',
  },
  lmstudio: {
    model: import.meta.env.VITE_LMSTUDIO_MODEL || 'local-model',
    baseUrl: import.meta.env.VITE_LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1',
  },
};

const normalizeProvider = (value: unknown): AIProvider => {
  if (
    value === 'openai' || value === 'deepseek' || value === 'qwen' || value === 'kimi'
    || value === 'zhipu' || value === 'baichuan' || value === 'claude' || value === 'ollama'
    || value === 'lmstudio' || value === 'custom'
  ) return value;
  return 'mock';
};

// ========== 自定义模型配置管理 ==========

export interface CustomModelConfig {
  id: string;
  label: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  apiFormat?: UniversalAIFormat;
  createdAt: number;
}

export const getCustomConfigs = (): CustomModelConfig[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_CONFIGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomModelConfig[];
  } catch {
    return [];
  }
};

export const saveCustomConfig = (config: Omit<CustomModelConfig, 'id' | 'createdAt'>): CustomModelConfig => {
  const configs = getCustomConfigs();
  const newConfig: CustomModelConfig = {
    ...config,
    id: `custom-${Date.now()}`,
    createdAt: Date.now(),
  };
  configs.push(newConfig);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CUSTOM_CONFIGS_KEY, JSON.stringify(configs));
  }
  return newConfig;
};

export const deleteCustomConfig = (id: string) => {
  const configs = getCustomConfigs().filter(c => c.id !== id);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CUSTOM_CONFIGS_KEY, JSON.stringify(configs));
  }
};

// ========== 运行时配置管理 ==========

const readStoredConfig = (): RuntimeAIConfig | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RuntimeAIConfig>;
    const provider = normalizeProvider(parsed.provider);
    if (provider === 'mock') return null;
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : '';
    const baseUrl = typeof parsed.baseUrl === 'string' && parsed.baseUrl ? parsed.baseUrl : '';
    const model = typeof parsed.model === 'string' && parsed.model ? parsed.model : '';
    const apiFormat = typeof parsed.apiFormat === 'string'
      ? parsed.apiFormat as UniversalAIFormat
      : inferAIFormat(provider, baseUrl);

    // 自定义模型：只要有 apiKey、model、baseUrl 就接受
    if (provider === 'custom') {
      if (!model || !baseUrl || (!apiKey && apiFormat !== 'ollama' && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(baseUrl))) {
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return {
        provider,
        apiKey,
        model,
        baseUrl,
        apiFormat,
        label: typeof parsed.label === 'string' ? parsed.label : undefined,
        customId: typeof parsed.customId === 'string' ? parsed.customId : undefined,
      };
    }

    // 内置模型：需要有效 API Key
    if (!['ollama', 'lmstudio'].includes(provider) && (!apiKey || apiKey.length < 10)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      provider,
      apiKey,
      model: model || defaultProviderConfig[provider].model,
      baseUrl: baseUrl || defaultProviderConfig[provider].baseUrl,
      apiFormat: apiFormat || defaultProviderConfig[provider].apiFormat,
    };
  } catch {
    return null;
  }
};

const getEnvConfig = (): RuntimeAIConfig | null => {
  const provider = normalizeProvider(import.meta.env.VITE_AI_PROVIDER);
  if (provider === 'mock' || provider === 'custom') return null;
  const config = {
    openai: {
      apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
      model: import.meta.env.VITE_OPENAI_MODEL || defaultProviderConfig.openai.model,
      baseUrl: import.meta.env.VITE_OPENAI_BASE_URL || defaultProviderConfig.openai.baseUrl,
    },
    deepseek: {
      apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || '',
      model: import.meta.env.VITE_DEEPSEEK_MODEL || defaultProviderConfig.deepseek.model,
      baseUrl: import.meta.env.VITE_DEEPSEEK_BASE_URL || defaultProviderConfig.deepseek.baseUrl,
    },
    qwen: {
      apiKey: import.meta.env.VITE_QWEN_API_KEY || '',
      model: import.meta.env.VITE_QWEN_MODEL || defaultProviderConfig.qwen.model,
      baseUrl: import.meta.env.VITE_QWEN_BASE_URL || defaultProviderConfig.qwen.baseUrl,
    },
    kimi: {
      apiKey: import.meta.env.VITE_KIMI_API_KEY || '',
      model: import.meta.env.VITE_KIMI_MODEL || defaultProviderConfig.kimi.model,
      baseUrl: import.meta.env.VITE_KIMI_BASE_URL || defaultProviderConfig.kimi.baseUrl,
    },
    zhipu: {
      apiKey: import.meta.env.VITE_ZHIPU_API_KEY || '',
      model: import.meta.env.VITE_ZHIPU_MODEL || defaultProviderConfig.zhipu.model,
      baseUrl: import.meta.env.VITE_ZHIPU_BASE_URL || defaultProviderConfig.zhipu.baseUrl,
      apiFormat: 'zhipu' as UniversalAIFormat,
    },
    baichuan: {
      apiKey: import.meta.env.VITE_BAICHUAN_API_KEY || '',
      model: import.meta.env.VITE_BAICHUAN_MODEL || defaultProviderConfig.baichuan.model,
      baseUrl: import.meta.env.VITE_BAICHUAN_BASE_URL || defaultProviderConfig.baichuan.baseUrl,
    },
    claude: {
      apiKey: import.meta.env.VITE_CLAUDE_API_KEY || '',
      model: import.meta.env.VITE_CLAUDE_MODEL || defaultProviderConfig.claude.model,
      baseUrl: import.meta.env.VITE_CLAUDE_BASE_URL || defaultProviderConfig.claude.baseUrl,
      apiFormat: 'claude' as UniversalAIFormat,
    },
    ollama: {
      apiKey: '',
      model: import.meta.env.VITE_OLLAMA_MODEL || defaultProviderConfig.ollama.model,
      baseUrl: import.meta.env.VITE_OLLAMA_BASE_URL || defaultProviderConfig.ollama.baseUrl,
      apiFormat: 'ollama' as UniversalAIFormat,
    },
    lmstudio: {
      apiKey: import.meta.env.VITE_LMSTUDIO_API_KEY || '',
      model: import.meta.env.VITE_LMSTUDIO_MODEL || defaultProviderConfig.lmstudio.model,
      baseUrl: import.meta.env.VITE_LMSTUDIO_BASE_URL || defaultProviderConfig.lmstudio.baseUrl,
    },
  }[provider];
  return { provider, ...config };
};

export const getDefaultAIConfig = (provider: AIProvider): RuntimeAIConfig => {
  if (provider === 'mock') {
    return { provider: 'mock', apiKey: '', model: '', baseUrl: '' };
  }
  if (provider === 'custom') {
    return { provider: 'custom', apiKey: '', model: '', baseUrl: 'https://api.example.com/v1', apiFormat: 'openai-compatible' };
  }
  const hardcoded = defaultProviderConfig[provider];
  const envModel = (import.meta.env as Record<string, string | undefined>)[`VITE_${provider.toUpperCase()}_MODEL`];
  const envBaseUrl = (import.meta.env as Record<string, string | undefined>)[`VITE_${provider.toUpperCase()}_BASE_URL`];
  return {
    provider,
    apiKey: '',
    model: envModel || hardcoded.model,
    baseUrl: envBaseUrl || hardcoded.baseUrl,
    apiFormat: hardcoded.apiFormat || inferAIFormat(provider, envBaseUrl || hardcoded.baseUrl),
  };
};

export const getEffectiveAIConfig = (): RuntimeAIConfig => {
  const stored = readStoredConfig();
  if (stored) return stored;
  const envConfig = getEnvConfig();
  if (envConfig) return envConfig;
  return getDefaultAIConfig('mock');
};

export const saveRuntimeAIConfig = (config: RuntimeAIConfig) => {
  if (typeof window === 'undefined') return;
  if (config.provider === 'mock') {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
  runtimeStatus = resolveAIStatus();
};

export const clearRuntimeAIConfig = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  runtimeStatus = resolveAIStatus();
};

export const getConfiguredProvider = (): AIProvider => getEffectiveAIConfig().provider;

// ========== API 连通性检测 ==========

/**
 * 测试 API 连接是否可用
 * 发送一个简单的测试请求验证：网络连通性、API Key有效性、模型可用性
 */
export const testAPIConnection = async (config: RuntimeAIConfig): Promise<TestConnectionResult> => {
  if (config.provider === 'mock') {
    return { success: true, message: '演示模式无需测试连接' };
  }

  if ((!config.apiKey && !['ollama', 'lmstudio'].includes(config.provider)) || !config.model || !config.baseUrl) {
    return { success: false, message: '请填写完整的 API Key、模型名称和 Base URL' };
  }

  try {
    const content = await callUniversalAI({
      config: {
        provider: config.provider === 'mock' ? 'custom' : config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseURL: config.baseUrl,
        apiFormat: config.apiFormat || inferAIFormat(config.provider, config.baseUrl),
        temperature: 0,
        maxTokens: 16,
        timeoutMs: 15000,
      },
      taskType: 'connection_test',
      messages: [{ role: 'user', content: '请只回复 JSON：{"ok":true}' }],
    });
    return {
      success: true,
      message: `连接成功，已收到模型响应：${content.slice(0, 60)}`,
      modelConfirmed: config.model,
    };
  } catch (error) {
    return { success: false, message: `连接测试失败：${(error as Error).message}` };
  }
};

/**
 * 启动时自动检测当前配置的 API 是否可用
 * 不可用则自动降级到演示模式
 */
export const autoDetectAPIOnStartup = async (): Promise<{ status: AIStatus; degraded: boolean }> => {
  const config = getEffectiveAIConfig();
  if (config.provider === 'mock') {
    return { status: { provider: 'mock', modeLabel: providerLabels.mock, isRealAI: false }, degraded: false };
  }

  const result = await testAPIConnection(config);
  if (result.success) {
    const status: AIStatus = {
      provider: config.provider,
      modeLabel: config.label || providerLabels[config.provider],
      isRealAI: true,
    };
    runtimeStatus = status;
    return { status, degraded: false };
  }

  // 降级到演示模式
  clearRuntimeAIConfig();
  const degradedStatus: AIStatus = {
    provider: 'mock',
    modeLabel: '当前API不可用，已进入演示模式',
    isRealAI: false,
  };
  runtimeStatus = degradedStatus;
  return { status: degradedStatus, degraded: true };
};

// ========== AI 状态管理 ==========

const resolveAIStatus = (): AIStatus => {
  const config = getEffectiveAIConfig();
  if (config.provider === 'mock') return { provider: 'mock', modeLabel: providerLabels.mock, isRealAI: false };
  if (!config.apiKey) return { provider: 'mock', modeLabel: 'API 未配置，已回退 Mock', isRealAI: false };
  return {
    provider: config.provider,
    modeLabel: config.label || providerLabels[config.provider],
    isRealAI: true,
  };
};

let runtimeStatus: AIStatus = resolveAIStatus();

export const getAIStatus = (): AIStatus => {
  runtimeStatus = resolveAIStatus();
  return runtimeStatus;
};

export const hasRealAIConfig = () => {
  const config = getEffectiveAIConfig();
  if (config.provider === 'mock') return false;
  if (['ollama', 'lmstudio'].includes(config.provider)) return Boolean(config.baseUrl && config.model);
  return Boolean(config.apiKey && config.baseUrl && config.model);
};

// ========== LLM 调用 ==========

const LLM_TIMEOUT_MS = 30000; // LLM 请求超时 30 秒

const extractJsonFromText = (text: string): unknown => {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM 响应不是合法 JSON。');
    return JSON.parse(match[0]);
  }
};

const readOpenAIResponseText = (data: unknown): string => {
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];
  output.forEach((item) => {
    const content = Array.isArray((item as Record<string, unknown>).content) ? ((item as Record<string, unknown>).content as unknown[]) : [];
    content.forEach((part) => {
      const text = (part as Record<string, unknown>).text;
      if (typeof text === 'string') parts.push(text);
    });
  });
  if (parts.length > 0) return parts.join('\n');
  throw new Error('OpenAI 响应中没有可读取文本。');
};

const callOpenAI = async (config: RuntimeAIConfig, systemPrompt: string, userPrompt: string, temperature: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        input: `${systemPrompt}\n\n${userPrompt}`,
        temperature,
        text: { format: { type: 'json_object' } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI 请求失败：${response.status} ${await response.text()}`);
    return extractJsonFromText(readOpenAIResponseText(await response.json()));
  } finally {
    clearTimeout(timeoutId);
  }
};

const getProxyUrl = (originalUrl: string): string => {
  const match = originalUrl.match(/^(https?:\/\/[^\/]+)(\/.*)$/);
  if (!match) return originalUrl;
  const [, , path] = match;
  return `/api-proxy${path}`;
};

const callOpenAICompatible = async (config: RuntimeAIConfig, systemPrompt: string, userPrompt: string, temperature: number) => {
  const fullUrl = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const fetchUrls = Array.from(new Set([fullUrl, getProxyUrl(fullUrl)]));
  let lastError: unknown = null;

  for (const fetchUrl of fetchUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${config.provider} 请求失败：${response.status} ${await response.text()}`);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error(`${config.provider} 响应中没有 message.content。`);
      return extractJsonFromText(content);
    } catch (error) {
      lastError = error;
      console.warn('[AI_REQUEST_RETRY]', fetchUrl === fullUrl ? 'direct_failed_try_proxy' : 'proxy_failed', error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${config.provider} 请求失败`);
};

export type ExternalAITaskType =
  | 'question_generation'
  | 'mistake_analysis'
  | 'reinforcement_generation'
  | 'report_generation'
  | 'unknown';

export const callExternalAIWithConfig = async ({
  taskType,
  prompt,
  modelConfig,
  materialProfile,
  webReferenceContext,
  options,
}: {
  taskType: ExternalAITaskType;
  prompt: { systemPrompt: string; userPrompt: string } | string;
  modelConfig?: RuntimeAIConfig;
  materialProfile?: MaterialProfile | null;
  webReferenceContext?: string;
  options?: { temperature?: number; max_tokens?: number };
}): Promise<unknown | null> => {
  const config = modelConfig || getEffectiveAIConfig();
  const providedPrompt = typeof prompt === 'string'
    ? { systemPrompt: '', userPrompt: prompt }
    : prompt;
  const userPrompt = [
    providedPrompt.userPrompt,
    webReferenceContext
      ? `\n\n【联网增强参考资料】\n${webReferenceContext}\n\n参考联网资料的题型风格，但必须围绕上传资料原创生成，不能照搬原题。`
      : '',
    materialProfile
      ? `\n\n【当前资料主题】${materialProfile.stage}${materialProfile.subject}｜${materialProfile.chapter || ''}｜${materialProfile.topic}｜核心知识点：${materialProfile.coreConcepts.join('、')}`
      : '',
  ].join('');
  const promptLength = providedPrompt.systemPrompt.length + userPrompt.length;

  console.log('[REAL_AI_ENABLED]', config.provider !== 'mock' && Boolean(config.apiKey));
  console.log('[AI_PROVIDER]', config.provider);
  console.log('[AI_BASE_URL]', config.baseUrl || '');
  console.log('[AI_MODEL]', config.model || '');
  console.log('[AI_REQUEST_START]', new Date().toISOString());
  console.log('[AI_PROMPT_LENGTH]', promptLength);

  if (config.provider === 'mock') {
    runtimeStatus = { provider: 'mock', modeLabel: providerLabels.mock, isRealAI: false };
    console.log('[AI_USED_FALLBACK]', true, '原因: 外接 AI 未配置');
    return null;
  }
  if (!config.apiKey) {
    runtimeStatus = { provider: 'mock', modeLabel: 'API 未配置，已回退 Mock', isRealAI: false };
    console.log('[AI_USED_FALLBACK]', true, '原因: 外接 AI API Key 未配置');
    return null;
  }

  const start = Date.now();
  try {
    const temperature = options?.temperature ?? 0.2;
    const rawText = await callUniversalAI({
      config: {
        provider: config.provider === 'mock' ? 'custom' : config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseURL: config.baseUrl,
        apiFormat: config.apiFormat || inferAIFormat(config.provider, config.baseUrl),
        temperature,
        maxTokens: options?.max_tokens,
        timeoutMs: LLM_TIMEOUT_MS,
      },
      taskType,
      messages: [
        ...(providedPrompt.systemPrompt ? [{ role: 'system' as const, content: providedPrompt.systemPrompt }] : []),
        { role: 'user' as const, content: userPrompt },
      ],
    });
    const result = extractJsonFromText(rawText);
    runtimeStatus = {
      provider: config.provider,
      modeLabel: config.label || providerLabels[config.provider],
      isRealAI: true,
    };
    console.log('[AI_RAW_RESPONSE_LENGTH]', JSON.stringify(result).length);
    console.log('[AI_RAW_RESPONSE_PREVIEW]', rawText.slice(0, 500));
    console.log('[AI_GENERATION_TIME]', Date.now() - start, 'ms');
    console.log('[AI_USED_FALLBACK]', false);
    console.log('[AI_TASK_TYPE]', taskType);
    return result;
  } catch (error) {
    console.error('[智学闭环] 外接 AI 调用失败：', error);
    runtimeStatus = {
      provider: config.provider,
      modeLabel: '外接 AI 失败，已切换本地兜底',
      isRealAI: true,
    };
    console.log('[AI_RAW_RESPONSE_LENGTH]', 0);
    console.log('[AI_GENERATION_TIME]', Date.now() - start, 'ms');
    console.log('[AI_ERROR_REASON]', error instanceof Error ? error.message : '外接 AI 请求失败');
    console.log('[AI_USED_FALLBACK]', true, `原因: ${error instanceof Error ? error.message : '外接 AI 请求失败'}`);
    return null;
  }
};

export const callLLMJson = async (
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; max_tokens?: number }
): Promise<unknown | null> =>
  callExternalAIWithConfig({
    taskType: 'unknown',
    prompt: { systemPrompt, userPrompt },
    modelConfig: getEffectiveAIConfig(),
    options,
  });
