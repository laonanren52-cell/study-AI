import { Send } from 'lucide-react';
import type { QuizQuestion, UserAnswer } from '../types';

interface QuizTakingProps {
  questions: QuizQuestion[];
  answers: UserAnswer[];
  setAnswers: (answers: UserAnswer[]) => void;
  onSubmit: () => void;
}

const typeLabel = {
  single: '单选题',
  judge: '判断题',
  short: '简答题',
};

export default function QuizTaking({ questions, answers, setAnswers, onSubmit }: QuizTakingProps) {
  const answerMap = new Map(answers.map((item) => [item.questionId, item.answer]));
  const updateAnswer = (questionId: string, answer: string) => {
    const next = answers.filter((item) => item.questionId !== questionId);
    setAnswers([...next, { questionId, answer }]);
  };
  const answeredCount = questions.filter((question) => answerMap.get(question.id)?.trim()).length;

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-semibold text-white">在线答题</h2>
          <p className="mt-2 text-slate-400">已作答 {answeredCount}/{questions.length} 题，提交后系统将自动评分并识别薄弱知识点。</p>
        </div>
        <button
          onClick={onSubmit}
          disabled={answeredCount < questions.length}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Send className="h-5 w-5" />
          提交测评
        </button>
      </div>

      <div className="space-y-5">
        {questions.map((question, index) => (
          <article key={question.id} className="glass-panel rounded-lg p-5">
            <span className="rounded bg-cyan-300/12 px-2.5 py-1 text-sm text-cyan-100">{typeLabel[question.type]}</span>
            <h3 className="mt-4 font-semibold leading-7 text-white">{index + 1}. {question.question}</h3>
            {question.type === 'single' && question.options ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {question.options.map((option) => (
                  <button
                    key={option}
                    onClick={() => updateAnswer(question.id, option)}
                    className={`focus-ring rounded-lg border px-4 py-3 text-left transition ${
                      answerMap.get(question.id) === option
                        ? 'border-cyan-300 bg-cyan-300/15 text-cyan-50'
                        : 'border-white/12 bg-white/5 text-slate-300 hover:border-cyan-300/50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
            {question.type === 'judge' ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {['正确', '错误'].map((option) => (
                  <button
                    key={option}
                    onClick={() => updateAnswer(question.id, option)}
                    className={`focus-ring rounded-lg border px-6 py-3 transition ${
                      answerMap.get(question.id) === option
                        ? 'border-cyan-300 bg-cyan-300/15 text-cyan-50'
                        : 'border-white/12 bg-white/5 text-slate-300 hover:border-cyan-300/50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
            {question.type === 'short' ? (
              <textarea
                value={answerMap.get(question.id) ?? ''}
                onChange={(event) => updateAnswer(question.id, event.target.value)}
                className="focus-ring mt-4 min-h-[120px] w-full rounded-lg border border-white/12 bg-slate-950/70 px-4 py-3 leading-7 text-white placeholder:text-slate-500"
                placeholder="请输入你的简答内容..."
              />
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
