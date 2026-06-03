import type { QuizQuestion, QuestionQualityReview, SubjectType } from '../types';

// 禁止的万能题干模式
const BANNED_QUESTION_PATTERNS = [
  '下列说法正确的是',
  '下列理解恰当的是',
  /关于.*以下说法正确的是/,
  /关于.*正确的一项是/,
  /根据以下语境.*正确的一项是/,
  '以下关于.*的描述.*正确的是',
  '根据原文.*下列选项正确的是',
  '下列选项中.*符合原文的是',
  '为什么重要',
  '请谈谈理解',
  '有什么意义',
  /关于xxx下列说法正确的是/,
  /关于xxx以下说法正确的是/,
  '请解释为什么重要',
  '与该考点无关',
  '以上都不对',
  '与该考点无关的内容',
  '该考点的常见误区',
  /关于.*的深入理解/,
  /理解了.*核心含义/,
  '分析正确',
  /用法正确，体现了/,
  '脱离材料内容',
  '凭印象进行判断',
  '在任何情况下都可以使用',
  '只需要记住',
  '没有使用限制',
  'Correct understanding',
  'Misinterpretation of the main point',
  'Incorrect interpretation',
];

// 禁止的万能干扰项模式
const BANNED_OPTION_PATTERNS = [
  '以上都不对',
  '与该考点无关的内容',
  '与该考点无关',
  '该考点的常见误区',
  '以上选项均不正确',
  '对该考点的错误理解',
  '与该考点无关的干扰项',
  '常见的误解之一',
  '在任何情况下都可以使用',
  '只需要记住',
  '没有使用限制',
  'Correct understanding',
  'Misinterpretation of the main point',
  'Incorrect interpretation',
];


// ========== 学科判断辅助函数 ==========

const isMathSubject = (question: QuizQuestion): boolean => {
  const mathPatterns = ['公式套用', '条件辨析', '综合解答', '运算'];
  return mathPatterns.some(p => question.examPattern?.includes(p)) ||
    question.requiredMethods?.some(m => ['求导', '积分', '矩阵运算', '方程求解'].some(p => m.includes(p))) ||
    false;
};

const isChineseSubject = (question: QuizQuestion): boolean => {
  const chineseSubjects = ['语文'];
  const chinesePatterns = ['材料分析', '词句理解', '文意分析', '主旨概括'];
  return chineseSubjects.some(s => question.knowledgePointId?.includes(s)) ||
    chinesePatterns.some(p => question.examPattern?.includes(p)) ||
    false;
};

const isEnglishSubject = (question: QuizQuestion): boolean => {
  const englishPatterns = ['阅读理解', '细节', '推断', '词义猜测', '语法选择'];
  return englishPatterns.some(p => question.examPattern?.includes(p)) ||
    /passage|paragraph|sentence|reading|vocabulary/i.test(question.question) ||
    false;
};


// 审查题目质量
export const reviewQuestionQuality = (question: QuizQuestion): QuestionQualityReview => {
  const problems: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // 1. 题干多样化检查（25分）- 最高优先级
  const hasBannedPattern = BANNED_QUESTION_PATTERNS.some(pattern => {
    try {
      return new RegExp(pattern).test(question.question);
    } catch {
      return typeof pattern === 'string' ? question.question.includes(pattern) : false;
    }
  });
  if (hasBannedPattern) {
    score -= 25;
    problems.push('题干使用了禁止的万能格式（如"下列说法正确的是"），缺乏具体考查目标');
    suggestions.push('基于原文具体内容改写题干，如"根据原文第X段，关于XXX的描述，错误的一项是"');
  }

  // 2. 题干具体性检查（15分）
  if (!question.knowledgePointId || question.question.length < 15) {
    score -= 15;
    problems.push('题干不够具体，考点不明确');
    suggestions.push('基于资料原文改写题干，明确考查点');
  }

  // 3. 符合考试题型（10分）
  if (!question.examPattern) {
    score -= 10;
    problems.push('未明确考试题型');
    suggestions.push('明确标注题型，如公式套用题、条件辨析题等');
  }

  // 4. 干扰项质量检查（25分）- 核心检查
  if (question.type === 'single' && question.options && question.options.length >= 4) {
    // 4.1 检查禁止的干扰项
    const hasBannedOption = question.options.some(opt =>
      BANNED_OPTION_PATTERNS.some(pat => opt.includes(pat))
    );
    if (hasBannedOption) {
      score -= 25;
      problems.push('干扰项包含禁止的废话（如"以上都不对""与该考点无关的内容"），不构成有效干扰');
      suggestions.push('所有干扰项必须从原文合理改编，是真实的有迷惑性的错误');
    }

    // 4.2 检查是否有明显不符合常识的干扰项
    const hasObviousWrong = question.options.some(opt =>
      (opt.includes('只要') && opt.includes('就可以')) ||
      (opt.includes('不需要') && opt.length < 15) ||
      (opt.includes('只能') && opt.includes('不能')) ||
      opt.includes('从来没有') ||
      opt.includes('完全不可能') ||
      (opt.length < 8 && !/[0-9=+\-*/²√]|sin|cos|tan|cot|正确|错误/i.test(opt))
    );
    if (hasObviousWrong && !hasBannedOption) {
      score -= 15;
      problems.push('干扰项存在明显不符合常识的内容，学生无需思考即可排除');
      suggestions.push('所有干扰项必须100%来自原文内容，使用偷换概念、扩大范围、因果倒置等错误类型');
    }

    // 4.3 检查选项是否过于相似或重复
    const optionTexts = question.options.map(opt =>
      opt.replace(/^[A-D][.、]\s*/, '').replace(/\s+/g, '')
    );
    const uniqueOptions = new Set(optionTexts);
    if (uniqueOptions.size < question.options.length) {
      score -= 15;
      problems.push('选项存在重复或过于相似');
      suggestions.push('确保四个选项内容有明显区分度');
    }

    // 4.4 检查正确答案是否明显最长（特殊语言特征）
    const answerOpt = question.options.find(opt => {
      const cleaned = opt.replace(/^[A-D][.、]\s*/, '');
      return cleaned === question.answer || opt.startsWith(question.answer);
    });
    if (answerOpt) {
      const correctLen = answerOpt.replace(/^[A-D][.、]\s*/, '').length;
      const otherLens = question.options
        .filter(o => o !== answerOpt)
        .map(o => o.replace(/^[A-D][.、]\s*/, '').length);
      if (otherLens.length > 0) {
        const avgLen = otherLens.reduce((s, l) => s + l, 0) / otherLens.length;
        if (correctLen > avgLen * 1.5) {
          score -= 10;
          problems.push('正确答案明显比其他选项长，具有特殊语言特征');
          suggestions.push('调整选项长度，使正确答案不因长度而被轻易识别');
        }
      }
    }

    // 4.5 检查所有选项是否来自同一模板（如"只需要……""不需要……"）
    const hasSameTemplate = checkSameTemplate(question.options);
    if (hasSameTemplate) {
      score -= 20;
      problems.push('所有选项都来自同一模板（如"只需要……/不需要……"），缺乏真实干扰性');
      suggestions.push('选项应该来自不同角度的真实错误，不能是格式化的模板');
    }
  }

  // 5. 数学题专项检查
  if (isMathSubject(question)) {
    const hasSpecificValue = /[0-9]+/.test(question.question) ||
      (question.options?.some(opt => /[0-9]+/.test(opt))) ||
      (question.solutionSteps && question.solutionSteps.length > 0);

    if (!hasSpecificValue) {
      // 数学题如果没有具体数值，除非是纯概念基础题，否则扣分
      const isPureConcept = question.examPattern === '基础概念题';
      if (!isPureConcept) {
        score -= 15;
        problems.push('数学题缺少具体数值、条件或公式推导，纯文字概念无法构成有效计算题');
        suggestions.push('数学题必须包含具体数值或条件，如"已知x=5"、"在△ABC中"等');
      }
    }

    // 数学解答题必须有 solutionSteps
    if (question.type === 'solution' || question.type === 'material') {
      if (!question.solutionSteps || question.solutionSteps.length === 0) {
        score -= 15;
        problems.push('解答题/材料分析题缺少标准解题步骤');
        suggestions.push('必须包含完整的 solutionSteps，如"识别条件→选择公式→代入计算→检验结论"');
      }
    }
  }

  // 6. 简答题/材料分析题必须要有 scoringRubric
  if (question.type === 'short' || question.type === 'fill' || question.type === 'solution' || question.type === 'material') {
    if (!question.scoringRubric || question.scoringRubric.length === 0) {
      score -= 15;
      problems.push('主观题缺少得分点，无法评分');
      suggestions.push('必须包含 scoringRubric，列出每个得分步骤');
    }
  }

  // 7. 解析质量检查（15分）
  if (!question.explanation || question.explanation.length < 30) {
    score -= 15;
    problems.push('解析过于简单，无法教会学生');
    suggestions.push('解析应包含：考点定位、解题思路、关键步骤、原文依据');
  }

  // 8. 得分点和常见误区（10分）
  if (!question.scoringRubric || question.scoringRubric.length === 0) {
    score -= 10;
    problems.push('缺少得分点');
    suggestions.push('明确列出每个得分点');
  }
  if (!question.commonMistake || question.commonMistake.length < 10) {
    score -= 10;
    problems.push('缺少常见误区提示或过于简略');
    suggestions.push('添加具体的学生常见错误提示，不能是模板废话');
  }

  // 9. 原文依据检查（10分）
  if (!question.sourceEvidence || question.sourceEvidence.length < 10) {
    score -= 10;
    problems.push('缺少原文依据或依据过于简略');
    suggestions.push('添加题目对应的原文具体句子作为依据');
  }

  // 10. 命题蓝图字段完整性（10分）
  const hasBlueprintFields = question.blueprintId &&
    question.targetAbility &&
    question.requiredMethods?.length;

  if (!hasBlueprintFields) {
    score -= 10;
    problems.push('题目缺少命题蓝图相关字段（blueprintId/targetAbility/requiredMethods）');
    suggestions.push('每道题必须关联命题蓝图，明确考查目标和必需方法');
  }

  
  // 11. 数学非基础概念题必须有具体数值、公式、条件、步骤
  if (isMathSubject(question) && question.examPattern !== '基础概念题') {
    const hasNumbersOrFormula = /[0-9]/.test(question.question) ||
      /[=+\-*/²√]/.test(question.question) ||
      /sin|cos|tan|log|lim|∑/.test(question.question);
    if (!hasNumbersOrFormula) {
      score -= 20;
      problems.push('数学非基础概念题缺少具体数值、公式、条件或步骤');
      suggestions.push('数学题必须包含具体数值或公式，如"已知tanα=-3/4"');
    }
  }

  // 12. 语文题没有具体语境或材料，判不合格
  if ((question.examPattern === '材料分析题' || question.type === 'material') && isChineseSubject(question)) {
    const hasContext = question.question.length > 40 && 
      (/['"「」【】《》]/.test(question.question) || /句子|段落|文中|材料|语境/.test(question.question));
    if (!hasContext) {
      score -= 20;
      problems.push('语文材料分析题缺少具体语境、句子或材料');
      suggestions.push('语文题必须包含具体句子、段落或材料语境');
    }
  }

  // 13. 英语题没有上下文、句子或短文，判不合格
  if (isEnglishSubject(question) && (question.type === 'single' || question.type === 'short')) {
    const hasContext = question.question.length > 50 &&
      (/['"]/.test(question.question) || /passage|paragraph|sentence|text|according/i.test(question.question));
    if (!hasContext) {
      score -= 20;
      problems.push('英语题缺少上下文、句子或短文定位');
      suggestions.push('英语阅读题必须包含文章段落或定位句');
    }
  }

  // 14. 选项过于模板化，判不合格
  if (question.options && question.type === 'single') {
    const templateOptions = question.options.filter(o => 
      /^(正确|错误|符合|不符合|理解了|忽略|混淆|脱离|凭印象|只需要|不需要|在任何情况下|没有使用限制)/.test(o) ||
      /核心含义|分析正确|用法正确|准确理解/.test(o)
    );
    if (templateOptions.length >= 2) {
      score -= 20;
      problems.push('选项过于模板化，缺乏具体性和考试价值');
      suggestions.push('每个选项必须基于具体内容，使用偷换概念、扩大范围、因果倒置等真实错误类型');
    }
  }

  // 直接不通过的情况
  function checkAnyPattern(pat: any, opt: string): boolean {
  if (typeof pat !== 'string') return pat.test(opt);
  return opt.includes(pat);
}
const bannedOpt = BANNED_OPTION_PATTERNS.some((pat: any) =>
    (question.options || []).some((opt: string) => checkAnyPattern(pat, opt))
  );
  const sameTpl = checkSameTemplate(question.options || []);
  const passed = score >= 80 &&
    !hasBannedPattern &&
    !bannedOpt &&
    !sameTpl &&
    question.options?.every(opt => opt.length > 8) !== false &&
    (question.explanation?.length ?? 0) >= 20;

  return {
    questionId: question.id,
    score: Math.max(0, score),
    problems,
    suggestions,
    passed,
  };
};

// ========== 批量审查 ==========

export const reviewQuestionsQuality = (questions: QuizQuestion[]): QuestionQualityReview[] => {
  return questions.map(reviewQuestionQuality);
};

// ========== 整体同质化检查（需批量调用）============

/**
 * 检查一批题目是否过于同质化
 * 如果超过5道题都以相同模式开头，扣分
 */
export const checkHomogenization = (questions: QuizQuestion[]): Map<string, { score: number; problems: string[] }> => {
  const results = new Map<string, { score: number; problems: string[] }>();

  // 提取题干开头模式
  const patterns = questions.map(q => {
    const text = q.question.replace(/\s+/g, '').slice(0, 15);
    // 提取前15个字符作为模式
    return text;
  });

  // 统计相同模式数量
  const patternCount: Record<string, number> = {};
  for (const p of patterns) {
    patternCount[p] = (patternCount[p] || 0) + 1;
  }

  // 找出同质化严重的模式
  for (const [pattern, count] of Object.entries(patternCount)) {
    if (count >= 3) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qPattern = patterns[i];
        if (qPattern === pattern && !results.has(q.id)) {
          results.set(q.id, {
            score: count >= 5 ? -15 : -5,
            problems: [`本题与另外${count - 1}道题题干模式高度相似（以"${pattern}..."开头），整体同质化严重`],
          });
        }
      }
    }
  }

  return results;
};

// ========== 获取质量等级 ==========

export const getQualityLevel = (score: number): '优秀' | '良好' | '合格' | '不合格' => {
  if (score >= 90) return '优秀';
  if (score >= 80) return '良好';
  if (score >= 60) return '合格';
  return '不合格';
};

// ========== 生成质量报告 ==========

export const generateQualityReport = (reviews: QuestionQualityReview[]): {
  total: number;
  passed: number;
  failed: number;
  averageScore: number;
  qualityLevel: '优秀' | '良好' | '合格' | '不合格';
  commonProblems: string[];
} => {
  const total = reviews.length;
  const passed = reviews.filter(r => r.passed).length;
  const failed = total - passed;
  const averageScore = total > 0
    ? Math.round(reviews.reduce((sum, r) => sum + r.score, 0) / total)
    : 0;

  // 统计常见问题
  const problemCount: Record<string, number> = {};
  for (const review of reviews) {
    for (const problem of review.problems) {
      problemCount[problem] = (problemCount[problem] || 0) + 1;
    }
  }

  const commonProblems = Object.entries(problemCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([problem, count]) => `${problem}(${count}题)`);

  return {
    total,
    passed,
    failed,
    averageScore,
    qualityLevel: getQualityLevel(averageScore),
    commonProblems,
  };
};

// ========== 辅助函数 ==========

const checkSameTemplate = (options: string[]): boolean => {
  // 检查是否所有选项都是同一模板（如"只需要……""不需要……"）
  const templates = [
    '只需要',
    '不需要',
    '与该考点',
    '该考点的',
    '上述',
    '以上',
  ];

  const templateCount = templates.filter(t =>
    options.filter(o => o.includes(t)).length >= 3
  );

  if (templateCount.length > 0) {
    return true;
  }

  // 检查选项长度是否完全相同（可能来自同一模板）
  const lengths = options.map(o => o.replace(/^[A-D][.、]\s*/, '').length);
  const allSameLength = lengths.every(l => l === lengths[0]);
  if (allSameLength && lengths[0] > 5) {
    return true;
  }

  return false;
};
