/**
 * 本地题型模板库 - 按九大学科拆分
 * 每个模板包含题型结构、命题规则、得分点和常见误区
 */
export interface ExamTemplate {
  id: string;
  subject: string;
  gradeRange: '初中' | '高中' | '初高中';
  keywords: string[];
  patternName: string;
  templateStructure: string;
  generationRules: string[];
  scoringPoints: string[];
  commonMistakes: string[];
  variantMethods: string[];
}

const TEMPLATES: ExamTemplate[] = [
  // ===== 数学 =====
  { id: 'math-trig-tan-quadrant', subject: '数学', gradeRange: '高中', keywords: ['tan', '象限', '同角三角函数'], patternName: '已知正切值和象限求值', templateStructure: '已知tan值和象限→设sin与cos比例→使用平方关系→判断符号→求值', generationRules: ['必须给出tan具体值', '必须给出象限', '只能使用同角三角函数基本关系'], scoringPoints: ['写出tanα=sinα/cosα', '代入平方关系', '按象限判断符号'], commonMistakes: ['忽略象限判断正负号'], variantMethods: ['换象限', '换数值', '换所求函数值'] },
  { id: 'math-trig-known-value', subject: '数学', gradeRange: '高中', keywords: ['sin', 'cos', '已知三角函数值'], patternName: '已知一个三角函数值求其他值', templateStructure: '已知sin或cos和象限→使用平方关系→判断符号→求tan或另一个函数值', generationRules: ['必须给出具体值', '必须给出象限或角范围', '只能使用同角三角函数基本关系'], scoringPoints: ['写出平方关系', '正确开平方', '按象限判断符号'], commonMistakes: ['开平方后漏掉符号判断'], variantMethods: ['换已知函数值', '换象限', '换所求函数值'] },
  { id: 'math-trig-identity-simplify', subject: '数学', gradeRange: '高中', keywords: ['sin²', 'cos²', 'tan', '化简'], patternName: '同角三角函数恒等式化简', templateStructure: '给出含sin、cos、tan的式子→使用平方关系和商数关系→化简', generationRules: ['只能使用同角三角函数基本关系', '不得引入其他数学章节'], scoringPoints: ['识别平方关系', '识别商数关系', '正确化简'], commonMistakes: ['混淆平方关系和商数关系'], variantMethods: ['换表达式', '换目标形式'] },
  { id: 'math-trig-symbol-quadrant', subject: '数学', gradeRange: '高中', keywords: ['象限', '正负号', 'sin', 'cos', 'tan'], patternName: '象限与符号判断', templateStructure: '给出象限→判断sin、cos、tan正负号', generationRules: ['必须围绕象限符号', '不得引入其他章节'], scoringPoints: ['识别象限', '正确判断函数值符号'], commonMistakes: ['混淆不同象限的正负号'], variantMethods: ['换象限', '换函数值'] },
  { id: 'math-trig-basic-relation', subject: '数学', gradeRange: '高中', keywords: ['同角三角函数', '平方关系', '商数关系'], patternName: '同角三角函数基本关系', templateStructure: '判断或应用sin²α+cos²α=1与tanα=sinα/cosα', generationRules: ['只考查两条基本关系', '不得引入其他章节'], scoringPoints: ['准确写出基本关系', '说明适用条件'], commonMistakes: ['混淆平方关系和商数关系'], variantMethods: ['换设问', '换表达式'] },
  { id: 'math-01', subject: '数学', gradeRange: '高中', keywords: ['三角函数', 'sin', 'cos', 'tan', '象限'], patternName: '已知三角函数值求值', templateStructure: '已知某三角函数值和象限条件→利用平方关系和商数关系→判断符号→求其他函数值', generationRules: ['必须给具体数值', '必须给象限或范围', '必须使用平方关系sin²+cos²=1', '需要判断正负号'], scoringPoints: ['正确写出平方关系', '正确代入数值', '正确判断符号', '正确计算结果'], commonMistakes: ['忽略象限判断正负号', '忘记开平方后有两个值需要取舍', '混淆sin和cos的定义'], variantMethods: ['换象限', '换给出条件(tan→sin)', '换所求量(求tan→求cos)'] },
  { id: 'math-02', subject: '数学', gradeRange: '初高中', keywords: ['二次函数', '顶点', '最值', '配方'], patternName: '二次函数顶点和最值', templateStructure: '给出二次函数表达式→配方或公式→求顶点坐标→判断最值', generationRules: ['必须有具体系数', '必须使用配方或公式', '需要判断开口方向'], scoringPoints: ['正确配方', '正确求顶点坐标', '正确判断最值'], commonMistakes: ['配方时常数项移项错误', '对称轴公式记忆错误', '开口方向判断错误'], variantMethods: ['换系数', '换配方法/公式法', '增加定义域限制'] },
  { id: 'math-03', subject: '数学', gradeRange: '初高中', keywords: ['一次函数', '实际应用', '图像'], patternName: '一次函数实际问题', templateStructure: '给出实际问题情境→建立一次函数模型→求解问题', generationRules: ['必须有实际情境', '必须有具体数值', '需要建立函数关系'], scoringPoints: ['正确识别变量关系', '正确建立函数表达式', '正确求解'], commonMistakes: ['自变量取值范围忽略', '比例系数符号错误'], variantMethods: ['换情境', '换数值', '换所求量'] },
  { id: 'math-04', subject: '数学', gradeRange: '高中', keywords: ['几何', '证明', '三角形', '圆'], patternName: '几何证明', templateStructure: '给出几何条件→识别几何关系→使用定理→逻辑推导→结论', generationRules: ['必须有具体几何条件', '必须使用相关定理', '步骤必须完整'], scoringPoints: ['正确识别几何关系', '正确引用定理', '推导过程完整', '结论正确'], commonMistakes: ['定理使用错误', '证明步骤跳跃', '忽略已知条件'], variantMethods: ['换图形', '换条件', '换所求结论'] },
  { id: 'math-05', subject: '数学', gradeRange: '初高中', keywords: ['方程', '不等式', '求解'], patternName: '方程求解', templateStructure: '给出方程或不等式→识别类型→选择解法→求解→检验', generationRules: ['必须有具体系数', '必须有完整求解过程', '需要判断解的合理性'], scoringPoints: ['正确识别方程类型', '正确选择解法', '求解过程正确', '检验结果'], commonMistakes: ['移项符号错误', '去分母漏乘', '不等式方向判断错误'], variantMethods: ['换方程类型', '换系数', '换求解方法'] },
  // ===== 语文 =====
  { id: 'chinese-01', subject: '语文', gradeRange: '初高中', keywords: ['标点符号', '顿号', '逗号', '书名号', '引号'], patternName: '标点符号语境判断', templateStructure: '给出含有标点的句子→判断标点使用是否正确→说明理由', generationRules: ['必须有具体句子', '标点用法必须典型', '选项包含常见标点错误'], scoringPoints: ['正确识别标点用法', '能说明错误原因', '能给出正确用法'], commonMistakes: ['并列词语误用逗号为顿号', '书名号和引号混淆', '引号内句末点号位置错误'], variantMethods: ['换标点类型', '换句子语境', '换错误类型'] },
  { id: 'chinese-02', subject: '语文', gradeRange: '初高中', keywords: ['病句', '语病', '成分残缺', '搭配不当'], patternName: '病句修改', templateStructure: '给出句子→判断是否有语病→分析语病类型→修改', generationRules: ['必须有完整句子', '语病类型必须典型', '每个选项代表不同语病类型'], scoringPoints: ['正确识别语病类型', '能说明语病原因', '能正确修改'], commonMistakes: ['成分残缺判断遗漏', '搭配不当类型混淆', '句式杂糅识别困难'], variantMethods: ['换病句类型', '换句子结构', '换修改方案'] },
  { id: 'chinese-03', subject: '语文', gradeRange: '初高中', keywords: ['阅读理解', '信息筛选', '主旨概括'], patternName: '阅读理解信息筛选', templateStructure: '给出阅读材料→设置具体问题→从材料中筛选信息→判断选项正误', generationRules: ['必须有具体阅读材料', '问题必须基于原文', '干扰项必须来自原文改编'], scoringPoints: ['准确定位原文信息', '正确理解文意', '能排除干扰项'], commonMistakes: ['脱离材料凭印象判断', '以偏概全', '过度推断'], variantMethods: ['换材料类型', '换设问角度', '换干扰项错误类型'] },
  // ===== 英语 =====
  { id: 'english-01', subject: '英语', gradeRange: '初高中', keywords: ['reading comprehension', 'detail', 'main idea'], patternName: '阅读理解细节题', templateStructure: '给出短文→设置细节问题→定位原文→判断选项正误', generationRules: ['必须有短文', '问题必须基于原文细节', '干扰项必须来自原文改编'], scoringPoints: ['正确理解题干', '准确定位原文', '排除干扰项', '确认正确答案'], commonMistakes: ['以偏概全', '张冠李戴', '过度推断'], variantMethods: ['换文章主题', '换题型(细节→推断)', '换干扰项设置'] },
  { id: 'english-02', subject: '英语', gradeRange: '初高中', keywords: ['vocabulary', 'context clues', 'word meaning'], patternName: '词义猜测题', templateStructure: '在短文中选取词汇→通过上下文线索→推测词义→选择正确释义', generationRules: ['必须放在具体语境中', '上下文必须有提示线索', '干扰项必须合理但错误'], scoringPoints: ['定位词汇所在句子', '分析上下文线索', '推测正确的词义'], commonMistakes: ['忽略上下文提示', '仅凭词汇字面意思猜测', '混淆同义词的细微差别'], variantMethods: ['换词汇类型', '换上下文线索类型', '换干扰项设置'] },
  { id: 'english-03', subject: '英语', gradeRange: '初高中', keywords: ['grammar', 'sentence structure', 'tense'], patternName: '语法选择题', templateStructure: '给出带空格的句子→四个语法选项→判断正确语法形式', generationRules: ['必须有完整句子', '语法考点必须典型', '干扰项必须来自常见语法错误'], scoringPoints: ['识别时态/语态/语气', '判断主谓一致', '选择正确语法形式'], commonMistakes: ['时态混淆', '主谓不一致', '非谓语动词形式错误'], variantMethods: ['换语法考点', '换句子语境', '换干扰项设置'] },
  // ===== 物理 =====
  { id: 'physics-01', subject: '物理', gradeRange: '高中', keywords: ['牛顿第二定律', 'F=ma', '受力分析'], patternName: '公式应用', templateStructure: '给出物理情境→受力分析→写出公式→代入计算', generationRules: ['必须有具体物理情境', '必须有具体数值', '必须使用相关物理公式'], scoringPoints: ['正确受力分析', '选择正确公式', '正确代入数值', '正确计算结果和单位'], commonMistakes: ['受力分析遗漏力', '单位换算遗漏', '方向判断错误'], variantMethods: ['换情境类型', '换数值', '换所求量'] },
  { id: 'physics-02', subject: '物理', gradeRange: '高中', keywords: ['电路', '欧姆定律', '电流', '电压', '电阻'], patternName: '电路分析', templateStructure: '给出电路图或条件→分析串并联→用欧姆定律求解→得出结论', generationRules: ['必须有具体电路条件', '必须有具体数值', '需要判断串并联关系'], scoringPoints: ['正确判断电路连接方式', '正确写出欧姆定律', '正确计算', '单位正确'], commonMistakes: ['串并联判断错误', '欧姆定律公式写错', '单位换算错误'], variantMethods: ['换电路结构', '换数值', '换所求物理量'] },
  { id: 'physics-03', subject: '物理', gradeRange: '高中', keywords: ['自由落体', '匀加速', '位移', '速度'], patternName: '运动过程分析', templateStructure: '给出运动情境→识别运动类型→选择公式→代入计算', generationRules: ['必须有具体运动情境', '必须有具体数值', '必须选择正确运动学公式'], scoringPoints: ['正确识别运动类型', '选择正确公式', '正确计算', '结果合理'], commonMistakes: ['公式选择错误', '忘记½或平方', '单位换算遗漏'], variantMethods: ['换运动类型', '换初始条件', '换所求量'] },
  // ===== 化学 =====
  { id: 'chemistry-01', subject: '化学', gradeRange: '高中', keywords: ['化学方程式', '配平', '反应条件'], patternName: '化学方程式判断', templateStructure: '给出化学方程式→检查配平→检查条件→检查产物→判断正误', generationRules: ['必须有具体化学方程式', '必须包含配平、条件和产物检查', '干扰项必须来自常见错误'], scoringPoints: ['正确配平', '正确标注反应条件', '正确标注产物状态', '正确判断反应类型'], commonMistakes: ['方程式未配平', '忽略反应条件', '产物判断错误', '气体沉淀符号遗漏'], variantMethods: ['换反应类型', '换化学物质', '换错误类型(配平/条件/产物)'] },
  { id: 'chemistry-02', subject: '化学', gradeRange: '高中', keywords: ['离子反应', '离子共存', '沉淀', '气体'], patternName: '离子反应与共存', templateStructure: '给出多种离子组合→判断能否大量共存→分析反应条件→得出结论', generationRules: ['必须有具体离子组合', '必须涉及沉淀/气体/难电离物生成', '每个选项代表不同的离子组合'], scoringPoints: ['正确判断离子能否共存', '正确写出离子反应方程式', '正确说明理由'], commonMistakes: ['忽略沉淀生成', '忽略气体生成', '忽略弱电解质生成', '忘记溶液酸碱性'], variantMethods: ['换离子组合', '换共存条件', '换溶液环境'] },
  // ===== 生物 =====
  { id: 'biology-01', subject: '生物', gradeRange: '高中', keywords: ['孟德尔', '遗传', '分离定律', '表现型'], patternName: '遗传规律计算', templateStructure: '给出遗传情境→判断显隐性→写出基因型→计算比例→得出结论', generationRules: ['必须有具体遗传情境', '必须有具体基因型和表现型', '需要计算遗传比例'], scoringPoints: ['正确判断显隐性', '正确写出亲本基因型', '正确计算子代比例'], commonMistakes: ['混淆显性和隐性', '分离比和自由组合比混淆', '基因型和表现型对应错误'], variantMethods: ['换遗传类型', '换亲本基因型', '换所求比例'] },
  { id: 'biology-02', subject: '生物', gradeRange: '初高中', keywords: ['光合作用', '叶绿体', '线粒体', '细胞器'], patternName: '细胞结构与功能', templateStructure: '给出细胞结构或生命过程→识别细胞器→判断功能→得出结论', generationRules: ['必须有具体细胞结构或过程', '必须区分不同细胞器的功能', '干扰项必须来自常见混淆'], scoringPoints: ['正确识别细胞结构', '正确对应功能', '能区分易混细胞器'], commonMistakes: ['叶绿体和线粒体功能混淆', '内质网和高尔基体功能混淆', '动植物细胞结构混淆'], variantMethods: ['换细胞器', '换生命过程', '换比较维度'] },
  // ===== 历史/政治 =====
  { id: 'history-01', subject: '历史', gradeRange: '初高中', keywords: ['时间线', '事件顺序', '原因影响'], patternName: '时间线与原因分析', templateStructure: '给出历史事件或材料→判断时间顺序→分析原因和影响', generationRules: ['必须有具体历史事件或材料', '需要判断先后顺序', '需要分析因果联系'], scoringPoints: ['正确判断时间顺序', '正确识别原因', '正确分析影响'], commonMistakes: ['时间顺序记忆错误', '原因和结果倒置', '以偏概全'], variantMethods: ['换事件', '换比较维度', '换设问角度'] },
  { id: 'politics-01', subject: '政治', gradeRange: '高中', keywords: ['材料分析', '观点归纳', '理论联系实际'], patternName: '材料分析题', templateStructure: '给出时政或理论材料→提炼核心观点→运用理论分析→提出措施建议', generationRules: ['必须有具体材料', '必须运用相关理论知识', '必须结合实际分析'], scoringPoints: ['正确提炼材料观点', '正确运用理论', '分析逻辑严密', '建议合理可行'], commonMistakes: ['脱离材料空谈理论', '理论和材料脱节', '建议过于空泛'], variantMethods: ['换材料主题', '换理论框架', '换设问角度'] },
  // ===== 地理 =====
  { id: 'geography-01', subject: '地理', gradeRange: '初高中', keywords: ['等高线', '地图', '地形'], patternName: '地图与等高线判读', templateStructure: '给出地图或等高线描述→提取地形信息→判断坡度、地形部位或方向', generationRules: ['仅限初高中地图判读', '设问必须基于材料描述'], scoringPoints: ['定位区域', '提取图表信息', '形成结论'], commonMistakes: ['等高线疏密与坡度关系判断错误'], variantMethods: ['换等高线数值', '换地形部位', '换设问角度'] },
  { id: 'geography-02', subject: '地理', gradeRange: '初高中', keywords: ['气候', '河流', '地貌', '自然灾害'], patternName: '自然地理条件分析', templateStructure: '给出区域自然条件→分析气候、河流或地貌→判断影响', generationRules: ['仅限初高中自然地理', '必须体现区域条件'], scoringPoints: ['提取自然条件', '建立因果链', '形成结论'], commonMistakes: ['自然条件与影响之间因果链不完整'], variantMethods: ['换区域材料', '换自然条件', '换影响对象'] },
  { id: 'geography-03', subject: '地理', gradeRange: '初高中', keywords: ['人口', '城市', '农业', '工业', '交通', '区域发展'], patternName: '人文与区域发展分析', templateStructure: '给出区域人文材料→分析人口、产业或交通条件→判断发展方向', generationRules: ['仅限初高中人文地理', '禁止引入大学GIS课程'], scoringPoints: ['提取人文条件', '分点分析', '形成结论'], commonMistakes: ['自然因素与人文因素混淆'], variantMethods: ['换区域', '换产业', '换设问角度'] },
];

export function getTemplatesBySubject(subject: string): ExamTemplate[] {
  return TEMPLATES.filter(t => t.subject === subject);
}

export function matchTemplatesForKnowledgePoint(
  subject: string,
  knowledgePointTitle: string,
  keywords: string[],
  allowedTemplateIds?: string[]
): ExamTemplate[] {
  const subjectTemplates = getTemplatesBySubject(subject).filter(
    (template) => !allowedTemplateIds?.length || allowedTemplateIds.includes(template.id)
  );
  const allKeywords = [...keywords, knowledgePointTitle].map(k => k.toLowerCase());

  return subjectTemplates
    .map(t => {
      const matchScore = allKeywords.filter(k =>
        t.keywords.some(tk => tk.toLowerCase().includes(k) || k.includes(tk.toLowerCase()))
      ).length;
      return { template: t, score: matchScore };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.template)
    .slice(0, 3);
}

export function getAllTemplates(): ExamTemplate[] {
  return TEMPLATES;
}
