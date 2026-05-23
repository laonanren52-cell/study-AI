import { ClipboardList, PlayCircle } from 'lucide-react';
import type { KnowledgePoint, QuizQuestion } from '../types';

interface QuizGeneratorProps {
  questions: QuizQuestion[];
  knowledgePoints: KnowledgePoint[];
  onStart: () => void;
}

const typeLabel = {
  single: '单选题',
  judge: '判断题',
  short: '简答题',
};

export default function QuizGenerator({ questions, knowledgePoints, onStart }: QuizGeneratorProps) {
  const getKnowledgeTitle = (id: string) => knowledgePoints.find((item) => item.id === id)?.title ?? '知识点';
  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-3xl font-semibold text-white">智能测评题目</h2>
          <p className="mt-2 text-slate-400">已生成 5 道单选、3 道判断、2 道简答，覆盖核心知识点。</p>
        </div>
        <button onClick={onStart} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">
          <PlayCircle className="h-5 w-5" />
          开始答题
        </button>
      </div>

      <div className="space-y-4">
        {questions.map((question, index) => (
          <article key={question.id} className="glass-panel rounded-lg p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-cyan-300/12 px-2.5 py-1 text-cyan-100">{typeLabel[question.type]}</span>
              <span className="rounded bg-white/8 px-2.5 py-1 text-slate-300">{question.difficulty}</span>
              <span className="rounded bg-violet-300/12 px-2.5 py-1 text-violet-100">{getKnowledgeTitle(question.knowledgePointId)}</span>
            </div>
            <div className="mt-4 flex gap-3">
              <ClipboardList className="mt-1 h-5 w-5 shrink-0 text-cyan-200" />
              <div>
                <h3 className="font-semibold leading-7 text-white">{index + 1}. {question.question}</h3>
                {question.options ? <p className="mt-2 text-sm text-slate-400">选项：{question.options.join(' / ')}</p> : null}
                <p className="mt-2 text-sm text-slate-500">解析将在提交测评后展示。</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
