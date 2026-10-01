import React, { useRef } from 'react';
import {
  Sparkles,
  Download,
  Eye,
  ArrowDown,
  Layers,
  Film,
  Play,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Archive,
} from 'lucide-react';
import { BatchImageItem } from '../types';
import { downloadImage } from '../utils/imageUtils';

export interface CompletedImageEntry {
  itemId: string;
  itemName: string;
  itemIndex: number;
  url: string;
  variationIndex: number;
  totalVariations: number;
}

interface CompletedImagesStripProps {
  items: BatchImageItem[];
  onOpenLightbox: (url: string, title: string) => void;
  onSelectAsStartFrame?: (itemId: string, imageUrl: string, imageName: string) => void;
  onSelectAsEndFrame?: (itemId: string, imageUrl: string, imageName: string) => void;
  onDownloadAllZip?: () => void;
  onScrollToRow?: (itemId: string) => void;
}

export const CompletedImagesStrip: React.FC<CompletedImagesStripProps> = ({
  items,
  onOpenLightbox,
  onSelectAsStartFrame,
  onSelectAsEndFrame,
  onDownloadAllZip,
  onScrollToRow,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Extract all completed images (including variations)
  const completedEntries: CompletedImageEntry[] = [];
  items.forEach((it, idx) => {
    if (it.status === 'completed' && it.resultImageUrl) {
      if (it.resultImageUrls && it.resultImageUrls.length > 1) {
        it.resultImageUrls.forEach((url, vIdx) => {
          completedEntries.push({
            itemId: it.id,
            itemName: it.name,
            itemIndex: idx,
            url,
            variationIndex: vIdx,
            totalVariations: it.resultImageUrls!.length,
          });
        });
      } else {
        completedEntries.push({
          itemId: it.id,
          itemName: it.name,
          itemIndex: idx,
          url: it.resultImageUrl,
          variationIndex: 0,
          totalVariations: 1,
        });
      }
    }
  });

  if (completedEntries.length === 0) {
    return null;
  }

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 360;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleDownload = (entry: CompletedImageEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const baseName = entry.itemName.replace(/\.[^/.]+$/, '');
    const suffix = entry.totalVariations > 1 ? `_var${entry.variationIndex + 1}` : '';
    downloadImage(entry.url, `swapped_${baseName}${suffix}.png`);
  };

  const scrollToRowItem = (itemId: string) => {
    if (onScrollToRow) {
      onScrollToRow(itemId);
      return;
    }
    const element = document.getElementById(`pipeline-row-${itemId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-4', 'ring-indigo-400');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-indigo-400');
      }, 1500);
    }
  };

  return (
    <div
      id="completed-images-strip"
      className="bg-white/95 backdrop-blur-md rounded-2xl border border-indigo-200/80 shadow-md p-4 transition-all animate-in fade-in slide-in-from-top-3 duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-100 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <span>Hàng ảnh đã tạo xong</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {completedEntries.length} ảnh sẵn sàng
                </span>
              </h3>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Ảnh mới tạo được tự động làm <strong>Ảnh đầu (Start frame)</strong>. Bạn có thể <strong>kéo ảnh</strong> vào bất kỳ ô video nào hoặc dùng các nút gán nhanh bên dưới.
            </p>
          </div>
        </div>

        {/* Actions on top right */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-full">
            🖐️ Có thể kéo thả vào ô Video
          </span>
          {onDownloadAllZip && (
            <button
              type="button"
              onClick={onDownloadAllZip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors border border-indigo-200 cursor-pointer shadow-2xs"
              title="Tải tất cả ảnh tạo xong dạng ZIP"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tải toàn bộ ZIP</span>
            </button>
          )}

          {/* Nav scroll buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleScroll('left')}
              className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors cursor-pointer"
              title="Cuộn sang trái"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors cursor-pointer"
              title="Cuộn sang phải"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scrollable Strip */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-3 overflow-x-auto pb-2 pt-1 px-0.5 scrollbar-thin scrollbar-thumb-stone-300 scrollbar-track-stone-100"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {completedEntries.map((entry, idx) => {
          return (
            <div
              key={`${entry.itemId}-${entry.variationIndex}-${idx}`}
              style={{ scrollSnapAlign: 'start' }}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', entry.url);
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    url: entry.url,
                    name: entry.itemName,
                    type: 'completed-image',
                    itemId: entry.itemId,
                    variationIndex: entry.variationIndex,
                  })
                );
                e.dataTransfer.effectAllowed = 'copyMove';
              }}
              className="group relative flex-shrink-0 w-36 sm:w-44 bg-stone-900/5 rounded-xl border border-stone-200/90 hover:border-indigo-400 overflow-hidden shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col cursor-grab active:cursor-grabbing"
              title="Kéo ảnh này thả vào ô Ảnh Đầu hoặc Ảnh Cuối của Video"
            >
              {/* Image Preview Container (Aspect 9:16 or 3:4 box) */}
              <div
                className="relative aspect-[3/4] w-full bg-stone-950 flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={() =>
                  onOpenLightbox(
                    entry.url,
                    `Ảnh mới #${entry.itemIndex + 1} - ${entry.itemName} ${
                      entry.totalVariations > 1 ? `(Biến thể ${entry.variationIndex + 1})` : ''
                    }`
                  )
                }
              >
                <img
                  src={entry.url}
                  alt={`Result #${entry.itemIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                />

                {/* Top Badge: Row # & Variation */}
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
                  <span className="px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-[10px] font-mono font-bold text-white shadow-xs">
                    #{entry.itemIndex + 1}
                  </span>
                  {entry.totalVariations > 1 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-indigo-600/90 backdrop-blur-xs text-[10px] font-bold text-white shadow-xs flex items-center gap-0.5">
                      <Layers className="w-2.5 h-2.5" />v{entry.variationIndex + 1}
                    </span>
                  )}
                </div>

                {/* Drag Handle Indicator */}
                <div className="absolute bottom-1.5 left-1.5 z-10 opacity-70 group-hover:opacity-100 transition-opacity">
                  <span className="px-1 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[9px] text-white/90">
                    🖐️ Kéo thả
                  </span>
                </div>

                {/* Hover Quick Overlay Actions */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2 z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLightbox(
                        entry.url,
                        `Ảnh mới #${entry.itemIndex + 1} - ${entry.itemName}`
                      );
                    }}
                    className="w-full py-1 px-2 rounded-md bg-white/95 hover:bg-white text-stone-900 text-[11px] font-semibold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Xem lớn</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDownload(entry, e)}
                    className="w-full py-1 px-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải ảnh</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToRowItem(entry.itemId);
                    }}
                    className="w-full py-1 px-2 rounded-md bg-stone-800/90 hover:bg-stone-800 text-stone-100 text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                    <span>Đến hàng #{entry.itemIndex + 1}</span>
                  </button>
                </div>
              </div>

              {/* Bottom Quick Bar with Video Assignment Options */}
              <div className="p-1.5 bg-white border-t border-stone-100 flex flex-col gap-1">
                <span className="text-[10px] font-medium text-stone-700 truncate px-0.5" title={entry.itemName}>
                  {entry.itemName}
                </span>

                <div className="grid grid-cols-2 gap-1 mt-0.5">
                  {onSelectAsStartFrame && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectAsStartFrame(
                          entry.itemId,
                          entry.url,
                          `${entry.itemName} (Biến thể ${entry.variationIndex + 1})`
                        )
                      }
                      className="py-1 px-1 rounded text-[9px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center justify-center gap-0.5 cursor-pointer"
                      title={`Đặt làm Ảnh Đầu (Start frame) cho video hàng #${entry.itemIndex + 1}`}
                    >
                      <Film className="w-2.5 h-2.5" />
                      <span>Gán Đầu</span>
                    </button>
                  )}

                  {onSelectAsEndFrame && (
                    <button
                      type="button"
                      onClick={() =>
                        onSelectAsEndFrame(
                          entry.itemId,
                          entry.url,
                          `${entry.itemName} (Biến thể ${entry.variationIndex + 1})`
                        )
                      }
                      className="py-1 px-1 rounded text-[9px] font-bold text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors flex items-center justify-center gap-0.5 cursor-pointer"
                      title={`Đặt làm Ảnh Cuối (End frame) cho video hàng #${entry.itemIndex + 1}`}
                    >
                      <Film className="w-2.5 h-2.5" />
                      <span>Gán Cuối</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
