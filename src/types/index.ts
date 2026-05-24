export type Importance = '高' | '中' | '低';
export type Difficulty = '简单' | '中等' | '较难';
export type QuestionType = 'single' | 'judge' | 'fill' | 'short' | 'solution' | 'material';
export type MaterialFileType = 'txt' | 'pdf' | 'docx' | 'pptx' | 'image';
export type AIProvider = 'mock' | 'openai' | 'deepseek' | 'qwen';
export type SubjectType = '语文' | '数学' | '英语' | '物理' | '化学' | '生物' | '政治' | '历史' | '地理' | '通用';
export type ExamQuestionPattern =
  | '基础概念题'
  | '公式套用题'
  | '条件辨析题'
  | '易错判断题'
  | '材料分析题'
  | '变式迁移题'
  | '综合解答题';
export type ExamType = '自动识别' | '期末' | '高职高考' | '考证' | '竞赛' | '自定义';
export type TrainingMode = '基础巩固' | '错题强化' | '考前冲刺' | '变式训练';
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
  imageDataUrl?: string;
}

export interface QuizSettings {
  subjectType: SubjectType | '自动识别';
  examType: ExamType;
  customExamType?: string;
  questionCount: 5 | 10 | 15;
  difficultyRatio: {
    easy: number;
    medium: number;
    hard: number;
  };
  questionTypes: QuestionType[];
  trainingMode: TrainingMode;
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
  subjectType?: SubjectType;
  examPatterns?: ExamQuestionPattern[];
  formulas?: string[];
  commonMistakes?: string[];
  keyMethods?: string[];
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
  examPattern?: ExamQuestionPattern;
  scoringRubric?: string[];
  solutionSteps?: string[];
  optionExplanations?: Record<string, string>;
  commonMistake?: string;
  learningObjective?: string;
  answerInputMode?: 'text' | 'image' | 'both';
  recommendedVariant?: string;
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
  matchedRubric?: string[];
  missingRubric?: string[];
  feedback?: string;
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
  userAnswer?: string;
  reasonType: '概念混淆' | '关键词遗漏' | '应用场景判断错误' | '记忆不牢固' | '表达不完整';
  diagnosis: string;
  correctUnderstanding: string;
  suggestion: string;
  missingRubric?: string[];
  commonMistake?: string;
  masteryStatus?: '已掌握' | '待加强' | '薄弱';
}

export interface ReviewPlanDay {
  day: number;
  goal: string;
  focusKnowledgePoints: string[];
  duration: string;
  practiceCount: number;
  method: string;
  mustRemember?: string[];
  exampleTasks?: string[];
  reinforcementTasks?: string[];
  commonMistakes?: string[];
  selfCheckCriteria?: string[];
  checklist?: Array<{ id: string; text: string; done: boolean }>;
}

export interface ReinforcementQuestion {
  id: string;
  knowledgePointTitle: string;
  examPattern: ExamQuestionPattern;
  question: string;
  hint: string;
  answer: string;
  solutionSteps: string[];
  scoringRubric: string[];
  commonMistake: string;
  sourceQuestionId?: string;
  sourceEvidence?: string;
  difficulty: Difficulty;
}

export interface ImageAnswer {
  questionId: string;
  imageDataUrl: string;
  recognizedText?: string;
  status: 'idle' | 'recognizing' | 'recognized' | 'failed';
  error?: string;
}

export interface LearningReport {
  title: string;
  markdown: string;
  createdAt: string;
}
