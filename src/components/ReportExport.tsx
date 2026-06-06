import { Check, Clipboard, Download, FileText, FileType2, Printer, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  DiagnosisItem,
  KnowledgePoint,
  LearningReport,
  MaterialInput,
  QuizQuestion,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
} from '../types';
import { downloadMarkdown, downloadWordReport, generateAIEnhancedLearningReport, generateLearningReport } from '../services/reportService';
import type { ReportType } from '../services/reportService';
import { formatFileSize } from '../utils/textClean';
import type { MaterialProfile } from '../services/materialTopicService';

interface ReportExportProps {
  material: MaterialInput;
  knowledgePoints: KnowledgePoint[];
  result: QuizResult;
  diagnosis: DiagnosisItem[];
  reviewPlan: ReviewPlanDay[];
  reinforcementQuiz: ReinforcementQuestion[];
  questions?: QuizQuestion[];
  onExport?: (type: ReportType) => void;
  materialProfile?: MaterialProfile | null;
}

export default function ReportExport(props: ReportExportProps) {
  const [copied, setCopied] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('student');
  const reportParams = useMemo(() => ({ ...props, reportType }), [
    props.material,
    props.knowledgePoints,
    props.result,
    props.diagnosis,
    props.reviewPlan,
    props.reinforcementQuiz,
    props.questions,
    props.materialProfile,
    reportType,
  ]);
  const fallbackReport: LearningReport = useMemo(() => generateLearningReport(reportParams), [reportParams]);
  const [report, setReport] = useState<LearningReport>(fallbackReport);
  const sourceItems = [
    ['输入方式', props.material.sourceType === 'sample' ? '示例资料' : props.material.sourceType === 'file' ? '文件上传' : '文本粘贴'],
    props.material.fileName ? ['文件名', props.material.fileName] : null,
    props.material.fileType ? ['文件类型', props.material.fileType.toUpperCase()] : null,
    typeof props.material.fileSize === 'number' ? ['文件大小', formatFileSize(props.material.fileSize)] : null,
    typeof props.material.wordCount === 'number' ? ['提取字数', `${props.material.wordCount}`] : null,
    typeof props.material.pageCount === 'number' ? ['PDF 页数', `${props.material.pageCount}`] : null,
    typeof props.material.slideCount === 'number' ? ['PPT 页数', `${props.material.slideCount}`] : null,
  ].filter(Boolean) as string[][];

  const copyReport = async () => {
    await navigator.clipboard.writeText(report.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => {
    let cancelled = false;
    setReport(fallbackReport);
    generateAIEnhancedLearningReport(reportParams).then((nextReport) => {
      if (!cancelled) setReport(nextReport);
    });
    return () => {
      cancelled = true;
    };
  }, [fallbackReport, reportParams]);

  const switchReportType = (type: ReportType) => {
    setReportType(type);
    props.onExport?.(type);
  };

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6">
        <p className="text-sm font-semibold text-sky-700">报告中心</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">学习报告导出</h2>
        <p className="mt-2 text-slate-600">报告整合资料来源、知识点、测评结果、错因诊断、复习计划和强化练习建议。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            <FileText className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-slate-950">{report.title}</h3>
          <p className="mt-2 text-sm text-slate-500">生成时间：{report.createdAt}</p>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">资料来源</p>
            <div className="grid gap-2 text-sm">
              {sourceItems.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 rounded-xl bg-white px-3 py-2">
                  <span className="text-slate-500">{label}</span>
                  <span className="break-all text-right font-medium text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="no-print mt-6 grid gap-3">
            <button onClick={() => downloadMarkdown(report)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-sky-700">
              <Download className="h-5 w-5" />
              下载 Markdown 报告
            </button>
            <button onClick={copyReport} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50">
              {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Clipboard className="h-5 w-5" />}
              {copied ? '已复制' : '复制到剪贴板'}
            </button>
            <button onClick={() => window.print()} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50">
              <Printer className="h-5 w-5" />
              打印 / 导出 PDF
            </button>
            <button onClick={() => downloadWordReport(report)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50">
              <FileType2 className="h-5 w-5" />
              导出 Word 报告
            </button>
          </div>

          {/* 批量导出选项 */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            <button
              onClick={() => switchReportType('student')}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors"
            >
              <FileText className="h-6 w-6 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">学生版报告</span>
              <span className="text-xs text-slate-400">题目+答案+解析</span>
            </button>
            <button
              onClick={() => switchReportType('teacher')}
              className="flex flex-col items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 p-4 hover:bg-purple-100 transition-colors"
            >
              <Users className="h-6 w-6 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">教师版报告</span>
              <span className="text-xs text-purple-400">学情+统计+建议</span>
            </button>
            <button
              onClick={() => switchReportType('parent')}
              className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 hover:bg-emerald-100 transition-colors"
            >
              <Users className="h-6 w-6 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">家长版报告</span>
              <span className="text-xs text-emerald-500">简洁反馈</span>
            </button>
            <button
              onClick={() => switchReportType('blank_paper')}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-6 w-6 text-slate-600" />
              <span className="text-sm font-medium text-slate-700">空白试卷</span>
              <span className="text-xs text-slate-400">可直接打印</span>
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">正式报告预览</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Document</span>
          </div>
          <div className="max-h-[720px] overflow-auto rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-700">
            <div className="border-b border-slate-200 pb-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">智学闭环学习报告</p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-950">{report.title}</h3>
              <p className="mt-2 text-slate-500">生成时间：{report.createdAt}</p>
            </div>

            <pre className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 font-sans text-sm leading-7 text-slate-800">
              {report.markdown}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
