import type {
  DiagnosisItem,
  KnowledgePoint,
  LearningReport,
  MaterialInput,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
} from '../types';

export const generateLearningReport = (params: {
  material: MaterialInput;
  knowledgePoints: KnowledgePoint[];
  result: QuizResult;
  diagnosis: DiagnosisItem[];
  reviewPlan: ReviewPlanDay[];
  reinforcementQuiz: ReinforcementQuestion[];
}): LearningReport => {
  const { material, knowledgePoints, result, diagnosis, reviewPlan, reinforcementQuiz } = params;
  const createdAt = new Date().toLocaleString('zh-CN');
  const markdown = `# 智学闭环学习报告

生成时间：${createdAt}

## 学习资料

- 标题：${material.title}
- 输入方式：${material.sourceType === 'sample' ? '示例资料' : material.sourceType === 'file' ? '文件上传' : '文本粘贴'}

## 提取的知识点

${knowledgePoints.map((item) => `- **${item.title}**（重要程度：${item.importance}）：${item.description}；考查方式：${item.examType}`).join('\n')}

## 测评结果

- 总分：${result.score} 分
- 掌握率：${result.masteryRate}%
- 正确题数：${result.correctCount}
- 错误题数：${result.wrongCount}
- 薄弱知识点：${result.weakKnowledgePoints.map((item) => item.title).join('、') || '暂无明显薄弱点'}

## 各知识点掌握情况

${result.byKnowledgePoint.map((item) => `- ${item.knowledgePoint.title}：${item.masteryRate}%（${item.correct}/${item.total}）`).join('\n')}

## 错题诊断

${diagnosis.length > 0 ? diagnosis.map((item) => `- **${item.knowledgePointTitle}**：${item.reasonType}。${item.diagnosis} 建议：${item.suggestion}`).join('\n') : '- 本次测评没有明显错题，建议继续做迁移应用练习。'}

## 3 天个性化复习计划

${reviewPlan.map((day) => `### 第 ${day.day} 天
- 目标：${day.goal}
- 重点：${day.focusKnowledgePoints.join('、')}
- 建议时长：${day.duration}
- 推荐练习：${day.practiceCount} 道
- 方法：${day.method}`).join('\n\n')}

## 强化练习建议

${reinforcementQuiz.map((item) => `- **${item.knowledgePointTitle}**：${item.question} 提示：${item.hint}`).join('\n')}
`;

  return {
    title: `${material.title}学习报告`,
    markdown,
    createdAt,
  };
};

export const downloadMarkdown = (report: LearningReport) => {
  const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report.title}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
