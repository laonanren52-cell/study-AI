import { Settings2 } from 'lucide-react';
import type { ExamType, QuestionType, QuizSettings, SubjectType, TrainingMode } from '../types';

interface QuizSettingsPanelProps {
  settings: QuizSettings;
  onChange: (settings: QuizSettings) => void;
}

const subjects: Array<QuizSettings['subjectType']> = ['自动识别', '语文', '数学', '英语', '物理', '化学', '通用'];
const examTypes: ExamType[] = ['自动识别', '期末', '高职高考', '考证', '竞赛', '自定义'];
const counts: Array<5 | 10 | 15> = [5, 10, 15];
const trainingModes: TrainingMode[] = ['基础巩固', '错题强化', '考前冲刺', '变式训练'];
const questionTypeOptions: Array<{ value: QuestionType; label: string }> = [
  { value: 'single', label: '单选' },
  { value: 'judge', label: '判断' },
  { value: 'fill', label: '填空' },
  { value: 'short', label: '简答' },
  { value: 'solution', label: '解答' },
  { value: 'material', label: '材料分析' },
];

export const defaultQuizSettings: QuizSettings = {
  subjectType: '自动识别',
  examType: '自动识别',
  questionCount: 10,
  difficultyRatio: {
    easy: 20,
    medium: 50,
    hard: 30,
  },
  questionTypes: ['single', 'judge', 'short', 'solution'],
  trainingMode: '基础巩固',
};

export default function QuizSettingsPanel({ settings, onChange }: QuizSettingsPanelProps) {
  const update = (patch: Partial<QuizSettings>) => onChange({ ...settings, ...patch });

  const toggleQuestionType = (type: QuestionType) => {
    const exists = settings.questionTypes.includes(type);
    const next = exists ? settings.questionTypes.filter((item) => item !== type) : [...settings.questionTypes, type];
    update({ questionTypes: next.length > 0 ? next : [type] });
  };

  return (
    <div className="rounded-[2rem] bg-white p-5 ring-1 ring-slate-200/80 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Settings2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-sky-700">出题设置</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">按考试场景生成训练题</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">生成题目前会读取这些参数，控制学科、题量、题型、难度和训练模式。</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">学科类型</span>
          <select
            value={settings.subjectType}
            onChange={(event) => update({ subjectType: event.target.value as SubjectType | '自动识别' })}
            className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
          >
            {subjects.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">考试类型</span>
          <select
            value={settings.examType}
            onChange={(event) => update({ examType: event.target.value as ExamType })}
            className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
          >
            {examTypes.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        {settings.examType === '自定义' ? (
          <label className="block lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">自定义考试类型</span>
            <input
              value={settings.customExamType ?? ''}
              onChange={(event) => update({ customExamType: event.target.value })}
              className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
              placeholder="例如：广东高职高考语文专项"
            />
          </label>
        ) : null}

        <div>
          <span className="text-sm font-medium text-slate-700">题目数量</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {counts.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => update({ questionCount: count })}
                className={`focus-ring rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  settings.questionCount === count ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-white'
                }`}
              >
                {count} 题
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium text-slate-700">训练模式</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {trainingModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => update({ trainingMode: mode })}
                className={`focus-ring rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  settings.trainingMode === mode ? 'bg-sky-600 text-white' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <span className="text-sm font-medium text-slate-700">题型组合</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {questionTypeOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => toggleQuestionType(item.value)}
                className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold transition ${
                  settings.questionTypes.includes(item.value) ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-slate-700">默认难度比例</span>
            <span className="text-xs text-slate-500">简单 {settings.difficultyRatio.easy}% / 中等 {settings.difficultyRatio.medium}% / 较难 {settings.difficultyRatio.hard}%</span>
          </div>
          <div className="mt-3 grid grid-cols-[0.4fr_1fr_0.6fr] overflow-hidden rounded-full bg-slate-100 text-center text-xs font-semibold text-white">
            <div className="bg-emerald-500 py-2">简单</div>
            <div className="bg-amber-500 py-2">中等</div>
            <div className="bg-rose-500 py-2">较难</div>
          </div>
        </div>
      </div>
    </div>
  );
}
