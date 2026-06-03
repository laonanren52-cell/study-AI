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
import { formatFileSize } from '../utils/textClean';
import { inferSubjectType } from './examStrategy';
import type { MaterialProfile } from './materialTopicService';
import { callExternalAIWithConfig, getEffectiveAIConfig } from './llmClient';

const fileTypeLabel = {
  txt: 'TXT',
  pdf: 'PDF',
  docx: 'Word .docx',
  pptx: 'PPT .pptx',
  image: '图片',
};

const sourceLabel = {
  sample: '示例资料',
  file: '文件上传',
  text: '文本粘贴',
};

const buildMaterialSourceLines = (material: MaterialInput) => {
  const lines = [`- 输入方式：${sourceLabel[material.sourceType]}`];
  if (material.fileName) lines.push(`- 文件名：${material.fileName}`);
  if (material.fileType) lines.push(`- 文件类型：${fileTypeLabel[material.fileType]}`);
  if (typeof material.fileSize === 'number') lines.push(`- 文件大小：${formatFileSize(material.fileSize)}`);
  if (typeof material.wordCount === 'number') lines.push(`- 提取字数：${material.wordCount}`);
  if (typeof material.pageCount === 'number') lines.push(`- 页数：${material.pageCount}`);
  if (typeof material.slideCount === 'number') lines.push(`- PPT 页数：${material.slideCount}`);
  if (material.sourceType === 'text') lines.push('- 来源说明：用户手动粘贴或编辑的文本内容');
  if (material.sourceType === 'sample') lines.push(`- 来源说明：系统内置《${material.title}》示例资料`);
  return lines.join('\n');
};

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
  reportType?: 'student' | 'teacher' | 'blank';
}): LearningReport => {
  const { material, knowledgePoints, result, diagnosis, reviewPlan, reinforcementQuiz, materialProfile, questions = [], reportType = 'student' } = params;
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
  const aiSummarySection = `## 本次学习总览

> 总分 **${result.score}** 分 | 正确率 **${result.masteryRate}%** | 知识点数 **${knowledgePoints.length}** | 掌握程度 **${masteryLabel}**

### 核心薄弱点

${weakPoints.length > 0 ? weakPoints.map((wp) => `- ${wp}`).join('\n') : '- 暂无薄弱知识点，继续保持！'}

### 提升建议

1. 重点复习薄弱知识点，确保核心概念理解到位
2. 每天完成 3-5 道针对性练习题，巩固易错题型
3. 按照复习计划执行，3 天后重新测评检验效果

`;
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

  const markdown = `# ${reportType === 'teacher' ? '教师版课后学情报告' : '学生版课后学习报告'}

生成时间：${createdAt}

${aiSummarySection}
## 学习资料

- 标题：${material.title}
- 学科类型：${materialProfile?.subject || subjectType}
- 资料章节：${materialProfile?.chapter || '未识别'}
- 资料主题：${materialProfile?.topic || '未识别'}

## 学习资料来源

${buildMaterialSourceLines(material)}

## 提取的知识点

${knowledgePoints.map((item) => `- **${item.title}**（重要程度：${item.importance}）：${item.description}；考查方式：${item.examType}`).join('\n')}

## 测评结果

- 总分：${result.score} 分
- 掌握率：${result.masteryRate}%
- 正确题数：${result.correctCount}
- 错误题数：${result.wrongCount}
- 薄弱知识点：${result.weakKnowledgePoints.map((item) => item.title).join('、') || '暂无明显薄弱点'}
- 薄弱题型：${weakPatterns.join('、') || '暂无明显薄弱题型'}
- 缺失得分点：${missingRubric.join('；') || '暂无明显缺失得分点'}

## 题型分布

${Object.keys(patternDistribution).length > 0 ? Object.entries(patternDistribution).map(([pattern, count]) => `- ${pattern}：${count}`).join('\n') : '- 暂无题型分布数据'}

## 各知识点掌握情况

${result.byKnowledgePoint.map((item) => `- ${item.knowledgePoint.title}：${item.masteryRate}%（${item.correct}/${item.total}）`).join('\n')}

## 掌握较好的知识点

${goodPoints.length > 0 ? goodPoints.map((item) => `- ${item.knowledgePoint.title}：正确率 ${item.masteryRate}%`).join('\n') : '- 暂无特别突出的知识点，建议先完成基础巩固。'}

## 错题回顾

${diagnosis.length > 0 ? diagnosis.map((item) => `- **${item.knowledgePointTitle}**：${item.question}。本次作答问题：${item.diagnosis}`).join('\n') : '- 本次测评没有明显错题。'}

## 题目、答案与解析

${reportType === 'student' && questions.length > 0 ? questions.map((item, index) => `### 第 ${index + 1} 题
- 题目：${item.question}
- 标准答案：${item.answer}
- 解析：${item.explanation}
${item.solutionSteps?.length ? `- 标准步骤：${item.solutionSteps.join('；')}` : ''}
${item.scoringRubric?.length ? `- 得分点：${item.scoringRubric.join('；')}` : ''}`).join('\n\n') : reportType === 'teacher' ? '- 教师版重点呈现统计、错因和教学建议，题目详解见学生版。' : ''}

## 错题诊断

${diagnosis.length > 0 ? diagnosis.map((item) => `- **${item.knowledgePointTitle}**：${item.reasonType}。${item.diagnosis} 建议：${item.suggestion}`).join('\n') : '- 本次测评没有明显错题，建议继续做迁移应用练习。'}

## 错因总结

${reasonSummary.length > 0 ? reasonSummary.map(([reason, count]) => `- ${reason}：${count} 题`).join('\n') : '- 本次没有明显错因，建议继续保持。'}

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

## 给家长的简短反馈

${parentFeedback}
`;

  return {
    title: `${material.title}${reportType === 'teacher' ? '教师版报告' : '学生版报告'}`,
    markdown,
    createdAt,
  };
};

export const generateAIEnhancedLearningReport = async (params: Parameters<typeof generateLearningReport>[0]): Promise<LearningReport> => {
  if (params.reportType === 'blank') return generateLearningReport(params);
  const local = generateLearningReport(params);
  const aiResult = await callExternalAIWithConfig({
    taskType: 'report_generation',
    prompt: {
      systemPrompt: '你是初高中家教老师的课后报告助手，只输出 JSON。',
      userPrompt: `请生成${params.reportType === 'teacher' ? '教师版' : '学生版'}学习报告 Markdown。
学生版必须包含：题目、答案、解析、错因、复习建议。
教师版必须包含：答题统计、薄弱知识点、错因分类、教学建议。
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

export const downloadWordReport = async (params: {
  material: MaterialInput;
  knowledgePoints: KnowledgePoint[];
  result: QuizResult;
  diagnosis: DiagnosisItem[];
  reviewPlan: ReviewPlanDay[];
  reinforcementQuiz: ReinforcementQuestion[];
  materialProfile?: MaterialProfile | null;
}) => {
  const { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import('docx');
  const { material, knowledgePoints, result, diagnosis, reviewPlan, reinforcementQuiz, materialProfile } = params;
  const subjectType = knowledgePoints[0]?.subjectType || inferSubjectType(material.content);
  const title = `${material.title || '课后辅导'}课后学习反馈报告`;
  const weakPoints = [...new Set([...extractWeakPoints(diagnosis), ...result.weakKnowledgePoints.map((item) => item.title)])].slice(0, 3);
  const masteryLabel = getMasteryLabel(result.masteryRate);
  const tableCell = (text: string) => new TableCell({
    children: [new Paragraph({ children: [new TextRun(String(text || '-'))] })],
  });
  const table = (rows: string[][]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row) => new TableRow({ children: row.map(tableCell) })),
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: '智学闭环', heading: HeadingLevel.TITLE }),
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph(`生成时间：${new Date().toLocaleString('zh-CN')}`),
          new Paragraph(`学科类型：${materialProfile?.subject || subjectType}`),
          new Paragraph(`资料主题：${materialProfile?.topic || '未识别'}`),
          new Paragraph({ text: '本次学习总览', heading: HeadingLevel.HEADING_2 }),
          table([
            ['总分', `${result.score}`],
            ['掌握率', `${result.masteryRate}%`],
            ['知识点数', `${knowledgePoints.length}`],
            ['掌握程度', masteryLabel],
          ]),
          new Paragraph({ text: '核心薄弱点', heading: HeadingLevel.HEADING_3 }),
          ...(weakPoints.length > 0
            ? weakPoints.map((wp) => new Paragraph(`- ${wp}`))
            : [new Paragraph('- 暂无薄弱知识点，继续保持！')]),
          new Paragraph({ text: '提升建议', heading: HeadingLevel.HEADING_3 }),
          new Paragraph('1. 重点复习薄弱知识点，确保核心概念理解到位'),
          new Paragraph('2. 每天完成 3-5 道针对性练习题，巩固易错题型'),
          new Paragraph('3. 按照复习计划执行，3 天后重新测评检验效果'),
          new Paragraph({ text: '一、学习资料信息', heading: HeadingLevel.HEADING_2 }),
          table([
            ['资料标题', material.title || '-'],
            ['输入方式', sourceLabel[material.sourceType]],
            ['文件名', material.fileName || '-'],
            ['文件类型', material.fileType ? fileTypeLabel[material.fileType] : '-'],
            ['提取字数', typeof material.wordCount === 'number' ? String(material.wordCount) : '-'],
          ]),
          new Paragraph({ text: '二、测评概览', heading: HeadingLevel.HEADING_2 }),
          table([
            ['总分', `${result.score}`],
            ['掌握率', `${result.masteryRate}%`],
            ['正确题数', `${result.correctCount}`],
            ['错误题数', `${result.wrongCount}`],
          ]),
          new Paragraph({ text: '三、知识点掌握情况', heading: HeadingLevel.HEADING_2 }),
          table([
            ['知识点', '掌握率', '答对/总数'],
            ...result.byKnowledgePoint.map((item) => [item.knowledgePoint.title, `${item.masteryRate}%`, `${item.correct}/${item.total}`]),
          ]),
          new Paragraph({ text: '四、错题诊断表', heading: HeadingLevel.HEADING_2 }),
          table([
            ['知识点', '错因类型', '缺失得分点', '复习建议'],
            ...(diagnosis.length ? diagnosis.map((item) => [
              item.knowledgePointTitle,
              item.reasonType,
              item.missingRubric?.join('；') || '-',
              item.suggestion,
            ]) : [['暂无明显错题', '-', '-', '继续进行迁移训练']]),
          ]),
          new Paragraph({ text: '五、3 天复习计划', heading: HeadingLevel.HEADING_2 }),
          table([
            ['天数', '今日目标', '任务清单', '预计用时'],
            ...reviewPlan.map((day) => [
              `第 ${day.day} 天`,
              day.goal,
              day.checklist?.map((item) => item.text).join('；') || day.method,
              day.duration,
            ]),
          ]),
          new Paragraph({ text: '六、强化训练任务', heading: HeadingLevel.HEADING_2 }),
          table([
            ['薄弱知识点', '题型', '难度', '常见误区'],
            ...reinforcementQuiz.map((item) => [item.knowledgePointTitle, item.examPattern, item.difficulty, item.commonMistake]),
          ]),
          new Paragraph({ text: '七、学习建议', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('建议先复盘缺失得分点，再完成同类变式训练。数学、物理、化学类题目重点检查公式、条件和步骤；语文类题目重点检查语境、规则和材料依据。'),
          new Paragraph({ text: '八、给家长的简短反馈', heading: HeadingLevel.HEADING_2 }),
          new Paragraph(result.masteryRate >= 80
            ? '本次课后测评整体完成较好，建议继续保持规范作答，并通过少量同类变式巩固稳定性。'
            : `本次学习已经定位出需要继续巩固的内容：${weakPoints.join('、') || '基础知识应用'}。建议按复习计划完成强化题，重点关注审题和解题步骤。`),
        ],
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
