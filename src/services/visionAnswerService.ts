import { getEffectiveAIConfig } from './llmClient';

const dataUrlToInputImage = (imageDataUrl: string) => imageDataUrl;

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
  return parts.join('\n').trim();
};

export const recognizeAnswerFromImage = async (imageDataUrl: string, questionText: string): Promise<string> => {
  const config = getEffectiveAIConfig();
  if (config.provider !== 'openai' || !config.apiKey) {
    throw new Error('当前模型暂不支持图片识别，请切换支持视觉能力的 OpenAI 模型，或手动输入答案。');
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `请识别图片中的学生手写答案。题目是：${questionText}\n只返回识别出的答案文字、公式和步骤，不要评价对错。`,
            },
            {
              type: 'input_image',
              image_url: dataUrlToInputImage(imageDataUrl),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`图片识别失败：${response.status} ${await response.text()}`);
  const text = readOpenAIResponseText(await response.json());
  if (!text) throw new Error('未能从图片中识别到有效答案，请手动输入。');
  return text;
};
