import { X, BookOpen, Target, AlertTriangle, CheckCircle, Star } from 'lucide-react';
import type { QuizQuestion, QuestionQualityReview } from '../types';

interface QuestionDetailModalProps {
  question: QuizQuestion;
  review?: QuestionQualityReview;
  onClose: () => void;
}

export default function QuestionDetailModal({ question, review, onClose }: QuestionDetailModalProps) {
  // 质量评分维度
  const dimensions = [
    { label: '题干清晰具体', maxScore: 30, check: !question.question.includes('下列说法正确的是') },
    { label: '选项逻辑通顺', maxScore: 20, check: question.options?.every(o => o.length > 8) },
    { label: '干扰项合理', maxScore: 25, check: !question.options?.some(o => o.includes('以上都不对') || o.includes('与该考点无关')) },
    { label: '解析完整', maxScore: 15, check: (question.explanation?.length ?? 0) >= 30 },
    { label: '符合学科特点', maxScore: 10, check: !!question.examPattern },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">命题详情</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        {/* 命题蓝图信息 */}
        <div className="rounded-xl bg-sky-50 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-sky-600" />
            <span className="text-sm font-semibold text-sky-800">命题蓝图</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-500">蓝图ID：</span><span className="font-mono text-slate-700">{question.blueprintId || '—'}</span></div>
            <div><span className="text-slate-500">难度：</span><span className="font-medium text-slate-700">{question.difficulty}</span></div>
            <div><span className="text-slate-500">考查目标：</span><span className="text-slate-700">{question.targetAbility || '—'}</span></div>
            <div><span className="text-slate-500">题型：</span><span className="text-slate-700">{question.examPattern || '—'}</span></div>
          </div>
          {question.requiredMethods && question.requiredMethods.length > 0 && (
            <div className="mt-2">
              <span className="text-slate-500 text-sm">必需方法：</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {question.requiredMethods.map((m, i) => (
                  <span key={i} className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 质量审查报告 */}
        <div className="rounded-xl bg-amber-50 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">质量审查报告</span>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
              (review?.score ?? question.qualityScore ?? 0) >= 90 ? 'bg-green-100 text-green-800' :
              (review?.score ?? question.qualityScore ?? 0) >= 80 ? 'bg-blue-100 text-blue-800' :
              'bg-red-100 text-red-800'
            }`}>
              {(review?.score ?? question.qualityScore ?? 0)}分
            </span>
          </div>

          {/* 评分维度 */}
          <div className="space-y-2">
            {dimensions.map((dim, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {dim.check ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className="text-slate-700 flex-1">{dim.label}：+{dim.check ? dim.maxScore : 0}分</span>
              </div>
            ))}
          </div>

          {/* 扣分点 */}
          {review?.problems && review.problems.length > 0 && (
            <div className="mt-3 border-t border-amber-200 pt-3">
              <p className="text-xs font-semibold text-red-600 mb-1">扣分点：</p>
              {review.problems.map((p, i) => (
                <p key={i} className="text-xs text-red-600">• {p}</p>
              ))}
            </div>
          )}
          {(!review?.problems || review.problems.length === 0) && (
            <p className="mt-3 text-xs text-green-600 font-medium">✅ 无扣分点</p>
          )}
        </div>

        {/* 来源依据 */}
        {question.sourceEvidence && (
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-4 w-4 text-slate-600" />
              <span className="text-sm font-semibold text-slate-800">来源依据</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{question.sourceEvidence}</p>
          </div>
        )}
      </div>
    </div>
  );
}
