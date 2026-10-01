import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import {
  Film,
  Scissors,
  Upload,
  CheckSquare,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  PlusCircle,
  CheckCircle2,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Layers,
  Smartphone,
  Monitor,
  Plus,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import {
  extractVideoFrames,
  getVideoMetadata,
  ExtractedVideoFrame,
  VideoMetadata,
  formatTime,
} from '../utils/videoExtractor';
import { analyzeVideoPrompts } from '../utils/videoPromptAnalyzer';
import { BatchImageItem } from '../types';

interface VideoSceneExtractorProps {
  onImportToBatch: (newItems: BatchImageItem[]) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void;
}

export const VideoSceneExtractor: React.FC<VideoSceneExtractorProps> = ({
  onImportToBatch,
  showToast,
}) => {
  const fileInputId = useId();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Video State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Extraction Settings
  const [mode, setMode] = useState<'interval' | 'scene'>('interval');
  const [intervalSeconds, setIntervalSeconds] = useState<number>(2);
  const [customInterval, setCustomInterval] = useState<string>('2');
  const [sceneSensitivity, setSceneSensitivity] = useState<'low' | 'medium' | 'high'>('high');
  const [targetRatio, setTargetRatio] = useState<'9:16' | '16:9' | 'original'>('9:16');

  // Extraction Progress State
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressInfo, setProgressInfo] = useState<{ count: number; currentTime: number }>({
    count: 0,
    currentTime: 0,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Extracted Frames Tray (Khay ảnh tạm chờ duyệt)
  const [extractedFrames, setExtractedFrames] = useState<ExtractedVideoFrame[]>([]);
  const [zoomFrameIndex, setZoomFrameIndex] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [addedFrameIds, setAddedFrameIds] = useState<Set<string>>(new Set());

  // Video Prompt Analysis State (Phân tích chuyển động video thành prompt tiếng Việt)
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [videoPrompts, setVideoPrompts] = useState<string[]>([]);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  const [copiedAllPrompts, setCopiedAllPrompts] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Clean up object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Handler: Phân tích video thành danh sách prompt tiếng Việt qua Gemini 3.7 Flash
  const handleAnalyzePrompts = async () => {
    if (!videoFile) {
      showToast('Vui lòng tải video lên trước khi phân tích.', 'warning');
      return;
    }

    setIsAnalyzingVideo(true);
    try {
      showToast('Đang quét chuyển động video qua Gemini 3.7 Flash...', 'info');
      const res = await analyzeVideoPrompts({
        videoFile,
        extractedFrames: extractedFrames.length > 0 ? extractedFrames : undefined,
      });

      if (res.success && res.prompts.length > 0) {
        setVideoPrompts(res.prompts);
        showToast(`Đã phân tích thành công ${res.prompts.length} câu prompt chuyển động tiếng Việt!`, 'success');
      } else {
        showToast('Không nhận được prompt nào từ AI. Vui lòng thử lại.', 'warning');
      }
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi phân tích prompt video qua AI.', 'warning');
    } finally {
      setIsAnalyzingVideo(false);
    }
  };

  const handleCopyPrompt = (promptText: string, index: number) => {
    navigator.clipboard.writeText(promptText);
    setCopiedPromptIndex(index);
    showToast('Đã sao chép prompt vào bộ nhớ tạm!', 'success');
    setTimeout(() => {
      setCopiedPromptIndex(null);
    }, 2000);
  };

  const handleCopyAllPrompts = () => {
    if (videoPrompts.length === 0) return;
    const allText = videoPrompts.join('\n\n');
    navigator.clipboard.writeText(allText);
    setCopiedAllPrompts(true);
    showToast(`Đã sao chép toàn bộ ${videoPrompts.length} câu prompt!`, 'success');
    setTimeout(() => {
      setCopiedAllPrompts(false);
    }, 2000);
  };

  const handleClearPrompts = () => {
    setVideoPrompts([]);
  };

  // Handle Video File Selection
  const handleSelectFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      showToast('Vui lòng chọn file video hợp lệ (MP4, WebM, MOV)', 'warning');
      return;
    }

    try {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }

      const newUrl = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(newUrl);

      const meta = await getVideoMetadata(file);
      setMetadata(meta);

      // Auto default to 9:16 or original
      showToast(`Đã nạp video: ${file.name} (${formatTime(meta.duration)})`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Không thể đọc file video', 'warning');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  // Start Extraction
  const handleStartExtraction = async () => {
    if (!videoFile || !metadata) {
      showToast('Vui lòng tải video lên trước khi cắt ảnh.', 'warning');
      return;
    }

    setIsExtracting(true);
    setProgress(0);
    setProgressInfo({ count: 0, currentTime: 0 });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const activeInterval =
        mode === 'interval'
          ? Math.max(0.2, parseFloat(customInterval) || intervalSeconds || 2)
          : 2;

      const frames = await extractVideoFrames(videoFile, {
        mode,
        intervalSeconds: activeInterval,
        sceneSensitivity,
        targetAspectRatio: targetRatio,
        maxFrames: 120,
        quality: 0.92,
        signal: controller.signal,
        onProgress: (percent, count, currentTime) => {
          setProgress(percent);
          setProgressInfo({ count, currentTime });
        },
      });

      setExtractedFrames(frames);
      setAddedFrameIds(new Set());
      showToast(
        `Đã cắt thành công ${frames.length} ảnh tỉ lệ ${targetRatio}! Bạn có thể zoom duyệt hoặc nhấn "Thêm vào" từng ảnh.`,
        'success'
      );
    } catch (err: any) {
      if (err.name === 'AbortError') {
        showToast('Đã dừng quá trình cắt ảnh.', 'info');
      } else {
        showToast(err.message || 'Lỗi khi trích xuất khung hình từ video', 'warning');
      }
    } finally {
      setIsExtracting(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel Extraction
  const handleCancelExtraction = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Selection Handlers for Extracted Frames
  const handleToggleSelectFrame = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExtractedFrames((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  const handleSelectAll = () => {
    setExtractedFrames((prev) => prev.map((f) => ({ ...f, selected: true })));
  };

  const handleDeselectAll = () => {
    setExtractedFrames((prev) => prev.map((f) => ({ ...f, selected: false })));
  };

  const handleDeleteFrame = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExtractedFrames((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDeleteSelected = () => {
    const remaining = extractedFrames.filter((f) => !f.selected);
    setExtractedFrames(remaining);
    showToast(`Đã xóa các ảnh được chọn khỏi khay duyệt.`, 'info');
  };

  const handleClearAllFrames = () => {
    setExtractedFrames([]);
    setAddedFrameIds(new Set());
  };

  // Import a SINGLE Frame directly into Batch
  const handleImportSingleFrame = (frame: ExtractedVideoFrame, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const cleanVideoBaseName = (videoFile?.name || 'video_scene')
      .replace(/\.[^/.]+$/, '')
      .replace(/[\s\W]+/g, '_');

    const timeStr = frame.timestampFormatted.replace(':', 'm').replace('.', 's');
    const singleBatchItem: BatchImageItem = {
      id: `video_frame_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: `${cleanVideoBaseName}_${timeStr}.jpg`,
      size: Math.round(frame.dataUrl.length * 0.75),
      dataUrl: frame.dataUrl,
      mimeType: 'image/jpeg',
      status: 'idle',
      progress: 0,
      originalDimensions: { width: frame.width, height: frame.height },
    };

    onImportToBatch([singleBatchItem]);
    setAddedFrameIds((prev) => new Set(prev).add(frame.id));
    showToast(`Đã thêm ảnh phân cảnh lúc ${frame.timestampFormatted} vào danh sách xử lý!`, 'success');
  };

  // Import ALL Selected Frames to BatchPipeline
  const handleImportSelectedToBatch = () => {
    const selected = extractedFrames.filter((f) => f.selected);
    if (selected.length === 0) {
      showToast('Vui lòng tích chọn ít nhất 1 ảnh để đưa vào danh sách xử lý.', 'warning');
      return;
    }

    const cleanVideoBaseName = (videoFile?.name || 'video_scene')
      .replace(/\.[^/.]+$/, '')
      .replace(/[\s\W]+/g, '_');

    const newBatchItems: BatchImageItem[] = selected.map((frame, index) => {
      const timeStr = frame.timestampFormatted.replace(':', 'm').replace('.', 's');
      return {
        id: `video_frame_${Date.now()}_${index}`,
        name: `${cleanVideoBaseName}_${timeStr}.jpg`,
        size: Math.round(frame.dataUrl.length * 0.75),
        dataUrl: frame.dataUrl,
        mimeType: 'image/jpeg',
        status: 'idle',
        progress: 0,
        originalDimensions: { width: frame.width, height: frame.height },
      };
    });

    onImportToBatch(newBatchItems);
    setAddedFrameIds((prev) => {
      const next = new Set(prev);
      selected.forEach((f) => next.add(f.id));
      return next;
    });

    showToast(
      `Đã thêm thành công ${newBatchItems.length} ảnh phân cảnh vào bảng xử lý bên dưới!`,
      'success'
    );
  };

  // Keyboard navigation for Zoom modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (zoomFrameIndex === null) return;

      if (e.key === 'ArrowLeft') {
        setZoomFrameIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
        setZoomScale(1);
      } else if (e.key === 'ArrowRight') {
        setZoomFrameIndex((prev) =>
          prev !== null && prev < extractedFrames.length - 1 ? prev + 1 : prev
        );
        setZoomScale(1);
      } else if (e.key === 'Escape') {
        setZoomFrameIndex(null);
        setZoomScale(1);
      }
    },
    [zoomFrameIndex, extractedFrames.length]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const selectedCount = extractedFrames.filter((f) => f.selected).length;
  const totalCount = extractedFrames.length;

  // Estimated frames for Interval mode
  const activeIntervalSec = parseFloat(customInterval) || intervalSeconds || 2;
  const estimatedFrames = metadata
    ? Math.min(120, Math.ceil(metadata.duration / activeIntervalSec))
    : 0;

  const currentZoomFrame =
    zoomFrameIndex !== null && extractedFrames[zoomFrameIndex]
      ? extractedFrames[zoomFrameIndex]
      : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/80 overflow-hidden transition-all duration-300">
      {/* Top Header Card */}
      <div className="px-5 py-4 bg-gradient-to-r from-stone-900 via-indigo-950 to-stone-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-inner">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Tải Video Mẫu & Cắt Phân Cảnh
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/30 text-indigo-200 rounded-full border border-indigo-400/30">
                Tỉ lệ 9:16 Dọc
              </span>
              {totalCount > 0 && (
                <span className="px-2.5 py-0.5 text-[11px] font-medium bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">
                  {totalCount} ảnh đã cắt ({selectedCount} đã chọn)
                </span>
              )}
            </div>
            <p className="text-xs text-stone-300/80 mt-0.5">
              Cắt khung hình video chuẩn tỉ lệ 9:16 (TikTok/Reels), zoom duyệt ảnh dễ dàng bằng phím điều hướng và thêm nhanh vào xử lý
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-stone-300 hover:text-white transition-colors cursor-pointer"
          title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-5 space-y-6">
          {/* Top Row: Video Upload & Configuration */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Video Dropzone & Player (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <label className="text-xs font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                <VideoIcon className="w-4 h-4 text-indigo-600" />
                <span>Video mẫu đầu vào (MP4, WebM, MOV)</span>
              </label>

              {!videoUrl ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[190px] ${isDragging
                      ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                      : 'border-stone-300 hover:border-indigo-400 bg-stone-50/50 hover:bg-indigo-50/20'
                    }`}
                  onClick={() => document.getElementById(fileInputId)?.click()}
                >
                  <input
                    id={fileInputId}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleSelectFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 shadow-sm group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-stone-800">
                    Kéo thả video mẫu vào đây, hoặc <span className="text-indigo-600 underline">bấm để chọn</span>
                  </p>
                  <p className="text-xs text-stone-500 mt-1">
                    Hỗ trợ file MP4, WebM, QuickTime (.mov) • Tự động chuyển đổi sang chuẩn khung hình 9:16
                  </p>
                </div>
              ) : (
                <div className="bg-stone-900 rounded-xl overflow-hidden border border-stone-800 shadow-md">
                  <div className="relative aspect-video max-h-[260px] w-full flex items-center justify-center bg-black">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="max-h-[260px] w-full object-contain"
                      controls
                      playsInline
                    />
                  </div>
                  {metadata && (
                    <div className="px-4 py-2.5 bg-stone-950/80 text-stone-300 flex items-center justify-between text-xs border-t border-stone-800">
                      <div className="truncate max-w-[280px] font-medium text-white flex items-center gap-2">
                        <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">{metadata.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-stone-400">
                        <span>{metadata.width}x{metadata.height}</span>
                        <span>•</span>
                        <span>{formatTime(metadata.duration)}</span>
                        <span>•</span>
                        <span>{(metadata.size / (1024 * 1024)).toFixed(1)} MB</span>
                        <button
                          type="button"
                          onClick={() => {
                            setVideoFile(null);
                            setVideoUrl(null);
                            setMetadata(null);
                          }}
                          className="ml-2 px-2 py-0.5 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                        >
                          Đổi video
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Settings & Trigger (5 cols) */}
            <div className="lg:col-span-5 bg-stone-50/80 border border-stone-200/90 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  Cấu hình cắt phân cảnh
                </span>
                {metadata && (
                  <span className="text-xs text-indigo-700 font-medium bg-indigo-100/70 px-2 py-0.5 rounded-md">
                    Dự kiến: ~{estimatedFrames} ảnh
                  </span>
                )}
              </div>

              {/* Tỉ lệ khung hình (Aspect Ratio Selection) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                  <span>Tỉ lệ khung hình ảnh cắt:</span>
                  <span className="text-indigo-600 font-bold">
                    {targetRatio === '9:16'
                      ? '9:16 (Dọc TikTok/Reels)'
                      : targetRatio === '16:9'
                        ? '16:9 (Ngang điện ảnh)'
                        : 'Gốc (Theo video)'}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTargetRatio('9:16')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${targetRatio === '9:16'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>9:16 (Dọc)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetRatio('16:9')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${targetRatio === '16:9'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>16:9 (Ngang)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetRatio('original')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${targetRatio === 'original'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Gốc</span>
                  </button>
                </div>
              </div>

              {/* Mode Selection Tabs */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode('interval')}
                  className={`py-2 px-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${mode === 'interval'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                    }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Cách đều theo giây</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('scene')}
                  className={`py-2 px-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${mode === 'scene'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                    }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Nhận diện chuyển cảnh</span>
                </button>
              </div>

              {/* Interval Mode Controls */}
              {mode === 'interval' && (
                <div className="space-y-2.5 bg-white p-3 rounded-lg border border-stone-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-700">Khoảng cách giữa các ảnh:</span>
                    <span className="font-bold text-indigo-600">{activeIntervalSec}s / 1 ảnh</span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.5, 1, 2, 3, 5].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          setIntervalSeconds(sec);
                          setCustomInterval(sec.toString());
                        }}
                        className={`py-1.5 text-xs font-medium rounded border transition-all cursor-pointer ${parseFloat(customInterval) === sec
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>

                  {/* Custom Interval Input */}
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span className="text-stone-500">Hoặc tự nhập:</span>
                    <input
                      type="number"
                      min="0.2"
                      max="60"
                      step="0.5"
                      value={customInterval}
                      onChange={(e) => {
                        setCustomInterval(e.target.value);
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) setIntervalSeconds(val);
                      }}
                      className="w-16 px-2 py-1 border border-stone-300 rounded text-center font-bold text-stone-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-stone-500">giây / 1 phân cảnh</span>
                  </div>
                </div>
              )}

              {/* Action Buttons: Analyze Video Prompts & Start Extracting */}
              <div className="space-y-2 pt-1">
                {/* Button: Phân tích Video tạo danh sách Prompt tiếng Việt */}
                <button
                  type="button"
                  onClick={handleAnalyzePrompts}
                  disabled={!videoFile || isAnalyzingVideo || isExtracting}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${!videoFile || isAnalyzingVideo || isExtracting
                      ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-indigo-200 hover:shadow-md'
                    }`}
                >
                  {isAnalyzingVideo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang phân tích video qua Gemini 3.7 Flash...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Phân tích video (Prompt Tiếng Việt)</span>
                    </>
                  )}
                </button>

                {/* Button: Bắt đầu cắt ảnh */}
                {!isExtracting ? (
                  <button
                    type="button"
                    onClick={handleStartExtraction}
                    disabled={!videoFile || isAnalyzingVideo}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${videoFile && !isAnalyzingVideo
                        ? 'bg-stone-800 hover:bg-stone-900 text-white hover:shadow-stone-300 hover:shadow-md cursor-pointer'
                        : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      }`}
                  >
                    <Scissors className="w-4 h-4" />
                    <span>Bắt đầu cắt ảnh tỉ lệ {targetRatio}</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-indigo-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping inline-block" />
                        Đang cắt phân cảnh: {progress}%
                      </span>
                      <span className="text-stone-500">Đã cắt: {progressInfo.count} ảnh</span>
                    </div>

                    <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2 rounded-full transition-all duration-200"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleCancelExtraction}
                      className="w-full py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                    >
                      Dừng / Hủy cắt
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Video Prompts List Section (Danh sách Prompt Video Tiếng Việt) */}
          {(isAnalyzingVideo || videoPrompts.length > 0) && (
            <div className="bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-white rounded-2xl border border-indigo-200/90 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-sm">
                    <Sparkles className="w-5 h-5 text-amber-200" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-stone-900">
                        Danh sách Prompt Video Tiếng Việt
                      </h3>
                      {videoPrompts.length > 0 && (
                        <span className="px-2.5 py-0.5 text-[11px] font-bold bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200">
                          {videoPrompts.length} câu prompt chuyển động
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                        Gemini 3.7 Flash
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Mô tả chi tiết hành động nhân vật và góc máy camera cho từng phân cảnh trong video
                    </p>
                  </div>
                </div>

                {videoPrompts.length > 0 && !isAnalyzingVideo && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyAllPrompts}
                      className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedAllPrompts ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Đã sao chép tất cả!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Sao chép tất cả ({videoPrompts.length})</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleClearPrompts}
                      className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-200/60 rounded-lg transition-colors cursor-pointer"
                      title="Đóng danh sách"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {isAnalyzingVideo ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm font-semibold text-indigo-950">
                    Đang phân tích các phân cảnh và chuyển động qua Gemini 3.7 Flash...
                  </p>
                  <p className="text-xs text-stone-500">
                    AI đang trích xuất keyframes và mô tả chi tiết chuyển động nhân vật cùng góc máy
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {videoPrompts.map((promptText, idx) => (
                    <div
                      key={idx}
                      className="group bg-white/95 hover:bg-white rounded-xl p-3.5 border border-indigo-100 hover:border-indigo-300 shadow-xs hover:shadow transition-all flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                        <p className="text-xs sm:text-sm text-stone-800 leading-relaxed select-text font-normal">
                          {promptText}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(promptText, idx)}
                        className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${copiedPromptIndex === idx
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                            : 'bg-stone-50 hover:bg-indigo-50 text-stone-700 hover:text-indigo-600 border border-stone-200 hover:border-indigo-200'
                          }`}
                      >
                        {copiedPromptIndex === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Đã sao chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Staging Gallery: Preview all extracted frames before adding to batch */}
          {extractedFrames.length > 0 && (
            <div className="pt-4 border-t border-stone-200 space-y-4">
              {/* Gallery Header & Controls Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
                      <span>Khay duyệt ảnh phân cảnh</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
                        Chuẩn tỉ lệ {targetRatio}
                      </span>
                    </h3>
                    <p className="text-xs text-stone-500">
                      Tổng số: <strong className="text-stone-700">{totalCount}</strong> ảnh • Đã chọn:{' '}
                      <strong className="text-indigo-600">{selectedCount}</strong> ảnh • Đã thêm vào batch:{' '}
                      <strong className="text-emerald-600">{addedFrameIds.size}</strong> ảnh
                    </p>
                  </div>
                </div>

                {/* Batch selection tools */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-stone-100 text-stone-700 rounded-lg border border-stone-200 shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Chọn tất cả ({totalCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-stone-100 text-stone-700 rounded-lg border border-stone-200 shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 text-stone-400" />
                    <span>Bỏ chọn</span>
                  </button>

                  {selectedCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa {selectedCount} ảnh</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleClearAllFrames}
                    className="px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 rounded-lg transition-colors cursor-pointer"
                  >
                    Dọn khay
                  </button>
                </div>
              </div>

              {/* Grid of Extracted Frames - Responsive Vertical 9:16 layout */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 max-h-[580px] overflow-y-auto p-1.5 pr-2">
                {extractedFrames.map((frame, index) => {
                  const isSelected = frame.selected;
                  const isAdded = addedFrameIds.has(frame.id);

                  return (
                    <div
                      key={frame.id}
                      className={`group relative rounded-xl overflow-hidden border-2 transition-all flex flex-col bg-stone-900 shadow-sm ${isSelected
                          ? 'border-indigo-600 ring-2 ring-indigo-500/30'
                          : 'border-stone-200 hover:border-stone-400'
                        }`}
                    >
                      {/* Top Checkbox & Timestamp Overlay */}
                      <div className="absolute top-1.5 left-1.5 z-10">
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectFrame(frame.id, e)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center shadow transition-all cursor-pointer ${isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-black/60 text-white/80 backdrop-blur-sm border border-white/20 hover:bg-black/80'
                            }`}
                          title={isSelected ? 'Bỏ chọn' : 'Tích chọn'}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/75 text-white backdrop-blur-sm shadow">
                        {frame.timestampFormatted}
                      </div>

                      {/* Image Thumbnail Container - Proper 9:16 vertical ratio */}
                      <div
                        onClick={() => {
                          setZoomFrameIndex(index);
                          setZoomScale(1);
                        }}
                        className={`w-full overflow-hidden bg-black flex items-center justify-center cursor-zoom-in relative ${targetRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'
                          }`}
                      >
                        <img
                          src={frame.dataUrl}
                          alt={`Scene ${frame.timestampFormatted}`}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />

                        {/* Hover Zoom Overlay hint */}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="p-2 rounded-full bg-black/60 text-white backdrop-blur-sm shadow">
                            <ZoomIn className="w-4 h-4" />
                          </span>
                        </div>

                        {/* Delete Single Button on Hover */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteFrame(frame.id, e)}
                          className="absolute bottom-1.5 right-1.5 p-1 rounded bg-black/70 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-all shadow cursor-pointer"
                          title="Xóa ảnh này khỏi khay"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Bottom Button on Every Image: "Thêm vào" */}
                      <div className="p-1.5 bg-white border-t border-stone-200">
                        <button
                          type="button"
                          onClick={(e) => handleImportSingleFrame(frame, e)}
                          className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm ${isAdded
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-200'
                            }`}
                          title="Thêm ảnh này vào danh sách xử lý"
                        >
                          {isAdded ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Đã thêm</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Thêm vào</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Primary Action Button: Import all checked frames into Batch Pipeline */}
              <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-stone-900">
                      Sẵn sàng đưa vào quy trình xử lý AI
                    </h4>
                    <p className="text-xs text-stone-600">
                      Chỉ những ảnh được bạn <strong>tích chọn ({selectedCount} ảnh)</strong> mới được
                      nạp hàng loạt vào bảng thay nhân vật & trang phục bên dưới.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleImportSelectedToBatch}
                  disabled={selectedCount === 0}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md ${selectedCount > 0
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-300/60 hover:scale-[1.02] cursor-pointer'
                      : 'bg-stone-300 text-stone-500 cursor-not-allowed'
                    }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Thêm {selectedCount} ảnh đã chọn vào hàng đợi xử lý</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox / Zoom Modal with Left/Right Navigation & Quick Add */}
      {currentZoomFrame && zoomFrameIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
          onClick={() => {
            setZoomFrameIndex(null);
            setZoomScale(1);
          }}
        >
          <div
            className="relative max-w-4xl w-full bg-stone-950 rounded-2xl overflow-hidden border border-stone-800 shadow-2xl flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 bg-stone-900 flex items-center justify-between text-white text-xs border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-400">
                  <Film className="w-4 h-4" />
                  <span>Phân cảnh: {currentZoomFrame.timestampFormatted}</span>
                </div>
                <span className="text-stone-500">•</span>
                <span className="text-stone-300 font-mono">
                  Ảnh {zoomFrameIndex + 1} / {extractedFrames.length}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-stone-800 text-stone-400 text-[10px]">
                  (Dùng phím ← → để chuyển ảnh)
                </span>
              </div>

              {/* Action Buttons in Modal Header */}
              <div className="flex items-center gap-2">
                {/* Add to Batch Button */}
                <button
                  type="button"
                  onClick={() => handleImportSingleFrame(currentZoomFrame)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow ${addedFrameIds.has(currentZoomFrame.id)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                >
                  {addedFrameIds.has(currentZoomFrame.id) ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Đã thêm vào batch</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm ảnh này vào xử lý</span>
                    </>
                  )}
                </button>

                {/* Toggle Select Checkbox in Modal */}
                <button
                  type="button"
                  onClick={() => handleToggleSelectFrame(currentZoomFrame.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${currentZoomFrame.selected
                      ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-500/40'
                      : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                    }`}
                >
                  {currentZoomFrame.selected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>{currentZoomFrame.selected ? 'Đã tick chọn' : 'Chưa tick'}</span>
                </button>

                {/* Zoom Scale Toggle */}
                <button
                  type="button"
                  onClick={() => setZoomScale((prev) => (prev === 1 ? 1.6 : 1))}
                  className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                  title={zoomScale === 1 ? 'Phóng to chi tiết (1.6x)' : 'Thu về bình thường'}
                >
                  {zoomScale === 1 ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    setZoomFrameIndex(null);
                    setZoomScale(1);
                  }}
                  className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors cursor-pointer"
                  title="Đóng (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Viewport with Left & Right Arrows */}
            <div className="relative bg-black flex items-center justify-center min-h-[420px] max-h-[78vh] overflow-hidden select-none">
              {/* Prev Button */}
              <button
                type="button"
                disabled={zoomFrameIndex <= 0}
                onClick={(e) => {
                  e.stopPropagation();
                  if (zoomFrameIndex > 0) {
                    setZoomFrameIndex(zoomFrameIndex - 1);
                    setZoomScale(1);
                  }
                }}
                className={`absolute left-3 z-20 p-3 rounded-full transition-all shadow-xl ${zoomFrameIndex > 0
                    ? 'bg-black/70 hover:bg-indigo-600 text-white cursor-pointer hover:scale-110'
                    : 'bg-black/30 text-stone-600 cursor-not-allowed opacity-30'
                  }`}
                title="Ảnh trước (Phím mũi tên Trái ←)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* Next Button */}
              <button
                type="button"
                disabled={zoomFrameIndex >= extractedFrames.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (zoomFrameIndex < extractedFrames.length - 1) {
                    setZoomFrameIndex(zoomFrameIndex + 1);
                    setZoomScale(1);
                  }
                }}
                className={`absolute right-3 z-20 p-3 rounded-full transition-all shadow-xl ${zoomFrameIndex < extractedFrames.length - 1
                    ? 'bg-black/70 hover:bg-indigo-600 text-white cursor-pointer hover:scale-110'
                    : 'bg-black/30 text-stone-600 cursor-not-allowed opacity-30'
                  }`}
                title="Ảnh tiếp theo (Phím mũi tên Phải →)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Image with zoom scale */}
              <div
                className="w-full h-full flex items-center justify-center p-4 overflow-auto cursor-zoom-in"
                onClick={() => setZoomScale((prev) => (prev === 1 ? 1.6 : 1))}
              >
                <img
                  src={currentZoomFrame.dataUrl}
                  alt={`Phóng to phân cảnh ${currentZoomFrame.timestampFormatted}`}
                  style={{
                    transform: `scale(${zoomScale})`,
                    transition: 'transform 0.2s ease-out',
                  }}
                  className="max-h-[72vh] max-w-full object-contain rounded-lg shadow-2xl"
                />
              </div>

              {/* Bottom bar indicator inside viewport */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md text-stone-300 text-[11px] font-mono flex items-center gap-2 border border-white/10">
                <span>{currentZoomFrame.width}x{currentZoomFrame.height}px</span>
                <span>•</span>
                <span>Tỉ lệ {targetRatio}</span>
                <span>•</span>
                <span>{zoomScale > 1 ? `${zoomScale}x` : '1x'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper icon component
const VideoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
    <rect width="14" height="12" x="2" y="6" rx="2" />
  </svg>
);
