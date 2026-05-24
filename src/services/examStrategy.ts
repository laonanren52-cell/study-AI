import type { ExamQuestionPattern, SubjectType } from '../types';

export interface ExamStrategy {
  subjectType: SubjectType;
  methods: string[];
  commonMistakes: string[];
  answerRequirements: string[];
}

const hasAny = (text: string, keywords: string[]) => keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));

export const inferSubjectType = (materialText: string): SubjectType => {
  if (hasAny(materialText, ['sin', 'cos', 'tan', '函数', '方程', '证明', '几何', '代数', '公式', '三角函数', '导数'])) return '数学';
  if (hasAny(materialText, ['力', '电路', '电压', '电流', '运动', '能量', '速度', '加速度', '功率'])) return '物理';
  if (hasAny(materialText, ['反应', '方程式', '离子', '溶液', '化合价', '电解质', '酸碱'])) return '化学';
  if (hasAny(materialText, ['标点', '阅读', '病句', '作文', '文言文', '冒号', '分号', '修辞'])) return '语文';
  if (hasAny(materialText, ['grammar', 'reading', 'vocabulary', '完形', '语法', '词汇', '从句', '时态'])) return '英语';
  if (hasAny(materialText, ['细胞', '遗传', '生态', '基因', '光合作用'])) return '生物';
  if (hasAny(materialText, ['政治', '制度', '经济', '哲学', '法治'])) return '政治';
  if (hasAny(materialText, ['历史', '朝代', '革命', '战争', '改革'])) return '历史';
  if (hasAny(materialText, ['地理', '气候', '地形', '洋流', '人口', '区域'])) return '地理';
  return '通用';
};

export const getExamStrategy = (subjectType: SubjectType): ExamStrategy => {
  const strategies: Record<SubjectType, ExamStrategy> = {
    数学: {
      subjectType,
      methods: ['公式记忆', '条件识别', '步骤推导', '符号规范', '变式训练'],
      commonMistakes: ['忽略定义域或取值条件', '只求平方值忘记判断正负号', '公式变形时符号错误', '步骤跳跃导致得分点缺失'],
      answerRequirements: ['写出所用公式', '说明条件来源', '分步代入计算', '给出最终结论'],
    },
    语文: {
      subjectType,
      methods: ['概念识别', '语境判断', '病因分析', '规则应用', '材料依据'],
      commonMistakes: ['脱离语境判断', '只记规则不看表达关系', '病因分类不清', '材料依据不足'],
      answerRequirements: ['指出规则', '结合语境', '说明原因', '给出规范修改或判断'],
    },
    英语: {
      subjectType,
      methods: ['语法规则', '语境判断', '词义辨析', '句法结构'],
      commonMistakes: ['只看单词不看句法', '忽略时态语态', '混淆近义词', '固定搭配记忆不牢'],
      answerRequirements: ['说明语法点', '结合上下文', '排除干扰项', '给出句法依据'],
    },
    物理: {
      subjectType,
      methods: ['模型识别', '公式选择', '受力/过程分析', '单位规范', '条件辨析'],
      commonMistakes: ['公式适用条件错误', '单位换算遗漏', '方向判断错误', '过程状态混淆'],
      answerRequirements: ['画清过程或对象', '列出公式', '代入单位', '说明物理意义'],
    },
    化学: {
      subjectType,
      methods: ['反应规律', '方程式书写', '离子判断', '条件辨析', '实验现象'],
      commonMistakes: ['方程式未配平', '忽略反应条件', '离子共存判断错误', '现象和结论混淆'],
      answerRequirements: ['写出反应依据', '规范方程式', '说明条件', '给出现象或结论'],
    },
    生物: {
      subjectType,
      methods: ['概念识别', '过程图解', '因果分析', '实验变量', '材料分析'],
      commonMistakes: ['概念边界混淆', '变量控制遗漏', '因果关系倒置', '图表信息读取不全'],
      answerRequirements: ['写清结构或过程', '指出变量', '结合材料解释', '形成结论'],
    },
    政治: {
      subjectType,
      methods: ['观点识别', '材料分析', '理论匹配', '规范表达'],
      commonMistakes: ['材料和原理脱节', '术语不规范', '角度遗漏', '答题层次混乱'],
      answerRequirements: ['点明原理', '结合材料', '分点作答', '形成结论'],
    },
    历史: {
      subjectType,
      methods: ['时空定位', '史料分析', '因果影响', '比较辨析'],
      commonMistakes: ['时间线混乱', '史实张冠李戴', '影响角度单一', '材料概括不足'],
      answerRequirements: ['明确时空背景', '引用材料信息', '分析原因影响', '比较归纳'],
    },
    地理: {
      subjectType,
      methods: ['区域定位', '图表读取', '因果分析', '条件评价'],
      commonMistakes: ['区域条件遗漏', '图表信息误读', '自然与人文因素混淆', '因果链不完整'],
      answerRequirements: ['定位区域', '提取图表信息', '分自然/人文分析', '给出结论'],
    },
    通用: {
      subjectType,
      methods: ['概念理解', '场景判断', '易错辨析', '材料分析'],
      commonMistakes: ['只记名称不懂含义', '脱离材料判断', '关键词遗漏', '表达不完整'],
      answerRequirements: ['解释概念', '引用材料', '辨析易错点', '形成完整表达'],
    },
  };
  return strategies[subjectType];
};

export const getQuestionPatternPlan = (subjectType: SubjectType): ExamQuestionPattern[] => {
  if (subjectType === '数学') {
    return ['基础概念题', '基础概念题', '公式套用题', '公式套用题', '条件辨析题', '条件辨析题', '易错判断题', '易错判断题', '综合解答题', '变式迁移题'];
  }
  if (subjectType === '语文') {
    return ['基础概念题', '基础概念题', '条件辨析题', '条件辨析题', '条件辨析题', '易错判断题', '易错判断题', '材料分析题', '材料分析题', '综合解答题'];
  }
  if (subjectType === '物理' || subjectType === '化学') {
    return ['基础概念题', '公式套用题', '条件辨析题', '易错判断题', '材料分析题', '公式套用题', '条件辨析题', '易错判断题', '综合解答题', '变式迁移题'];
  }
  return ['基础概念题', '基础概念题', '条件辨析题', '易错判断题', '材料分析题', '条件辨析题', '易错判断题', '材料分析题', '综合解答题', '变式迁移题'];
};
