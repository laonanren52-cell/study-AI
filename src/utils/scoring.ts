import type { KnowledgePoint, QuestionResult, QuizQuestion, QuizResult, UserAnswer } from '../types';

const normalizeAnswer = (value: string) => value.trim().toLowerCase();

const shortAnswerKeywords: Record<string, string[]> = {
  q9: ['过拟合', '训练数据', '新数据', '泛化'],
  q10: ['个性化', '薄弱', '推荐', '复习'],
};

export const evaluateQuizAnswers = (
  questions: QuizQuestion[],
  answers: UserAnswer[],
  knowledgePoints: KnowledgePoint[],
): QuizResult => {
  const answerMap = new Map(answers.map((item) => [item.questionId, item.answer]));
  const maxPerQuestion = 10;

  const evaluated: QuestionResult[] = questions.map((question) => {
    const userAnswer = answerMap.get(question.id) ?? '';
    if (question.type === 'short') {
      const keywords = shortAnswerKeywords[question.id] ?? question.answer.split(/[，。、；\s]+/).filter(Boolean);
      const matchedKeywords = keywords.filter((word) => normalizeAnswer(userAnswer).includes(normalizeAnswer(word)));
      const score = Math.min(maxPerQuestion, Math.round((matchedKeywords.length / Math.max(keywords.length, 1)) * maxPerQuestion));
      return {
        questionId: question.id,
        isCorrect: score >= 7,
        score,
        maxScore: maxPerQuestion,
        userAnswer,
        matchedKeywords,
      };
    }

    const isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(question.answer);
    return {
      questionId: question.id,
      isCorrect,
      score: isCorrect ? maxPerQuestion : 0,
      maxScore: maxPerQuestion,
      userAnswer,
    };
  });

  const score = evaluated.reduce((sum, item) => sum + item.score, 0);
  const correctCount = evaluated.filter((item) => item.isCorrect).length;
  const wrongQuestions = evaluated.filter((item) => !item.isCorrect);
  const masteryRate = Math.round((score / (questions.length * maxPerQuestion)) * 100);

  const byKnowledgePoint = knowledgePoints.map((knowledgePoint) => {
    const relatedQuestions = questions.filter((question) => question.knowledgePointId === knowledgePoint.id);
    const relatedResults = relatedQuestions.map((question) => evaluated.find((item) => item.questionId === question.id)!);
    const kpScore = relatedResults.reduce((sum, item) => sum + item.score, 0);
    const kpMax = relatedResults.length * maxPerQuestion;
    return {
      knowledgePoint,
      correct: relatedResults.filter((item) => item.isCorrect).length,
      total: relatedResults.length,
      masteryRate: kpMax > 0 ? Math.round((kpScore / kpMax) * 100) : 100,
    };
  });

  const weakKnowledgePoints = byKnowledgePoint
    .filter((item) => item.total > 0 && item.masteryRate < 75)
    .map((item) => item.knowledgePoint);

  return {
    score,
    totalQuestions: questions.length,
    correctCount,
    wrongCount: wrongQuestions.length,
    masteryRate,
    weakKnowledgePoints,
    wrongQuestions,
    byKnowledgePoint,
  };
};
