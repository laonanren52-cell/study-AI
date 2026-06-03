/**
 * 检索客户端 - 连接到公开教育资源
 * 黑客松阶段使用 mockSearch，预留 realSearch 接口
 */
import type { ExamSearchParams } from './queryBuilder';
import { buildExamSearchQueries } from './queryBuilder';

export interface SearchResult {
  title: string;
  summary: string;
  url: string;
  sourceType: '官方' | '教育平台' | '教育资源站' | '题库' | '考试院';
  reliability: number; // 0-100
}

// ========== Mock 搜索 ==========

const MOCK_RESULTS: Record<string, SearchResult[]> = {
  '数学': [
    { title: '高中数学三角函数高频题型归纳', summary: '同角三角函数基本关系、诱导公式、图像性质等高考高频考点题型总结', url: 'https://example.com/math/trigonometry', sourceType: '教育平台', reliability: 80 },
    { title: '高考数学必备：二次函数顶点与最值', summary: '二次函数解析式、顶点坐标公式、配方法求最值完整步骤', url: 'https://example.com/math/quadratic', sourceType: '教育资源站', reliability: 75 },
    { title: '中考数学方程与不等式解题技巧', summary: '一元二次方程求解、不等式解法、应用题建模全攻略', url: 'https://example.com/math/equations', sourceType: '教育平台', reliability: 70 },
  ],
  '语文': [
    { title: '中考语文标点符号用法全解', summary: '顿号、逗号、分号、书名号、引号的正确使用规则与常见错误', url: 'https://example.com/chinese/punctuation', sourceType: '教育平台', reliability: 85 },
    { title: '高考语文病句修改六大类型', summary: '成分残缺、搭配不当、语序不当、句式杂糅、表意不明、不合逻辑', url: 'https://example.com/chinese/errors', sourceType: '教育平台', reliability: 80 },
    { title: '初中语文阅读理解答题模板', summary: '概括主旨、分析作用、鉴赏语言、评价观点等题型答题方法', url: 'https://example.com/chinese/reading', sourceType: '教育资源站', reliability: 75 },
  ],
  '英语': [
    { title: '高考英语阅读理解五大题型', summary: '主旨大意题、细节理解题、推理判断题、词义猜测题、作者态度题解题技巧', url: 'https://example.com/english/reading', sourceType: '教育平台', reliability: 80 },
    { title: '中考英语语法单选高频考点', summary: '时态语态、非谓语动词、定语从句、主谓一致核心语法点', url: 'https://example.com/english/grammar', sourceType: '教育资源站', reliability: 75 },
  ],
  '物理': [
    { title: '高中物理牛顿运动定律题型分类', summary: '受力分析、整体隔离法、连接体问题、临界问题全面解析', url: 'https://example.com/physics/newton', sourceType: '教育平台', reliability: 80 },
    { title: '中考物理电路分析专题', summary: '串并联电路识别、欧姆定律应用、电功率计算核心题型', url: 'https://example.com/physics/circuit', sourceType: '教育资源站', reliability: 75 },
  ],
  '化学': [
    { title: '高中化学方程式书写与配平', summary: '氧化还原配平、离子方程式书写、反应条件判断全攻略', url: 'https://example.com/chemistry/equations', sourceType: '教育平台', reliability: 80 },
    { title: '中考化学离子共存与推断', summary: '离子共存条件、物质推断题解题思路与常见陷阱', url: 'https://example.com/chemistry/ions', sourceType: '教育资源站', reliability: 75 },
  ],
  '生物': [
    { title: '高中生物孟德尔遗传定律专项', summary: '分离定律、自由组合定律、遗传系谱图分析与计算', url: 'https://example.com/biology/genetics', sourceType: '教育平台', reliability: 80 },
    { title: '中考生物细胞结构与功能', summary: '动植物细胞结构对比、细胞器功能、细胞分裂过程全解', url: 'https://example.com/biology/cell', sourceType: '教育资源站', reliability: 75 },
  ],
  '历史': [
    { title: '中考历史时间线与重要事件', summary: '中国古代史、近代史时间轴梳理及因果关系分析', url: 'https://example.com/history/timeline', sourceType: '教育平台', reliability: 80 },
  ],
  '政治': [
    { title: '高中政治材料分析题答题思路', summary: '观点归纳、理论联系实际、措施建议类题型解题模板', url: 'https://example.com/politics/material', sourceType: '教育平台', reliability: 80 },
  ],
};

export async function searchExamResources(queries: string[]): Promise<SearchResult[]> {
  // 尝试真实搜索（预留接口，当前未接通）
  try {
    // const results = await realSearch(queries);
    // return results;
    return mockSearch(queries);
  } catch {
    return mockSearch(queries);
  }
}

export async function mockSearch(queries: string[]): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const keyword = Object.keys(MOCK_RESULTS).find(k => query.includes(k));
    if (keyword) {
      for (const result of MOCK_RESULTS[keyword]) {
        if (!seen.has(result.title)) {
          seen.add(result.title);
          results.push(result);
        }
      }
    }
  }

  return results.slice(0, 5);
}

/**
 * 真实搜索接口 - 预留 Tavily / Bing / SerpAPI
 * 黑客松阶段不做强制接通
 */
export async function realSearch(queries: string[]): Promise<SearchResult[]> {
  // TODO: 接入 Tavily Search API
  // TODO: 接入 Bing Search API
  // TODO: 接入 SerpAPI
  return mockSearch(queries);
}
