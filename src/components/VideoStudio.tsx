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
}

export const VideoStudio: React.FC<VideoStudioProps> = ({
  apiConfig,
  items,
  onBatchEnqueueVideos,
  onDeleteItem,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing'>('all');

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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>🎬 Video Phân Cảnh Đã Tạo</span>
                  <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {items.length} video
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Xem trực tiếp trên trình duyệt hoặc bấm Tải xuống MP4 về máy (không lưu trữ trên hệ thống)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Lọc:</span>
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
                <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                  {item.status === 'completed' && item.resultVideoUrl ? (
                    <div className="relative w-full h-full group/video">
                      <video
                        src={item.resultVideoUrl}
                        className="w-full h-full object-cover"
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
                    <div className="flex flex-col items-center gap-2 p-6 text-center text-rose-400">
                      <AlertCircle className="w-8 h-8" />
                      <span className="text-xs font-bold">Khởi tạo thất bại</span>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{item.error}</p>
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
