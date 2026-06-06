import type {
  DiagnosisItem,
  KnowledgePoint,
  LearningReport,
  MaterialInput,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
  QuizQuestion,
} from '../types';
import { inferSubjectType } from './examStrategy';
import type { MaterialProfile } from './materialTopicService';
import { callExternalAIWithConfig, getEffectiveAIConfig } from './llmClient';

export type ReportType = 'student' | 'teacher' | 'parent' | 'blank' | 'blank_paper';

const normalizeReportType = (reportType?: ReportType): 'student' | 'teacher' | 'parent' | 'blank' => (
  reportType === 'blank_paper' ? 'blank' : reportType || 'student'
);

function getMasteryLabel(masteryRate: number): string {
  if (masteryRate >= 80) return '优秀';
  if (masteryRate >= 60) return '良好';
  if (masteryRate >= 40) return '一般';
  return '待加强';
}

function extractWeakPoints(diagnosis: DiagnosisItem[]): string[] {
  const weakTitles = new Set<string>();
  for (const item of diagnosis) {
    if (item.masteryStatus === '薄弱') {
      weakTitles.add(item.knowledgePointTitle);
    }
  }
  return Array.from(weakTitles);
}

export const generateLearningReport = (params: {
  material: MaterialInput;
  knowledgePoints: KnowledgePoint[];
  result: QuizResult;
  diagnosis: DiagnosisItem[];
  reviewPlan: ReviewPlanDay[];
  reinforcementQuiz: ReinforcementQuestion[];
  questions?: QuizQuestion[];
  materialProfile?: MaterialProfile | null;
  reportType?: ReportType;
}): LearningReport => {
  const { material, knowledgePoints, result, diagnosis, reviewPlan, reinforcementQuiz, materialProfile, questions = [] } = params;
  const reportType = normalizeReportType(params.reportType);
  const createdAt = new Date().toLocaleString('zh-CN');
  const subjectType = knowledgePoints[0]?.subjectType || inferSubjectType(material.content);
  const allQuestionsByKp = result.byKnowledgePoint.flatMap((item) => item.knowledgePoint.examPatterns ?? []);
  const patternDistribution = allQuestionsByKp.reduce<Record<string, number>>((acc, pattern) => {
    acc[pattern] = (acc[pattern] ?? 0) + 1;
    return acc;
  }, {});
  const missingRubric = [...new Set(result.wrongQuestions.flatMap((item) => item.missingRubric ?? []))];
  const weakPatterns = [...new Set(result.weakKnowledgePoints.flatMap((item) => item.examPatterns ?? []))];
  const weakPoints = [...new Set([...extractWeakPoints(diagnosis), ...result.weakKnowledgePoints.map((item) => item.title)])].slice(0, 3);
  const goodPoints = result.byKnowledgePoint
    .filter((item) => item.masteryRate >= 70)
    .sort((left, right) => right.masteryRate - left.masteryRate)
    .slice(0, 3);
  const reasonSummary = Object.entries(diagnosis.reduce<Record<string, number>>((summary, item) => {
    summary[item.reasonType] = (summary[item.reasonType] || 0) + 1;
    return summary;
  }, {}));
  const masteryLabel = getMasteryLabel(result.masteryRate);
  const parentFeedback = result.masteryRate >= 80
    ? '本次课后测评整体完成较好，建议继续保持规范作答，并通过少量同类变式巩固稳定性。'
    : `本次学习已经定位出需要继续巩固的内容：${weakPoints.join('、') || '基础知识应用'}。建议按复习计划完成强化题，重点关注审题和解题步骤。`;
  if (reportType === 'blank') {
    return {
      title: `${material.title || '课后测评'}空白试卷`,
      createdAt,
      markdown: `# ${material.title || '课后测评'}空白试卷

生成时间：${createdAt}

${questions.length > 0 ? questions.map((item, index) => `## 第 ${index + 1} 题

${item.question}

${item.options?.length ? item.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`).join('\n') : '\n\n答题区：\n\n\n\n'}`).join('\n\n') : '暂无题目。'}`
    };
  }

  if (reportType === 'parent') {
    return {
      title: `${material.title || '课后学习'}家长反馈`,
      createdAt,
      markdown: `# 家长版课后反馈

生成时间：${createdAt}

## 本节课学习内容

- 学科：${materialProfile?.subject || subjectType}
- 主题：${materialProfile?.topic || material.title || '本次学习资料'}
- 核心知识点：${knowledgePoints.map((item) => item.title).slice(0, 5).join('、') || '本次资料核心内容'}

## 学生表现

- 本次得分：${result.score} 分
- 掌握率：${result.masteryRate}%
- 正确题数：${result.correctCount}
- 错误题数：${result.wrongCount}

## 掌握情况

- 已掌握：${goodPoints.map((item) => item.knowledgePoint.title).join('、') || '暂未形成稳定优势点'}
- 需要关注：${weakPoints.join('、') || result.weakKnowledgePoints.map((item) => item.title).join('、') || '继续巩固基础应用'}

## 需要关注的问题

${diagnosis.length > 0 ? diagnosis.slice(0, 3).map((item) => `- ${item.knowledgePointTitle}：${item.diagnosis}`).join('\n') : '- 本次错题较少，建议继续保持规范作答。'}

## 下次课建议

- 先复盘本次错题，再做同知识点变式训练。
- 重点跟进：${weakPoints.join('、') || '本次资料核心知识点'}。
- 建议完成 ${reinforcementQuiz.length || 3} 道强化题后再进行一次小测。

## 给家长的简短反馈

${parentFeedback}
`,
    };
  }

  if (reportType === 'teacher') {
    return {
      title: `${material.title || '课后测评'}教师版学情报告`,
      createdAt,
      markdown: `# 教师版课后学情报告

生成时间：${createdAt}

## 答题统计

- 总分：${result.score} 分
- 掌握率：${result.masteryRate}%
- 正确题数：${result.correctCount}
- 错误题数：${result.wrongCount}
- 题型分布：${Object.entries(patternDistribution).map(([key, value]) => `${key} ${value}题`).join('、') || '暂无统计'}

## 每个知识点掌握情况

${result.byKnowledgePoint.map((item) => `- ${item.knowledgePoint.title}：${item.masteryRate}%（${item.status}）`).join('\n') || '- 暂无知识点统计'}

## 错因分类

${reasonSummary.length > 0 ? reasonSummary.map(([reason, count]) => `- ${reason}：${count} 次`).join('\n') : '- 本次暂无明显错因聚类'}

## 题型薄弱点

${weakPatterns.length > 0 ? weakPatterns.map((item) => `- ${item}`).join('\n') : '- 暂未发现集中薄弱题型'}

## 后续教学建议

- 优先补讲：${weakPoints.join('、') || result.weakKnowledgePoints.map((item) => item.title).join('、') || '本次资料核心知识点'}
- 课堂处理：先用 1 道例题复盘错因，再安排 2-3 道同知识点变式。
- 作业安排：保留步骤书写要求，重点检查判别式、图像区间、参数条件等关键环节。

## 推荐强化训练方向

${reinforcementQuiz.length > 0 ? reinforcementQuiz.slice(0, 5).map((item, index) => `- ${index + 1}. ${item.knowledgePointTitle}：${item.question}`).join('\n') : '- 暂无强化题，建议先生成复习强化训练。'}

## 推荐补讲内容

${missingRubric.length > 0 ? missingRubric.map((item) => `- ${item}`).join('\n') : '- 重点补讲薄弱知识点的条件识别、解题步骤和规范表达。'}
`,
    };
  }

  const markdown = `# 学生版课后学习报告

生成时间：${createdAt}

## 学习主题

- ${materialProfile?.subject || subjectType}：${materialProfile?.topic || material.title || '本次学习资料'}
- 章节：${materialProfile?.chapter || '未识别'}

## 我的得分和掌握率

- 本次得分：${result.score} 分
- 掌握率：${result.masteryRate}%
- 做对：${result.correctCount} 题
- 做错：${result.wrongCount} 题
- 当前状态：${masteryLabel}

## 我已经掌握的知识点

${goodPoints.length > 0 ? goodPoints.map((item) => `- ${item.knowledgePoint.title}：正确率 ${item.masteryRate}%`).join('\n') : '- 还没有特别稳定的优势点，先把基础题练稳。'}

## 还需要重点练的知识点

${weakPoints.length > 0 ? weakPoints.map((item) => `- ${item}`).join('\n') : '- 暂无明显薄弱知识点，继续保持。'}

## 错题回顾

${diagnosis.length > 0 ? diagnosis.map((item, index) => `### 错题 ${index + 1}
- 题目：${item.question}
- 你错在：${item.diagnosis}
- 对应知识点：${item.knowledgePointTitle}
- 正确方法：${item.suggestion}`).join('\n\n') : '- 本次没有明显错题，建议做 2-3 道变式题保持手感。'}

## 每道题的答案和解析

${questions.length > 0 ? questions.map((item, index) => `### 第 ${index + 1} 题
- 题目：${item.question}
- 标准答案：${item.answer}
- 解析：${item.explanation}
${item.solutionSteps?.length ? `- 标准步骤：${item.solutionSteps.join('；')}` : ''}
${item.scoringRubric?.length ? `- 得分点：${item.scoringRubric.join('；')}` : ''}`).join('\n\n') : '- 暂无题目明细。'}

## 3 天个性化复习计划

${reviewPlan.map((day) => `### 第 ${day.day} 天
- 目标：${day.goal}
- 重点：${day.focusKnowledgePoints.join('、')}
- 建议时长：${day.duration}
- 推荐练习：${day.practiceCount} 道
- 必背公式/定义：${day.mustRemember?.join('；') || '按知识点清单复习'}
- 例题任务：${day.exampleTasks?.join('；') || '完成基础例题'}
- 强化练习：${day.reinforcementTasks?.join('；') || '完成强化题'}
- 常见误区：${day.commonMistakes?.join('；') || '复盘错题'}
- 自测标准：${day.selfCheckCriteria?.join('；') || '能独立复述并完成同类题'}
- 任务清单：${day.checklist?.map((item) => item.text).join('；') || '完成当天任务'}
- 方法：${day.method}`).join('\n\n')}

## 二次强化训练完成情况

- 已安排同知识点强化题：${reinforcementQuiz.length} 道
- 建议学生完成后逐题核对解析，并标记“我已掌握”或“仍需复习”。

## 强化练习建议

${reinforcementQuiz.length > 0 ? reinforcementQuiz.map((item) => `- **${item.knowledgePointTitle}**（${item.examPattern}）：${item.question}
  - 提示：${item.hint}
  - 标准步骤：${item.solutionSteps.join('；')}
  - 得分点：${item.scoringRubric.join('；')}
  - 常见误区：${item.commonMistake}`).join('\n') : '- 尚未生成强化题，建议完成测评后再安排。'}

## 下一步复习建议

- 优先复习：${weakPoints.join('、') || '本次资料核心知识点'}
- 完成二次强化训练后，隔天再做 3 道同知识点变式题。
- 作答时保留关键步骤，避免只写结论。
`;

  return {
    title: `${material.title}${reportType === 'teacher' ? '教师版报告' : '学生版报告'}`,
    markdown,
    createdAt,
  };
};

export const generateAIEnhancedLearningReport = async (params: Parameters<typeof generateLearningReport>[0]): Promise<LearningReport> => {
  if (normalizeReportType(params.reportType) === 'blank') return generateLearningReport(params);
  const local = generateLearningReport(params);
  const aiResult = await callExternalAIWithConfig({
    taskType: 'report_generation',
    prompt: {
      systemPrompt: '你是初高中家教老师的课后报告助手，只输出 JSON。',
      userPrompt: `请生成${params.reportType === 'teacher' ? '教师版' : params.reportType === 'parent' ? '家长版' : '学生版'}学习报告 Markdown。
学生版必须包含：题目、答案、解析、错因、复习建议。
教师版必须包含：答题统计、薄弱知识点、错因分类、教学建议。
家长版必须包含：本节课学习内容、学生表现、掌握情况、需要关注的问题、下次课建议，语气专业、简洁、温和。
禁止空泛套话，必须绑定当前题目、错因和薄弱知识点。
输出格式：{"title":"","markdown":""}

数据：
${JSON.stringify(params, null, 2)}`,
    },
    modelConfig: getEffectiveAIConfig(),
    materialProfile: params.materialProfile,
  });
  const record = aiResult as Record<string, unknown> | null;
  if (record && typeof record.markdown === 'string' && record.markdown.length > 200) {
    return {
      title: String(record.title || local.title),
      markdown: record.markdown,
      createdAt: new Date().toLocaleString('zh-CN'),
    };
  }
  return local;
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

export const downloadWordReport = async (report: LearningReport) => {
  const { Document, HeadingLevel, Packer, Paragraph } = await import('docx');
  const title = report.title || '学习报告';
  const children = report.markdown.split('\n').map((line) => {
    if (line.startsWith('# ')) return new Paragraph({ text: line.replace(/^#\s+/, ''), heading: HeadingLevel.HEADING_1 });
    if (line.startsWith('## ')) return new Paragraph({ text: line.replace(/^##\s+/, ''), heading: HeadingLevel.HEADING_2 });
    if (line.startsWith('### ')) return new Paragraph({ text: line.replace(/^###\s+/, ''), heading: HeadingLevel.HEADING_3 });
    return new Paragraph(line || ' ');
  });

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
