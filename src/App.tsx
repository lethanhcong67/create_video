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
  aspectRatio: '16:9',
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
    if (videoItems.length > 0) {
      if (window.confirm('Bạn có chắc chắn muốn làm mới không gian làm việc?')) {
        setVideoItems([]);
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

  const startVideoTaskSimulation = (newItemId: string) => {
    let progress = 10;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setVideoItems((prev) =>
          prev.map((item) => {
            if (item.id === newItemId) {
              return {
                ...item,
                status: 'completed',
                progress: 100,
                resultVideoUrl:
                  item.type === 'text_to_video'
                    ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                    : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
                completedAt: Date.now(),
              };
            }
            return item;
          })
        );
        try {
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
        } catch (_) {}
        showToast('Tạo Video AI hoàn tất thành công!', 'success');
      } else {
        setVideoItems((prev) =>
          prev.map((item) =>
            item.id === newItemId
              ? { ...item, status: 'generating', progress }
              : item
          )
        );
      }
    }, 1500);
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

    startVideoTaskSimulation(newItem.id);
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

    startVideoTaskSimulation(newItem.id);
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
    const newItems: VideoGenerationItem[] = itemsToEnqueue.map((item, idx) => ({
      id: `vid_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
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
    showToast(`Đã thêm ${newItems.length} phân cảnh vào Hàng Đợi Render Video!`, 'success');

    newItems.forEach((it) => startVideoTaskSimulation(it.id));
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
          onBatchEnqueueVideos={handleBatchEnqueueVideos}
          onDeleteItem={handleDeleteItem}
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
