import type { QuizQuestion } from '../types';

export interface VerificationResult {
  passed: boolean;
  score: number;
  problems: string[];
  suggestions: string[];
}

/**
 * ???????
 * ???????????????????????????
 */
export function verifyQuestionAccuracy(
  question: QuizQuestion,
  materialText?: string
): VerificationResult {
  const problems: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // 1. ???????
  if (!question.knowledgePointId) {
    score -= 20;
    problems.push('??????');
  }

  // 2. ???????
  if (!question.answer || question.answer.trim().length === 0) {
    score -= 20;
    problems.push('????');
  }

  // 3. ???????????????
  if (question.type === 'single' && question.options && question.options.length > 0) {
    const answerFound = question.options.some(
      o => o === question.answer || o.startsWith(question.answer)
    );
    if (!answerFound && !question.correctOptionLabel) {
      score -= 15;
      problems.push('???????');
    }
  }

  // 4. ?????
  if (!question.explanation || question.explanation.length < 15) {
    score -= 15;
    problems.push('?????');
  }

  // 5. ???????
  if (!question.sourceEvidence || question.sourceEvidence.length < 5) {
    score -= 10;
    problems.push('??????');
  }

  // 6. ??????
  if (!question.question || question.question.length < 10) {
    score -= 10;
    problems.push('????');
  }

  const passed = score >= 60;

  if (suggestions.length === 0 && !passed) {
    suggestions.push('????????????????');
  }

  return { passed, score: Math.max(0, score), problems, suggestions };
}
