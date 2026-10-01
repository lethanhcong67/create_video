import React, { useState } from 'react';
import {
  Download,
  Copy,
  Maximize2,
  Check,
  Subtitles,
  Shirt,
  User,
  Sparkles,
  AlertCircle,
  RotateCw,
  X,
} from 'lucide-react';
import { BatchImageItem, BatchSettings, ApiConfig } from '../types';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { downloadImage } from '../utils/imageUtils';

interface ResultGalleryProps {
  items: BatchImageItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onRetryItem: (id: string) => void;
  settings: BatchSettings;
  apiConfig?: ApiConfig;
}

export const ResultGallery: React.FC<ResultGalleryProps> = ({
  items,
  selectedItemId,
  onSelectItem,
  onRetryItem,
  settings,
  apiConfig,
}) => {
  const [copied, setCopied] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const completedItems = items.filter((item) => item.status === 'completed' && item.resultImageUrl);
  const currentItem = items.find((item) => item.id === selectedItemId) || completedItems[0] || items[0];

  if (!currentItem) return null;

  const handleDownload = () => {
    if (!currentItem.resultImageUrl) return;
    const name = currentItem.name.replace(/\.[^/.]+$/, '') + '_ai_replaced.png';
    downloadImage(currentItem.resultImageUrl, name);
  };

  const handleCopy = async () => {
    if (!currentItem.resultImageUrl) return;
    try {
      const res = await fetch(currentItem.resultImageUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Không thể sao chép trực tiếp vào clipboard:', e);
    }
  };

  return (
    <div id="result-gallery-section" className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-stone-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Kết quả hình ảnh & So sánh Trước / Sau
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              {completedItems.length}/{items.length} đã tạo
            </span>
          </div>
          <p className="text-xs text-stone-500">
            Xem ảnh kết quả, kéo thanh trượt để so sánh nhân vật, trang phục và kiểm tra vị trí phụ đề đã xóa
          </p>
        </div>

        {/* Action buttons */}
        {currentItem.resultImageUrl && (
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              id="copy-result-btn"
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 transition-colors"
              title="Sao chép ảnh vào clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-600" />}
              <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
            </button>

            <button
              id="lightbox-expand-btn"
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 transition-colors"
              title="Xem ảnh phóng to"
            >
              <Maximize2 className="w-3.5 h-3.5 text-stone-600" />
              <span>Phóng to</span>
            </button>

            <button
              id="download-single-btn"
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition-colors active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải ảnh PNG</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Comparison Area */}
      <div className="mb-5">
        {currentItem.status === 'completed' && currentItem.resultImageUrl ? (
          <BeforeAfterSlider
            beforeImage={currentItem.dataUrl}
            afterImage={currentItem.resultImageUrl}
            beforeLabel="Ảnh gốc (Có phụ đề / nhân vật cũ)"
            afterLabel="AI: Đổi nhân vật, trang phục & Xóa chữ"
          />
        ) : currentItem.status === 'processing' ? (
          <div className="w-full h-[55vh] min-h-[400px] max-h-[640px] rounded-2xl bg-stone-900 border border-stone-800 flex flex-col items-center justify-center text-white p-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <img
                src={currentItem.dataUrl}
                alt="Source preview"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover blur-md"
              />
            </div>
            <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/80 backdrop-blur-md flex items-center justify-center shadow-xl mb-4 ring-4 ring-indigo-400/20">
                <Sparkles className="w-7 h-7 text-amber-300 animate-spin" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Gemini 3.1 Flash Image đang xử lý...
              </h3>
              <p className="text-xs text-stone-300 leading-relaxed mb-4">
                Đang nhận diện nhân vật, chuyển đổi trang phục theo mẫu và bóc tách xóa phụ đề/chữ trong ảnh...
              </p>
              <div className="w-48 bg-stone-800 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-500 h-2 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          </div>
        ) : currentItem.status === 'error' ? (
          <div className="w-full h-[55vh] min-h-[400px] max-h-[640px] rounded-2xl bg-rose-50 border-2 border-dashed border-rose-200 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-rose-900 mb-1">
              Chưa thể hoàn tất tạo ảnh này
            </h4>
            <p className="text-xs text-rose-700 max-w-md mb-4 leading-relaxed">
              {currentItem.error || 'Có thể do ảnh quá mờ hoặc dịch vụ AI bận. Vui lòng thử lại.'}
            </p>
            <button
              type="button"
              onClick={() => onRetryItem(currentItem.id)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Thử tạo lại ảnh này</span>
            </button>
          </div>
        ) : (
          <div className="w-full h-[55vh] min-h-[400px] max-h-[640px] rounded-2xl bg-stone-50 border-2 border-dashed border-stone-200 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-2xs border border-stone-200 flex items-center justify-center mb-3 text-stone-400">
              <Sparkles className="w-7 h-7 text-indigo-400" />
            </div>
            <h4 className="text-sm font-bold text-stone-800 mb-1">
              Sẵn sàng tạo ảnh mới
            </h4>
            <p className="text-xs text-stone-500 max-w-sm">
              Bấm nút <span className="font-semibold text-indigo-600">"Bắt đầu xử lý hàng loạt"</span> ở thanh điều khiển bên dưới để AI tiến hành thay thế nhân vật, khoác trang phục mới và xóa phụ đề.
            </p>
          </div>
        )}
      </div>

      {/* Selector thumbnails row */}
      {items.length > 1 && (
        <div className="border-t border-stone-200 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-700">
              Chọn ảnh để xem chi tiết ({items.length} ảnh):
            </span>
            <span className="text-[11px] text-stone-400">
              Đang hiển thị: #{items.findIndex((i) => i.id === currentItem.id) + 1} - {currentItem.name}
            </span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-2">
            {items.map((it, idx) => {
              const isSelected = it.id === currentItem.id;
              const hasResult = it.status === 'completed' && it.resultImageUrl;

              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelectItem(it.id)}
                  className={`group relative shrink-0 w-20 rounded-xl border p-1 text-left transition-all ${
                    isSelected
                      ? 'border-indigo-600 ring-2 ring-indigo-500/30 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="aspect-square w-full rounded-lg overflow-hidden bg-stone-100 relative">
                    <img
                      src={hasResult ? it.resultImageUrl : it.dataUrl}
                      alt={it.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute top-1 left-1 px-1 rounded bg-black/60 text-[9px] font-bold text-white">
                      #{idx + 1}
                    </div>
                    {hasResult && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-stone-700 truncate">
                    {it.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Applied specs summary */}
      <div className="mt-4 p-3.5 rounded-xl bg-stone-50 border border-stone-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="flex items-start gap-2">
          <User className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-stone-700">Nhân vật thay thế:</span>
            <p className="text-stone-500 line-clamp-2 mt-0.5">
              {settings.characterPrompt || 'Mặc định (Tự động nâng cấp chân dung)'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Shirt className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-stone-700">Trang phục:</span>
            <p className="text-stone-500 line-clamp-2 mt-0.5">
              {settings.outfitPrompt || 'Theo ảnh mẫu trang phục tải lên'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Subtitles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-stone-700">Xóa phụ đề & Chữ:</span>
            <p className="text-stone-500 mt-0.5">
              {settings.removeSubtitles ? (
                <span className="text-emerald-600 font-semibold">Đã bật (Xóa sạch viền chữ & watermark)</span>
              ) : (
                <span className="text-stone-400">Không xóa phụ đề</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-stone-700">Mô hình AI:</span>
            <p className="text-stone-500 mt-0.5 font-medium">
              {apiConfig?.model || 'gemini-3.1-flash-image'}
              {apiConfig?.isCustomKeyActive && apiConfig?.apiKey && (
                <span className="ml-1 text-indigo-600 font-bold">(Key riêng)</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && currentItem.resultImageUrl && (
        <div
          id="lightbox-modal"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-5xl max-h-[90vh] overflow-auto rounded-xl p-2 bg-stone-900 border border-stone-800">
            <img
              src={currentItem.resultImageUrl}
              alt="High resolution result"
              referrerPolicy="no-referrer"
              className="max-h-[85vh] w-auto mx-auto object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
