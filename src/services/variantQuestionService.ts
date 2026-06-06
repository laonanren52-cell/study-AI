import type { Difficulty, QuizQuestion } from '../types';
import type { MaterialProfile } from './materialTopicService';
import { normalizedStemHash, verifyQuestionAgainstProfile } from './questionTopicVerifier';

interface VariantParams {
  baseQuestion: QuizQuestion;
  materialProfile: MaterialProfile;
  sourceText: string;
  difficulty: Difficulty;
  count: number;
  existingQuestions?: QuizQuestion[];
}

const createQuestion = (
  baseQuestion: QuizQuestion,
  profile: MaterialProfile,
  index: number,
  question: string,
  options: string[],
  answer: string,
  explanation: string,
  difficulty: Difficulty
): QuizQuestion => ({
  id: `variant-${Date.now()}-${index}`,
  subject: profile.subject,
  normalizedStemHash: normalizedStemHash(question),
  type: 'single',
  question,
  options,
  answer,
  explanation,
  knowledgePointId: baseQuestion.knowledgePointId,
  difficulty,
  qualityScore: 90,
  templateId: profile.allowedTemplateIds[index % Math.max(profile.allowedTemplateIds.length, 1)],
  sourceEvidence: profile.sourceSummary,
});

const trigVariants = (baseQuestion: QuizQuestion, profile: MaterialProfile, difficulty: Difficulty): QuizQuestion[] => [
  createQuestion(baseQuestion, profile, 0, '已知 tanα = 4/3，且 α 是第一象限角，求 sinα 和 cosα', ['sinα=4/5, cosα=3/5', 'sinα=3/5, cosα=4/5', 'sinα=4/3, cosα=3/4', 'sinα=3/4, cosα=4/3'], 'sinα=4/5, cosα=3/5', '由 tanα=sinα/cosα=4/3，设 sinα=4k，cosα=3k，代入 sin²α+cos²α=1，得 k=1/5。', difficulty),
  createQuestion(baseQuestion, profile, 1, '已知 tanα = -5/12，且 α 是第四象限角，求 cosα', ['cosα=12/13', 'cosα=-12/13', 'cosα=5/13', 'cosα=-5/13'], 'cosα=12/13', '第四象限 sinα<0、cosα>0。设 sinα=-5k，cosα=12k，代入平方关系得 k=1/13。', difficulty),
  createQuestion(baseQuestion, profile, 2, '已知 sinα = 3/5，且 α 是第二象限角，求 tanα', ['tanα=-3/4', 'tanα=3/4', 'tanα=-4/3', 'tanα=4/3'], 'tanα=-3/4', '由平方关系得 cosα=-4/5，再由 tanα=sinα/cosα 得 tanα=-3/4。', difficulty),
  createQuestion(baseQuestion, profile, 3, '若 α 是第三象限角，且 cosα = -12/13，则 sinα =（  ）', ['-5/13', '5/13', '-12/13', '12/13'], '-5/13', '由 sin²α+cos²α=1 得 |sinα|=5/13，第三象限 sinα<0。', difficulty),
];

const quadraticVariants = (baseQuestion: QuizQuestion, profile: MaterialProfile, difficulty: Difficulty): QuizQuestion[] => [
  createQuestion(baseQuestion, profile, 0, '求不等式 x²-7x+10>0 的解集，并判断对应二次函数图像在哪些区间位于 x 轴上方。', ['x<2 或 x>5', '2<x<5', 'x≤2 或 x≥5', '全体实数'], 'x<2 或 x>5', 'x²-7x+10=(x-2)(x-5)，抛物线开口向上，图像在两根外侧位于 x 轴上方，所以解集为 x<2 或 x>5。', difficulty),
  createQuestion(baseQuestion, profile, 1, '若二次函数 y=x²-4x+4 与 x 轴只有一个交点，则方程 x²-4x+4=0 的根是（  ）', ['x=2', 'x=-2', 'x=0', '无实根'], 'x=2', 'x²-4x+4=(x-2)²，判别式 Δ=0，图像与 x 轴相切，方程有两个相等实根 x=2。', difficulty),
  createQuestion(baseQuestion, profile, 2, '已知不等式 x²-9<0，结合函数 y=x²-9 的图像写出 x 的取值范围。', ['-3<x<3', 'x<-3 或 x>3', 'x≤-3 或 x≥3', 'x=±3'], '-3<x<3', '方程 x²-9=0 的两根是 -3 和 3。抛物线开口向上，小于 0 表示图像在 x 轴下方，因此取两根之间的区间。', difficulty),
  createQuestion(baseQuestion, profile, 3, '若 x²-2mx+9>0 对一切实数 x 恒成立，则 m 的取值范围是（  ）', ['-3<m<3', 'm≤-3 或 m≥3', 'm>3', '全体实数'], '-3<m<3', '开口向上且恒大于 0，需要判别式 Δ<0。Δ=(-2m)²-36=4m²-36<0，所以 m²<9，即 -3<m<3。', difficulty),
];

const chemistryVariants = (baseQuestion: QuizQuestion, profile: MaterialProfile, difficulty: Difficulty): QuizQuestion[] => [
  createQuestion(baseQuestion, profile, 0, '下列化学方程式书写正确的是（  ）', ['2H₂ + O₂ = 2H₂O', 'H₂ + O₂ = H₂O', '2H₂ + O₂ = H₂O', 'H₂ + O₂ = 2H₂O'], '2H₂ + O₂ = 2H₂O', '判断化学方程式时需要检查反应物、生成物和配平系数。', difficulty),
  createQuestion(baseQuestion, profile, 1, '在无色透明溶液中，下列离子能够大量共存的是（  ）', ['K⁺、NO₃⁻、Cl⁻', 'H⁺、CO₃²⁻、Na⁺', 'Ba²⁺、SO₄²⁻、Cl⁻', 'Ag⁺、Cl⁻、NO₃⁻'], 'K⁺、NO₃⁻、Cl⁻', 'K⁺、NO₃⁻、Cl⁻之间不发生生成沉淀、气体或难电离物的反应。', difficulty),
  createQuestion(baseQuestion, profile, 2, '判断离子反应能否发生时，首先应检查的是（  ）', ['是否生成沉淀、气体或难电离物', '溶液颜色是否相同', '元素名称是否相近', '化学式长度是否一致'], '是否生成沉淀、气体或难电离物', '离子反应发生的常见条件是生成沉淀、气体或难电离物。', difficulty),
];

const geographyVariants = (baseQuestion: QuizQuestion, profile: MaterialProfile, difficulty: Difficulty): QuizQuestion[] => [
  createQuestion(baseQuestion, profile, 0, '等高线地形图中，等高线越密集通常表示（  ）', ['坡度越陡', '坡度越缓', '海拔一定越低', '河流流速一定越慢'], '坡度越陡', '等高线疏密反映坡度变化，越密集说明单位水平距离内高差越大。', difficulty),
  createQuestion(baseQuestion, profile, 1, '分析某区域农业区位条件时，下列属于自然地理因素的是（  ）', ['气候和河流水源', '市场和交通', '政策和技术', '劳动力数量'], '气候和河流水源', '气候、河流、地貌属于自然因素；市场、交通、政策和劳动力属于人文因素。', difficulty),
  createQuestion(baseQuestion, profile, 2, '某城市位于河流交汇处，其早期发展的主要有利条件是（  ）', ['水运交通便利', '矿产资源一定丰富', '海拔一定较高', '全年降水一定均匀'], '水运交通便利', '河流交汇处通常具有较好的水运和交通条件，应以材料信息为依据判断。', difficulty),
];

export function generateVariantQuestions({
  baseQuestion,
  materialProfile,
  difficulty,
  count,
  existingQuestions = [],
}: VariantParams): QuizQuestion[] {
  const pool = materialProfile.subject === '数学' && /二次函数|一元二次方程|一元二次不等式|判别式|解集|恒成立/.test(`${materialProfile.topic} ${materialProfile.coreConcepts.join(' ')}`)
    ? quadraticVariants(baseQuestion, materialProfile, difficulty)
    : materialProfile.subject === '数学' && materialProfile.topic.includes('三角函数')
      ? trigVariants(baseQuestion, materialProfile, difficulty)
    : materialProfile.subject === '化学'
      ? chemistryVariants(baseQuestion, materialProfile, difficulty)
      : materialProfile.subject === '地理'
        ? geographyVariants(baseQuestion, materialProfile, difficulty)
        : [];
  const seen = new Set([baseQuestion, ...existingQuestions].map((question) => normalizedStemHash(question.question)));
  return pool.filter((question) => {
    const review = verifyQuestionAgainstProfile(question, materialProfile, seen);
    if (!review.passed) return false;
    seen.add(question.normalizedStemHash || normalizedStemHash(question.question));
    return true;
  }).slice(0, count);
}
