/**
 * 题型规律抽象模块
 * 从检索来源中抽象出题型结构、考查能力、常见误区和得分点
 * 注意：不能复制原题，只能抽象规律
 */
import type { SearchResult } from './retrieval/searchClient';
import type { KnowledgeCard } from '../types';
import type { ExamTemplate } from './examTemplateLibrary';

export interface ExtractedPattern {
  title: string;
  subject: string;
  grade: string;
  examType: string;
  patternStructure: string;
  testedAbility: string;
  commonMistakes: string[];
  scoringPoints: string[];
  sourceUrls: string[];
  sourceSummaries: string[];
}

export function extractExamPatternsFromSources(
  sources: SearchResult[],
  knowledgeCard: KnowledgeCard,
  templates?: ExamTemplate[]
): ExtractedPattern[] {
  const patterns: ExtractedPattern[] = [];

  // 从检索结果中抽象题型规律
  for (const source of sources) {
    const pattern: ExtractedPattern = {
      title: `${knowledgeCard.title} - ${source.title}`,
      subject: knowledgeCard.subject,
      grade: knowledgeCard.subject === '数学' || knowledgeCard.subject === '物理' ? '高中' :
             knowledgeCard.subject === '语文' ? '初高中' : '高中',
      examType: '高考',
      patternStructure: source.summary || '',
      testedAbility: `能结合具体条件运用${knowledgeCard.title}完成判断和解答`,
      commonMistakes: knowledgeCard.commonMistakes.length > 0
        ? knowledgeCard.commonMistakes
        : ['忽略关键条件', '概念混淆', '应用场景判断错误'],
      scoringPoints: [
        `正确识别${knowledgeCard.title}的考点`,
        `准确运用相关公式或规则`,
        '步骤完整、推理严谨',
        '结论规范、符合学科要求',
      ],
      sourceUrls: [source.url],
      sourceSummaries: [source.summary],
    };

    // 如果有本地模板，融合模板信息
    if (templates && templates.length > 0) {
      const matched = templates.find(t => t.subject === knowledgeCard.subject);
      if (matched) {
        pattern.patternStructure = matched.templateStructure;
        pattern.scoringPoints = [...new Set([...pattern.scoringPoints, ...matched.scoringPoints])];
        pattern.commonMistakes = [...new Set([...pattern.commonMistakes, ...matched.commonMistakes])];
      }
    }

    patterns.push(pattern);
  }

  return patterns;
}
