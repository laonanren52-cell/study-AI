import type { ExamQuestionPattern, SubjectType } from '../types';

export interface ExamStrategy {
  subjectType: SubjectType;
  methods: string[];
  commonMistakes: string[];
  answerRequirements: string[];
}

const SCHOOL_SUBJECTS: SubjectType[] = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '政治', '地理'];

const hasAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));

const detectEnglishRatio = (text: string): number => {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  const chinese = text.replace(/[^\u4e00-\u9fa5]/g, '');
  const total = letters.length + chinese.length;
  return total === 0 ? 0 : letters.length / total;
};

const isTrigText = (text: string) =>
  hasAny(text, ['三角函数', '同角三角函数', 'sin', 'cos', 'tan', '诱导公式', '象限角']) ||
  /\b(sin|cos|tan)\b/i.test(text);

/**
 * 旧调用方仍需要一个具体 SubjectType。无法判断时返回“语文”，避免历史上
 * 默认回落到数学；真正的资料主题失败拦截由 materialTopicService 完成。
 */
export const inferSubjectType = (materialText: string): SubjectType => {
  const text = materialText || '';
  const englishRatio = detectEnglishRatio(text);

  if (englishRatio > 0.6) {
    if (isTrigText(text) || hasAny(text, ['function', 'equation', 'geometry', 'probability', 'trigonometric'])) return '数学';
    if (hasAny(text, ['chemical', 'reaction', 'acid', 'base', 'ion', 'molecule', 'equilibrium'])) return '化学';
    if (hasAny(text, ['force', 'velocity', 'acceleration', 'ohm', 'current', 'voltage', 'resistance'])) return '物理';
    if (hasAny(text, ['cell', 'gene', 'photosynthesis', 'ecosystem', 'dna'])) return '生物';
    if (hasAny(text, ['climate', 'river', 'population', 'city', 'region', 'contour'])) return '地理';
    if (hasAny(text, ['dynasty', 'revolution', 'war', 'industrial revolution'])) return '历史';
    return '英语';
  }

  if (hasAny(text, ['化学', '化学反应', '化学方程式', '离子', '电解质', '酸碱', '氧化还原', '电离平衡', '化学平衡', '沉淀', '溶液'])) return '化学';
  if (isTrigText(text) || hasAny(text, ['数学', '函数', '方程', '几何', '代数', '概率', '数列', '导数', '公式', '证明'])) return '数学';
  if (hasAny(text, ['物理', '力学', '受力', '速度', '加速度', '牛顿', '电路', '电流', '电压', '电阻', '欧姆定律', '光学', '热学', '能量守恒'])) return '物理';
  if (hasAny(text, ['生物', '细胞', '遗传', '基因', '光合作用', '呼吸作用', '生态系统', '人体调节', 'dna'])) return '生物';
  if (hasAny(text, ['地理', '等高线', '地球运动', '气候', '河流', '地貌', '自然灾害', '人口', '城市', '农业', '工业', '交通', '区域'])) return '地理';
  if (hasAny(text, ['历史', '朝代', '洋务运动', '辛亥革命', '革命', '战争', '改革', '世界史', '中国古代史', '中国近现代史'])) return '历史';
  if (hasAny(text, ['政治', '道德与法治', '制度', '法治', '公民', '权利', '义务', '监督权', '宪法', '法律面前人人平等'])) return '政治';
  if (hasAny(text, ['语文', '标点', '阅读', '病句', '作文', '文言文', '古诗', '修辞', '句子赏析'])) return '语文';
  if (hasAny(text, ['英语', 'grammar', 'reading', 'vocabulary', '完形', '语法', '词汇', '从句', '时态', '现在完成时'])) return '英语';

  return '语文';
};

export function mapToDisplaySubject(subject: string): string {
  return SCHOOL_SUBJECTS.includes(subject as SubjectType) ? subject : '自动识别';
}

export function inferDisplaySubject(materialText: string): string {
  return mapToDisplaySubject(inferSubjectType(materialText));
}

const STRATEGIES: Record<SubjectType, ExamStrategy> = {
  数学: {
    subjectType: '数学',
    methods: ['公式记忆', '条件识别', '步骤推导', '符号规范', '变式训练'],
    commonMistakes: ['忽略定义域或取值条件', '只求平方值忘记判断正负号', '公式变形时符号错误', '步骤跳跃导致得分点缺失'],
    answerRequirements: ['写出所用公式', '说明条件来源', '分步代入计算', '给出最终结论'],
  },
  语文: {
    subjectType: '语文',
    methods: ['语境判断', '文本定位', '修辞辨析', '规范表达'],
    commonMistakes: ['脱离语境判断', '只记术语不结合句子', '表达效果分析空泛', '材料依据不足'],
    answerRequirements: ['定位原句', '指出手法或规则', '结合语境说明效果', '表达完整'],
  },
  英语: {
    subjectType: '英语',
    methods: ['语法规则', '语境判断', '词义辨析', '句法结构'],
    commonMistakes: ['只看单词不看句法', '忽略时态语态', '混淆近义词', '固定搭配记忆不牢'],
    answerRequirements: ['说明语法点', '结合上下文', '排除干扰项', '给出句法依据'],
  },
  物理: {
    subjectType: '物理',
    methods: ['模型识别', '公式选择', '受力/过程分析', '单位规范', '条件辨析'],
    commonMistakes: ['公式适用条件错误', '单位换算遗漏', '方向判断错误', '过程状态混淆'],
    answerRequirements: ['画清过程或对象', '列出公式', '代入单位', '说明物理意义'],
  },
  化学: {
    subjectType: '化学',
    methods: ['反应规律', '方程式书写', '离子判断', '条件辨析', '实验现象'],
    commonMistakes: ['方程式未配平', '忽略反应条件', '离子共存判断错误', '现象和结论混淆'],
    answerRequirements: ['写出反应依据', '规范方程式', '说明条件', '给出现象或结论'],
  },
  生物: {
    subjectType: '生物',
    methods: ['概念识别', '过程图解', '因果分析', '实验变量', '材料分析'],
    commonMistakes: ['概念边界混淆', '变量控制遗漏', '因果关系倒置', '图表信息读取不全'],
    answerRequirements: ['写清结构或过程', '指出变量', '结合材料解释', '形成结论'],
  },
  历史: {
    subjectType: '历史',
    methods: ['时空定位', '史料分析', '因果影响', '比较辨析'],
    commonMistakes: ['时间线混乱', '史实张冠李戴', '影响角度单一', '材料概括不足'],
    answerRequirements: ['明确时空背景', '引用材料信息', '分析原因影响', '比较归纳'],
  },
  政治: {
    subjectType: '政治',
    methods: ['观点识别', '材料分析', '理论匹配', '规范表达'],
    commonMistakes: ['材料和原理脱节', '术语不规范', '角度遗漏', '答题层次混乱'],
    answerRequirements: ['点明原理', '结合材料', '分点作答', '形成结论'],
  },
  地理: {
    subjectType: '地理',
    methods: ['区域定位', '图表读取', '因果分析', '条件评价'],
    commonMistakes: ['区域条件遗漏', '图表信息误读', '自然与人文因素混淆', '因果链不完整'],
    answerRequirements: ['定位区域', '提取图表信息', '分自然/人文分析', '给出结论'],
  },
};

export const getExamStrategy = (subjectType: SubjectType): ExamStrategy => STRATEGIES[subjectType];

export const getQuestionPatternPlan = (subjectType: SubjectType): ExamQuestionPattern[] => {
  if (subjectType === '数学' || subjectType === '物理' || subjectType === '化学') {
    return ['基础概念题', '公式套用题', '条件辨析题', '易错判断题', '材料分析题', '变式迁移题', '综合解答题'];
  }
  if (subjectType === '生物' || subjectType === '地理') {
    return ['基础概念题', '条件辨析题', '材料分析题', '易错判断题', '综合解答题'];
  }
  return ['基础概念题', '材料分析题', '条件辨析题', '易错判断题', '综合解答题'];
};

export const getExamPatternsBySubject = (subject: SubjectType): ExamQuestionPattern[] => getQuestionPatternPlan(subject);

export const getDefaultDifficultyRatio = () => ({ easy: 20, medium: 50, hard: 30 });

export const getCommonMistakesBySubject = (subject: SubjectType): string[] => STRATEGIES[subject].commonMistakes;

export const getMethodsBySubject = (subject: SubjectType): string[] => STRATEGIES[subject].methods;
