/**
 * 检索查询构建器 - 为知识点构建检索查询
 */
export interface ExamSearchParams {
  subject: string;
  grade?: string;
  examType?: string;
  knowledgePoint: string;
  keywords: string[];
}

export function buildExamSearchQueries(params: ExamSearchParams): string[] {
  const { subject, grade, examType, knowledgePoint, keywords } = params;
  const queries: string[] = [];

  // 生成不同类型查询
  const baseParts = [grade, subject].filter(Boolean);
  const examParts = [examType, '典型题型'].filter(Boolean);
  const patternParts = ['高频题型', '易错点', '解题方法'];

  // 组合查询
  if (baseParts.length > 0) {
    queries.push([...baseParts, knowledgePoint, ...examParts].join(' '));
    queries.push([...baseParts, knowledgePoint, '高频', '题型'].join(' '));
    queries.push([...baseParts, knowledgePoint, '常见错误'].join(' '));
  }

  // 关键词组合查询
  if (keywords.length > 0) {
    for (const kw of keywords.slice(0, 3)) {
      queries.push([...baseParts, kw, ...examParts].join(' '));
    }
    queries.push([...baseParts, ...keywords.slice(0, 3), ...examParts].join(' '));
  }

  // 通用查询
  for (const pattern of patternParts) {
    queries.push([...baseParts, knowledgePoint, pattern].join(' '));
  }

  return queries.slice(0, 8);
}
