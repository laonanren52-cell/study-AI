import type { AIProvider, AIStatus } from '../types';

const providerLabels: Record<AIProvider, string> = {
  mock: 'Mock 演示模式',
  openai: 'OpenAI API 已启用',
  deepseek: 'DeepSeek API 已启用',
  qwen: 'Qwen API 已启用',
};

const normalizeProvider = (value: string | undefined): AIProvider => {
  if (value === 'openai' || value === 'deepseek' || value === 'qwen') return value;
  return 'mock';
};

export const getConfiguredProvider = (): AIProvider => normalizeProvider(import.meta.env.VITE_AI_PROVIDER);

const providerConfig = {
  openai: {
    key: import.meta.env.VITE_OPENAI_API_KEY,
    model: import.meta.env.VITE_OPENAI_MODEL || 'gpt-4.1-mini',
    baseUrl: import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },
  deepseek: {
    key: import.meta.env.VITE_DEEPSEEK_API_KEY,
    model: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  },
  qwen: {
    key: import.meta.env.VITE_QWEN_API_KEY,
    model: import.meta.env.VITE_QWEN_MODEL || 'qwen-plus',
    baseUrl: import.meta.env.VITE_QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
};

let runtimeStatus: AIStatus = (() => {
  const provider = getConfiguredProvider();
  if (provider === 'mock') return { provider, modeLabel: providerLabels.mock, isRealAI: false };
  const config = providerConfig[provider];
  if (!config.key) return { provider: 'mock', modeLabel: 'API 未配置，已回退 Mock', isRealAI: false };
  return { provider, modeLabel: providerLabels[provider], isRealAI: true };
})();

export const getAIStatus = (): AIStatus => runtimeStatus;

export const hasRealAIConfig = () => {
  const provider = getConfiguredProvider();
  if (provider === 'mock') return false;
  return Boolean(providerConfig[provider].key);
};

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

const callOpenAI = async (systemPrompt: string, userPrompt: string) => {
  const config = providerConfig.openai;
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: `${systemPrompt}\n\n${userPrompt}`,
      temperature: 0.2,
      text: { format: { type: 'json_object' } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI 请求失败：${response.status} ${await response.text()}`);
  return extractJsonFromText(readOpenAIResponseText(await response.json()));
};

const callOpenAICompatible = async (provider: 'deepseek' | 'qwen', systemPrompt: string, userPrompt: string) => {
  const config = providerConfig[provider];
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error(`${provider} 请求失败：${response.status} ${await response.text()}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`${provider} 响应中没有 message.content。`);
  return extractJsonFromText(content);
};

export const callLLMJson = async (systemPrompt: string, userPrompt: string): Promise<unknown | null> => {
  const provider = getConfiguredProvider();
  if (provider === 'mock') {
    runtimeStatus = { provider: 'mock', modeLabel: providerLabels.mock, isRealAI: false };
    return null;
  }
  if (!hasRealAIConfig()) {
    runtimeStatus = { provider: 'mock', modeLabel: 'API 未配置，已回退 Mock', isRealAI: false };
    return null;
  }

  try {
    const result = provider === 'openai' ? await callOpenAI(systemPrompt, userPrompt) : await callOpenAICompatible(provider, systemPrompt, userPrompt);
    runtimeStatus = { provider, modeLabel: providerLabels[provider], isRealAI: true };
    return result;
  } catch (error) {
    console.error('[智学闭环] LLM 调用失败，已回退 Mock：', error);
    runtimeStatus = { provider: 'mock', modeLabel: 'API 请求失败，已回退 Mock', isRealAI: false };
    return null;
  }
};
