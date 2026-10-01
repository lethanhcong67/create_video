import React, { useState, useRef } from 'react';
import {
  Trash2,
  RefreshCw,
  Eye,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Video,
  Play,
  Film,
  Sparkles,
  Layers,
  Maximize2,
  Subtitles,
  CheckCheck,
  User,
  Shirt,
  CheckSquare,
  Square,
  Lock,
  ShieldCheck,
  UserCheck,
  Check,
  RotateCcw,
  Pencil,
  Mountain,
  Settings,
  ChevronDown,
  ChevronUp,
  Camera,
  ZoomIn,
  ZoomOut,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  FileText,
  Copy,
  X,
  RotateCw,
  UploadCloud,
  Plus,
  ImagePlus,
  ArrowLeftRight,
  Image,
  Images,
} from 'lucide-react';
import { AppliedReplacementConfig, BatchImageItem, BatchSettings, OutfitReference, ApiConfig } from '../types';
import { fileToDataUrl, downloadImage, downloadVideo } from '../utils/imageUtils';
import { generateFullPromptText } from '../utils/promptHelper';

interface BatchPipelineRowItemProps {
  item: BatchImageItem;
  index: number;
  settings: BatchSettings;
  apiConfig?: ApiConfig;
  uploadedOutfit?: OutfitReference | null;
  uploadedOutfits?: OutfitReference[];
  isProcessingAll: boolean;
  onUpdateItem: (id: string, updates: Partial<BatchImageItem>) => void;
  onRemoveItem: (id: string) => void;
  onProcessSingleItem: (item: BatchImageItem) => Promise<void>;
  onOpenKlingSettings?: () => void;
  onOpenLightbox: (url: string, title: string) => void;
  onGenerateKlingVideo: (item: BatchImageItem) => void;
  onGenerateInstantVideo: (item: BatchImageItem) => void;
  allItems?: BatchImageItem[];
}

export const BatchPipelineRowItem: React.FC<BatchPipelineRowItemProps> = ({
  item,
  index,
  settings,
  apiConfig,
  uploadedOutfit,
  uploadedOutfits = [],
  isProcessingAll,
  onUpdateItem,
  onRemoveItem,
  onProcessSingleItem,
  onOpenKlingSettings,
  onOpenLightbox,
  onGenerateKlingVideo,
  onGenerateInstantVideo,
  allItems = [],
}) => {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isFullPromptModalOpen, setIsFullPromptModalOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [localPrompt, setLocalPrompt] = useState<string>('');
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [isDragOverStart, setIsDragOverStart] = useState(false);
  const [isDragOverEnd, setIsDragOverEnd] = useState(false);
  const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState<'start' | 'end' | null>(null);

  const isRowProcessing = item.status === 'processing';
  const isRowCompleted = (item.status === 'completed' || Boolean(item.resultImageUrl)) && Boolean(item.resultImageUrl);
  const isRowError = item.status === 'error';
  const hasVideo = Boolean(item.videoUrl);
  const isVideoGenerating = item.videoStatus === 'generating';

  // Default auto-generated prompt
  const defaultPromptText = generateFullPromptText(item, settings, uploadedOutfits, uploadedOutfit);
  const activePromptText = (item.customPrompt || item.appliedConfig?.customPrompt || defaultPromptText).trim();
  const isPromptCustomized = Boolean(
    (item.customPrompt || item.appliedConfig?.customPrompt) &&
    (item.customPrompt || item.appliedConfig?.customPrompt)?.trim() !== defaultPromptText.trim()
  );

  const handleOpenPromptModal = () => {
    setLocalPrompt(item.customPrompt || item.appliedConfig?.customPrompt || defaultPromptText);
    setIsFullPromptModalOpen(true);
  };

  const handleSaveCustomPrompt = () => {
    const trimmed = localPrompt.trim();
    onUpdateItem(item.id, {
      customPrompt: trimmed,
      appliedConfig: {
        ...(item.appliedConfig || {
          enableCharacter: item.appliedConfig?.enableCharacter ?? settings.enableCharacter,
          enableOutfit: item.appliedConfig?.enableOutfit ?? settings.enableOutfit,
          characterPrompt: appliedCharacter,
          outfitPrompt: appliedOutfitPrompt,
        }),
        customPrompt: trimmed,
        appliedAt: Date.now(),
      },
    });

    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  const handleResetToDefaultPrompt = () => {
    const freshDefault = generateFullPromptText(item, settings, uploadedOutfits, uploadedOutfit);
    setLocalPrompt(freshDefault);
    onUpdateItem(item.id, {
      customPrompt: undefined,
      appliedConfig: item.appliedConfig ? {
        ...item.appliedConfig,
        customPrompt: undefined,
        appliedAt: Date.now(),
      } : undefined,
    });

    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  const rowFileInputRef = useRef<HTMLInputElement>(null);

  const handleRowFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles = (Array.from(files) as File[]).filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const newRefs: OutfitReference[] = [];
    const currentList = item.appliedConfig?.productReferences && item.appliedConfig.productReferences.length > 0
      ? item.appliedConfig.productReferences
      : (uploadedOutfits.length > 0 ? uploadedOutfits : (uploadedOutfit ? [uploadedOutfit] : []));

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const dataUrl = await fileToDataUrl(file);
        const refIndex = currentList.length + i + 2;
        const newRef: OutfitReference = {
          id: `row_ref_${item.id}_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          previewUrl: dataUrl,
          dataUrl,
          mimeType: file.type || 'image/jpeg',
          description: `Ảnh tham chiếu riêng ref${refIndex}: ${file.name}`,
          category: 'uploaded',
        };
        newRefs.push(newRef);
      } catch (err) {
        console.error('Lỗi đọc ảnh tham chiếu hàng:', err);
      }
    }

    if (newRefs.length > 0) {
      const updatedList = [...currentList, ...newRefs];
      updateItemConfig({
        productReferences: updatedList,
        outfitImageUrl: updatedList[0]?.dataUrl || updatedList[0]?.previewUrl || null,
        outfitImageName: updatedList[0]?.name || null,
        enableOutfit: true,
      });
    }

    if (rowFileInputRef.current) {
      rowFileInputRef.current.value = '';
    }
  };

  const handleRemoveRowRef = (refId: string) => {
    const currentList = item.appliedConfig?.productReferences || [];
    const filtered = currentList.filter((r) => r.id !== refId);
    updateItemConfig({
      productReferences: filtered.length > 0 ? filtered : undefined,
      outfitImageUrl: filtered[0]?.dataUrl || filtered[0]?.previewUrl || null,
      outfitImageName: filtered[0]?.name || null,
    });
  };

  const handleResetToGlobalRefs = () => {
    updateItemConfig({
      productReferences: undefined,
      outfitImageUrl: uploadedOutfits[0]?.previewUrl || uploadedOutfit?.previewUrl || null,
      outfitImageName: uploadedOutfits[0]?.name || uploadedOutfit?.name || null,
    });
  };

  // Applied config data for this specific row
  const appliedCharacter = item.appliedConfig?.characterPrompt || settings.characterPrompt;
  const hasCustomRowRefs = Boolean(
    item.appliedConfig?.productReferences && item.appliedConfig.productReferences.length > 0
  );
  const appliedProductReferences: OutfitReference[] =
    item.appliedConfig?.productReferences && item.appliedConfig.productReferences.length > 0
      ? item.appliedConfig.productReferences
      : (uploadedOutfits.length > 0 ? uploadedOutfits : (uploadedOutfit ? [uploadedOutfit] : []));
  const appliedOutfitName = appliedProductReferences[0]?.name || item.appliedConfig?.outfitImageName || uploadedOutfit?.name;
  const appliedOutfitImg = appliedProductReferences[0]?.previewUrl || item.appliedConfig?.outfitImageUrl || uploadedOutfit?.previewUrl;
  const appliedOutfitPrompt = item.appliedConfig?.outfitPrompt || settings.outfitPrompt;
  const isConfigApplied = Boolean(item.appliedConfig?.appliedAt);

  // Helper to update applied configuration
  const updateItemConfig = (updates: Partial<AppliedReplacementConfig>) => {
    const currentConfig: AppliedReplacementConfig = item.appliedConfig || {
      enableCharacter: item.appliedConfig?.enableCharacter ?? settings.enableCharacter,
      enableOutfit: item.appliedConfig?.enableOutfit ?? settings.enableOutfit,
      enableBackground: item.appliedConfig?.enableBackground ?? Boolean(settings.backgroundPrompt?.trim()),
      characterPrompt: appliedCharacter,
      outfitPrompt: appliedOutfitPrompt,
      backgroundPrompt: item.appliedConfig?.backgroundPrompt ?? settings.backgroundPrompt ?? '',
      productReferences: appliedProductReferences,
      outfitImageUrl: appliedOutfitImg || null,
      outfitImageName: appliedOutfitName || null,
      preservePose: item.appliedConfig?.preservePose ?? settings.preservePose,
      appliedAt: Date.now(),
    };

    onUpdateItem(item.id, {
      appliedConfig: {
        ...currentConfig,
        ...updates,
        appliedAt: Date.now(),
      },
    });
  };

  const handleDownloadImage = (url: string, filename: string) => {
    const ext = url.includes('.webp') ? '.webp' : url.includes('.jpeg') || url.includes('.jpg') ? '.jpg' : '.png';
    const baseName = filename.replace(/\.[^/.]+$/, '');
    downloadImage(url, `swapped_${baseName}${ext}`);
  };

  const handleDownloadVideo = (url: string, filename: string) => {
    const isMp4 = url.includes('.mp4') || (!url.startsWith('blob:') && !url.includes('.webm'));
    const ext = isMp4 ? '.mp4' : '.webm';
    const baseName = filename.replace(/\.[^/.]+$/, '');
    downloadVideo(url, `video_${baseName}${ext}`);
  };

  const startFrameInputRef = useRef<HTMLInputElement>(null);
  const endFrameInputRef = useRef<HTMLInputElement>(null);

  const effectiveStartImage = item.videoStartImageUrl || item.resultImageUrl || item.dataUrl;
  const effectiveStartName = item.videoStartImageName || (item.resultImageUrl ? `Ảnh mới: ${item.name}` : `Ảnh gốc: ${item.name}`);

  const handleUploadStartFrame = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      onUpdateItem(item.id, {
        videoStartImageUrl: dataUrl,
        videoStartImageName: file.name,
      });
    } catch (err) {
      console.error('Lỗi đọc ảnh đầu:', err);
    }
    if (startFrameInputRef.current) startFrameInputRef.current.value = '';
  };

  const handleUploadEndFrame = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      onUpdateItem(item.id, {
        videoEndImageUrl: dataUrl,
        videoEndImageName: file.name,
      });
    } catch (err) {
      console.error('Lỗi đọc ảnh cuối:', err);
    }
    if (endFrameInputRef.current) endFrameInputRef.current.value = '';
  };

  const handleSwapStartEndFrames = () => {
    const currentStart = effectiveStartImage;
    const currentEnd = item.videoEndImageUrl;
    if (!currentEnd) return;
    onUpdateItem(item.id, {
      videoStartImageUrl: currentEnd,
      videoStartImageName: item.videoEndImageName || 'Ảnh cuối',
      videoEndImageUrl: currentStart,
      videoEndImageName: effectiveStartName,
    });
  };

  const handleRemoveEndFrame = () => {
    onUpdateItem(item.id, {
      videoEndImageUrl: undefined,
      videoEndImageName: undefined,
    });
  };

  const handleResetStartFrame = () => {
    onUpdateItem(item.id, {
      videoStartImageUrl: undefined,
      videoStartImageName: undefined,
    });
  };

  const handleDropOnStartFrame = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverStart(false);

    // 1. Files dropped from OS
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        try {
          const dataUrl = await fileToDataUrl(file);
          onUpdateItem(item.id, {
            videoStartImageUrl: dataUrl,
            videoStartImageName: file.name,
          });
        } catch (err) {
          console.error('Lỗi đọc ảnh thả vào:', err);
        }
        return;
      }
    }

    // 2. JSON data transfer (dragged from strip, column 1, column 3)
    const jsonStr = e.dataTransfer.getData('application/json');
    if (jsonStr) {
      try {
        const data = JSON.parse(jsonStr);
        if (data.url) {
          onUpdateItem(item.id, {
            videoStartImageUrl: data.url,
            videoStartImageName: data.name || 'Ảnh đã chọn',
          });
          return;
        }
      } catch {
        // continue
      }
    }

    // 3. Plain text data
    const plainText = e.dataTransfer.getData('text/plain');
    if (plainText && (plainText.startsWith('data:image') || plainText.startsWith('http') || plainText.startsWith('blob:'))) {
      onUpdateItem(item.id, {
        videoStartImageUrl: plainText,
        videoStartImageName: 'Ảnh kéo thả',
      });
    }
  };

  const handleDropOnEndFrame = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverEnd(false);

    // 1. Files dropped from OS
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        try {
          const dataUrl = await fileToDataUrl(file);
          onUpdateItem(item.id, {
            videoEndImageUrl: dataUrl,
            videoEndImageName: file.name,
          });
        } catch (err) {
          console.error('Lỗi đọc ảnh thả vào:', err);
        }
        return;
      }
    }

    // 2. JSON data transfer
    const jsonStr = e.dataTransfer.getData('application/json');
    if (jsonStr) {
      try {
        const data = JSON.parse(jsonStr);
        if (data.url) {
          onUpdateItem(item.id, {
            videoEndImageUrl: data.url,
            videoEndImageName: data.name || 'Ảnh đã chọn',
          });
          return;
        }
      } catch {
        // continue
      }
    }

    // 3. Plain text data
    const plainText = e.dataTransfer.getData('text/plain');
    if (plainText && (plainText.startsWith('data:image') || plainText.startsWith('http') || plainText.startsWith('blob:'))) {
      onUpdateItem(item.id, {
        videoEndImageUrl: plainText,
        videoEndImageName: 'Ảnh kéo thả',
      });
    }
  };

  return (
    <div
      id={`pipeline-row-${item.id}`}
      className={`bg-white rounded-2xl border transition-all p-4 sm:p-5 shadow-xs ${
        isRowProcessing
          ? 'border-indigo-400 ring-2 ring-indigo-100'
          : isRowCompleted
          ? 'border-stone-200 hover:border-stone-300'
          : 'border-stone-200'
      }`}
    >
      {/* Row Top Header */}
      <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-stone-100 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-6 h-6 rounded-md bg-stone-900 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
            #{index + 1}
          </span>
          <span className="text-xs sm:text-sm font-bold text-stone-900 truncate">
            {item.name}
          </span>
          <span className="text-[11px] text-stone-400 shrink-0 font-medium hidden sm:inline">
            {(item.size / 1024).toFixed(0)} KB
            {item.originalDimensions && ` • ${item.originalDimensions.width}×${item.originalDimensions.height}`}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">

          {isRowProcessing && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
              Đang tạo ảnh AI...
            </span>
          )}
          {isRowCompleted && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Đã xong ảnh mới
            </span>
          )}
          {isRowError && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              <AlertCircle className="w-3.5 h-3.5" />
              Lỗi tạo ảnh
            </span>
          )}
          {hasVideo && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
              <Film className="w-3 h-3" />
              Đã có video
            </span>
          )}

          <button
            type="button"
            onClick={() => onRemoveItem(item.id)}
            disabled={isRowProcessing || isProcessingAll}
            className="w-7 h-7 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
            title="Xóa hàng này"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row Body: 4 Symmetrical Parallel Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 items-stretch">
        
        {/* COLUMN 1: Original Image */}
        <div className="flex flex-col bg-stone-50/80 rounded-xl p-3 border border-stone-200/90 h-[430px] sm:h-[460px] justify-between shadow-2xs">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-stone-400"></span>
                1. Ảnh gốc cần thay thế
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpenLightbox(item.dataUrl || item.previewUrl, `Ảnh gốc: ${item.name}`)}
                  className="text-stone-400 hover:text-stone-700 p-1 rounded hover:bg-stone-200/60 transition-colors cursor-pointer"
                  title="Phóng to ảnh gốc"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div
              draggable={true}
              onDragStart={(e) => {
                const imgSource = item.dataUrl || item.previewUrl;
                e.dataTransfer.setData('text/plain', imgSource);
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    url: imgSource,
                    name: `Ảnh gốc: ${item.name}`,
                    type: 'original-image',
                    itemId: item.id,
                  })
                );
                e.dataTransfer.effectAllowed = 'copyMove';
              }}
              className="relative flex-1 w-full min-h-0 rounded-lg overflow-hidden bg-stone-900/5 border border-stone-200/80 shadow-2xs group flex items-center justify-center my-1 cursor-grab active:cursor-grabbing"
              title="Kéo ảnh gốc này thả vào ô Ảnh Đầu hoặc Ảnh Cuối của Video"
            >
              <img
                src={item.dataUrl || item.previewUrl}
                alt={`Original ${item.name}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain transition-all duration-200 pointer-events-none"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenLightbox(item.dataUrl || item.previewUrl, `Ảnh gốc: ${item.name}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/95 text-stone-900 text-xs font-semibold shadow-md hover:bg-white cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Xem ảnh gốc
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-200/60 shrink-0">
            <span>Sẵn sàng thay đổi</span>
            <button
              type="button"
              onClick={() => onProcessSingleItem(item)}
              disabled={isRowProcessing || isProcessingAll}
              className="text-indigo-600 hover:text-indigo-700 font-semibold hover:underline flex items-center gap-1 disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>Tạo riêng ảnh này</span>
            </button>
          </div>
        </div>

        {/* COLUMN 2: Target Character & Outfit / Product replacement */}
        <div className="flex flex-col bg-stone-50/80 rounded-xl p-3 border border-stone-200/90 h-[430px] sm:h-[460px] justify-between shadow-2xs">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                2. Cấu hình thay thế
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenPromptModal}
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded transition-colors cursor-pointer border ${
                    isPromptCustomized
                      ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-300'
                      : 'text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border-indigo-200/80'
                  }`}
                  title="Xem và chỉnh sửa toàn bộ prompt AI gửi đi cho ảnh này"
                >
                  <Eye className="w-3 h-3 text-indigo-600" />
                  <span>{isPromptCustomized ? 'Prompt đã sửa ✨' : 'Xem & Sửa prompt'}</span>
                </button>
                {isConfigApplied ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                    <CheckCheck className="w-3 h-3" />
                    Đã đồng bộ
                  </span>
                ) : (
                  <span className="text-[10px] text-stone-400 font-medium">Theo mẫu chung</span>
                )}
              </div>
            </div>

            {/* Scrollable specs container */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 my-1">
              
              {/* 1. TRANG PHỤC & SẢN PHẨM (ĐƯA LÊN TRÊN CÙNG) */}
              {(() => {
                const isOutfitActive = item.appliedConfig?.enableOutfit !== false;
                return (
                  <div
                    className={`p-2.5 rounded-lg border transition-all ${
                      isOutfitActive
                        ? 'bg-white border-emerald-200 shadow-2xs'
                        : 'bg-stone-100/70 border-stone-200'
                    }`}
                  >
                    {/* Hidden file input for uploading row-specific reference image */}
                    <input
                      ref={rowFileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleRowFileUpload}
                      className="hidden"
                    />

                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-900">
                        <Shirt className={`w-3.5 h-3.5 ${isOutfitActive ? 'text-emerald-600' : 'text-stone-400'}`} />
                        <span>Trang phục / Đồ:</span>
                        {hasCustomRowRefs && (
                          <span className="text-[9.5px] font-semibold text-emerald-800 bg-emerald-100/90 border border-emerald-300/80 px-1.5 py-0.2 rounded-full">
                            Ảnh riêng
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {hasCustomRowRefs && (
                          <button
                            type="button"
                            onClick={handleResetToGlobalRefs}
                            className="text-[10px] text-stone-400 hover:text-emerald-700 font-medium underline inline-flex items-center gap-0.5 cursor-pointer mr-0.5"
                            title="Khôi phục về ảnh tham chiếu chung của cột bên trái"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>Mẫu chung</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updateItemConfig({ enableOutfit: !isOutfitActive })}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                            isOutfitActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300/80'
                              : 'bg-stone-200 text-stone-600 hover:bg-stone-300 border border-stone-300'
                          }`}
                        >
                          {isOutfitActive ? (
                            <>
                              <CheckSquare className="w-3 h-3 text-emerald-600" />
                              <span>Thay thế</span>
                            </>
                          ) : (
                            <>
                              <Square className="w-3 h-3 text-stone-400" />
                              <span>Giữ gốc</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {isOutfitActive ? (
                      <div className="space-y-1.5">
                        {/* Reference Images Toolbar & Thumbnails */}
                        <div className="flex flex-wrap items-center gap-1 mb-1">
                          {appliedProductReferences.map((prod, pIdx) => {
                            const pRefTag = `Ref ${pIdx + 2}`;
                            const isRowCustomSingle = item.appliedConfig?.productReferences?.some((r) => r.id === prod.id);
                            return (
                              <div
                                key={prod.id || pIdx}
                                className="group relative flex items-center gap-1 p-0.5 pr-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/90 transition-colors shadow-2xs"
                                title={
                                  prod.analysis
                                    ? `✨ Đã phân tích AI: ${prod.analysis.productName}\n🎨 Màu sắc: ${prod.analysis.colors}\n🌸 Họa tiết: ${prod.analysis.patterns}\n🔤 Chữ/Logo: ${prod.analysis.textOrTypography || 'Không có'}`
                                    : `${pRefTag}: ${prod.name}`
                                }
                              >
                                <div
                                  className="w-6 h-6 rounded overflow-hidden bg-stone-100 cursor-pointer shrink-0 border border-emerald-300/60"
                                  onClick={() => onOpenLightbox(prod.previewUrl || prod.dataUrl || '', `${pRefTag}: ${prod.name}`)}
                                >
                                  <img
                                    src={prod.previewUrl || prod.dataUrl}
                                    alt={prod.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <span className="text-[9.5px] font-bold text-emerald-900">{pRefTag}</span>
                                  {prod.analysis && (
                                    <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                                  )}
                                </div>
                                {isRowCustomSingle && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveRowRef(prod.id);
                                    }}
                                    className="ml-0.5 p-0.5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Xóa ảnh tham chiếu này khỏi hàng"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {/* Add/Upload new reference image for this row button */}
                          <button
                            type="button"
                            onClick={() => rowFileInputRef.current?.click()}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-bold text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200/90 border border-emerald-300/90 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                            title="Tải lên ảnh mẫu/sản phẩm tham chiếu riêng cho hàng này"
                          >
                            <Plus className="w-3 h-3 text-emerald-700" />
                            <span>Tải ảnh ref mới</span>
                          </button>
                        </div>

                        {appliedProductReferences.length === 0 && !appliedOutfitImg && (
                          <button
                            type="button"
                            onClick={() => rowFileInputRef.current?.click()}
                            className="w-full py-2 px-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-800 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <UploadCloud className="w-4 h-4 text-emerald-600" />
                            <span>Bấm để tải ảnh tham chiếu riêng cho hàng này</span>
                          </button>
                        )}

                        <textarea
                          rows={2}
                          value={item.appliedConfig?.outfitPrompt !== undefined ? item.appliedConfig.outfitPrompt : appliedOutfitPrompt}
                          onChange={(e) => updateItemConfig({ outfitPrompt: e.target.value })}
                          placeholder={`Thay thế chính xác ${item.appliedConfig?.productName || settings.productName || 'sản phẩm'} theo ảnh tham chiếu image2 vào hình gốc image1 (xóa bỏ sản phẩm cũ ở image1)`}
                          className="w-full text-xs font-medium text-stone-800 bg-stone-50/70 hover:bg-white focus:bg-white border border-stone-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded p-1.5 transition-all resize-none outline-none leading-relaxed placeholder:text-stone-400 placeholder:italic"
                        />
                        {item.appliedConfig?.outfitPrompt !== undefined && item.appliedConfig.outfitPrompt !== settings.outfitPrompt && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => updateItemConfig({ outfitPrompt: settings.outfitPrompt })}
                              className="text-[10px] text-stone-400 hover:text-emerald-600 font-medium underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Mẫu chung</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-stone-500 py-0.5">
                        <Lock className="w-3 h-3 text-stone-400 shrink-0" />
                        <span>Giữ nguyên trang phục ảnh gốc</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 2. NHÂN VẬT MỚI (LUÔN HIỆN Ô NHẬP, ĐỂ TRỐNG = GIỮ NGƯỜI GỐC) */}
              {(() => {
                const currentCharVal = item.appliedConfig?.characterPrompt || '';
                const isCharEnabled = Boolean(currentCharVal.trim() || item.appliedConfig?.enableCharacter);
                const isPosePreserved = item.appliedConfig?.preservePose ?? true;

                return (
                  <div
                    className={`p-2.5 rounded-lg border transition-all ${
                      currentCharVal.trim()
                        ? 'bg-white border-violet-300 shadow-2xs'
                        : 'bg-stone-50/90 border-stone-200 hover:border-violet-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-900">
                        <User className={`w-3.5 h-3.5 ${currentCharVal.trim() ? 'text-violet-600' : 'text-stone-500'}`} />
                        <span>Nhân vật mới:</span>
                      </div>

                      {/* Pose Preservation Toggle */}
                      <button
                        type="button"
                        onClick={() => updateItemConfig({ preservePose: !isPosePreserved })}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                          isPosePreserved
                            ? 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100'
                            : 'text-stone-500 bg-stone-100 border-stone-200 hover:bg-stone-200'
                        }`}
                        title="Khóa tư thế và dáng người từ ảnh gốc"
                      >
                        <Check className={`w-3 h-3 ${isPosePreserved ? 'opacity-100 text-violet-600' : 'opacity-0'}`} />
                        <span>{isPosePreserved ? 'Giữ dáng gốc' : 'Dáng tự do'}</span>
                      </button>
                    </div>

                    <div className="space-y-1">
                      <textarea
                        rows={2}
                        value={currentCharVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateItemConfig({
                            characterPrompt: val,
                            enableCharacter: Boolean(val.trim()),
                          });
                        }}
                        placeholder="Nhập mô tả nhân vật mới (tuổi, tóc, phong cách... - để trống nếu giữ người gốc)"
                        className="w-full text-xs font-medium text-stone-800 bg-stone-50/70 hover:bg-white focus:bg-white border border-stone-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-200 rounded p-1.5 transition-all resize-none outline-none leading-relaxed placeholder:text-stone-400 placeholder:italic"
                      />
                      <div className="flex items-center justify-between text-[10px] pt-0.5">
                        {currentCharVal.trim() ? (
                          <span className="inline-flex items-center gap-1 text-violet-700 font-semibold bg-violet-50 px-1.5 py-0.5 rounded">
                            <Sparkles className="w-2.5 h-2.5 text-violet-600" />
                            Đổi nhân vật theo mô tả
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                            Giữ 100% người mẫu gốc
                          </span>
                        )}
                        {currentCharVal && (
                          <button
                            type="button"
                            onClick={() => {
                              updateItemConfig({
                                characterPrompt: '',
                                enableCharacter: false,
                              });
                            }}
                            className="text-stone-400 hover:text-rose-600 font-medium text-[9.5px] cursor-pointer"
                          >
                            Xóa mô tả
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3. BỐI CẢNH MỚI (LUÔN HIỆN Ô NHẬP, ĐỂ TRỐNG = GIỮ NỀN GỐC) */}
              {(() => {
                const currentBgVal =
                  item.appliedConfig?.backgroundPrompt !== undefined
                    ? item.appliedConfig.backgroundPrompt
                    : (settings.backgroundPrompt || '');
                const isCustomBg =
                  item.appliedConfig?.backgroundPrompt !== undefined &&
                  item.appliedConfig.backgroundPrompt !== settings.backgroundPrompt;

                return (
                  <div
                    className={`p-2.5 rounded-lg border transition-all ${
                      currentBgVal.trim()
                        ? 'bg-white border-sky-300 shadow-2xs'
                        : 'bg-stone-50/90 border-stone-200 hover:border-sky-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-900">
                        <Mountain className={`w-3.5 h-3.5 ${currentBgVal.trim() ? 'text-sky-600' : 'text-stone-500'}`} />
                        <span>Bối cảnh / Nền:</span>
                        {isCustomBg && (
                          <span className="text-[9px] font-bold text-sky-700 bg-sky-100 px-1 py-0.2 rounded leading-none">
                            Riêng
                          </span>
                        )}
                      </div>
                      {isCustomBg && (
                        <button
                          type="button"
                          onClick={() => {
                            const defaultBg = settings.backgroundPrompt || '';
                            updateItemConfig({
                              backgroundPrompt: defaultBg,
                              enableBackground: Boolean(defaultBg.trim()),
                            });
                          }}
                          className="text-stone-400 hover:text-sky-600 font-medium text-[10px] underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Mẫu chung</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <textarea
                        rows={2}
                        value={currentBgVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateItemConfig({
                            backgroundPrompt: val,
                            enableBackground: Boolean(val.trim()),
                          });
                        }}
                        placeholder="Nhập bối cảnh mới (bãi biển, quán cafe... - để trống nếu giữ nền gốc)"
                        className="w-full text-xs font-medium text-stone-800 bg-stone-50/70 hover:bg-white focus:bg-white border border-stone-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-200 rounded p-1.5 transition-all resize-none outline-none leading-relaxed placeholder:text-stone-400 placeholder:italic"
                      />
                      <div className="flex items-center justify-between text-[10px] pt-0.5">
                        {currentBgVal.trim() ? (
                          <span className="inline-flex items-center gap-1 text-sky-800 font-semibold bg-sky-50 px-1.5 py-0.5 rounded">
                            <ShieldCheck className="w-2.5 h-2.5 text-sky-600" />
                            Đổi nền, giữ nguyên người & sản phẩm
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-stone-600 font-medium bg-stone-100 px-1.5 py-0.5 rounded">
                            <ShieldCheck className="w-2.5 h-2.5 text-stone-400" />
                            Giữ 100% bối cảnh gốc
                          </span>
                        )}
                        {currentBgVal && (
                          <button
                            type="button"
                            onClick={() => {
                              updateItemConfig({
                                backgroundPrompt: '',
                                enableBackground: false,
                              });
                            }}
                            className="text-stone-400 hover:text-rose-600 font-medium text-[9.5px] cursor-pointer"
                          >
                            Xóa bối cảnh
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Bottom Footer: Quick Sync bar */}
            <div className="mt-2 flex items-center justify-between text-[11px] pt-2 border-t border-stone-200/60 shrink-0">
              <span className="text-[10px] text-stone-400 font-medium">
                Đồng bộ từ thiết lập chung
              </span>
              <button
                type="button"
                onClick={() => {
                  const syncOutfits = uploadedOutfits.length > 0 ? uploadedOutfits : (uploadedOutfit ? [uploadedOutfit] : []);
                  onUpdateItem(item.id, {
                    appliedConfig: {
                      enableCharacter: Boolean(settings.characterPrompt.trim()),
                      enableOutfit: item.appliedConfig?.enableOutfit ?? true,
                      enableBackground: Boolean(settings.backgroundPrompt?.trim()),
                      characterPrompt: settings.characterPrompt,
                      outfitPrompt: settings.outfitPrompt,
                      backgroundPrompt: settings.backgroundPrompt || '',
                      productReferences: syncOutfits,
                      outfitImageUrl: syncOutfits[0]?.dataUrl || syncOutfits[0]?.previewUrl || null,
                      outfitImageName: syncOutfits[0]?.name || null,
                      preservePose: settings.preservePose,
                      appliedAt: Date.now(),
                    },
                  });
                }}
                className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Đồng bộ ngay</span>
              </button>
            </div>
          </div>
        </div>

        {/* COLUMN 3: New AI Result Image */}
        <div className="flex flex-col bg-stone-50/80 rounded-xl p-3 border border-stone-200/90 h-[430px] sm:h-[460px] justify-between shadow-2xs">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isRowCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`}></span>
                3. Ảnh AI tạo mới
              </span>

              <div className="flex items-center gap-1">
                {isRowCompleted && (
                  <button
                    type="button"
                    onClick={() => onOpenLightbox(item.resultImageUrl!, `Ảnh mới đã thay thế: ${item.name}`)}
                    className="text-stone-400 hover:text-stone-700 p-1 rounded hover:bg-stone-200/60 transition-colors cursor-pointer"
                    title="Phóng to ảnh mới"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Multiple variations buttons */}
            {isRowCompleted && item.resultImageUrls && item.resultImageUrls.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto py-1 mb-1 shrink-0">
                <span className="text-[10px] font-bold text-indigo-700 flex items-center gap-1 mr-0.5">
                  <Layers className="w-3 h-3" />
                  {item.resultImageUrls.length} biến thể:
                </span>
                {item.resultImageUrls.map((url, vIdx) => {
                  const isAct = (item.activeResultIndex ?? 0) === vIdx;
                  return (
                    <button
                      key={vIdx}
                      type="button"
                      onClick={() => {
                        onUpdateItem(item.id, {
                          activeResultIndex: vIdx,
                          resultImageUrl: url,
                        });
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        isAct
                          ? 'bg-indigo-600 text-white shadow-xs scale-105'
                          : 'bg-white text-stone-700 border border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Ảnh {vIdx + 1}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Display Area for New Image */}
            <div
              draggable={isRowCompleted && Boolean(item.resultImageUrl)}
              onDragStart={(e) => {
                if (!item.resultImageUrl) return;
                e.dataTransfer.setData('text/plain', item.resultImageUrl);
                e.dataTransfer.setData(
                  'application/json',
                  JSON.stringify({
                    url: item.resultImageUrl,
                    name: `Ảnh mới: ${item.name}`,
                    type: 'result-image',
                    itemId: item.id,
                  })
                );
                e.dataTransfer.effectAllowed = 'copyMove';
              }}
              className={`relative flex-1 w-full min-h-0 rounded-lg overflow-hidden bg-stone-900/5 border border-stone-200/80 shadow-2xs flex items-center justify-center my-1 ${
                isRowCompleted && item.resultImageUrl ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
              title={isRowCompleted && item.resultImageUrl ? 'Kéo ảnh AI này thả vào ô Ảnh Đầu hoặc Ảnh Cuối Video' : undefined}
            >
              {isRowProcessing ? (
                <div className="flex flex-col items-center justify-center p-4 text-center bg-indigo-50/70 border border-indigo-200/80 rounded-lg w-full h-full animate-in fade-in duration-200">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                  <p className="text-xs font-bold text-stone-900">
                    {item.resultImageUrl ? 'Đang tạo lại ảnh bằng AI...' : 'Đang tạo ảnh bằng AI...'}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-0.5">Xóa phụ đề & áp dụng nhân vật/sản phẩm</p>
                  <span className="mt-2 text-[10px] text-indigo-700 font-bold bg-indigo-100/80 px-2.5 py-0.5 rounded-full border border-indigo-200 animate-pulse">
                    Mô hình AI đang kết xuất...
                  </span>
                </div>
              ) : isRowCompleted && item.resultImageUrl ? (
                <div className="relative w-full h-full group flex items-center justify-center">
                  <img
                    src={item.resultImageUrl}
                    alt={`Result ${item.name}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain transition-all duration-200 pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenLightbox(item.resultImageUrl!, `Ảnh mới đã thay thế: ${item.name}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/95 text-stone-900 text-xs font-semibold shadow-md hover:bg-white cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Phóng to
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadImage(item.resultImageUrl!, item.name)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold shadow-md hover:bg-indigo-700 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Tải ảnh
                    </button>
                  </div>
                </div>
              ) : isRowError ? (
                <div className="flex flex-col items-center justify-center p-3 text-center bg-rose-50/70 w-full h-full rounded-lg border border-rose-200">
                  <AlertCircle className="w-6 h-6 text-rose-500 mb-1" />
                  <p className="text-xs font-bold text-rose-800">Chưa tạo được ảnh từ AI</p>
                  <p className="text-[11px] text-rose-700 mt-1 max-w-[220px] line-clamp-2" title={item.error}>
                    {item.error || 'Vui lòng kiểm tra lại cấu hình API'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onProcessSingleItem(item)}
                    className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow-xs transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Thử lại
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-stone-300 rounded-lg w-full h-full bg-white/60">
                  <Sparkles className="w-6 h-6 text-stone-300 mb-1" />
                  <p className="text-xs font-semibold text-stone-600">Chưa tạo ảnh mới</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Áp dụng nhân vật & trang phục vào ảnh gốc
                  </p>
                  <button
                    type="button"
                    onClick={() => onProcessSingleItem(item)}
                    disabled={isProcessingAll}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Tạo ảnh AI
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-200/60 shrink-0">
            {isRowProcessing ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Đang tạo {item.resultImageUrl ? 'lại' : ''} ảnh AI...</span>
              </span>
            ) : isRowCompleted ? (
              <>
                <span className="text-emerald-700 font-medium">Ảnh AI đã sẵn sàng</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onProcessSingleItem(item)}
                    disabled={isRowProcessing || isProcessingAll}
                    className="text-stone-500 hover:text-indigo-600 font-medium flex items-center gap-1 cursor-pointer"
                    title="Tạo lại ảnh mới"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Tạo lại
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadImage(item.resultImageUrl!, item.name)}
                    className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
                    title="Tải ảnh về máy"
                  >
                    <Download className="w-3 h-3" />
                    Tải về
                  </button>
                </div>
              </>
            ) : (
              <span>Sẵn sàng tạo ảnh AI</span>
            )}
          </div>
        </div>

        {/* COLUMN 4: Video corresponding to this Row & Video Studio */}
        <div className="flex flex-col bg-stone-50/80 rounded-xl p-3 border border-stone-200/90 h-[430px] sm:h-[460px] justify-between shadow-2xs">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-bold text-violet-900 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-violet-600" />
                4. Video Kling AI
              </span>

              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-violet-100/80 text-violet-700 border border-violet-200/60">
                  {apiConfig?.kling?.model || 'kling-v2-6'} • {apiConfig?.kling?.duration || '5'}s
                </span>
                {onOpenKlingSettings && (
                  <button
                    type="button"
                    onClick={onOpenKlingSettings}
                    className="text-stone-400 hover:text-violet-600 p-1 rounded hover:bg-stone-200/60 transition-colors cursor-pointer"
                    title="Cấu hình API Key Kling AI"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Display / Generator Area for Video */}
            <div className="relative flex-1 w-full min-h-0 rounded-lg overflow-hidden flex flex-col justify-between my-1">
              <input
                ref={startFrameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadStartFrame}
              />
              <input
                ref={endFrameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadEndFrame}
              />
              
              {/* STATE 1: Video Generating / Regenerating Progress */}
              {isVideoGenerating ? (
                <div className="flex flex-col items-center justify-center p-4 text-center bg-violet-50/80 border border-violet-200/90 rounded-lg w-full h-full animate-in fade-in duration-200">
                  <Loader2 className="w-8 h-8 text-violet-600 animate-spin mb-2" />
                  <p className="text-xs font-bold text-stone-900">
                    {item.videoUrl ? 'Đang tạo lại video với Kling AI...' : 'Đang tạo video với Kling AI...'}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {item.videoTaskId ? `Task ID: ${item.videoTaskId.slice(0, 16)}...` : 'Đang gửi yêu cầu tạo video đến Kling AI...'}
                  </p>
                  <div className="w-40 bg-stone-200 h-2 rounded-full mt-3 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-violet-600 to-indigo-600 h-full transition-all duration-300"
                      style={{ width: `${item.videoProgress || 20}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] font-bold text-violet-700">{item.videoProgress || 20}%</span>
                    <span className="text-[10px] text-stone-400">• Render chuyển động AI</span>
                  </div>
                </div>
              ) : hasVideo && item.videoUrl ? (
                isPromptExpanded ? (
                  /* When editing prompt & reference frames: hide video, show full editor */
                  <div className="flex-1 flex flex-col justify-between p-2 sm:p-2.5 bg-white rounded-lg border border-violet-200/80 shadow-2xs overflow-hidden animate-in fade-in duration-200">
                    <div className="space-y-2 flex-1 flex flex-col min-h-0">
                      {/* Header: Reference Frames Title */}
                      <div className="flex items-center justify-between gap-1 shrink-0">
                        <span className="text-[11px] font-bold text-violet-950 flex items-center gap-1">
                          <Film className="w-3.5 h-3.5 text-violet-600" />
                          <span>Khung hình tham chiếu:</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200/70 px-1.5 py-0.5 rounded">
                            {item.videoEndImageUrl ? '2 Khung hình (Đầu & Cuối)' : '1 Khung hình đầu'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsPromptExpanded(false)}
                            className="text-stone-400 hover:text-stone-700 p-0.5 rounded cursor-pointer"
                            title="Đóng sửa (quay lại xem video)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* TWO REFERENCE FRAMES: START & END */}
                      <div className="grid grid-cols-2 gap-1.5 shrink-0 relative items-center">
                        {/* 1. START FRAME (FIRST FRAME) */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            setIsDragOverStart(true);
                          }}
                          onDragLeave={() => setIsDragOverStart(false)}
                          onDrop={handleDropOnStartFrame}
                          className={`flex flex-col bg-stone-50 rounded-lg p-1.5 border relative group transition-all ${
                            isDragOverStart
                              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300 scale-[1.02]'
                              : 'border-stone-200/90 hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1 gap-1">
                            <span className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 truncate">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                              <span>1. Ảnh đầu</span>
                              {item.videoStartImageUrl ? (
                                <span className="text-[8.5px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200 shrink-0">
                                  Ảnh ngoài
                                </span>
                              ) : item.resultImageUrl ? (
                                <span className="text-[8.5px] px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold border border-indigo-200 shrink-0">
                                  Ảnh AI
                                </span>
                              ) : item.dataUrl ? (
                                <span className="text-[8.5px] px-1 py-0.2 rounded bg-stone-200/80 text-stone-700 font-semibold border border-stone-300 shrink-0">
                                  Ảnh gốc
                                </span>
                              ) : (
                                <span className="text-[8.5px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-200 shrink-0">
                                  Chưa có
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              {item.videoStartImageUrl && (
                                <button
                                  type="button"
                                  onClick={handleResetStartFrame}
                                  className="text-[9px] text-stone-400 hover:text-stone-700 underline cursor-pointer"
                                  title="Khôi phục ảnh mặc định"
                                >
                                  Mặc định
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startFrameInputRef.current?.click()}
                                className="text-[9px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 bg-emerald-100/80 hover:bg-emerald-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                title="Tải ảnh đầu ngoài từ máy tính"
                              >
                                <ImagePlus className="w-2.5 h-2.5" />
                                <span>Tải ảnh</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsGalleryPickerOpen('start')}
                                className="text-[9px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 bg-emerald-100/80 hover:bg-emerald-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                title="Chọn từ danh sách ảnh đã tạo"
                              >
                                <Images className="w-2.5 h-2.5" />
                                <span>Chọn</span>
                              </button>
                            </div>
                          </div>

                          <div
                            className={`relative aspect-[4/3] w-full rounded-md overflow-hidden bg-stone-900/10 border flex items-center justify-center transition-colors ${
                              isDragOverStart ? 'border-emerald-500 bg-emerald-100/50' : 'border-stone-200'
                            }`}
                          >
                            {isDragOverStart ? (
                              <div className="flex flex-col items-center justify-center p-1 text-center text-emerald-700 font-bold animate-pulse">
                                <Plus className="w-5 h-5 mb-0.5" />
                                <span className="text-[9px]">Thả vào làm Ảnh Đầu!</span>
                              </div>
                            ) : effectiveStartImage ? (
                              <>
                                <img
                                  src={effectiveStartImage}
                                  alt="Start frame"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-contain pointer-events-none"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onOpenLightbox(effectiveStartImage, `Ảnh đầu video: ${effectiveStartName}`)}
                                    className="p-1 rounded bg-white text-stone-900 hover:bg-stone-100 cursor-pointer shadow-xs"
                                    title="Phóng to ảnh đầu"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setIsGalleryPickerOpen('start')}
                                    className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-xs"
                                    title="Chọn từ danh sách ảnh đã tạo"
                                  >
                                    <Images className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startFrameInputRef.current?.click()}
                                    className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-xs"
                                    title="Tải ảnh đầu khác từ máy tính"
                                  >
                                    <ImagePlus className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setIsGalleryPickerOpen('start')}
                                className="w-full h-full flex flex-col items-center justify-center text-stone-400 hover:text-indigo-600 cursor-pointer"
                              >
                                <Plus className="w-4 h-4 mb-0.5" />
                                <span className="text-[9px] font-semibold">Chọn ảnh</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* SWAP BUTTON (IN THE MIDDLE) */}
                        {item.videoEndImageUrl && (
                          <button
                            type="button"
                            onClick={handleSwapStartEndFrames}
                            className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white text-violet-700 hover:text-white hover:bg-violet-600 border border-violet-300 shadow-md flex items-center justify-center transition-all cursor-pointer"
                            title="Hoán đổi Ảnh Đầu ⇄ Ảnh Cuối"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                          </button>
                        )}

                        {/* 2. END FRAME (LAST FRAME / TAIL) */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            setIsDragOverEnd(true);
                          }}
                          onDragLeave={() => setIsDragOverEnd(false)}
                          onDrop={handleDropOnEndFrame}
                          className={`flex flex-col bg-stone-50 rounded-lg p-1.5 border relative group transition-all ${
                            isDragOverEnd
                              ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-300 scale-[1.02]'
                              : 'border-stone-200/90 hover:border-violet-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-violet-800 flex items-center gap-1 truncate">
                              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0"></span>
                              <span>2. Ảnh cuối</span>
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => endFrameInputRef.current?.click()}
                                className="text-[9px] text-violet-700 hover:text-violet-800 font-bold flex items-center gap-0.5 bg-violet-100/80 hover:bg-violet-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                title="Tải ảnh cuối từ máy tính"
                              >
                                <ImagePlus className="w-2.5 h-2.5" />
                                <span>Tải ảnh</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsGalleryPickerOpen('end')}
                                className="text-[9px] text-violet-700 hover:text-violet-800 font-bold flex items-center gap-0.5 bg-violet-100/80 hover:bg-violet-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                                title="Chọn từ danh sách ảnh đã tạo"
                              >
                                <Images className="w-2.5 h-2.5" />
                                <span>Chọn</span>
                              </button>
                              {item.videoEndImageUrl && (
                                <button
                                  type="button"
                                  onClick={handleRemoveEndFrame}
                                  className="text-stone-400 hover:text-rose-600 cursor-pointer p-0.5 rounded"
                                  title="Gỡ bỏ ảnh cuối"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div
                            className={`relative aspect-[4/3] w-full rounded-md overflow-hidden bg-stone-900/10 border flex items-center justify-center transition-colors ${
                              isDragOverEnd ? 'border-violet-500 bg-violet-100/50' : 'border-stone-200'
                            }`}
                          >
                            {isDragOverEnd ? (
                              <div className="flex flex-col items-center justify-center p-1 text-center text-violet-700 font-bold animate-pulse">
                                <Plus className="w-5 h-5 mb-0.5" />
                                <span className="text-[9px]">Thả vào làm Ảnh Cuối!</span>
                              </div>
                            ) : item.videoEndImageUrl ? (
                              <>
                                <img
                                  src={item.videoEndImageUrl}
                                  alt="End frame"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-contain pointer-events-none"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onOpenLightbox(item.videoEndImageUrl!, `Ảnh cuối video: ${item.videoEndImageName || item.name}`)}
                                    className="p-1 rounded bg-white text-stone-900 hover:bg-stone-100 cursor-pointer shadow-xs"
                                    title="Phóng to ảnh cuối"
                                  >
                                    <Eye className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setIsGalleryPickerOpen('end')}
                                    className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 cursor-pointer shadow-xs"
                                    title="Chọn từ danh sách ảnh đã tạo"
                                  >
                                    <Images className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => endFrameInputRef.current?.click()}
                                    className="p-1 rounded bg-stone-700 text-white hover:bg-stone-800 cursor-pointer shadow-xs"
                                    title="Đổi ảnh cuối khác từ máy"
                                  >
                                    <ImagePlus className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleRemoveEndFrame}
                                    className="p-1 rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer shadow-xs"
                                    title="Gỡ bỏ"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setIsGalleryPickerOpen('end')}
                                className="w-full h-full flex flex-col items-center justify-center p-1 text-center border border-dashed border-stone-300 hover:border-violet-400 rounded hover:bg-violet-50/50 transition-colors text-stone-400 hover:text-violet-600 cursor-pointer group"
                                title="Nhấp để chọn hoặc kéo thả ảnh kết thúc (End frame) cho video"
                              >
                                <Plus className="w-3.5 h-3.5 mb-0.5 group-hover:scale-110 transition-transform" />
                                <span className="text-[9px] font-bold">+ Ảnh cuối</span>
                                <span className="text-[8px] text-stone-400">(Kéo/Chọn)</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Video Prompt Textarea */}
                      <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex items-center justify-between mb-1 shrink-0">
                          <span className="text-[10px] font-bold text-stone-700">Prompt chuyển động:</span>
                        </div>
                        <textarea
                          rows={2}
                          value={item.videoPrompt || ''}
                          onChange={(e) => onUpdateItem(item.id, { videoPrompt: e.target.value })}
                          placeholder="Mô tả chuyển động video (ví dụ: người mẫu xoay nhẹ, quay chậm cinematic, giữ nguyên form áo)..."
                          className="w-full flex-1 min-h-[50px] text-[11px] rounded-md border border-stone-300 p-1.5 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1.5 focus:ring-violet-500 bg-stone-50/50 resize-none leading-tight"
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-1.5 pt-1.5 border-t border-stone-100 flex items-center justify-between gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsPromptExpanded(false)}
                        className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition-colors cursor-pointer"
                      >
                        Quay lại video
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsPromptExpanded(false);
                          onGenerateKlingVideo({
                            ...item,
                            videoStartImageUrl: effectiveStartImage,
                            videoEndImageUrl: item.videoEndImageUrl || undefined,
                          });
                        }}
                        disabled={isVideoGenerating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-95 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Tạo video mới</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* When not editing: show video player */
                  <div className="flex-1 flex flex-col min-h-0 justify-between">
                    <div className="relative flex-1 w-full min-h-0 rounded-lg overflow-hidden bg-black flex items-center justify-center group">
                      <video
                        src={item.videoUrl}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )
              ) : (
                /* STATE 3 & 4: Ready for Video Creation (Directly or from New/Original/External Image) & Error Recovery */
                <div className={`flex-1 flex flex-col justify-between p-2 sm:p-2.5 rounded-lg border shadow-2xs overflow-hidden ${
                  item.videoStatus === 'error'
                    ? 'bg-rose-50/30 border-rose-200'
                    : 'bg-white border-violet-200/80'
                }`}>

                  <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                    {/* Error Notification Banner when in Error State */}
                    {item.videoStatus === 'error' && (
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] shrink-0 animate-in fade-in duration-150">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-rose-800 text-xs">Chưa tạo được video</p>
                              <p className="text-[10px] text-rose-700 line-clamp-2 mt-0.5 leading-snug" title={item.videoError}>
                                {item.videoError || 'Lỗi xử lý video từ Kling AI. Bạn có thể sửa lại prompt hoặc đổi ảnh đầu bên dưới để thử lại.'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onUpdateItem(item.id, { videoStatus: 'idle', videoError: undefined })}
                            className="text-stone-400 hover:text-stone-600 p-0.5 rounded cursor-pointer shrink-0"
                            title="Đóng thông báo lỗi"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Header: Reference Frames Title */}
                    <div className="flex items-center justify-between gap-1 shrink-0">
                      <span className="text-[11px] font-bold text-violet-950 flex items-center gap-1">
                        <Film className="w-3.5 h-3.5 text-violet-600" />
                        <span>Khung hình tham chiếu:</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200/70 px-1.5 py-0.5 rounded">
                          {item.videoEndImageUrl ? '2 Khung hình (Đầu & Cuối)' : '1 Khung hình đầu'}
                        </span>
                      </div>
                    </div>

                    {/* TWO REFERENCE FRAMES: START & END */}
                    <div className="grid grid-cols-2 gap-1.5 shrink-0 relative items-center">
                      {/* 1. START FRAME (FIRST FRAME) */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setIsDragOverStart(true);
                        }}
                        onDragLeave={() => setIsDragOverStart(false)}
                        onDrop={handleDropOnStartFrame}
                        className={`flex flex-col bg-stone-50 rounded-lg p-1.5 border relative group transition-all ${
                          isDragOverStart
                            ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300 scale-[1.02]'
                            : 'border-stone-200/90 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1 gap-1">
                          <span className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                            <span>1. Ảnh đầu</span>
                            {item.videoStartImageUrl ? (
                              <span className="text-[8.5px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200 shrink-0">
                                Ảnh ngoài
                              </span>
                            ) : item.resultImageUrl ? (
                              <span className="text-[8.5px] px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold border border-indigo-200 shrink-0">
                                Ảnh AI
                              </span>
                            ) : item.dataUrl ? (
                              <span className="text-[8.5px] px-1 py-0.2 rounded bg-stone-200/80 text-stone-700 font-semibold border border-stone-300 shrink-0">
                                Ảnh gốc
                              </span>
                            ) : (
                              <span className="text-[8.5px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-200 shrink-0">
                                Chưa có
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-1">
                            {item.videoStartImageUrl && (
                              <button
                                type="button"
                                onClick={handleResetStartFrame}
                                className="text-[9px] text-stone-400 hover:text-stone-700 underline cursor-pointer"
                                title="Khôi phục ảnh mặc định"
                              >
                                Mặc định
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startFrameInputRef.current?.click()}
                              className="text-[9px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 bg-emerald-100/80 hover:bg-emerald-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                              title="Tải ảnh đầu ngoài từ máy tính"
                            >
                              <ImagePlus className="w-2.5 h-2.5" />
                              <span>Tải ảnh</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsGalleryPickerOpen('start')}
                              className="text-[9px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 bg-emerald-100/80 hover:bg-emerald-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                              title="Chọn từ danh sách ảnh đã tạo"
                            >
                              <Images className="w-2.5 h-2.5" />
                              <span>Chọn</span>
                            </button>
                          </div>
                        </div>

                        <div
                          className={`relative aspect-[4/3] w-full rounded-md overflow-hidden bg-stone-900/10 border flex items-center justify-center transition-colors ${
                            isDragOverStart ? 'border-emerald-500 bg-emerald-100/50' : 'border-stone-200'
                          }`}
                        >
                          {isDragOverStart ? (
                            <div className="flex flex-col items-center justify-center p-1 text-center text-emerald-700 font-bold animate-pulse">
                              <Plus className="w-5 h-5 mb-0.5" />
                              <span className="text-[9px]">Thả vào làm Ảnh Đầu!</span>
                            </div>
                          ) : effectiveStartImage ? (
                            <>
                              <img
                                src={effectiveStartImage}
                                alt="Start frame"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain pointer-events-none"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onOpenLightbox(effectiveStartImage, `Ảnh đầu video: ${effectiveStartName}`)}
                                  className="p-1 rounded bg-white text-stone-900 hover:bg-stone-100 cursor-pointer shadow-xs"
                                  title="Phóng to ảnh đầu"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startFrameInputRef.current?.click()}
                                  className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-xs"
                                  title="Tải ảnh đầu khác từ máy tính"
                                >
                                  <ImagePlus className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsGalleryPickerOpen('start')}
                                  className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer shadow-xs"
                                  title="Chọn từ danh sách ảnh đã tạo"
                                >
                                  <Images className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startFrameInputRef.current?.click()}
                              className="w-full h-full flex flex-col items-center justify-center text-stone-400 hover:text-emerald-600 cursor-pointer p-1 text-center group border border-dashed border-stone-300 rounded"
                              title="Tải ảnh từ máy tính hoặc kéo thả vào đây làm Ảnh Đầu"
                            >
                              <ImagePlus className="w-4 h-4 mb-0.5 group-hover:scale-110 transition-transform" />
                              <span className="text-[9px] font-bold text-stone-600 group-hover:text-emerald-700">+ Tải ảnh đầu</span>
                              <span className="text-[8px] text-stone-400">(Từ máy/Kéo thả)</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* SWAP BUTTON (IN THE MIDDLE) */}
                      {item.videoEndImageUrl && (
                        <button
                          type="button"
                          onClick={handleSwapStartEndFrames}
                          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-white text-violet-700 hover:text-white hover:bg-violet-600 border border-violet-300 shadow-md flex items-center justify-center transition-all cursor-pointer"
                          title="Hoán đổi Ảnh Đầu ⇄ Ảnh Cuối"
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                        </button>
                      )}

                      {/* 2. END FRAME (LAST FRAME / TAIL) */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          setIsDragOverEnd(true);
                        }}
                        onDragLeave={() => setIsDragOverEnd(false)}
                        onDrop={handleDropOnEndFrame}
                        className={`flex flex-col bg-stone-50 rounded-lg p-1.5 border relative group transition-all ${
                          isDragOverEnd
                            ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-300 scale-[1.02]'
                            : 'border-stone-200/90 hover:border-violet-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-violet-800 flex items-center gap-1 truncate">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0"></span>
                            <span>2. Ảnh cuối</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => endFrameInputRef.current?.click()}
                              className="text-[9px] text-violet-700 hover:text-violet-800 font-bold flex items-center gap-0.5 bg-violet-100/80 hover:bg-violet-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                              title="Tải ảnh cuối từ máy tính"
                            >
                              <ImagePlus className="w-2.5 h-2.5" />
                              <span>Tải ảnh</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsGalleryPickerOpen('end')}
                              className="text-[9px] text-violet-700 hover:text-violet-800 font-bold flex items-center gap-0.5 bg-violet-100/80 hover:bg-violet-200/80 px-1 py-0.5 rounded cursor-pointer transition-colors"
                              title="Chọn từ danh sách ảnh đã tạo"
                            >
                              <Images className="w-2.5 h-2.5" />
                              <span>Chọn</span>
                            </button>
                            {item.videoEndImageUrl && (
                              <button
                                type="button"
                                onClick={handleRemoveEndFrame}
                                className="text-stone-400 hover:text-rose-600 cursor-pointer p-0.5 rounded"
                                title="Gỡ bỏ ảnh cuối"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div
                          className={`relative aspect-[4/3] w-full rounded-md overflow-hidden bg-stone-900/10 border flex items-center justify-center transition-colors ${
                            isDragOverEnd ? 'border-violet-500 bg-violet-100/50' : 'border-stone-200'
                          }`}
                        >
                          {isDragOverEnd ? (
                            <div className="flex flex-col items-center justify-center p-1 text-center text-violet-700 font-bold animate-pulse">
                              <Plus className="w-5 h-5 mb-0.5" />
                              <span className="text-[9px]">Thả vào làm Ảnh Cuối!</span>
                            </div>
                          ) : item.videoEndImageUrl ? (
                            <>
                              <img
                                src={item.videoEndImageUrl}
                                alt="End frame"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain pointer-events-none"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onOpenLightbox(item.videoEndImageUrl!, `Ảnh cuối video: ${item.videoEndImageName || item.name}`)}
                                  className="p-1 rounded bg-white text-stone-900 hover:bg-stone-100 cursor-pointer shadow-xs"
                                  title="Phóng to ảnh cuối"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => endFrameInputRef.current?.click()}
                                  className="p-1 rounded bg-stone-700 text-white hover:bg-stone-800 cursor-pointer shadow-xs"
                                  title="Đổi ảnh cuối khác từ máy"
                                >
                                  <ImagePlus className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsGalleryPickerOpen('end')}
                                  className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 cursor-pointer shadow-xs"
                                  title="Chọn từ danh sách ảnh đã tạo"
                                >
                                  <Images className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleRemoveEndFrame}
                                  className="p-1 rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer shadow-xs"
                                  title="Gỡ bỏ"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => endFrameInputRef.current?.click()}
                              className="w-full h-full flex flex-col items-center justify-center p-1 text-center border border-dashed border-stone-300 hover:border-violet-400 rounded hover:bg-violet-50/50 transition-colors text-stone-400 hover:text-violet-600 cursor-pointer group"
                              title="Nhấp để tải ảnh hoặc kéo thả ảnh kết thúc (End frame) cho video"
                            >
                              <Plus className="w-3.5 h-3.5 mb-0.5 group-hover:scale-110 transition-transform" />
                              <span className="text-[9px] font-bold text-stone-600 group-hover:text-violet-700">+ Ảnh cuối</span>
                              <span className="text-[8px] text-stone-400">(Tải/Kéo thả)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Video Prompt Textarea (Editable anytime) */}
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="flex items-center justify-between mb-1 shrink-0">
                        <span className="text-[10px] font-bold text-stone-700">Prompt chuyển động:</span>
                        {item.videoPrompt && item.videoPrompt.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={() => onUpdateItem(item.id, { videoPrompt: '' })}
                            className="text-[9px] text-stone-400 hover:text-rose-600 underline cursor-pointer"
                            title="Xóa nhanh prompt video cũ để nhập lại từ đầu"
                          >
                            Xóa prompt cũ
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={item.videoPrompt || ''}
                        onChange={(e) => onUpdateItem(item.id, { videoPrompt: e.target.value })}
                        placeholder="Mô tả chuyển động video (ví dụ: người mẫu xoay nhẹ, quay chậm cinematic, giữ nguyên form áo)..."
                        className="w-full flex-1 min-h-[48px] text-[11px] rounded-md border border-stone-300 p-1.5 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1.5 focus:ring-violet-500 bg-stone-50/50 focus:bg-white resize-none leading-tight transition-colors"
                      />
                    </div>
                  </div>

                  {/* Submit / Retry Kling AI Video Button */}
                  <div className="mt-1.5 pt-1.5 border-t border-stone-100 shrink-0 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!effectiveStartImage) {
                          startFrameInputRef.current?.click();
                          return;
                        }
                        onGenerateKlingVideo({
                          ...item,
                          videoStartImageUrl: effectiveStartImage,
                          videoEndImageUrl: item.videoEndImageUrl || undefined,
                        });
                      }}
                      disabled={isVideoGenerating}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 ${
                        effectiveStartImage
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {item.videoStatus === 'error' ? (
                        <>
                          <RefreshCw className="w-3 h-3" />
                          <span>Thử lại (Tạo video mới)</span>
                        </>
                      ) : effectiveStartImage ? (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>Tạo video Kling AI</span>
                        </>
                      ) : (
                        <>
                          <ImagePlus className="w-3 h-3" />
                          <span>Thêm ảnh đầu để tạo video</span>
                        </>
                      )}
                    </button>
                    {item.videoStatus === 'error' && onOpenKlingSettings && (
                      <button
                        type="button"
                        onClick={onOpenKlingSettings}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition-colors cursor-pointer shrink-0"
                        title="Mở cấu hình Kling AI"
                      >
                        <Settings className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom action for video */}
          <div className="mt-2 flex items-center justify-between text-[11px] text-stone-500 pt-2 border-t border-stone-200/60 shrink-0">
            {isVideoGenerating ? (
              <div className="flex items-center gap-1.5 text-violet-700 font-bold animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
                <span>Đang tạo {item.videoUrl ? 'lại' : ''} video Kling AI...</span>
              </div>
            ) : hasVideo ? (
              <>
                <span className="text-violet-700 font-semibold">Video hoàn tất</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPromptExpanded((prev) => !prev)}
                    className="text-stone-500 hover:text-violet-600 font-medium flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>{isPromptExpanded ? 'Đóng sửa' : 'Sửa prompt & ảnh'}</span>
                    {isPromptExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onGenerateKlingVideo({
                        ...item,
                        videoStartImageUrl: effectiveStartImage,
                        videoEndImageUrl: item.videoEndImageUrl || undefined,
                      })
                    }
                    disabled={isVideoGenerating || !effectiveStartImage}
                    className="text-stone-500 hover:text-violet-600 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Tạo lại
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadVideo(item.videoUrl!, item.name)}
                    className="text-violet-600 hover:text-violet-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Tải video
                  </button>
                </div>
              </>
            ) : item.videoStatus === 'error' ? (
              <div className="flex items-center justify-between w-full">
                <span className="text-rose-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span>Tạo video chưa thành công</span>
                </span>
                <div className="flex items-center gap-2">
                  {item.videoPrompt && item.videoPrompt.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => onUpdateItem(item.id, { videoPrompt: '' })}
                      className="text-stone-400 hover:text-rose-600 text-[10px] underline cursor-pointer"
                      title="Xóa nhanh prompt cũ"
                    >
                      Xóa prompt cũ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onGenerateKlingVideo({
                        ...item,
                        videoStartImageUrl: effectiveStartImage,
                        videoEndImageUrl: item.videoEndImageUrl || undefined,
                      })
                    }
                    disabled={isVideoGenerating || !effectiveStartImage}
                    className="text-violet-600 hover:text-violet-700 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Thử lại
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-violet-700 font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-violet-600" />
                  <span>{effectiveStartImage ? 'Sẵn sàng tạo video Kling' : 'Thêm ảnh đầu để tạo video'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!effectiveStartImage) {
                      startFrameInputRef.current?.click();
                      return;
                    }
                    onGenerateKlingVideo({
                      ...item,
                      videoStartImageUrl: effectiveStartImage,
                      videoEndImageUrl: item.videoEndImageUrl || undefined,
                    });
                  }}
                  disabled={isVideoGenerating}
                  className="text-violet-600 hover:text-violet-800 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Tạo video</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full AI Image Prompt Modal (Editable) */}
      {isFullPromptModalOpen && (
        <div
          id={`full-prompt-modal-${item.id}`}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsFullPromptModalOpen(false)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[92vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <span>Prompt tạo ảnh AI đầy đủ</span>
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                      Hàng #{index + 1} • {item.name}
                    </span>
                    {isPromptCustomized && (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                        ✨ Đang dùng Prompt tùy chỉnh
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Toàn bộ nội dung lệnh và hướng dẫn inpainting sẽ gửi sang AI để xử lý ảnh này. Bạn có thể trực tiếp chỉnh sửa bên dưới.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFullPromptModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
              {/* Quick Summary Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-medium block">Nhân vật</span>
                  <span className="font-bold text-stone-800 truncate block text-[11px]">
                    {item.appliedConfig?.enableCharacter
                      ? item.appliedConfig?.characterPrompt || 'Thay đổi nhân vật'
                      : 'Giữ 100% người gốc'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-medium block">Trang phục / Đồ</span>
                  <span className="font-bold text-emerald-700 truncate block text-[11px]">
                    {item.appliedConfig?.enableOutfit !== false ? 'Thay theo ref2' : 'Giữ đồ gốc'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-medium block">Bối cảnh / Nền</span>
                  <span className="font-bold text-stone-800 truncate block text-[11px]">
                    {item.appliedConfig?.enableBackground && item.appliedConfig?.backgroundPrompt
                      ? item.appliedConfig.backgroundPrompt
                      : 'Giữ bối cảnh gốc'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-medium block">Xóa phụ đề</span>
                  <span className="font-bold text-stone-800 truncate block text-[11px]">
                    {settings.removeSubtitles ? 'Đang bật' : 'Tắt'}
                  </span>
                </div>
              </div>

              {/* Full Editable Prompt Box */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Nội dung Prompt gửi sang AI (Cho phép chỉnh sửa trực tiếp):</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleResetToDefaultPrompt}
                      className="text-xs font-medium text-stone-600 hover:text-stone-900 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-stone-100 hover:bg-stone-200 transition-colors cursor-pointer border border-stone-300"
                      title="Khôi phục về prompt tự động sinh từ cấu hình hàng"
                    >
                      <RotateCcw className="w-3 h-3 text-stone-500" />
                      <span>Khôi phục mặc định</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(localPrompt);
                        setCopiedPrompt(true);
                        setTimeout(() => setCopiedPrompt(false), 2000);
                      }}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer border border-indigo-200"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Đã sao chép!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    rows={12}
                    value={localPrompt}
                    onChange={(e) => setLocalPrompt(e.target.value)}
                    placeholder="Nhập hoặc chỉnh sửa toàn bộ prompt tạo ảnh tại đây..."
                    className="w-full bg-stone-900 text-stone-100 rounded-xl p-3.5 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none border border-stone-800 shadow-inner resize-y select-text"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-stone-500 pt-0.5">
                  <span>
                    💡 Bạn có thể tự do sửa từ khóa, thêm chi tiết, thay đổi văn bản mô tả bằng tiếng Anh hoặc tiếng Việt.
                  </span>
                  <span className="font-mono text-stone-400">
                    {localPrompt.length} ký tự
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isSavedToast ? (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                    <Check className="w-4 h-4" />
                    Đã lưu prompt tùy chỉnh thành công!
                  </span>
                ) : localPrompt.trim() !== defaultPromptText.trim() ? (
                  <span className="text-xs font-medium text-amber-700 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Prompt đã được chỉnh sửa (Nhấn "Lưu prompt" để áp dụng)
                  </span>
                ) : (
                  <span className="text-[11px] text-stone-400">
                    Đang sử dụng prompt mặc định chuẩn
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCustomPrompt}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Lưu prompt cho ảnh này</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullPromptModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Gallery Picker Modal for Start / End Video Frame */}
      {isGalleryPickerOpen && (
        <div
          id={`gallery-picker-modal-${item.id}`}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsGalleryPickerOpen(null)}
        >
          <div
            className="relative max-w-2xl w-full max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-xs shrink-0 ${
                    isGalleryPickerOpen === 'start' ? 'bg-emerald-600' : 'bg-violet-600'
                  }`}
                >
                  <Images className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <span>
                      {isGalleryPickerOpen === 'start'
                        ? 'Chọn ảnh làm [Ảnh Đầu - Start frame]'
                        : 'Chọn ảnh làm [Ảnh Cuối - End frame]'}
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                      Hàng #{index + 1}
                    </span>
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Nhấp vào bất kỳ ảnh nào bên dưới để gán làm khung hình tham chiếu video.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsGalleryPickerOpen(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Grid of Images */}
            <div className="flex-1 overflow-y-auto py-3 space-y-4 min-h-0">
              {/* Section 1: Completed AI Images */}
              <div>
                <h4 className="text-xs font-bold text-stone-700 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Các ảnh AI vừa tạo xong (Từ tất cả các hàng):</span>
                </h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                  {allItems
                    .filter((it) => it.status === 'completed' && it.resultImageUrl)
                    .map((it, rowIdx) => {
                      const allUrls = it.resultImageUrls && it.resultImageUrls.length > 1
                        ? it.resultImageUrls
                        : [it.resultImageUrl!];
                      return allUrls.map((url, vIdx) => (
                        <div
                          key={`${it.id}-${vIdx}`}
                          onClick={() => {
                            if (isGalleryPickerOpen === 'start') {
                              onUpdateItem(item.id, {
                                videoStartImageUrl: url,
                                videoStartImageName: `${it.name} ${allUrls.length > 1 ? `(Biến thể ${vIdx + 1})` : ''}`,
                              });
                            } else {
                              onUpdateItem(item.id, {
                                videoEndImageUrl: url,
                                videoEndImageName: `${it.name} ${allUrls.length > 1 ? `(Biến thể ${vIdx + 1})` : ''}`,
                              });
                            }
                            setIsGalleryPickerOpen(null);
                          }}
                          className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-900 border-2 border-stone-200 hover:border-indigo-500 cursor-pointer shadow-2xs hover:shadow-md transition-all flex flex-col justify-end p-1"
                        >
                          <img
                            src={url}
                            alt={it.name}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform"
                          />
                          <div className="relative z-10 bg-black/75 backdrop-blur-xs p-1 rounded-md text-white">
                            <p className="text-[9px] font-bold truncate">#{rowIdx + 1} {it.name}</p>
                            {allUrls.length > 1 && (
                              <span className="text-[8px] text-indigo-300">Biến thể {vIdx + 1}</span>
                            )}
                          </div>
                        </div>
                      ));
                    })}
                  {allItems.filter((it) => it.status === 'completed' && it.resultImageUrl).length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                      Chưa có ảnh AI nào được tạo xong.
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Original Image & Outfit References */}
              <div>
                <h4 className="text-xs font-bold text-stone-700 mb-2 flex items-center gap-1.5">
                  <Shirt className="w-3.5 h-3.5 text-stone-600" />
                  <span>Ảnh gốc hàng này & ảnh sản phẩm tham chiếu:</span>
                </h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                  {/* Current row original image */}
                  <div
                    onClick={() => {
                      if (isGalleryPickerOpen === 'start') {
                        onUpdateItem(item.id, {
                          videoStartImageUrl: item.dataUrl,
                          videoStartImageName: `Ảnh gốc: ${item.name}`,
                        });
                      } else {
                        onUpdateItem(item.id, {
                          videoEndImageUrl: item.dataUrl,
                          videoEndImageName: `Ảnh gốc: ${item.name}`,
                        });
                      }
                      setIsGalleryPickerOpen(null);
                    }}
                    className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-900 border-2 border-stone-200 hover:border-emerald-500 cursor-pointer shadow-2xs hover:shadow-md transition-all flex flex-col justify-end p-1"
                  >
                    <img
                      src={item.dataUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform"
                    />
                    <div className="relative z-10 bg-black/75 backdrop-blur-xs p-1 rounded-md text-white">
                      <p className="text-[9px] font-bold truncate">Ảnh gốc: #{index + 1}</p>
                    </div>
                  </div>

                  {/* Outfit References */}
                  {appliedProductReferences.map((ref, rIdx) => (
                    <div
                      key={`ref-${rIdx}-${ref.id}`}
                      onClick={() => {
                        const targetUrl = ref.previewUrl || ref.dataUrl || '';
                        if (isGalleryPickerOpen === 'start') {
                          onUpdateItem(item.id, {
                            videoStartImageUrl: targetUrl,
                            videoStartImageName: `Sản phẩm ref${rIdx + 2}: ${ref.name}`,
                          });
                        } else {
                          onUpdateItem(item.id, {
                            videoEndImageUrl: targetUrl,
                            videoEndImageName: `Sản phẩm ref${rIdx + 2}: ${ref.name}`,
                          });
                        }
                        setIsGalleryPickerOpen(null);
                      }}
                      className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-900 border-2 border-stone-200 hover:border-violet-500 cursor-pointer shadow-2xs hover:shadow-md transition-all flex flex-col justify-end p-1"
                    >
                      <img
                        src={ref.previewUrl || ref.dataUrl}
                        alt={ref.name}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform"
                      />
                      <div className="relative z-10 bg-black/75 backdrop-blur-xs p-1 rounded-md text-white">
                        <p className="text-[9px] font-bold truncate">Ref {rIdx + 2}: {ref.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
              <span className="text-xs text-stone-500">
                Mẹo: Bạn cũng có thể kéo trực tiếp ảnh từ hàng phía trên hoặc từ máy tính thả vào ô.
              </span>
              <button
                type="button"
                onClick={() => setIsGalleryPickerOpen(null)}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
