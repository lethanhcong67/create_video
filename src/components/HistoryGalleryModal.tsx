import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Database,
  Film,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Download,
  Copy,
  Check,
  RefreshCw,
  Search,
  ExternalLink,
  Layers,
  Clock,
  Play,
  Maximize2,
  Sliders,
  AlertCircle,
  FileText,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchGenerationHistory,
  deleteGenerationRecord,
  GenerationRecord,
  testSupabaseConnection,
} from '../utils/supabaseClient';

interface HistoryGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPrompt?: (prompt: string, type: 'image' | 'video') => void;
  showToast: (message: string, type?: 'info' | 'success' | 'warning') => void;
}

export const HistoryGalleryModal: React.FC<HistoryGalleryModalProps> = ({
  isOpen,
  onClose,
  onApplyPrompt,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'video' | 'image'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'video' | 'image'; title?: string } | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{ ok: boolean; message: string }>({
    ok: false,
    message: 'Đang kiểm tra kết nối...',
  });
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Load history data from Supabase
  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const conn = await testSupabaseConnection();
      setSupabaseStatus(conn);

      const res = await fetchGenerationHistory({
        taskType: activeTab,
        limit: 100,
      });

      setItems(res.items);
      setTotalCount(res.total);
    } catch (err: any) {
      console.error('Lỗi load gallery:', err);
      showToast('Không thể tải lịch sử từ Supabase.', 'warning');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, showToast]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  if (!isOpen) return null;

  // Filter items by search query
  const filteredItems = items.filter((it) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const promptMatch = it.prompt?.toLowerCase().includes(q);
    const modelMatch = it.model_name?.toLowerCase().includes(q);
    const typeMatch = it.task_type?.toLowerCase().includes(q);
    return promptMatch || modelMatch || typeMatch;
  });

  const handleCopyPrompt = (id: string, promptText?: string | null) => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    setCopiedPromptId(id);
    showToast('Đã sao chép prompt vào Clipboard!', 'success');
    setTimeout(() => {
      setCopiedPromptId(null);
    }, 2500);
  };

  const handleApplyToApp = (it: GenerationRecord) => {
    if (!it.prompt) {
      showToast('Mục này không có nội dung prompt.', 'warning');
      return;
    }
    const isVid = it.task_type.includes('video');
    if (onApplyPrompt) {
      onApplyPrompt(it.prompt, isVid ? 'video' : 'image');
      showToast('Đã áp dụng prompt này vào bảng điều khiển!', 'success');
      onClose();
    }
  };

  const handleDelete = async (it: GenerationRecord) => {
    if (!it.id) return;
    const confirmDelete = window.confirm('Bạn có chắc muốn xóa bản ghi này khỏi Supabase Cloud?');
    if (!confirmDelete) return;

    setIsDeletingId(it.id);
    try {
      const urlsToDelete = [it.output_media_url, it.thumbnail_url].filter(Boolean);
      const success = await deleteGenerationRecord(it.id, urlsToDelete);
      if (success) {
        setItems((prev) => prev.filter((item) => item.id !== it.id));
        setTotalCount((prev) => Math.max(0, prev - 1));
        showToast('Đã xóa bản ghi thành công.', 'info');
      } else {
        showToast('Không thể xóa bản ghi trên Supabase.', 'warning');
      }
    } catch (err: any) {
      showToast(err?.message || 'Lỗi khi xóa.', 'warning');
    } finally {
      setIsDeletingId(null);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return isoString;
    }
  };

  return (
    <div
      id="supabase-history-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-stone-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-teal-950/40">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Kho Lưu Trữ & Lịch Sử Tạo AI (Google Drive & Sheets)
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-500/10 border border-teal-500/30 text-teal-400">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                  {supabaseStatus.ok ? (supabaseStatus.message || 'Đã kết nối') : 'Bộ nhớ Cloud'}
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Toàn bộ ảnh AI, prompt và thông số tạo được lưu trữ trực tiếp trên Google Drive & Google Sheets.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadHistory}
              disabled={isLoading}
              className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors"
              title="Làm mới dữ liệu từ Supabase"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="px-6 py-3 border-b border-stone-800 bg-stone-900/90 flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-stone-950 p-1 rounded-xl border border-stone-800">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-stone-800 text-white shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Tất cả ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('video')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'video'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              🎬 Video AI
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'image'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              🖼️ Ảnh AI
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo prompt, model..."
              className="w-full pl-9 pr-4 py-1.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Gallery Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
              <p className="text-sm text-stone-300 font-medium">Đang tải dữ liệu từ Supabase Cloud...</p>
              <p className="text-xs text-stone-500 mt-1">Đồng bộ danh sách hình ảnh, video và prompt</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center bg-stone-950/40 border border-dashed border-stone-800 rounded-2xl p-8">
              <div className="w-14 h-14 rounded-2xl bg-stone-800/80 flex items-center justify-center text-stone-500 mb-4">
                <Database className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-stone-200 mb-1">
                {searchQuery ? 'Không tìm thấy kết quả phù hợp' : 'Chưa có dữ liệu nào được lưu trữ'}
              </h3>
              <p className="text-xs text-stone-400 max-w-md mb-4">
                {searchQuery
                  ? 'Hãy thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc.'
                  : 'Khi bạn tạo ảnh AI hoặc sinh video Kling trong ứng dụng, kết quả và prompt sẽ tự động lưu vào Supabase Cloud tại đây.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((it) => {
                const isVideo = it.task_type.includes('video') || it.output_media_url?.endsWith('.mp4') || it.output_media_url?.endsWith('.webm');
                const isCopied = copiedPromptId === it.id;

                return (
                  <div
                    key={it.id}
                    className="bg-stone-950 border border-stone-800/90 hover:border-stone-700 rounded-2xl overflow-hidden shadow-lg transition-all flex flex-col group"
                  >
                    {/* Media Preview Thumbnail Area */}
                    <div className="relative aspect-[9/16] sm:aspect-[4/3] bg-stone-900 flex items-center justify-center overflow-hidden">
                      {isVideo ? (
                        <video
                          src={it.output_media_url || undefined}
                          poster={it.thumbnail_url || undefined}
                          className="w-full h-full object-cover"
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={it.output_media_url || it.thumbnail_url || ''}
                          alt="AI Result"
                          className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                          onClick={() => {
                            if (it.output_media_url) {
                              setPreviewMedia({
                                url: it.output_media_url,
                                type: 'image',
                                title: it.prompt || 'Ảnh kết quả AI',
                              });
                            }
                          }}
                        />
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-md backdrop-blur-md ${
                            isVideo
                              ? 'bg-emerald-600/90 text-white'
                              : 'bg-indigo-600/90 text-white'
                          }`}
                        >
                          {isVideo ? '🎬 Video' : '🖼️ Ảnh AI'}
                        </span>
                        {it.model_name && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/60 text-stone-200 backdrop-blur-md border border-white/10">
                            {it.model_name}
                          </span>
                        )}
                      </div>

                      {/* Right Action Icons Overlay */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10">
                        {it.output_media_url && (
                          <a
                            href={it.output_media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="p-1.5 bg-black/60 hover:bg-black/90 text-stone-300 hover:text-white rounded-lg backdrop-blur-md transition-colors shadow-md"
                            title="Tải về file gốc"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(it)}
                          disabled={isDeletingId === it.id}
                          className="p-1.5 bg-black/60 hover:bg-rose-900/80 text-stone-400 hover:text-rose-200 rounded-lg backdrop-blur-md transition-colors shadow-md"
                          title="Xóa khỏi Supabase"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata & Prompt Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      {/* Prompt text */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-stone-400">
                          <span className="flex items-center gap-1 font-semibold text-stone-300">
                            <FileText className="w-3 h-3 text-emerald-400" />
                            Prompt đã dùng:
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-stone-500">
                            <Clock className="w-3 h-3" />
                            {formatDate(it.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-stone-300 bg-stone-900 p-2.5 rounded-xl border border-stone-800 line-clamp-3 leading-relaxed font-mono select-all">
                          {it.prompt || '(Không có prompt văn bản)'}
                        </p>
                      </div>

                      {/* Action buttons on card */}
                      <div className="flex items-center gap-2 pt-1 border-t border-stone-800/80">
                        <button
                          type="button"
                          onClick={() => handleCopyPrompt(it.id || '', it.prompt)}
                          className="flex-1 py-1.5 px-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">Đã chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-stone-400" />
                              <span>Chép Prompt</span>
                            </>
                          )}
                        </button>

                        {onApplyPrompt && it.prompt && (
                          <button
                            type="button"
                            onClick={() => handleApplyToApp(it)}
                            className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                            title="Áp dụng lại câu prompt này vào bộ công cụ"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Dùng Prompt này</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-stone-800 bg-stone-950 flex items-center justify-between text-xs text-stone-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>
              Lưu trữ Cloud: <strong>{totalCount}</strong> mục trong cơ sở dữ liệu
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg font-medium transition-colors"
          >
            Đóng Gallery
          </button>
        </div>
      </div>

      {/* Lightbox Modal for Large Image / Video Preview */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewMedia(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/70 text-white rounded-full hover:bg-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            {previewMedia.type === 'video' ? (
              <video
                src={previewMedia.url}
                className="max-h-[80vh] w-auto rounded-xl object-contain mx-auto"
                controls
                autoPlay
              />
            ) : (
              <img
                src={previewMedia.url}
                alt="Preview"
                className="max-h-[80vh] w-auto rounded-xl object-contain mx-auto"
              />
            )}
            {previewMedia.title && (
              <p className="text-xs text-stone-300 mt-2 px-3 py-1.5 bg-stone-900 rounded-lg text-center">
                {previewMedia.title}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
