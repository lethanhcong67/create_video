import React, { useState } from 'react';
import {
  Film,
  Video,
  Download,
  Copy,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Layers,
  Play,
} from 'lucide-react';
import {
  VideoGenerationItem,
  CameraMovementType,
  ApiConfig
} from '../types';
import { AutoProductVideoWorkflow } from './AutoProductVideoWorkflow';

interface VideoStudioProps {
  apiConfig: ApiConfig;
  items: VideoGenerationItem[];
  mergedVideo?: {
    id: string;
    url: string;
    clipsCount: number;
    transitions?: Array<{
      fromIndex: number;
      toIndex: number;
      transition: string;
      duration: number;
      reason: string;
    }>;
    createdAt: number;
  } | null;
  isMergingVideo?: boolean;
  mergeError?: string | null;
  onMergeScenes?: (mode?: 'auto' | 'cut' | 'crossfade' | 'fadeblack') => void;
  onBatchEnqueueVideos: (
    items: Array<{
      prompt: string;
      cameraMovement: CameraMovementType;
      duration: '5' | '10';
      mode: 'std' | 'pro';
      aspectRatio: '16:9' | '9:16' | '1:1';
      cfgScale: number;
      model: string;
      startImageUrl?: string;
    }>
  ) => void;
  onDeleteItem: (id: string) => void;
  onRetryItem?: (id: string) => void;
}

export const VideoStudio: React.FC<VideoStudioProps> = ({
  apiConfig,
  items,
  mergedVideo,
  isMergingVideo,
  mergeError,
  onMergeScenes,
  onBatchEnqueueVideos,
  onDeleteItem,
  onRetryItem,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing'>('all');
  const [selectedTransitionMode, setSelectedTransitionMode] = useState<'auto' | 'cut' | 'crossfade' | 'fadeblack'>('auto');

  const handleTriggerMerge = (mode?: 'auto' | 'cut' | 'crossfade' | 'fadeblack') => {
    const targetMode = mode || selectedTransitionMode;
    if (onMergeScenes) {
      onMergeScenes(targetMode);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'completed') return item.status === 'completed';
    if (filter === 'processing') return item.status === 'generating' || item.status === 'queued';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-10">
      {/* Tính năng duy nhất: Tạo Video từ Link Sản Phẩm */}
      <AutoProductVideoWorkflow
        apiConfig={apiConfig}
        onBatchEnqueueVideos={onBatchEnqueueVideos}
      />

      {/* Kết quả Video phân cảnh đã tạo (Xem & Tải xuống trực tiếp) */}
      {items.length > 0 && (
        <section id="generated-videos-section" className="space-y-6 pt-6 border-t border-slate-800">
          {/* HERO CARD: VIDEO QUẢNG CÁO HOÀN CHỈNH ĐÃ GHÉP BẰNG FFMPEG */}
          {(mergedVideo || isMergingVideo) && (
            <div
              id="merged-final-video-section"
              className="bg-gradient-to-br from-indigo-950/90 via-slate-900 to-purple-950/90 border-2 border-indigo-500/50 rounded-3xl p-6 lg:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 space-y-6 ring-1 ring-white/10"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-indigo-500/30 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        FFmpeg Master Video
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {mergedVideo ? `${mergedVideo.clipsCount} phân cảnh đã ghép` : 'Đang xử lý'}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight mt-1 flex items-center gap-2">
                      🎉 Video Quảng Cáo Hoàn Chỉnh (Full Commercial Video)
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {mergedVideo && (
                    <a
                      href={`/api/proxy/download?url=${encodeURIComponent(mergedVideo.url)}&filename=final_commercial_video.mp4`}
                      download="final_commercial_video.mp4"
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all cursor-pointer ring-1 ring-white/20"
                    >
                      <Download className="w-4 h-4" />
                      <span>Tải Video Hoàn Chỉnh (.MP4)</span>
                    </a>
                  )}

                  {onMergeScenes && (
                    <button
                      type="button"
                      disabled={isMergingVideo}
                      onClick={onMergeScenes}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isMergingVideo ? 'animate-spin text-cyan-400' : ''}`} />
                      <span>{isMergingVideo ? 'Đang ghép video...' : 'Ghép lại video'}</span>
                    </button>
                  )}
                </div>
              </div>

              {isMergingVideo ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-slate-950/70 border border-indigo-900/60 rounded-2xl">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 text-cyan-300 flex items-center justify-center border border-indigo-500/40">
                    <RefreshCw className="w-7 h-7 animate-spin" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">Đang dùng FFmpeg ghép nối các phân cảnh...</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md">
                      Hệ thống đang chuẩn hóa độ phân giải 1080x1920 (9:16), đồng bộ tốc độ 30fps và ghép liền mạch toàn bộ phân cảnh thành 1 video duy nhất.
                    </p>
                  </div>
                </div>
              ) : mergedVideo ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  <div className="lg:col-span-6 xl:col-span-5 aspect-[9/16] max-h-[520px] mx-auto w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 relative group">
                    <video
                      src={mergedVideo.url}
                      controls
                      autoPlay
                      loop
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="lg:col-span-6 xl:col-span-7 space-y-4">
                    <div className="bg-slate-950/80 border border-indigo-900/50 rounded-2xl p-5 space-y-3">
                      <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        <span>Thông Tin Video Thành Phẩm</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Số phân cảnh</span>
                          <span className="text-white font-bold text-sm mt-0.5 block">{mergedVideo.clipsCount} Scenes</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-slate-400 text-[10px] block">Định dạng & Chuẩn</span>
                          <span className="text-white font-bold text-sm mt-0.5 block">1080x1920 | 30fps MP4</span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1 border-t border-slate-800/80">
                        <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                          <span>Chế độ chuyển cảnh:</span>
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => { setSelectedTransitionMode('auto'); handleTriggerMerge('auto'); }}
                            className={`p-2 rounded-xl border text-center transition-all font-semibold ${
                              selectedTransitionMode === 'auto'
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            🤖 AI Tự Động
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSelectedTransitionMode('cut'); handleTriggerMerge('cut'); }}
                            className={`p-2 rounded-xl border text-center transition-all font-semibold ${
                              selectedTransitionMode === 'cut'
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            ✂️ Hard Cut
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSelectedTransitionMode('crossfade'); handleTriggerMerge('crossfade'); }}
                            className={`p-2 rounded-xl border text-center transition-all font-semibold ${
                              selectedTransitionMode === 'crossfade'
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            🌟 Crossfade
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSelectedTransitionMode('fadeblack'); handleTriggerMerge('fadeblack'); }}
                            className={`p-2 rounded-xl border text-center transition-all font-semibold ${
                              selectedTransitionMode === 'fadeblack'
                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            🖤 Nháy Tối (Fade Black)
                          </button>
                        </div>
                      </div>

                      {/* AI Transition Decisions Timeline */}
                      {mergedVideo.transitions && mergedVideo.transitions.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-800/80">
                          <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Mạch Chuyển Cảnh Thông Minh (AI Director):</span>
                          </span>
                          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                            {mergedVideo.transitions.map((tr, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] space-y-0.5 flex items-start gap-2"
                              >
                                <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono font-bold text-[10px] shrink-0 border border-indigo-800/40">
                                  Cảnh {tr.fromIndex + 1} ➔ {tr.toIndex + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-amber-300 uppercase text-[10px]">
                                      {tr.transition === 'none'
                                        ? '✂️ Cắt dứt khoát (Hard Cut)'
                                        : tr.transition === 'fade'
                                        ? `🌟 Hòa tan (${tr.duration}s)`
                                        : tr.transition === 'fadeblack'
                                        ? `🖤 Nháy tối (${tr.duration}s)`
                                        : `${tr.transition} (${tr.duration}s)`}
                                    </span>
                                  </div>
                                  <p className="text-slate-400 text-[10px] leading-tight mt-0.5">{tr.reason}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <a
                        href={`/api/proxy/download?url=${encodeURIComponent(mergedVideo.url)}&filename=final_commercial_video.mp4`}
                        download="final_commercial_video.mp4"
                        className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Tải Xuống Video Hoàn Chỉnh Ngay</span>
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}

              {mergeError && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{mergeError}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>🎬 Từng Phân Cảnh Riêng Biệt ({items.length} cảnh)</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Bạn có thể xem từng phân cảnh độc lập hoặc bấm Ghép Video để FFmpeg gộp tất cả làm 1.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {items.filter((i) => i.status === 'completed').length >= 2 && onMergeScenes && (
                <button
                  type="button"
                  disabled={isMergingVideo}
                  onClick={() => handleTriggerMerge()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-950/60 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                  <span>
                    {isMergingVideo
                      ? 'Đang ghép video...'
                      : `Ghép ${items.filter((i) => i.status === 'completed').length} cảnh thành 1 video`}
                  </span>
                </button>
              )}

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['all', 'completed', 'processing'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      filter === f ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {f === 'all' ? 'Tất cả' : f === 'completed' ? 'Đã hoàn thành' : 'Đang xử lý'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between group hover:border-slate-700 transition-all"
              >
                <div className="relative aspect-[9/16] bg-black flex items-center justify-center overflow-hidden">
                  {item.status === 'completed' && item.resultVideoUrl ? (
                    <div className="relative w-full h-full group/video">
                      <video
                        src={item.resultVideoUrl}
                        className="w-full h-full object-contain"
                        controls
                        loop
                      />
                    </div>
                  ) : item.status === 'generating' || item.status === 'queued' ? (
                    <div className="flex flex-col items-center gap-3 p-6 text-center">
                      <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                      <div>
                        <span className="text-xs font-bold text-cyan-300">
                          {item.status === 'queued' ? 'Đang chờ hàng đợi...' : `Đang render video... (${item.progress}%)`}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Kling AI đang xử lý khung hình chi tiết
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2.5 p-6 text-center text-rose-400">
                      <AlertCircle className="w-8 h-8" />
                      <span className="text-xs font-bold">Khởi tạo thất bại</span>
                      <p className="text-[11px] text-slate-400 line-clamp-3 max-w-[240px]">{item.error || 'Lỗi không xác định từ Kling AI'}</p>
                      {onRetryItem && (
                        <button
                          type="button"
                          onClick={() => onRetryItem(item.id)}
                          className="mt-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Thử tạo lại video</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 backdrop-blur-md text-indigo-300 border border-indigo-500/20">
                      {item.duration}s | {item.mode?.toUpperCase() || 'PRO'}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed font-medium">
                      {item.prompt || 'Không có mô tả'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {item.resultVideoUrl && (
                        <a
                          href={`/api/proxy/download?url=${encodeURIComponent(item.resultVideoUrl)}&filename=video_${item.id}.mp4`}
                          download={`video_${item.id}.mp4`}
                          className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1 text-xs font-semibold px-2.5"
                          title="Tải video xuống trực tiếp"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải MP4</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.prompt, item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                        title="Sao chép câu lệnh Prompt"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Xóa video khỏi danh sách tạm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
