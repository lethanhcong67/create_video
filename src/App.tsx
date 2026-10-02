import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Header } from './components/Header';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { ApiStatusBanner } from './components/ApiStatusBanner';
import { VideoStudio } from './components/VideoStudio';
import {
  VideoGenerationItem,
  CameraMovementType,
  ApiConfig,
  GptImageConfig,
  KlingVideoConfig,
  VisionAnalysisConfig
} from './types';

const API_STORAGE_KEY = 'create_video_api_config_v1';

const DEFAULT_GPT_CONFIG: GptImageConfig = {
  apiKey: 'sk-***REVOKED-ROTATE-ME***',
  baseUrl: 'https://api.openlux.ai/v1/images/edits',
  model: 'gpt-image-2',
  size: '1152x2048',
  quality: 'medium',
  isCustomKeyActive: true,
  isValidated: true,
  endpointKeys: {
    'https://api.openlux.ai/v1/images/edits': 'sk-***REVOKED-ROTATE-ME***',
  },
};

const DEFAULT_KLING_CONFIG: KlingVideoConfig = {
  apiKey: 'sk-***REVOKED-ROTATE-ME***',
  baseUrl: 'https://api.openlux.ai/kling/v1/videos/image2video',
  model: 'kling-v2-6',
  mode: 'pro',
  duration: '5',
  aspectRatio: '9:16',
  multiShot: false,
  cfgScale: 0.6,
  negativePrompt: '',
  watermarkEnabled: false,
  isCustomKeyActive: true,
  isValidated: true,
};

const DEFAULT_VISION_CONFIG: VisionAnalysisConfig = {
  apiKey: 'sk-***REVOKED-ROTATE-ME***',
  provider: 'gemini',
  model: 'gemini-3.5-flash',
  baseUrl: 'https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent',
  isCustomKeyActive: true,
  isValidated: true,
};

function loadSavedApiConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(API_STORAGE_KEY) || localStorage.getItem('ai_image_api_config_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        activeProvider: parsed.activeProvider || 'kling',
        apiKey: parsed.apiKey || 'sk-***REVOKED-ROTATE-ME***',
        model: parsed.model || 'gemini-3.1-flash-image',
        isCustomKeyActive: Boolean(parsed.isCustomKeyActive ?? true),
        isValidated: Boolean(parsed.isValidated ?? true),
        gptImage: parsed.gptImage || DEFAULT_GPT_CONFIG,
        kling: {
          ...DEFAULT_KLING_CONFIG,
          ...(parsed.kling || {}),
        },
        visionAnalysis: parsed.visionAnalysis || DEFAULT_VISION_CONFIG,
      };
    }
  } catch (e) {
    console.warn('Lỗi đọc API config từ storage:', e);
  }
  return {
    activeProvider: 'kling',
    apiKey: 'sk-***REVOKED-ROTATE-ME***',
    model: 'gemini-3.1-flash-image',
    isCustomKeyActive: true,
    isValidated: true,
    gptImage: DEFAULT_GPT_CONFIG,
    kling: DEFAULT_KLING_CONFIG,
    visionAnalysis: DEFAULT_VISION_CONFIG,
  };
}

export default function App() {
  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadSavedApiConfig);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);

  // Pure in-memory state: xem và tải trực tiếp, không lưu trữ video vào ổ đĩa hay cloud
  const [videoItems, setVideoItems] = useState<VideoGenerationItem[]>([]);
  const [mergedVideo, setMergedVideo] = useState<{
    id: string;
    url: string;
    clipsCount: number;
    createdAt: number;
    transitions?: Array<{ fromIndex: number; toIndex: number; transition: string; duration: number; reason: string }>;
  } | null>(null);
  const [isMergingVideo, setIsMergingVideo] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const [notification, setNotification] = useState<{
    message: string;
    type: 'info' | 'success' | 'warning';
  } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSaveApiConfig = (newConfig: ApiConfig) => {
    setApiConfig(newConfig);
    try {
      localStorage.setItem(API_STORAGE_KEY, JSON.stringify(newConfig));
      showToast('Đã lưu cấu hình API thành công!', 'success');
    } catch (e) {
      showToast('Lỗi khi lưu cấu hình API', 'warning');
    }
  };

  const handleResetWorkspace = () => {
    if (videoItems.length > 0 || mergedVideo) {
      if (window.confirm('Bạn có chắc chắn muốn làm mới không gian làm việc?')) {
        setVideoItems([]);
        setMergedVideo(null);
        setIsMergingVideo(false);
        setMergeError(null);
        showToast('Đã làm mới không gian làm việc', 'info');
      }
    } else {
      showToast('Không gian làm việc đã trống', 'info');
    }
  };

  const handleDeleteItem = (id: string) => {
    setVideoItems((prev) => prev.filter((item) => item.id !== id));
    showToast('Đã xóa video khỏi danh sách', 'info');
  };

  // Master function to merge all completed scene clips with FFmpeg & AI Smart Transitions
  const handleMergeCompletedScenes = async (
    customItems?: VideoGenerationItem[],
    transitionMode: 'auto' | 'cut' | 'crossfade' | 'slide' = 'auto'
  ) => {
    let candidateList = customItems;
    if (!candidateList || candidateList.length === 0) {
      // Find the active batch or use all videoItems
      const latestBatchItem = videoItems.find((i) => i.batchId);
      if (latestBatchItem && latestBatchItem.batchId) {
        candidateList = videoItems.filter((i) => i.batchId === latestBatchItem.batchId);
      } else {
        candidateList = videoItems;
      }
    }

    const completedClips = candidateList
      .filter((i) => i.status === 'completed' && Boolean(i.resultVideoUrl))
      .sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0) || a.createdAt - b.createdAt);

    if (completedClips.length < 2) {
      showToast(
        `Cần ít nhất 2 phân cảnh hoàn thành để ghép video (hiện có ${completedClips.length}/${candidateList.length} cảnh hoàn tất).`,
        'warning'
      );
      return;
    }

    setIsMergingVideo(true);
    setMergeError(null);
    showToast(`AI đang phân tích & dùng FFmpeg ghép ${completedClips.length} phân cảnh...`, 'info');

    try {
      const videoUrls = completedClips.map((c) => c.resultVideoUrl as string);
      const scenes = completedClips.map((c, idx) => ({
        prompt: c.prompt,
        cameraMotion: c.cameraMovement,
        purpose: `Phân cảnh ${(c.sceneIndex ?? idx) + 1}`,
      }));

      const res = await fetch('/api/video/merge-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrls,
          scenes,
          transitionMode,
          aspectRatio: completedClips[0]?.aspectRatio || '9:16',
          apiKey: apiConfig.apiKey,
          visionConfig: apiConfig.visionAnalysis,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi ghép video bằng FFmpeg');
      }

      const newMerged = {
        id: data.mergedId,
        url: data.videoUrl,
        clipsCount: data.clipsCount || completedClips.length,
        transitions: data.transitions,
        createdAt: Date.now(),
      };

      setMergedVideo(newMerged);
      try {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      } catch (_) {}
      showToast(`🎉 Đã tự động phân tích chuyển cảnh & ghép hoàn tất ${completedClips.length} phân cảnh thành 1 Video Hoàn Chỉnh!`, 'success');

      // Scroll to merged video hero section
      setTimeout(() => {
        const el = document.getElementById('merged-final-video-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    } catch (err: any) {
      console.error('Lỗi khi ghép video với FFmpeg:', err);
      setMergeError(err?.message || 'Không thể ghép các phân cảnh video');
      showToast(`Lỗi ghép video: ${err?.message}`, 'warning');
    } finally {
      setIsMergingVideo(false);
    }
  };

  const handleEnhancePromptWithGemini = async (rawPrompt: string): Promise<string> => {
    const key = apiConfig.apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      showToast('Vui lòng cấu hình Gemini API Key trước khi tối ưu prompt', 'warning');
      return rawPrompt;
    }

    try {
      const systemInstruction =
        'You are an expert AI Video Prompt Engineer. Expand the user input into a highly detailed, professional, cinematic video creation prompt in English. Include dynamic motion details, 4k photorealistic textures, volumetric lighting, and smooth camera pacing. Return ONLY the enhanced English prompt without commentary or markdown code blocks.';

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.trim()}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemInstruction}\n\nUser Prompt: ${rawPrompt}` }],
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API call failed (${response.status})`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) {
        showToast('Đã tối ưu hóa Prompt với Gemini AI!', 'success');
        return text.trim();
      }
    } catch (err: any) {
      console.warn('Fallback prompt enhancement:', err);
    }
    return `${rawPrompt}, 8k resolution, cinematic volumetric lighting, hyperrealistic details, smooth 60fps video.`;
  };

  const executeRealKlingVideoTask = async (targetItem: VideoGenerationItem) => {
    // Transition to generating state
    setVideoItems((prev) =>
      prev.map((item) =>
        item.id === targetItem.id
          ? { ...item, status: 'generating', progress: 15, error: undefined }
          : item
      )
    );

    try {
      const klingConf = apiConfig.kling || DEFAULT_KLING_CONFIG;
      const effectiveApiKey = klingConf.apiKey || apiConfig.apiKey || '';
      const effectiveAccessKey = klingConf.accessKey || '';
      const effectiveSecretKey = klingConf.secretKey || '';
      const effectiveBaseUrl = klingConf.baseUrl || 'https://api.openlux.ai/kling';

      const payload = {
        image: targetItem.startImageUrl,
        imageUrl: targetItem.startImageUrl,
        endImage: targetItem.endImageUrl,
        endImageUrl: targetItem.endImageUrl,
        prompt: targetItem.prompt,
        negative_prompt: targetItem.negativePrompt,
        camera_movement: targetItem.cameraMovement,
        duration: targetItem.duration || '5',
        mode: targetItem.mode || 'pro',
        aspect_ratio: targetItem.aspectRatio || '9:16',
        cfg_scale: targetItem.cfgScale ?? 0.6,
        model_name: targetItem.model || klingConf.model || 'kling-v2-6',
        apiKey: effectiveApiKey,
        accessKey: effectiveAccessKey,
        secretKey: effectiveSecretKey,
        baseUrl: effectiveBaseUrl,
      };

      const res = await fetch('/api/kling/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.taskId) {
        const errMsg = data.error || data.message || `Lỗi máy chủ Kling AI (Mã HTTP: ${res.status})`;
        setVideoItems((prev) =>
          prev.map((item) =>
            item.id === targetItem.id
              ? { ...item, status: 'error', error: errMsg, progress: 0 }
              : item
          )
        );
        showToast(`Lỗi khởi tạo video: ${errMsg}`, 'warning');
        return;
      }

      const taskId = data.taskId;
      setVideoItems((prev) =>
        prev.map((item) =>
          item.id === targetItem.id
            ? { ...item, taskId, status: 'generating', progress: 25 }
            : item
        )
      );

      // Poll task status every 3.5 seconds
      let pollCount = 0;
      const maxPoll = 120; // ~7 minutes maximum polling
      const pollTimer = setInterval(async () => {
        pollCount++;
        try {
          const params = new URLSearchParams();
          if (effectiveApiKey) params.set('apiKey', effectiveApiKey);
          if (effectiveAccessKey) params.set('accessKey', effectiveAccessKey);
          if (effectiveSecretKey) params.set('secretKey', effectiveSecretKey);
          if (effectiveBaseUrl) params.set('baseUrl', effectiveBaseUrl);

          const statusRes = await fetch(`/api/kling/task-status/${taskId}?${params.toString()}`);
          const statusData = await statusRes.json().catch(() => ({}));

          if (statusData.status === 'succeed') {
            clearInterval(pollTimer);
            setVideoItems((prev) => {
              const updated = prev.map((item) =>
                item.id === targetItem.id
                  ? {
                      ...item,
                      status: 'completed' as const,
                      progress: 100,
                      resultVideoUrl: statusData.videoUrl,
                      completedAt: Date.now(),
                    }
                  : item
              );

              // If all queued/generating items in this batch are completed, auto-trigger FFmpeg merge!
              const targetBatchId = targetItem.batchId;
              const batchItems = targetBatchId ? updated.filter((it) => it.batchId === targetBatchId) : updated;
              const allBatchDone =
                batchItems.length >= 2 &&
                batchItems.every((it) => it.status === 'completed' && Boolean(it.resultVideoUrl));
              if (allBatchDone) {
                const sortedBatch = [...batchItems].sort((a, b) => (a.sceneIndex ?? 0) - (b.sceneIndex ?? 0));
                setTimeout(() => {
                  handleMergeCompletedScenes(sortedBatch);
                }, 1000);
              }

              return updated;
            });
            try {
              confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
            } catch (_) {}
            showToast('Tạo Video Kling AI hoàn tất thành công!', 'success');
          } else if (statusData.status === 'failed') {
            clearInterval(pollTimer);
            const failReason = statusData.error || statusData.statusMsg || 'Kling AI xử lý video thất bại';
            setVideoItems((prev) =>
              prev.map((item) =>
                item.id === targetItem.id
                  ? { ...item, status: 'error', error: failReason, progress: 0 }
                  : item
              )
            );
            showToast(`Tạo video thất bại: ${failReason}`, 'warning');
          } else {
            // Processing: update progress smoothly between 25% and 95%
            const prog = Math.min(95, 25 + Math.floor(pollCount * 2));
            setVideoItems((prev) =>
              prev.map((item) =>
                item.id === targetItem.id
                  ? { ...item, status: 'generating', progress: prog }
                  : item
              )
            );
          }

          if (pollCount >= maxPoll) {
            clearInterval(pollTimer);
            setVideoItems((prev) =>
              prev.map((item) =>
                item.id === targetItem.id
                  ? {
                      ...item,
                      status: 'error',
                      error: 'Quá thời gian chờ tạo video Kling AI (hơn 7 phút). Bạn có thể thử tạo lại.',
                      progress: 0,
                    }
                  : item
              )
            );
          }
        } catch (pollErr: any) {
          console.warn('Lỗi kiểm tra trạng thái video:', pollErr);
        }
      }, 3500);
    } catch (err: any) {
      console.error('Lỗi khi gửi tác vụ Kling AI:', err);
      setVideoItems((prev) =>
        prev.map((item) =>
          item.id === targetItem.id
            ? { ...item, status: 'error', error: err?.message || 'Lỗi mạng khi kết nối Kling AI', progress: 0 }
            : item
        )
      );
      showToast(`Lỗi: ${err?.message || 'Không thể kết nối đến máy chủ Kling AI'}`, 'warning');
    }
  };

  const handleRetryItem = (id: string) => {
    const item = videoItems.find((i) => i.id === id);
    if (item) {
      showToast('Đang thử tạo lại video với Kling AI...', 'info');
      executeRealKlingVideoTask(item);
    }
  };

  const handleGenerateTextToVideo = async (params: {
    prompt: string;
    negativePrompt?: string;
    cameraMovement: CameraMovementType;
    duration: '5' | '10';
    mode: 'std' | 'pro';
    aspectRatio: '16:9' | '9:16' | '1:1';
    cfgScale: number;
    model: string;
  }) => {
    const newItem: VideoGenerationItem = {
      id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'text_to_video',
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      cameraMovement: params.cameraMovement,
      duration: params.duration,
      mode: params.mode,
      aspectRatio: params.aspectRatio,
      cfgScale: params.cfgScale,
      model: params.model,
      status: 'queued',
      progress: 5,
      createdAt: Date.now(),
    };

    setVideoItems((prev) => [newItem, ...prev]);
    showToast('Đã gửi lệnh tạo Video tới Kling AI...', 'info');

    executeRealKlingVideoTask(newItem);
  };

  const handleGenerateImageToVideo = async (params: {
    startImageUrl: string;
    startImageName?: string;
    endImageUrl?: string;
    endImageName?: string;
    prompt: string;
    cameraMovement: CameraMovementType;
    duration: '5' | '10';
    mode: 'std' | 'pro';
    aspectRatio: '16:9' | '9:16' | '1:1';
    cfgScale: number;
    model: string;
  }) => {
    const newItem: VideoGenerationItem = {
      id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'image_to_video',
      startImageUrl: params.startImageUrl,
      startImageName: params.startImageName,
      endImageUrl: params.endImageUrl,
      endImageName: params.endImageName,
      prompt: params.prompt || 'Animate this image with smooth realistic movement',
      cameraMovement: params.cameraMovement,
      duration: params.duration,
      mode: params.mode,
      aspectRatio: params.aspectRatio,
      cfgScale: params.cfgScale,
      model: params.model,
      status: 'queued',
      progress: 5,
      createdAt: Date.now(),
    };

    setVideoItems((prev) => [newItem, ...prev]);
    showToast('Đã khởi tạo yêu cầu Animate Ảnh sang Video...', 'info');

    executeRealKlingVideoTask(newItem);
  };

  const handleBatchEnqueueVideos = (
    itemsToEnqueue: Array<{
      prompt: string;
      cameraMovement: CameraMovementType;
      duration: '5' | '10';
      mode: 'std' | 'pro';
      aspectRatio: '16:9' | '9:16' | '1:1';
      cfgScale: number;
      model: string;
      startImageUrl?: string;
    }>
  ) => {
    const currentBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newItems: VideoGenerationItem[] = itemsToEnqueue.map((item, idx) => ({
      id: `vid_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      batchId: currentBatchId,
      sceneIndex: idx,
      type: item.startImageUrl ? 'image_to_video' : 'text_to_video',
      startImageUrl: item.startImageUrl,
      prompt: item.prompt,
      cameraMovement: item.cameraMovement,
      duration: item.duration,
      mode: item.mode,
      aspectRatio: item.aspectRatio,
      cfgScale: item.cfgScale,
      model: item.model,
      status: 'queued',
      progress: 5,
      createdAt: Date.now() + idx * 10,
    }));

    setVideoItems((prev) => [...newItems, ...prev]);
    showToast(`Đã gửi ${newItems.length} phân cảnh vào Kling AI để render video!`, 'success');

    newItems.forEach((it, idx) => {
      // Stagger dispatch slightly by 300ms to avoid burst limits
      setTimeout(() => {
        executeRealKlingVideoTask(it);
      }, idx * 300);
    });
  };

  const completedCount = videoItems.filter((i) => i.status === 'completed').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased selection:bg-indigo-500 selection:text-white pb-16">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold text-white transition-all animate-in fade-in slide-in-from-top-2 border ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-700 text-emerald-200'
              : notification.type === 'warning'
              ? 'bg-amber-950/90 border-amber-700 text-amber-200'
              : 'bg-indigo-950/90 border-indigo-700 text-indigo-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      <Header
        apiConfig={apiConfig}
        videoCount={videoItems.length}
        completedCount={completedCount}
        onReset={handleResetWorkspace}
        onOpenApiSettings={() => setIsApiModalOpen(true)}
      />

      <main className="w-full flex-1">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-6">
          <ApiStatusBanner
            config={apiConfig}
            systemHasKey={Boolean(apiConfig.apiKey)}
            systemHasOpenAiKey={Boolean(apiConfig.gptImage?.apiKey)}
            onOpenSettings={() => setIsApiModalOpen(true)}
          />
        </div>

        <VideoStudio
          apiConfig={apiConfig}
          items={videoItems}
          mergedVideo={mergedVideo}
          isMergingVideo={isMergingVideo}
          mergeError={mergeError}
          onMergeScenes={(mode) => handleMergeCompletedScenes(undefined, mode)}
          onBatchEnqueueVideos={handleBatchEnqueueVideos}
          onDeleteItem={handleDeleteItem}
          onRetryItem={handleRetryItem}
        />
      </main>

      <ApiSettingsModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        config={apiConfig}
        onSaveConfig={handleSaveApiConfig}
        systemHasKey={Boolean(apiConfig.apiKey)}
        systemHasOpenAiKey={Boolean(apiConfig.gptImage?.apiKey)}
        systemHasKlingKey={Boolean(apiConfig.kling?.apiKey || apiConfig.kling?.accessKey)}
        initialTab="kling"
      />
    </div>
  );
}
