import { FileUp, Play, Sparkles } from 'lucide-react';
import { sampleMaterial, sampleMaterialTitle } from '../data/sampleMaterial';
import type { MaterialInput as MaterialInputType } from '../types';

interface MaterialInputProps {
  material: MaterialInputType;
  setMaterial: (material: MaterialInputType) => void;
  onAnalyze: () => void;
}

export default function MaterialInput({ material, setMaterial, onAnalyze }: MaterialInputProps) {
  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.endsWith('.txt')) {
      alert('当前 Demo 仅支持 .txt 文件，PDF / Word / PPT 将在后续版本支持。');
      return;
    }
    const content = await file.text();
    setMaterial({ title: file.name.replace(/\.txt$/i, ''), content, sourceType: 'file' });
  };

  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="glass-panel rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white">导入学习资料</h2>
          <p className="mt-3 leading-7 text-slate-400">支持粘贴文本或上传 .txt 文件。PDF、Word、PPT 已预留入口，适合后续接入解析服务。</p>

          <div className="mt-6 grid gap-3">
            <button
              onClick={() => setMaterial({ title: sampleMaterialTitle, content: sampleMaterial, sourceType: 'sample' })}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-violet-400/14 px-4 py-3 text-violet-100 transition hover:bg-violet-400/22"
            >
              <Sparkles className="h-5 w-5" />
              使用示例资料
            </button>
            <label className="focus-within:ring-2 focus-within:ring-cyan-300/60 rounded-lg border border-dashed border-slate-500/70 bg-white/5 p-5 text-center text-slate-300 transition hover:border-cyan-300/60">
              <FileUp className="mx-auto mb-2 h-7 w-7 text-cyan-200" />
              上传 .txt 文件
              <input type="file" accept=".txt" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} />
            </label>
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
              <span className="rounded bg-white/5 px-2 py-2">PDF 后续支持</span>
              <span className="rounded bg-white/5 px-2 py-2">Word 后续支持</span>
              <span className="rounded bg-white/5 px-2 py-2">PPT 后续支持</span>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-lg p-6">
          <label className="block text-sm text-slate-300">资料标题</label>
          <input
            value={material.title}
            onChange={(event) => setMaterial({ ...material, title: event.target.value, sourceType: 'text' })}
            className="focus-ring mt-2 w-full rounded-lg border border-white/12 bg-slate-950/70 px-4 py-3 text-white placeholder:text-slate-500"
            placeholder="例如：人工智能基础概念"
          />
          <label className="mt-5 block text-sm text-slate-300">学习资料正文</label>
          <textarea
            value={material.content}
            onChange={(event) => setMaterial({ ...material, content: event.target.value, sourceType: 'text' })}
            className="focus-ring mt-2 min-h-[330px] w-full resize-y rounded-lg border border-white/12 bg-slate-950/70 px-4 py-3 leading-7 text-white placeholder:text-slate-500"
            placeholder="粘贴课程笔记、课件内容或复习资料..."
          />
          <button
            onClick={onAnalyze}
            disabled={material.content.trim().length < 20}
            className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play className="h-5 w-5" />
            开始分析
          </button>
        </div>
      </div>
    </section>
  );
}
