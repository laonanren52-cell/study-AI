import type { KnowledgePoint, SubjectType } from '../types';

export type SupportedMaterialSubject =
  | '语文' | '数学' | '英语' | '物理' | '化学'
  | '生物' | '历史' | '政治' | '地理';

export interface MaterialProfile {
  subject: SupportedMaterialSubject;
  stage: '初中' | '高中' | '未知';
  chapter?: string;
  topic: string;
  coreConcepts: string[];
  keyFormulas?: string[];
  sourceSummary: string;
  sourceText: string;
  sourceFingerprint: string;
  confidence: number;
  forbiddenTopics: string[];
  allowedTemplateIds: string[];
}

export interface MaterialTopic {
  subject: string;
  chapterTag: string;
  topicTag: string;
  allowedKeywords: string[];
  bannedKeywords: string[];
  allowedTemplateIds: string[];
}

const hasAny = (text: string, keywords: string[]) =>
  keywords.some((k) => text.toLowerCase().includes(k.toLowerCase()));

const hashText = (text: string): string => {
  let hash = 2166136261;
  for (const char of text.trim().replace(/\s+/g, ' ')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `src-${(hash >>> 0).toString(16)}`;
};

const detectStage = (text: string): MaterialProfile['stage'] => {
  if (hasAny(text, ['初中', '中考', '七年级', '八年级', '九年级'])) return '初中';
  if (hasAny(text, ['高中', '高考', '高一', '高二', '高三', '象限', '离子共存'])) return '高中';
  return '未知';
};

const detectEnglishRatio = (text: string): number => {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  const chinese = text.replace(/[^\u4e00-\u9fa5]/g, '');
  const total = letters.length + chinese.length;
  if (total === 0) return 0;
  return letters.length / total;
};

const TOPIC_RULES: Array<{
  test: (text: string) => boolean;
  topic: MaterialTopic;
}> = [
  {
    test: (t) =>
      hasAny(t, ['同角三角函数', 'sin\u00b2\u03b1+cos\u00b2\u03b1=1', 'sin\u00b2\u03b1 + cos\u00b2\u03b1 = 1', 'tan\u03b1=sin\u03b1/cos\u03b1', 'tan\u03b1 = sin\u03b1 / cos\u03b1']) ||
      (hasAny(t, ['三角函数', '正弦', '余弦', '正切', '象限']) &&
        hasAny(t, ['sin', 'cos', 'tan']) && hasAny(t, ['求值', '关系', '基本'])),
    topic: {
      subject: '数学',
      chapterTag: '三角函数',
      topicTag: '同角三角函数基本关系',
      allowedKeywords: [
        'sin', 'cos', 'tan', '正弦', '余弦', '正切',
        '三角函数', '同角三角函数', '象限', '象限角',
        '平方关系', '商数关系', '平方和', '弦切互化',
        '第一象限', '第二象限', '第三象限', '第四象限',
        '正负号', '符号判断', '已知三角函数值',
        'sin²α + cos²α = 1', 'tanα = sinα / cosα',
        '求其他三角函数值',
      ],
      bannedKeywords: [
        '二次函数', '一次函数', '一元二次方程', '二元一次方程',
        '方程组', '几何证明', '概率', '统计', '数列', '导数',
        '抛物线', '顶点坐标', '对称轴', '开口方向',
        '配方', '因式分解', '韦达定理', '判别式',
        '不等式', '绝对值', '集合', '映射',
        '圆', '三角形', '平行', '垂直',
      ],
      allowedTemplateIds: [
        'math-trig-tan-quadrant',
        'math-trig-known-value',
        'math-trig-identity-simplify',
        'math-trig-symbol-quadrant',
        'math-trig-basic-relation',
      ],
    },
  },
  {
    test: (t) =>
      hasAny(t, ['三角函数图像', '正弦函数', '余弦函数', '周期', '振幅', '相移', 'y=Asin', 'y=Acos']),
    topic: {
      subject: '数学',
      chapterTag: '三角函数',
      topicTag: '三角函数图像与性质',
      allowedKeywords: ['正弦函数', '余弦函数', '正切函数', '周期', '振幅', '相移', '最大值', '最小值', '单调区间', '对称轴', '对称中心', '图像变换'],
      bannedKeywords: ['二次函数', '一次函数', '方程组', '几何证明', '概率', '导数'],
      allowedTemplateIds: ['math-01'],
    },
  },
  {
    test: (t) => hasAny(t, ['二次函数', '抛物线', 'y=ax', 'y=a*x']),
    topic: {
      subject: '数学',
      chapterTag: '函数',
      topicTag: '二次函数',
      allowedKeywords: ['二次函数', '抛物线', '顶点', '对称轴', '开口方向', '配方', '最值', '判别式', '韦达定理', '零点'],
      bannedKeywords: ['三角函数', 'sin', 'cos', 'tan', '正弦', '余弦', '几何证明', '概率', '数列', '导数'],
      allowedTemplateIds: ['math-02'],
    },
  },
  {
    test: (t) => hasAny(t, ['方程', '方程组', '解方程', '移项'])
      && !hasAny(t, ['三角函数', 'sin', 'cos', '化学方程式', '离子', '反应', '溶液', '酸碱']),
    topic: {
      subject: '数学',
      chapterTag: '方程与不等式',
      topicTag: '方程',
      allowedKeywords: ['方程', '方程组', '解方程', '等式', '移项', '系数', '未知数'],
      bannedKeywords: ['三角函数', 'sin', 'cos', '二次函数', '几何证明', '概率'],
      allowedTemplateIds: ['math-05'],
    },
  },
  {
    test: (t) => hasAny(t, ['几何', '三角形', '圆', '平行四边形', '全等', '相似', '证明']) && !hasAny(t, ['三角函数', 'sin', 'cos']),
    topic: {
      subject: '数学',
      chapterTag: '几何',
      topicTag: '几何',
      allowedKeywords: ['几何', '三角形', '圆', '全等', '相似', '证明', '定理'],
      bannedKeywords: ['三角函数', 'sin', 'cos', '二次函数', '方程', '概率'],
      allowedTemplateIds: ['math-04'],
    },
  },
  {
    test: (t) => hasAny(t, ['标点', '病句', '语病', '修辞', '文言文']),
    topic: {
      subject: '语文',
      chapterTag: '语言运用',
      topicTag: '标点与病句',
      allowedKeywords: ['标点', '病句', '语病', '修辞', '文言文', '语法'],
      bannedKeywords: ['数学', 'sin', 'cos', 'tan', '二次函数', '一次函数', '几何证明', '概率', '统计', '数列', '导数'],
      allowedTemplateIds: ['chinese-01', 'chinese-02', 'chinese-03'],
    },
  },
  {
    test: (t) => hasAny(t, ['现在完成时', '一般过去时', '语法', '时态', '语态', '定语从句', '宾语从句', 'reading comprehension', 'present perfect']),
    topic: {
      subject: '英语',
      chapterTag: '英语语法与阅读',
      topicTag: '英语语境应用',
      allowedKeywords: ['英语', '语法', '时态', '语态', '从句', 'reading', 'passage', 'context', 'present perfect', 'has gone', 'have'],
      bannedKeywords: ['数学', '方程', '函数', '三角', '离子', '牛顿'],
      allowedTemplateIds: ['english-01', 'english-02', 'english-03'],
    },
  },
  {
    test: (t) => hasAny(t, ['阅读理解', '文段', '文章', '段落']) && !hasAny(t, ['sin', 'cos', '方程']),
    topic: {
      subject: '语文',
      chapterTag: '阅读理解',
      topicTag: '现代文阅读',
      allowedKeywords: ['阅读理解', '主旨', '细节', '推断', '文意', '段落', '文章'],
      bannedKeywords: ['数学', '方程', '函数', '三角'],
      allowedTemplateIds: ['chinese-01', 'chinese-02'],
    },
  },
  {
    test: (t) => detectEnglishRatio(t) > 0.4,
    topic: {
      subject: '英语',
      chapterTag: '英语阅读',
      topicTag: '英语阅读理解',
      allowedKeywords: ['reading', 'passage', 'paragraph', 'main idea', 'detail', 'inference', 'vocabulary', 'grammar'],
      bannedKeywords: ['数学', '方程', '函数', '三角'],
      allowedTemplateIds: ['english-01', 'english-02'],
    },
  },
  {
    test: (t) => hasAny(t, ['力学', '受力', '速度', '加速度', '牛顿', '受力分析', '电路', '电流', '电压', '电阻', '欧姆定律', '光学', '热学', '能量守恒']),
    topic: {
      subject: '物理',
      chapterTag: '力学',
      topicTag: '力学基础',
      allowedKeywords: ['力', '运动', '速度', '加速度', '牛顿', '受力分析', '质量', '重力', '摩擦力', '电路', '电流', '电压', '电阻', '欧姆定律', '能量'],
      bannedKeywords: ['三角函数', 'sin', 'cos', '二次函数', '方程', '概率'],
      allowedTemplateIds: ['physics-01', 'physics-02', 'physics-03'],
    },
  },
  {
    test: (t) => hasAny(t, ['化学方程式', '离子', '反应', '溶液', '酸碱', '电离平衡', '化学平衡', '氧化还原', '化学实验']),
    topic: {
      subject: '化学',
      chapterTag: '化学反应',
      topicTag: '化学反应原理',
      allowedKeywords: ['化学方程式', '离子', '反应', '溶液', '酸碱', '配平', '氧化还原', '电离平衡', '化学平衡', '弱电解质', '实验现象'],
      bannedKeywords: ['数学', 'sin', 'cos', 'tan', '二次函数', '一次函数', '几何证明', '概率', '统计', '数列', '导数'],
      allowedTemplateIds: ['chemistry-01', 'chemistry-02'],
    },
  },
  {
    test: (t) => hasAny(t, ['细胞', '遗传', '基因', '光合作用', '孟德尔', '呼吸作用', '生态系统', '人体调节', '生物实验']),
    topic: {
      subject: '生物',
      chapterTag: '生物学基础',
      topicTag: '生物基础',
      allowedKeywords: ['细胞', '遗传', '基因', '光合作用', '孟德尔', 'DNA', 'RNA', '呼吸作用', '生态系统', '人体调节', '实验'],
      bannedKeywords: ['数学', '方程', '函数', '三角'],
      allowedTemplateIds: ['biology-01', 'biology-02'],
    },
  },
  {
    test: (t) => hasAny(t, ['等高线', '地球运动', '气候', '河流', '地貌', '自然灾害', '人口', '城市', '农业', '工业', '交通', '区域发展', '中国地理', '世界地理']),
    topic: {
      subject: '地理',
      chapterTag: '初高中地理',
      topicTag: '区域与自然人文地理',
      allowedKeywords: ['地理', '等高线', '地球运动', '气候', '河流', '地貌', '自然灾害', '人口', '城市', '农业', '工业', '交通', '区域', '中国地理', '世界地理'],
      bannedKeywords: ['sin', 'cos', 'tan', '二次函数', '方程', '几何证明', '离子', '化学方程式', '大学地理', 'GIS', '考研', '竞赛'],
      allowedTemplateIds: ['geography-01', 'geography-02', 'geography-03'],
    },
  },
  {
    test: (t) => hasAny(t, ['历史', '朝代', '事件', '时间线', '洋务运动', '辛亥革命', '世界史', '中国古代史', '中国近现代史']),
    topic: {
      subject: '历史',
      chapterTag: '历史',
      topicTag: '历史事件分析',
      allowedKeywords: ['历史', '朝代', '事件', '原因', '影响', '时间', '洋务运动', '辛亥革命', '世界史', '材料'],
      bannedKeywords: ['数学', '方程', '函数', '公民权利', '法治观念', '等高线', '语文阅读'],
      allowedTemplateIds: ['history-01'],
    },
  },
  {
    test: (t) => hasAny(t, ['政治', '制度', '经济', '哲学', '法治', '公民', '权利义务', '道德与法治', '监督权']),
    topic: {
      subject: '政治',
      chapterTag: '政治',
      topicTag: '政治理论',
      allowedKeywords: ['政治', '制度', '经济', '哲学', '法治', '材料分析', '公民', '权利', '义务', '监督权'],
      bannedKeywords: ['数学', '方程', '函数', '朝代', '历史时间线', '洋务运动', '辛亥革命'],
      allowedTemplateIds: ['politics-01'],
    },
  },
];

const DEFAULT_TOPIC_BY_SUBJECT: Record<SupportedMaterialSubject, MaterialTopic> = {
  语文: { subject: '语文', chapterTag: '初高中语文', topicTag: '语文语言与阅读', allowedKeywords: ['语文', '句子', '病句', '修辞', '文言文', '阅读', '诗句'], bannedKeywords: ['sin', 'cos', 'tan', '方程', '离子', '牛顿'], allowedTemplateIds: ['chinese-01', 'chinese-02', 'chinese-03'] },
  数学: { subject: '数学', chapterTag: '初高中数学', topicTag: '数学基础', allowedKeywords: ['数学', '代数', '函数', '方程', '几何', '三角函数', '概率', '数列'], bannedKeywords: ['离子', '化学方程式', '洋务运动', '公民权利'], allowedTemplateIds: ['math-01', 'math-02', 'math-03', 'math-04', 'math-05'] },
  英语: { subject: '英语', chapterTag: '初高中英语', topicTag: '英语语境应用', allowedKeywords: ['英语', 'grammar', 'reading', 'passage', 'context', 'tense', '时态', '语法', '从句'], bannedKeywords: ['数学', '方程', '离子', '牛顿'], allowedTemplateIds: ['english-01', 'english-02', 'english-03'] },
  物理: { subject: '物理', chapterTag: '初高中物理', topicTag: '物理情境应用', allowedKeywords: ['物理', '力', '速度', '加速度', '质量', '电路', '电流', '电压', '电阻', '能量'], bannedKeywords: ['sin', 'cos', '离子', '洋务运动'], allowedTemplateIds: ['physics-01', 'physics-02', 'physics-03'] },
  化学: { subject: '化学', chapterTag: '初高中化学', topicTag: '化学反应与实验', allowedKeywords: ['化学', '反应', '溶液', '离子', '酸碱', '平衡', '氧化还原', '实验'], bannedKeywords: ['sin', 'cos', 'tan', '二次函数', '几何证明', '概率', '数列', '导数'], allowedTemplateIds: ['chemistry-01', 'chemistry-02'] },
  生物: { subject: '生物', chapterTag: '初高中生物', topicTag: '生命活动与实验', allowedKeywords: ['生物', '细胞', '遗传', '基因', '光合作用', '呼吸作用', '生态系统', '人体调节', '实验'], bannedKeywords: ['sin', 'cos', '方程', '离子'], allowedTemplateIds: ['biology-01', 'biology-02'] },
  历史: { subject: '历史', chapterTag: '初高中历史', topicTag: '历史事件与材料分析', allowedKeywords: ['历史', '事件', '时间', '原因', '影响', '材料', '洋务运动', '辛亥革命', '世界史'], bannedKeywords: ['数学', '方程', '函数', '公民权利', '法治观念', '等高线', '语文阅读'], allowedTemplateIds: ['history-01'] },
  政治: { subject: '政治', chapterTag: '初高中政治', topicTag: '道德法治与社会生活', allowedKeywords: ['政治', '公民', '权利', '义务', '法治', '经济', '社会', '材料'], bannedKeywords: ['数学', '方程', '函数', '朝代', '历史时间线', '洋务运动', '辛亥革命'], allowedTemplateIds: ['politics-01'] },
  地理: { subject: '地理', chapterTag: '初高中地理', topicTag: '区域与自然人文地理', allowedKeywords: ['地理', '等高线', '地球运动', '气候', '河流', '地貌', '自然灾害', '人口', '城市', '农业', '工业', '交通', '区域'], bannedKeywords: ['sin', 'cos', 'tan', '方程', '离子', '化学方程式', '牛顿', '遗传', '大学地理', 'GIS', '考研', '竞赛'], allowedTemplateIds: ['geography-01', 'geography-02', 'geography-03'] },
};

const resolvePreferredSubject = (preferredSubject?: string): SupportedMaterialSubject | undefined =>
  preferredSubject && preferredSubject !== '自动识别' && preferredSubject in DEFAULT_TOPIC_BY_SUBJECT
    ? preferredSubject as SupportedMaterialSubject
    : undefined;

export function inferMaterialTopic(
  materialText: string,
  knowledgePoints: KnowledgePoint[],
  preferredSubject?: string
): MaterialTopic {
  const selectedSubject = resolvePreferredSubject(preferredSubject);
  for (const rule of TOPIC_RULES) {
    if ((!selectedSubject || rule.topic.subject === selectedSubject) && rule.test(materialText)) {
      return rule.topic;
    }
  }

  const kpText = knowledgePoints
    .map((kp) => `${kp.title} ${kp.description} ${kp.sourceEvidence || ''}`)
    .join(' ');

  for (const rule of TOPIC_RULES) {
    if ((!selectedSubject || rule.topic.subject === selectedSubject) && rule.test(kpText)) {
      return rule.topic;
    }
  }

  if (selectedSubject) return DEFAULT_TOPIC_BY_SUBJECT[selectedSubject];

  return {
    subject: '通用',
    chapterTag: '通用',
    topicTag: '通用知识',
    allowedKeywords: [],
    bannedKeywords: [],
    allowedTemplateIds: [],
  };
}

export function isSpecificTopic(topic: MaterialTopic): boolean {
  return topic.topicTag !== '通用知识';
}

export function inferMaterialProfile(
  materialText: string,
  knowledgePoints: KnowledgePoint[] = [],
  preferredSubject?: string
): MaterialProfile | null {
  const topic = inferMaterialTopic(materialText, knowledgePoints, preferredSubject);
  if (topic.topicTag === '通用知识') return null;
  return {
    subject: topic.subject as SupportedMaterialSubject,
    stage: detectStage(materialText),
    chapter: topic.chapterTag,
    topic: topic.topicTag,
    coreConcepts: [...new Set([
      ...topic.allowedKeywords,
      ...knowledgePoints.flatMap((point) => [point.title, ...(point.keywords || [])]),
    ])].slice(0, 18),
    keyFormulas: knowledgePoints.flatMap((point) => point.formulas || []).slice(0, 8),
    sourceSummary: materialText.trim().replace(/\s+/g, ' ').slice(0, 240),
    sourceText: materialText,
    sourceFingerprint: hashText(materialText),
    confidence: knowledgePoints.length > 0 ? 0.95 : 0.85,
    forbiddenTopics: topic.bannedKeywords,
    allowedTemplateIds: topic.allowedTemplateIds,
  };
}

export function materialProfileToTopic(profile: MaterialProfile): MaterialTopic {
  return {
    subject: profile.subject,
    chapterTag: profile.chapter || profile.subject,
    topicTag: profile.topic,
    allowedKeywords: profile.coreConcepts,
    bannedKeywords: profile.forbiddenTopics,
    allowedTemplateIds: profile.allowedTemplateIds,
  };
}
