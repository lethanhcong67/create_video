import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Video,
  Play,
  Film,
  Sparkles,
  Layers,
  Maximize2,
  X,
  Subtitles,
  CheckCheck,
  User,
  Shirt,
  CheckSquare,
  Square,
  Lock,
  ShieldCheck,
  UserCheck,
  UserX,
  Check,
  RotateCcw,
  Pencil,
  Zap,
  Mountain,
  Settings,
  ChevronDown,
  ChevronUp,
  Camera,
  Clapperboard,
} from 'lucide-react';
import { AppliedReplacementConfig, BatchImageItem, BatchSettings, OutfitReference, ApiConfig, CameraMovementType } from '../types';
import { fileToDataUrl, getImageDimensions, downloadImage, downloadVideo } from '../utils/imageUtils';
import { generateMotionVideoFromImage } from '../utils/videoGenerator';
import { CAMERA_MOVEMENT_PRESETS } from '../data/presets';
import { BatchPipelineRowItem } from './BatchPipelineRowItem';
import { CompletedImagesStrip } from './CompletedImagesStrip';

interface BatchPipelineRowsProps {
  items: BatchImageItem[];
  onAddItems: (newItems: BatchImageItem[]) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  onProcessSingleItem: (item: BatchImageItem) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<BatchImageItem>) => void;
  settings: BatchSettings;
  isProcessingAll: boolean;
  uploadedOutfit?: OutfitReference | null;
  uploadedOutfits?: OutfitReference[];
  onApplyToAll: () => void;
  apiConfig?: ApiConfig;
  systemHasKlingKey?: boolean;
  onOpenKlingSettings?: () => void;
  onDownloadAllZip?: () => void;
  onLogApiRequest?: (logData: any) => void;
}

export const BatchPipelineRows: React.FC<BatchPipelineRowsProps> = ({
  items,
  onAddItems,
  onRemoveItem,
  onClearAll,
  onProcessSingleItem,
  onUpdateItem,
  settings,
  isProcessingAll,
  uploadedOutfit,
  uploadedOutfits = [],
  onApplyToAll,
  apiConfig,
  systemHasKlingKey = false,
  onOpenKlingSettings,
  onDownloadAllZip,
  onLogApiRequest,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isBatchVideoGenerating, setIsBatchVideoGenerating] = useState(false);

  // Modals
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxTitle, setLightboxTitle] = useState<string>('');
  const [expandedPromptRowId, setExpandedPromptRowId] = useState<string | null>(null);
  const [batchCameraMotion, setBatchCameraMotion] = useState<CameraMovementType>(
    settings.defaultCameraMotion || 'static'
  );

  // Tracks the active Kling status-poll interval per row so it can be cleared when the row
  // is removed or the component unmounts — previously these intervals ran unbounded (up to
  // maxPoll ticks) even after a row was deleted or the user navigated away.
  const klingPollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const clearKlingPollTimer = (itemId: string) => {
    const existing = klingPollTimersRef.current.get(itemId);
    if (existing) {
      clearInterval(existing);
      klingPollTimersRef.current.delete(itemId);
    }
  };

  useEffect(() => {
    return () => {
      klingPollTimersRef.current.forEach((timer) => clearInterval(timer));
      klingPollTimersRef.current.clear();
    };
  }, []);

  const handleRemoveItem = (id: string) => {
    clearKlingPollTimer(id);
    onRemoveItem(id);
  };

  // Apply selected camera movement and its cinematic prompt to all rows
  const handleApplyCameraMotionToAll = (motionId: CameraMovementType) => {
    setBatchCameraMotion(motionId);
    const preset = CAMERA_MOVEMENT_PRESETS.find((p) => p.id === motionId);
    if (!preset) return;

    items.forEach((it) => {
      onUpdateItem(it.id, {
        selectedCameraMotion: motionId,
        videoPrompt: preset.prompt,
      });
    });
  };

  // Generate videos for all rows that have start images (external, result, or original) and don't have video yet
  const handleBatchGenerateAllVideos = async () => {
    const readyItems = items.filter((it) => {
      const startImg = it.videoStartImageUrl || it.resultImageUrl || it.dataUrl;
      return Boolean(startImg) && it.videoStatus !== 'generating';
    });
    if (readyItems.length === 0) return;

    setIsBatchVideoGenerating(true);
    try {
      for (const it of readyItems) {
        handleGenerateKlingVideoForRow(it);
        // Small stagger between API requests to avoid spamming
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    } finally {
      setIsBatchVideoGenerating(false);
    }
  };

  // Dedicated Video Scene File Upload Processor (sets start frame directly)
  const processVideoFiles = async (fileList: FileList | File[]) => {
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
            id: `video_scene_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: file.size,
            dataUrl,
            mimeType: file.type || 'image/jpeg',
            status: 'idle',
            progress: 0,
            originalDimensions: dimensions,
            videoStartImageUrl: dataUrl,
            videoStartImageName: file.name,
            videoStatus: 'idle',
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
      }
    } catch (err) {
      console.error('Lỗi khi nạp ảnh cảnh video:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      e.target.value = '';
      processVideoFiles(filesArray);
    }
  };

  // File Upload Processor: Handles multiple files asynchronously & safely
  const processFiles = async (fileList: FileList | File[]) => {
    // Clone files to an independent array immediately so that resetting the input does not mutate the list
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    setIsLoadingFiles(true);

    try {
      // Filter image files by mime or common image extension
      const imageFiles = rawFiles.filter((file) => {
        const isMimeImage = file.type ? file.type.startsWith('image/') : false;
        const isExtImage = /\.(jpe?g|png|webp|bmp|gif|heic|avif)$/i.test(file.name);
        return isMimeImage || isExtImage;
      });

      if (imageFiles.length === 0) {
        setIsLoadingFiles(false);
        return;
      }

      // Read all images in parallel for fast and reliable batch upload
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
            videoStatus: 'idle',
          };
          return item;
        })
      );

      const newItems: BatchImageItem[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled') {
          newItems.push(res.value);
        } else {
          console.error('Lỗi khi đọc file ảnh:', res.reason);
        }
      }

      if (newItems.length > 0) {
        onAddItems(newItems);
      }
    } catch (err) {
      console.error('Lỗi khi xử lý danh sách ảnh:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Take snapshot of files before resetting input value
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

  // Kling AI Video Generator for a specific row
  const handleGenerateKlingVideoForRow = async (item: BatchImageItem) => {
    const effectiveStart = item.videoStartImageUrl || item.resultImageUrl || item.dataUrl;
    if (!effectiveStart) return;

    const klingConfig = apiConfig?.kling;
    const apiKey = klingConfig?.apiKey?.trim() || undefined;
    const accessKey = klingConfig?.accessKey?.trim() || undefined;
    const secretKey = klingConfig?.secretKey?.trim() || undefined;
    const baseUrl = klingConfig?.baseUrl?.trim() || 'https://api.openlux.ai/kling/v1/videos/image2video';
    const model = klingConfig?.model || 'kling-v2-6';
    const mode = klingConfig?.mode || 'pro';
    const duration = klingConfig?.duration || '5';
    const aspectRatio = klingConfig?.aspectRatio || '9:16';
    const multiShot = klingConfig?.multiShot !== undefined ? klingConfig.multiShot : false;
    const cfgScale = klingConfig?.cfgScale !== undefined ? klingConfig.cfgScale : 0.6;
    const negativePrompt =
      klingConfig?.negativePrompt && !klingConfig.negativePrompt.includes('camera movement')
        ? klingConfig.negativePrompt
        : '';
    const watermarkInfo = { enabled: klingConfig?.watermarkEnabled ?? false };

    const hasAnyKey = Boolean(apiKey || (accessKey && secretKey) || systemHasKlingKey);
    if (!hasAnyKey) {
      if (onOpenKlingSettings) {
        onOpenKlingSettings();
      }
      onUpdateItem(item.id, {
        videoStatus: 'error',
        videoError: 'Chưa có Kling AI API Key. Vui lòng mở Cấu hình API để nhập API Key hoặc AccessKey/SecretKey.',
      });
      return;
    }

    onUpdateItem(item.id, {
      videoStatus: 'generating',
      videoProgress: 10,
      videoError: undefined,
      videoUrl: undefined,
      videoTaskId: undefined,
    });

    try {
      const promptText = item.videoPrompt?.trim() || '';
      const effectiveEnd = item.videoEndImageUrl && item.videoEndImageUrl.trim() ? item.videoEndImageUrl.trim() : undefined;

      const videoPayloadToSend = {
        apiKey,
        accessKey,
        secretKey,
        baseUrl,
        model_name: model,
        model,
        mode,
        duration,
        aspect_ratio: aspectRatio,
        multi_shot: multiShot,
        cfg_scale: cfgScale,
        negative_prompt: negativePrompt,
        watermark_info: watermarkInfo,
        prompt: promptText,
        image: effectiveStart,
        imageUrl: effectiveStart,
        image_tail: effectiveEnd,
        endImageUrl: effectiveEnd,
      };

      console.log('[Kling Video Client Dispatch]', {
        rowId: item.id,
        model,
        mode,
        duration,
        aspectRatio,
        startImagePreview: `${effectiveStart.slice(0, 40)}... (${effectiveStart.length} chars)`,
        hasEndImage: Boolean(effectiveEnd),
        endImagePreview: effectiveEnd ? `${effectiveEnd.slice(0, 40)}... (${effectiveEnd.length} chars)` : 'none',
        hasImageTailField: Boolean(effectiveEnd),
      });

      const res = await fetch('/api/kling/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(videoPayloadToSend),
      });

      const data = await res.json().catch(() => ({}));

      // Update API Log preview so user can inspect the exact payload sent to Kling
      if (onLogApiRequest) {
        if (data.requestPayloadPreview || data.loggedBody) {
          const logBody = data.requestPayloadPreview || data.loggedBody;
          onLogApiRequest({
            ...logBody,
            provider: `Kling AI Video (${logBody.model_name || model})`,
            timestamp: new Date().toLocaleTimeString(),
          });
        } else {
          onLogApiRequest({
            model_name: model,
            mode,
            duration,
            aspect_ratio: aspectRatio,
            multi_shot: multiShot,
            image: effectiveStart.length > 60 ? `${effectiveStart.slice(0, 40)}... (${effectiveStart.length} bytes)` : effectiveStart,
            image_tail: effectiveEnd ? (effectiveEnd.length > 60 ? `${effectiveEnd.slice(0, 40)}... (${effectiveEnd.length} bytes)` : effectiveEnd) : undefined,
            prompt: promptText,
            negative_prompt: negativePrompt,
            cfg_scale: cfgScale,
            watermark_info: watermarkInfo,
            provider: `Kling AI Video (${model})`,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi gửi yêu cầu tạo video Kling AI');
      }

      const taskId = data.taskId;
      onUpdateItem(item.id, {
        videoTaskId: taskId,
        videoProgress: 25,
      });

      // Poll status every 3.5 seconds. Any previous timer for this row is cleared first so a
      // retry never leaves an orphaned interval running alongside the new one.
      clearKlingPollTimer(item.id);
      let pollCount = 0;
      const maxPoll = 100;
      const pollTimer = setInterval(async () => {
        pollCount++;
        try {
          // Credentials travel as headers, not query params, so they don't end up logged in
          // server access logs or browser history on this GET request.
          const statusRes = await fetch(`/api/kling/task-status/${taskId}`, {
            headers: {
              ...(apiKey ? { 'x-kling-api-key': apiKey } : {}),
              ...(accessKey ? { 'x-kling-access-key': accessKey } : {}),
              ...(secretKey ? { 'x-kling-secret-key': secretKey } : {}),
              ...(baseUrl ? { 'x-kling-base-url': baseUrl } : {}),
            },
          });
          const statusData = await statusRes.json();

          if (statusData.status === 'succeed') {
            clearKlingPollTimer(item.id);
            onUpdateItem(item.id, {
              videoUrl: statusData.videoUrl,
              videoStatus: 'completed',
              videoProgress: 100,
            });
          } else if (statusData.status === 'failed') {
            clearKlingPollTimer(item.id);
            onUpdateItem(item.id, {
              videoStatus: 'error',
              videoError: statusData.error || 'Quá trình tạo video thất bại từ Kling AI',
            });
          } else {
            // Still processing: increment smoothly from 25% up to 95%
            const prog = Math.min(95, 25 + Math.floor(pollCount * 2.5));
            onUpdateItem(item.id, {
              videoProgress: prog,
            });
          }

          if (pollCount >= maxPoll) {
            clearKlingPollTimer(item.id);
            onUpdateItem(item.id, {
              videoStatus: 'error',
              videoError: 'Quá thời gian chờ tạo video từ Kling AI. Bạn có thể kiểm tra lại sau.',
            });
          }
        } catch (pollErr: any) {
          console.warn('Lỗi kiểm tra trạng thái video:', pollErr);
        }
      }, 3500);
      klingPollTimersRef.current.set(item.id, pollTimer);
    } catch (err: any) {
      console.error('Lỗi khi bắt đầu tạo video Kling AI:', err);
      onUpdateItem(item.id, {
        videoStatus: 'error',
        videoError: err.message || 'Không thể tạo video Kling AI',
      });
    }
  };

  // Instant client-side fallback motion video
  const handleGenerateInstantVideoForRow = async (item: BatchImageItem) => {
    if (!item.resultImageUrl) return;

    onUpdateItem(item.id, {
      videoStatus: 'generating',
      videoProgress: 5,
      videoError: undefined,
    });

    try {
      const videoUrl = await generateMotionVideoFromImage(
        item.resultImageUrl,
        3500,
        (progress) => {
          onUpdateItem(item.id, { videoProgress: progress });
        }
      );

      onUpdateItem(item.id, {
        videoUrl,
        videoStatus: 'completed',
        videoProgress: 100,
      });
    } catch (err: any) {
      console.error('Lỗi khi tạo video tức thì cho hàng:', err);
      onUpdateItem(item.id, {
        videoStatus: 'error',
        videoError: err.message || 'Không thể tạo video chuyển động tức thì từ ảnh này',
      });
    }

  };

  // Alias for backward compatibility
  const handleGenerateVideoForRow = handleGenerateKlingVideoForRow;

  // Download individual image
  const handleDownloadImage = (url: string, filename: string) => {
    const ext = url.includes('.webp') ? '.webp' : url.includes('.jpeg') || url.includes('.jpg') ? '.jpg' : '.png';
    const baseName = filename.replace(/\.[^/.]+$/, '');
    downloadImage(url, `swapped_${baseName}${ext}`);
  };

  // Download individual video
  const handleDownloadVideo = (url: string, filename: string) => {
    const isMp4 = url.includes('.mp4') || (!url.startsWith('blob:') && !url.includes('.webm'));
    const ext = isMp4 ? '.mp4' : '.webm';
    const baseName = filename.replace(/\.[^/.]+$/, '');
    downloadVideo(url, `video_${baseName}${ext}`);
  };

  return (
    <div id="batch-pipeline-section" className="space-y-4">
      {/* Hidden Multi-file input for standard images */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        id="pipeline-multi-file-input"
      />

      {/* Hidden Multi-file input for direct video scenes */}
      <input
        ref={videoFileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleVideoFileChange}
        className="hidden"
        id="pipeline-video-file-input"
      />

      {/* When no items: Friendly full dropzone */}
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
              1
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                Tải lên các hình ảnh cần xử lý hoặc tạo video
              </h2>
              <p className="text-xs text-stone-500">
                Mỗi ảnh sẽ là một hàng xử lý riêng biệt để đổi nhân vật/trang phục hoặc tạo video Kling AI trực tiếp từ ảnh ngoài
              </p>
            </div>
          </div>

          <div
            id="pipeline-dropzone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/60 scale-[0.99]'
                : 'border-stone-300 hover:border-indigo-400 bg-stone-50/50 hover:bg-stone-50'
            }`}
          >
            {isLoadingFiles ? (
              <div className="flex flex-col items-center justify-center py-3">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                <p className="text-xs font-semibold text-stone-700">Đang nạp và phân bổ các hàng hình ảnh...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-2">
                <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-stone-200 flex items-center justify-center mb-2 text-indigo-600">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-stone-800 mb-0.5">
                  Kéo thả nhiều hình ảnh vào đây hoặc <span className="text-indigo-600 underline">chọn từ máy tính</span>
                </p>
                <p className="text-xs text-stone-400 max-w-md mb-3">
                  Hỗ trợ PNG, JPG, WEBP. Chọn nhiều ảnh cùng một lúc.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      videoFileInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 transition-colors shadow-2xs"
                  >
                    <Film className="w-3.5 h-3.5 text-violet-600" />
                    <span>+ Tải ảnh tạo Video trực tiếp</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* When items exist: Clean, compact toolbar & slim dropzone */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-stone-800">
                Danh sách hàng xử lý ({items.length} hàng)
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Batch Kling Video Generator Button */}
              {items.length > 0 && (
                <button
                  type="button"
                  disabled={isBatchVideoGenerating}
                  onClick={handleBatchGenerateAllVideos}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                  title="Tự động tạo video Kling AI cho tất cả các hàng đã có ảnh đầu (ảnh ngoài / ảnh AI / ảnh gốc)"
                >
                  {isBatchVideoGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang tạo video hàng loạt...</span>
                    </>
                  ) : (
                    <>
                      <Film className="w-3.5 h-3.5" />
                      <span>Tạo Video tất cả ({items.filter((it) => Boolean(it.videoStartImageUrl || it.resultImageUrl || it.dataUrl)).length})</span>
                    </>
                  )}
                </button>
              )}

              {/* Add Direct Video Scenes Button */}
              <button
                type="button"
                onClick={() => videoFileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 transition-colors cursor-pointer"
                title="Tải ảnh ngoài từ máy tính vào làm phân cảnh tạo video trực tiếp"
              >
                <Plus className="w-3.5 h-3.5 text-violet-600" />
                <span>+ Thêm cảnh Video</span>
              </button>

              {/* Standard Add Images Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm ảnh đổi đồ</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  klingPollTimersRef.current.forEach((timer) => clearInterval(timer));
                  klingPollTimersRef.current.clear();
                  onClearAll();
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1.5 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                Xóa tất cả
              </button>
            </div>
          </div>

          {/* Slim Dropzone */}
          <div
            id="pipeline-dropzone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl py-2 px-3 text-center cursor-pointer transition-all flex items-center justify-center gap-2 text-xs ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/60 text-indigo-700 font-semibold'
                : 'border-stone-300 hover:border-indigo-400 bg-white hover:bg-stone-50 text-stone-600'
            }`}
          >
            <UploadCloud className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Kéo thả thêm ảnh vào đây hoặc click để tải thêm</span>
          </div>
        </div>
      )}

      {/* Top Strip: All Completed Generated Images */}
      {items.length > 0 && (
        <CompletedImagesStrip
          items={items}
          onOpenLightbox={(url, title) => {
            setLightboxImageUrl(url);
            setLightboxTitle(title);
          }}
          onSelectAsStartFrame={(itemId, imageUrl, imageName) => {
            onUpdateItem(itemId, {
              videoStartImageUrl: imageUrl,
              videoStartImageName: imageName,
            });
          }}
          onSelectAsEndFrame={(itemId, imageUrl, imageName) => {
            onUpdateItem(itemId, {
              videoEndImageUrl: imageUrl,
              videoEndImageName: imageName,
            });
          }}
          onDownloadAllZip={onDownloadAllZip}
        />
      )}

      {/* Main Row-Based Pipeline List */}
      {items.length > 0 && (
        <div className="space-y-4">
          {items.map((item, index) => (
            <BatchPipelineRowItem
              key={item.id}
              item={item}
              index={index}
              settings={settings}
              apiConfig={apiConfig}
              uploadedOutfit={uploadedOutfit}
              uploadedOutfits={uploadedOutfits}
              isProcessingAll={isProcessingAll}
              onUpdateItem={onUpdateItem}
              onRemoveItem={handleRemoveItem}
              onProcessSingleItem={onProcessSingleItem}
              onOpenKlingSettings={onOpenKlingSettings}
              onOpenLightbox={(url, title) => {
                setLightboxImageUrl(url);
                setLightboxTitle(title);
              }}
              onGenerateKlingVideo={handleGenerateKlingVideoForRow}
              onGenerateInstantVideo={handleGenerateInstantVideoForRow}
              allItems={items}
            />
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImageUrl && (
        <div
          id="image-lightbox-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] bg-stone-900 rounded-2xl overflow-hidden flex flex-col p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 text-white">
              <p className="text-sm font-bold truncate">{lightboxTitle}</p>
              <button
                type="button"
                onClick={() => setLightboxImageUrl(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
              <img
                src={lightboxImageUrl}
                alt="Enlarged preview"
                referrerPolicy="no-referrer"
                className="max-h-[80vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
