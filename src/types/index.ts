export type Importance = '高' | '中' | '低';
export type Difficulty = '简单' | '中等' | '较难';
export type QuestionType = 'single' | 'judge' | 'short';
export type MaterialFileType = 'txt' | 'pdf' | 'docx' | 'pptx';
export type AIProvider = 'mock' | 'openai' | 'deepseek' | 'qwen';
export type AppStep =
  | 'home'
  | 'material'
  | 'knowledge'
  | 'quiz'
  | 'taking'
  | 'result'
  | 'diagnosis'
  | 'plan'
  | 'reinforcement'
  | 'report';

export interface MaterialInput {
  title: string;
  content: string;
  sourceType: 'text' | 'file' | 'sample';
  fileType?: MaterialFileType;
  fileName?: string;
  fileSize?: number;
  wordCount?: number;
  pageCount?: number;
  slideCount?: number;
}

export interface KnowledgePoint {
  id: string;
  title: string;
  description: string;
  importance: Importance;
  masteryTarget: string;
  examType: string;
  sourceEvidence?: string;
  keywords?: string[];
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
  knowledgePointId: string;
  difficulty: Difficulty;
  sourceEvidence?: string;
  qualityScore?: number;
}

export interface AIStatus {
  provider: AIProvider;
  modeLabel: string;
  isRealAI: boolean;
}

export interface UserAnswer {
  questionId: string;
  answer: string;
}

export interface QuestionResult {
  questionId: string;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  userAnswer: string;
  matchedKeywords?: string[];
}

export interface QuizResult {
  score: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  masteryRate: number;
  weakKnowledgePoints: KnowledgePoint[];
  wrongQuestions: QuestionResult[];
  byKnowledgePoint: Array<{
    knowledgePoint: KnowledgePoint;
    correct: number;
    total: number;
    masteryRate: number;
  }>;
}

export interface DiagnosisItem {
  id: string;
  questionId: string;
  question: string;
  knowledgePointTitle: string;
  reasonType: '概念混淆' | '关键词遗漏' | '应用场景判断错误' | '记忆不牢固' | '表达不完整';
  diagnosis: string;
  correctUnderstanding: string;
  suggestion: string;
}

export interface ReviewPlanDay {
  day: number;
  goal: string;
  focusKnowledgePoints: string[];
  duration: string;
  practiceCount: number;
  method: string;
}

export interface ReinforcementQuestion {
  id: string;
  question: string;
  knowledgePointTitle: string;
  hint: string;
  answer: string;
}

export interface LearningReport {
  title: string;
  markdown: string;
  createdAt: string;
}
