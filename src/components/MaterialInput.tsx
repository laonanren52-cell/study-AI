import { AlertCircle, FileText, FileUp, Loader2, Play, Sparkles } from 'lucide-react';
import type { DragEvent } from 'react';
import { useState } from 'react';
import { sampleMaterial, sampleMaterialTitle } from '../data/sampleMaterial';
import { parseFileToMaterial } from '../services/fileParser';
import type { MaterialInput as MaterialInputType } from '../types';
import { formatFileSize } from '../utils/textClean';

interface MaterialInputProps {
  material: MaterialInputType;
  setMaterial: (material: MaterialInputType) => void;
  onAnalyze: () => void;
}

const supportedFormats = ['TXT 文本', 'PDF 文档', 'Word 文档 .docx', 'PPT 课件 .pptx'];

const fileTypeLabel = {
  txt: 'TXT',
  pdf: 'PDF',
  docx: 'Word .docx',
  pptx: 'PPT .pptx',
};

export default function MaterialInput({ material, setMaterial, onAnalyze }: MaterialInputProps) {
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [parseError, setParseError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const clearFileMeta = (next: MaterialInputType): MaterialInputType => ({
    title: next.title,
    content: next.content,
    sourceType: next.sourceType,
  });

  const updateTextContent = (content: string) => {
    if (material.sourceType === 'file') {
      setMaterial({ ...material, content });
      return;
    }
    setMaterial(clearFileMeta({ ...material, content, sourceType: 'text' }));
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setParseError('');
    setIsParsingFile(true);
    try {
      const parsed = await parseFileToMaterial(file);
      setMaterial({
        title: parsed.title,
        content: parsed.content,
        sourceType: 'file',
        fileType: parsed.fileType,
        fileName: parsed.meta.fileName,
        fileSize: parsed.meta.fileSize,
        wordCount: parsed.meta.wordCount,
        pageCount: parsed.meta.pageCount,
        slideCount: parsed.meta.slideCount,
      });
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '文件解析失败，请更换文件或复制内容粘贴。');
    } finally {
      setIsParsingFile(false);
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0]);
  };

  const fileInfoItems = [
    material.fileName ? ['文件名', material.fileName] : null,
    material.fileType ? ['文件类型', fileTypeLabel[material.fileType]] : null,
    typeof material.fileSize === 'number' ? ['文件大小', formatFileSize(material.fileSize)] : null,
    typeof material.wordCount === 'number' ? ['提取字数', `${material.wordCount}`] : null,
    typeof material.pageCount === 'number' ? ['PDF 页数', `${material.pageCount}`] : null,
    typeof material.slideCount === 'number' ? ['PPT 页数', `${material.slideCount}`] : null,
  ].filter(Boolean) as string[][];

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6">
        <p className="text-sm font-semibold text-sky-700">文件导入中心</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-950">导入学习资料</h2>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">支持粘贴文本，也支持 PDF / Word / PPTX / TXT 在浏览器端本地解析，无需后端和数据库。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="glass-panel rounded-2xl p-6">
          <div className="grid gap-3">
            <button
              onClick={() => {
                setParseError('');
                setMaterial({ title: sampleMaterialTitle, content: sampleMaterial, sourceType: 'sample' });
              }}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              <Sparkles className="h-5 w-5" />
              使用示例资料
            </button>
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`focus-within:ring-2 focus-within:ring-sky-400/60 rounded-2xl border border-dashed p-6 text-center transition ${
                isDragging ? 'border-sky-400 bg-sky-50' : 'border-slate-300 bg-slate-50 hover:border-sky-300 hover:bg-sky-50/70'
              }`}
            >
              {isParsingFile ? <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-sky-600" /> : <FileUp className="mx-auto mb-3 h-8 w-8 text-sky-600" />}
              <span className="block font-semibold text-slate-950">{isParsingFile ? '正在解析文件...' : '点击或拖拽上传资料'}</span>
              <span className="mt-1 block text-sm text-slate-500">支持 .txt / .pdf / .docx / .pptx</span>
              <input type="file" accept=".txt,.pdf,.docx,.pptx" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} />
            </label>
            <div className="grid grid-cols-2 gap-2 text-center text-xs font-medium text-slate-600">
              {supportedFormats.map((item) => (
                <span key={item} className="rounded-lg border border-slate-200 bg-white px-2 py-2">{item}</span>
              ))}
            </div>
            <p className="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">已支持 PDF / Word / PPTX 本地解析；扫描版 PDF 暂不支持 OCR，老版 .doc / .ppt 暂不支持。</p>
            {parseError ? (
              <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {parseError}
              </div>
            ) : null}
          </div>

          {fileInfoItems.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-700">
                <FileText className="h-4 w-4" />
                文件解析信息
              </div>
              <div className="grid gap-2 text-sm">
                {fileInfoItems.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 rounded-xl bg-white px-3 py-2">
                    <span className="text-slate-500">{label}</span>
                    <span className="break-all text-right font-medium text-slate-800">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <label className="block text-sm font-medium text-slate-600">资料标题</label>
          <input
            value={material.title}
            onChange={(event) => setMaterial({ ...material, title: event.target.value })}
            className="focus-ring mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm placeholder:text-slate-400"
            placeholder="例如：人工智能基础概念"
          />
          <label className="mt-5 block text-sm font-medium text-slate-600">学习资料正文</label>
          <textarea
            value={material.content}
            onChange={(event) => updateTextContent(event.target.value)}
            className="focus-ring mt-2 min-h-[330px] w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 leading-7 text-slate-900 shadow-sm placeholder:text-slate-400"
            placeholder="粘贴课程笔记、课件内容或复习资料，或上传文件自动提取文本..."
          />
          <button
            onClick={onAnalyze}
            disabled={material.content.trim().length < 20 || isParsingFile}
            className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play className="h-5 w-5" />
            开始分析
          </button>
        </div>
      </div>
    </section>
  );
}
