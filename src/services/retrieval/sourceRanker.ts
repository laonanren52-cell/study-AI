/**
 * 来源排序器 - 对检索结果进行可靠性评分和排序
 */
import type { SearchResult } from './searchClient';

export function rankSources(results: SearchResult[]): SearchResult[] {
  return results
    .map(result => {
      let rankBoost = 0;

      // 官方/课程标准/考试院
      if (result.sourceType === '考试院' || result.sourceType === '官方') rankBoost += 30;
      if (/考试院|教育部|课程标准|教学大纲/.test(result.title)) rankBoost += 25;

      // 学校/教研/正规教育平台
      if (result.sourceType === '教育平台') rankBoost += 20;
      if (/教研|学校|中学|教育平台|学科网/.test(result.summary)) rankBoost += 15;

      // 包含真题/高频/考点/题型/易错
      if (/真题|高频|考点|题型|易错|必考|常考/.test(result.title)) rankBoost += 15;
      if (/解题技巧|答题模板|方法|规律/.test(result.summary)) rankBoost += 10;

      // 广告/下载站/无关页面
      if (/广告|下载|免费|天天更新|点击购买/.test(result.summary)) rankBoost -= 30;

      return {
        ...result,
        reliability: Math.max(0, Math.min(100, result.reliability + rankBoost)),
      };
    })
    .sort((a, b) => b.reliability - a.reliability);
}
