import type { DiagnosisItem, KnowledgePoint, QuizQuestion, QuizResult, UserAnswer } from '../types';

const baseSystemPrompt = '你是严谨的中文教学测评命题专家。你必须只输出 JSON，不要输出 Markdown、解释性前言或代码块。';

export const buildKnowledgePrompt = (materialText: string) => ({
  systemPrompt: baseSystemPrompt,
  userPrompt: `请基于以下学习资料提取 4-8 个知识点。不得编造资料外知识。每个知识点必须包含 id、title、description、importance、masteryTarget、examType、sourceEvidence、keywords。

要求：
1. title 必须是完整名词短语，不要使用碎片词、页码、目录、谢谢观看。
2. description 用完整中文句子概括。
3. sourceEvidence 必须引用资料中能支撑该知识点的原句或近似原文。
4. keywords 是 2-5 个关键词。
5. importance 只能是“高”“中”“低”。

输出 JSON：
{
  "knowledgePoints": [
    {
      "id": "kp-1",
      "title": "知识点标题",
      "description": "完整解释",
      "importance": "高",
      "masteryTarget": "建议掌握程度",
      "examType": "可能考查方式",
      "sourceEvidence": "资料依据句",
      "keywords": ["关键词1", "关键词2"]
    }
  ]
}

学习资料：
${materialText.slice(0, 16000)}`,
});

export const buildQuizPrompt = (materialText: string, knowledgePoints: KnowledgePoint[]) => ({
  systemPrompt: baseSystemPrompt,
  userPrompt: `请基于用户资料和知识点生成高质量测评题。必须只基于资料，不得编造资料外知识。

必须输出 10 道题：5 道单选题、3 道判断题、2 道简答题。

单选题要求：
1. 题干必须完整，不能是碎片。
2. options 必须有 4 个完整句子。
3. 正确答案必须是 options 中的完整句子。
4. 干扰项必须合理但与资料不一致。
5. 不得把关键词、知识点标题、页码、残句直接当选项。
6. 不得出现“无关干扰项”“资料背景信息”等假选项。

判断题要求：
1. 题干必须是完整判断句。
2. answer 只能是“正确”或“错误”。

简答题要求：
1. 题干必须可回答。
2. answer 是参考答案。

每道题必须包含 explanation 和 sourceEvidence。
difficulty 只能是“简单”“中等”“较难”。

输出 JSON：
{
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "question": "完整题干",
      "options": ["完整选项A", "完整选项B", "完整选项C", "完整选项D"],
      "answer": "完整选项A",
      "explanation": "解析",
      "knowledgePointId": "kp-1",
      "difficulty": "简单",
      "sourceEvidence": "资料中的依据句"
    }
  ]
}

知识点：
${JSON.stringify(knowledgePoints, null, 2)}

学习资料：
${materialText.slice(0, 16000)}`,
});

export const buildDiagnosisPrompt = (
  result: QuizResult,
  questions: QuizQuestion[],
  answers: UserAnswer[],
) => ({
  systemPrompt: baseSystemPrompt,
  userPrompt: `请基于测评结果生成错因诊断。只输出 JSON。

输出 JSON：
{
  "diagnosis": [
    {
      "id": "diag-q1",
      "questionId": "q1",
      "question": "题干",
      "knowledgePointTitle": "知识点",
      "reasonType": "概念混淆",
      "diagnosis": "诊断说明",
      "correctUnderstanding": "正确理解",
      "suggestion": "复习建议"
    }
  ]
}

reasonType 只能从以下值中选择：概念混淆、关键词遗漏、应用场景判断错误、记忆不牢固、表达不完整。

测评结果：
${JSON.stringify(result, null, 2)}

题目：
${JSON.stringify(questions, null, 2)}

用户答案：
${JSON.stringify(answers, null, 2)}`,
});

export type DiagnosisPromptPayload = {
  diagnosis: DiagnosisItem[];
};
