import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Trash2, CheckCircle2, AlertCircle, Loader2, Sparkles, Plus, Subtitles } from 'lucide-react';
import { BatchImageItem } from '../types';
import { fileToDataUrl, getImageDimensions } from '../utils/imageUtils';

interface BatchUploadZoneProps {
  items: BatchImageItem[];
  onAddItems: (newItems: BatchImageItem[]) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}

export const BatchUploadZone: React.FC<BatchUploadZoneProps> = ({
  items,
  onAddItems,
  onRemoveItem,
  onClearAll,
  selectedItemId,
  onSelectItem,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const processFiles = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    setIsLoadingFiles(true);

    try {
      const imageFiles = rawFiles.filter((file) => {
        const isMimeImage = file.type ? file.type.startsWith('image/') : false;
        const isExtImage = /\.(jpe?g|png|webp|bmp|gif|heic|avif)$/i.test(file.name);
        return isMimeImage || isExtImage;
      });

      if (imageFiles.length === 0) {
        setIsLoadingFiles(false);
        return;
      }

      const results = await Promise.allSettled(
        imageFiles.map(async (file, index) => {
          const dataUrl = await fileToDataUrl(file);
          const dimensions = await getImageDimensions(dataUrl);

          const item: BatchImageItem = {
            id: `img_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: file.size,
            dataUrl,
            mimeType: file.type || 'image/jpeg',
            status: 'idle',
            progress: 0,
            originalDimensions: dimensions,
          };
          return item;
        })
      );

      const newItems: BatchImageItem[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled') {
          newItems.push(res.value);
        }
      }

      if (newItems.length > 0) {
        onAddItems(newItems);
        if (!selectedItemId) {
          onSelectItem(newItems[0].id);
        }
      }
    } catch (err) {
      console.error('Lỗi khi đọc file ảnh:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      e.target.value = '';
      processFiles(filesArray);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files) as File[];
      processFiles(filesArray);
    }
  };

  return (
    <div id="batch-upload-section" className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-stone-900">
              Tải lên hàng loạt hình ảnh cần sửa
            </h2>
            <p className="text-xs text-stone-500">
              Hỗ trợ JPG, PNG, WEBP — Xử lý cùng lúc nhiều ảnh với cùng thiết lập
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 bg-stone-100 text-stone-700 rounded-full">
              {items.length} ảnh đã nạp
            </span>
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-rose-600 hover:text-rose-700 hover:underline p-1"
            >
              Xóa hết
            </button>
          </div>
        )}
      </div>

      {/* Drag & Drop Input Area */}
      <div
        id="batch-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50/60 scale-[0.99]'
            : 'border-stone-300 hover:border-indigo-400 bg-stone-50/50 hover:bg-stone-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id="batch-file-input"
        />

        {isLoadingFiles ? (
          <div className="flex flex-col items-center justify-center py-4">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
            <p className="text-xs font-medium text-stone-600">Đang đọc và chuẩn bị các file ảnh...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2">
            <div className="w-12 h-12 rounded-full bg-white shadow-sm border border-stone-200 flex items-center justify-center mb-3 text-indigo-600 group-hover:scale-105 transition-transform">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-stone-800 mb-1">
              Kéo thả các hình ảnh vào đây hoặc <span className="text-indigo-600 underline">chọn từ thiết bị</span>
            </p>
            <p className="text-xs text-stone-500 max-w-sm">
              Chọn một hoặc nhiều ảnh nhân vật cũ, ảnh cắt từ phim có phụ đề cần xóa, hoặc ảnh chân dung cần đổi trang phục.
            </p>
          </div>
        )}
      </div>

      {/* Uploaded Items Thumbnails List */}
      {items.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-600">
              Danh sách ảnh trong hàng đợi ({items.length}):
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm ảnh khác</span>
            </button>
          </div>

          <div
            id="batch-thumbnail-strip"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[300px] overflow-y-auto p-1"
          >
            {items.map((item, idx) => {
              const isSelected = item.id === selectedItemId;

              return (
                <div
                  key={item.id}
                  id={`batch-item-${item.id}`}
                  onClick={() => onSelectItem(item.id)}
                  className={`group relative rounded-xl border p-1.5 text-left cursor-pointer transition-all bg-white ${
                    isSelected
                      ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-sm'
                      : 'border-stone-200 hover:border-stone-300 hover:shadow-2xs'
                  }`}
                >
                  {/* Image container */}
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-stone-100">
                    <img
                      src={item.resultImageUrl || item.dataUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />

                    {/* Badge index */}
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-bold text-white">
                      #{idx + 1}
                    </div>

                    {/* Subtitle tag indicator */}
                    <div
                      className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-500/90 text-[10px] font-bold text-white flex items-center gap-0.5"
                      title="Có phụ đề cần xóa"
                    >
                      <Subtitles className="w-2.5 h-2.5" />
                      <span>Sub</span>
                    </div>

                    {/* Status badge */}
                    {item.status === 'processing' && (
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center text-white">
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-400 mb-1" />
                        <span className="text-[10px] font-medium">Đang xử lý</span>
                      </div>
                    )}
                    {item.status === 'completed' && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
                        <AlertCircle className="w-3.5 h-3.5" />
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveItem(item.id);
                      }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-stone-900/70 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600 transition-all flex items-center justify-center"
                      title="Xóa ảnh này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Caption name */}
                  <p className="mt-1.5 text-[11px] font-medium text-stone-800 truncate" title={item.name}>
                    {item.name}
                  </p>
                  <p className="text-[10px] text-stone-400">
                    {(item.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
