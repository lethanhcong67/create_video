import React from 'react';
import { Play, Pause, Loader2, Download, CheckCircle2, Sparkles, RefreshCw, Archive, Zap } from 'lucide-react';

interface BatchControlsProps {
  totalCount: number;
  completedCount: number;
  errorCount: number;
  isProcessing: boolean;
  currentProcessingIndex: number;
  activeProcessingCount?: number;
  concurrency?: number;
  onChangeConcurrency?: (val: number) => void;
  onStartProcessing: () => void;
  onStopProcessing: () => void;
  onDownloadAllZip: () => void;
  canStart: boolean;
}

export const BatchControls: React.FC<BatchControlsProps> = ({
  totalCount,
  completedCount,
  errorCount,
  isProcessing,
  currentProcessingIndex,
  activeProcessingCount = 1,
  concurrency = 5,
  onChangeConcurrency,
  onStartProcessing,
  onStopProcessing,
  onDownloadAllZip,
  canStart,
}) => {
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      id="batch-controls-sticky-bar"
      className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-lg shadow-indigo-950/5 sticky bottom-4 z-30"
    >
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Left: Summary and progress status */}
        <div className="w-full lg:w-auto flex-1">
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2.5 mb-1.5">
            <span className="text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Tiến độ hàng đợi: {completedCount}/{totalCount} ảnh
            </span>
            {isProcessing && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70 flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                Đang tạo song song {activeProcessingCount} ảnh cùng lúc...
              </span>
            )}
            {completedCount === totalCount && totalCount > 0 && !isProcessing && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Hoàn tất tất cả
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-violet-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Middle: Concurrency Indicator (Mặc định tối đa 5 ảnh cùng lúc) */}
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-1.5 shadow-2xs self-stretch sm:self-auto justify-center" title="Tự động xử lý song song tối đa 5 hình ảnh cùng 1 lúc">
          <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500 shrink-0" />
          <span className="text-[11px] font-bold text-amber-800 whitespace-nowrap">
            Chạy tối đa 5 ảnh cùng lúc
          </span>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {/* Download Zip button when at least 1 image completed */}
          {completedCount > 0 && (
            <button
              id="download-zip-batch-btn"
              type="button"
              onClick={onDownloadAllZip}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs sm:text-sm font-bold border border-stone-200 transition-colors shadow-2xs active:scale-95 cursor-pointer"
            >
              <Archive className="w-4 h-4 text-indigo-600" />
              <span>Tải tất cả (.ZIP)</span>
            </button>
          )}

          {/* Start or Stop processing */}
          {isProcessing ? (
            <button
              id="stop-processing-btn"
              type="button"
              onClick={onStopProcessing}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-rose-200 transition-colors active:scale-95 cursor-pointer"
            >
              <Pause className="w-4 h-4" />
              <span>Tạm dừng</span>
            </button>
          ) : (
            <button
              id="start-processing-btn"
              type="button"
              disabled={!canStart}
              onClick={onStartProcessing}
              className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all active:scale-95 cursor-pointer ${
                canStart
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-indigo-200'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {completedCount > 0 && completedCount < totalCount
                  ? `Tiếp tục (${totalCount - completedCount} ảnh còn lại • tối đa 5 ảnh/lúc)`
                  : `Bắt đầu xử lý (${totalCount} ảnh • tối đa 5 ảnh/lúc)`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
