import React, { useState } from 'react';
import { X, Copy, Check, Terminal, FileText, Code2, Clock } from 'lucide-react';

interface ApiLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logData: any;
}

export const ApiLogModal: React.FC<ApiLogModalProps> = ({ isOpen, onClose, logData }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!logData) return;
    navigator.clipboard.writeText(JSON.stringify(logData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="api-log-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        id="api-log-modal-content"
        className="bg-stone-900 text-stone-100 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-stone-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                Log Payload Yêu Cầu Gửi Đi (API Request)
                {logData?.provider && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-stone-800 text-emerald-400 border border-stone-700">
                    {logData.provider}
                  </span>
                )}
              </h3>
              <p className="text-xs text-stone-400">
                Toàn bộ tham số, hình ảnh tham chiếu (đầu/cuối) và Prompt thực tế đã gửi đến API AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {logData && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-colors"
                title="Sao chép toàn bộ JSON"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép JSON</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 font-mono text-xs">
          {!logData ? (
            <div className="text-center py-12 text-stone-500">
              <Code2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Chưa có lượt tạo ảnh/video nào gần đây.</p>
              <p className="text-[11px] text-stone-600 mt-1">
                Hãy nhấn tạo ảnh hoặc tạo video để hệ thống ghi nhận body yêu cầu.
              </p>
            </div>
          ) : (
            <>
              {/* Quick Summary Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-stone-950/80 p-3 rounded-xl border border-stone-800 text-stone-300">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 block">Động cơ</span>
                  <span className="font-semibold text-white truncate block">{logData.provider || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 block">Model</span>
                  <span className="font-semibold text-emerald-400 truncate block">
                    {logData.model_name || logData.model || logData.formData?.model || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 block">Tỉ lệ / Frames</span>
                  <span className="font-semibold text-indigo-400 truncate block">
                    {logData.aspect_ratio || logData.config?.imageConfig?.aspectRatio || logData.formData?.size || '9:16'}
                    {logData.image_tail ? ' (2 Frames: Đầu+Cuối)' : ''}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 block">Thời gian</span>
                  <span className="text-[11px] text-stone-400 truncate block">
                    {logData.timestamp || 'Vừa xong'}
                  </span>
                </div>
              </div>

              {/* Prompt Preview */}
              {(logData.prompt || logData.formData?.prompt) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-stone-400">
                    <span className="text-xs font-sans font-medium flex items-center gap-1.5 text-stone-300">
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      Prompt gửi đi:
                    </span>
                  </div>
                  <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800 text-stone-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto select-all">
                    {logData.prompt || logData.formData?.prompt}
                  </div>
                </div>
              )}

              {/* Full JSON Dump */}
              <div className="space-y-1.5">
                <span className="text-xs font-sans font-medium text-stone-400 block">
                  Toàn bộ Payload (JSON Schema):
                </span>
                <pre className="bg-stone-950 p-4 rounded-xl border border-stone-800 text-stone-300 overflow-x-auto leading-relaxed select-all">
                  {JSON.stringify(logData, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-800 bg-stone-950/40 flex items-center justify-between text-[11px] text-stone-500">
          <span>* Các khóa API bảo mật (sk-...) đã được ẩn đi để đảm bảo an toàn.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
