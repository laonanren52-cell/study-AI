import { Check, Clipboard, Download, FileText, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  DiagnosisItem,
  KnowledgePoint,
  LearningReport,
  MaterialInput,
  QuizResult,
  ReinforcementQuestion,
  ReviewPlanDay,
} from '../types';
import { downloadMarkdown, generateLearningReport } from '../services/reportService';
import { formatFileSize } from '../utils/textClean';

interface ReportExportProps {
  material: MaterialInput;
  knowledgePoints: KnowledgePoint[];
  result: QuizResult;
  diagnosis: DiagnosisItem[];
  reviewPlan: ReviewPlanDay[];
  reinforcementQuiz: ReinforcementQuestion[];
}

export default function ReportExport(props: ReportExportProps) {
  const [copied, setCopied] = useState(false);
  const report: LearningReport = useMemo(() => generateLearningReport(props), [props]);
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

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6">
        <h2 className="text-3xl font-semibold text-white">学习报告导出</h2>
        <p className="mt-2 text-slate-400">报告整合资料、知识点、测评结果、错因诊断、复习计划和强化练习建议。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="glass-panel rounded-lg p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-100">
            <FileText className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-white">{report.title}</h3>
          <p className="mt-2 text-sm text-slate-400">生成时间：{report.createdAt}</p>
          <div className="mt-5 rounded-lg bg-white/6 p-4">
            <p className="mb-3 text-sm font-semibold text-cyan-100">资料来源</p>
            <div className="grid gap-2 text-sm">
              {sourceItems.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-slate-400">{label}</span>
                  <span className="break-all text-right text-slate-100">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            <button onClick={() => downloadMarkdown(report)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200">
              <Download className="h-5 w-5" />
              下载 Markdown 报告
            </button>
            <button onClick={copyReport} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 px-5 py-3 text-slate-200 hover:border-cyan-300/50">
              {copied ? <Check className="h-5 w-5 text-emerald-200" /> : <Clipboard className="h-5 w-5" />}
              {copied ? '已复制' : '复制到剪贴板'}
            </button>
            <button onClick={() => window.print()} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 px-5 py-3 text-slate-200 hover:border-cyan-300/50">
              <Printer className="h-5 w-5" />
              打印 / 导出 PDF
            </button>
            <button disabled className="rounded-lg border border-white/10 px-5 py-3 text-slate-500">导出 Word 后续支持</button>
          </div>
        </div>

        <pre className="glass-panel max-h-[620px] overflow-auto whitespace-pre-wrap rounded-lg p-6 text-sm leading-7 text-slate-300">
          {report.markdown}
        </pre>
      </div>
    </section>
  );
}
