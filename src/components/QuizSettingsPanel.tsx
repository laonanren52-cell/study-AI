import { Settings2 } from 'lucide-react';
import { SUBJECT_DISPLAY_OPTIONS, EXAM_TYPE_DISPLAY_OPTIONS, SUBJECT_SCOPE_NOTICE, isSupportedDisplaySubject } from '../services/subjectConfig';
import { normalizeDifficultyRatio, rebalanceDifficultyRatio } from '../services/difficultyRatio';
import type { ExamType, QuestionType, QuizSettings, SubjectType, TrainingMode } from '../types';

interface QuizSettingsPanelProps {
  settings: QuizSettings;
  onChange: (settings: QuizSettings) => void;
}

const counts: Array<5 | 10 | 15> = [5, 10, 15];
const trainingModes: TrainingMode[] = ['基础巩固', '错题强化', '考前冲刺', '变式训练', '母题改编'];
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
  strictSourceMode: true,
  enableWebEnhancedQuestions: false,
};

const sliderAccentClass: Record<string, string> = {
  emerald: 'accent-emerald-500',
  amber: 'accent-amber-500',
  rose: 'accent-rose-500',
};

export default function QuizSettingsPanel({ settings, onChange }: QuizSettingsPanelProps) {
  const update = (patch: Partial<QuizSettings>) => onChange({ ...settings, ...patch });
  const normalizedRatio = normalizeDifficultyRatio(settings.difficultyRatio);
  const ratioTotal = normalizedRatio.easy + normalizedRatio.medium + normalizedRatio.hard;
  const updateDifficulty = (key: keyof QuizSettings['difficultyRatio'], value: number) => {
    update({
      difficultyRatio: rebalanceDifficultyRatio(normalizedRatio, key, Number.isNaN(value) ? 0 : value),
    });
  };
  const toggleQuestionType = (type: QuestionType) => {
    const exists = settings.questionTypes.includes(type);
    const next = exists ? settings.questionTypes.filter((item) => item !== type) : [...settings.questionTypes, type];
    update({ questionTypes: next.length > 0 ? next : [type] });
  };
  const showUnsupportedNotice = settings.subjectType !== '自动识别' && !isSupportedDisplaySubject(settings.subjectType);

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

      {/* 范围提示 */}
      <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">
        {SUBJECT_SCOPE_NOTICE}
      </div>

      {/* 非核心学科提示 */}
      {showUnsupportedNotice ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
          当前资料不属于初高中家教学科范围。请手动选择语文、数学、英语、物理、化学、生物、历史、政治或地理，或上传对应课程资料。
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 lg:col-span-2">
          <input
            type="checkbox"
            checked={settings.strictSourceMode !== false}
            onChange={(event) => update({ strictSourceMode: event.target.checked })}
            className="mt-1 h-4 w-4 accent-sky-600"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">严格按上传资料出题</span>
            <span className="mt-1 block text-sm leading-6 text-slate-600">
              开启后，系统只围绕上传资料中的知识点生成题目；若资料范围较窄，可能少于设定题数，但不会跨章节补题。
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
          <input
            type="checkbox"
            checked={settings.enableWebEnhancedQuestions === true}
            onChange={(event) => update({ enableWebEnhancedQuestions: event.target.checked })}
            className="mt-1 h-4 w-4 accent-sky-600"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">联网增强出题</span>
            <span className="mt-1 block text-sm leading-6 text-slate-600">
              默认关闭。开启后仅补充参考摘要；网络不可用时会自动降级，不影响按上传资料出题。
            </span>
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">学科类型</span>
          <select
            value={settings.subjectType}
            onChange={(event) => update({ subjectType: event.target.value as SubjectType | '自动识别' })}
            className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
          >
            {SUBJECT_DISPLAY_OPTIONS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">考试类型</span>
          <select
            value={settings.examType}
            onChange={(event) => update({ examType: event.target.value as ExamType })}
            className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
          >
            {EXAM_TYPE_DISPLAY_OPTIONS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        {settings.examType === '自定义' ? (
          <label className="block lg:col-span-2">
            <span className="text-sm font-medium text-slate-700">自定义考试类型</span>
            <input
              value={settings.customExamType ?? ''}
              onChange={(event) => update({ customExamType: event.target.value })}
              className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
              placeholder="例如：广雅中学初三摸底测试"
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
                className={"focus-ring rounded-2xl px-4 py-3 text-sm font-semibold transition " + (settings.questionCount === count ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-white")}
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
                onClick={() => update({ trainingMode: mode as TrainingMode })}
                className={"focus-ring rounded-2xl px-3 py-3 text-sm font-semibold transition " + (settings.trainingMode === mode ? "bg-sky-600 text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-white")}
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
                className={"focus-ring rounded-full px-4 py-2 text-sm font-semibold transition " + (settings.questionTypes.includes(item.value) ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-white")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <span className="text-sm font-medium text-slate-700">难度比例</span>
            <span className="text-xs text-slate-500">
              当前比例：简单 {normalizedRatio.easy}% / 中等 {normalizedRatio.medium}% / 较难 {normalizedRatio.hard}%（合计 {ratioTotal}%）
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {([
              ['easy', '简单', '偏基础概念和直接套用', 'emerald'],
              ['medium', '中等', '强调条件辨析和常见误区', 'amber'],
              ['hard', '较难', '包含综合步骤和变式迁移', 'rose'],
            ] as const).map(([key, label, desc, tone]) => (
              <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={normalizedRatio[key]}
                    onChange={(event) => updateDifficulty(key, Number(event.target.value))}
                    className="focus-ring w-16 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-sm font-semibold text-slate-900"
                    aria-label={label + "题比例"}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={normalizedRatio[key]}
                  onChange={(event) => updateDifficulty(key, Number(event.target.value))}
                  className={"mt-3 h-2 w-full cursor-pointer " + sliderAccentClass[tone]}
                  aria-label={label + "题滑动比例"}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => update({ difficultyRatio: { easy: 20, medium: 50, hard: 30 } })}
            className="focus-ring mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            恢复推荐比例 20 / 50 / 30
          </button>
        </div>
      </div>
    </div>
  );
}
