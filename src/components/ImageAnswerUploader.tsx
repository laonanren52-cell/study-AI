import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ImageAnswer } from '../types';
import { recognizeAnswerFromImage } from '../services/visionAnswerService';

interface ImageAnswerUploaderProps {
  questionId: string;
  questionText: string;
  onRecognized: (text: string) => void;
}

export default function ImageAnswerUploader({ questionId, questionText, onRecognized }: ImageAnswerUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageAnswer, setImageAnswer] = useState<ImageAnswer | null>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageDataUrl = String(reader.result || '');
      setImageAnswer({ questionId, imageDataUrl, status: 'idle' });
    };
    reader.readAsDataURL(file);
  };

  const recognize = async () => {
    if (!imageAnswer?.imageDataUrl) return;
    setImageAnswer((current) => current ? { ...current, status: 'recognizing', error: undefined } : current);
    try {
      const recognizedText = await recognizeAnswerFromImage(imageAnswer.imageDataUrl, questionText);
      setImageAnswer((current) => current ? { ...current, status: 'recognized', recognizedText } : current);
      onRecognized(recognizedText);
    } catch (error) {
      setImageAnswer((current) => current ? {
        ...current,
        status: 'failed',
        error: error instanceof Error ? error.message : '图片识别失败，请手动输入答案。',
      } : current);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">手写/公式答案拍照上传</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">适合数学、物理、电路、化学步骤题；识别结果会自动填入文本框，可继续编辑。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-sky-50"
          >
            <ImagePlus className="h-4 w-4" />
            上传/拍照
          </button>
          {imageAnswer?.imageDataUrl ? (
            <button
              type="button"
              onClick={() => setImageAnswer(null)}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {imageAnswer?.imageDataUrl ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
          <img src={imageAnswer.imageDataUrl} alt="答案图片预览" className="max-h-56 w-full rounded-xl border border-slate-200 object-contain bg-white" />
          <div className="rounded-xl bg-white p-3 text-sm leading-6 text-slate-600">
            <button
              type="button"
              onClick={recognize}
              disabled={imageAnswer.status === 'recognizing'}
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
            >
              {imageAnswer.status === 'recognizing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              AI 识别答案
            </button>
            {imageAnswer.status === 'recognized' ? (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-emerald-700">已识别并填入答案框，可继续修改。</p>
            ) : null}
            {imageAnswer.status === 'failed' ? (
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-800">{imageAnswer.error}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
