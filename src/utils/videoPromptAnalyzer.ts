/**
 * Utility to extract keyframes from video and analyze motion prompts in Vietnamese.
 * The actual Gemini call happens server-side (POST /api/video/analyze-motion-prompts)
 * so the AI provider API key never has to be shipped to the browser bundle.
 */

import { ExtractedVideoFrame } from './videoExtractor';

export interface VideoPromptAnalysisParams {
  videoFile?: File | null;
  extractedFrames?: ExtractedVideoFrame[];
  apiKey?: string;
  baseUrl?: string;
  maxKeyframes?: number;
}

export interface VideoPromptAnalysisResult {
  success: boolean;
  prompts: string[];
  engine?: string;
  error?: string;
}

/**
 * Extract evenly spaced keyframe data URLs from a video file
 */
export async function extractKeyframesForAnalysis(
  videoFile: File,
  count: number = 6
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration || 1;
        // Limit keyframe canvas resolution to optimize payload size (max 768px on longest edge)
        const maxDim = 768;
        let width = video.videoWidth || 640;
        let height = video.videoHeight || 360;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const keyframeDataUrls: string[] = [];
        const actualCount = Math.min(Math.max(3, count), 10);
        const step = duration / (actualCount + 1);

        for (let i = 1; i <= actualCount; i++) {
          const targetTime = Math.min(duration - 0.05, step * i);
          await seekVideo(video, targetTime);
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            keyframeDataUrls.push(dataUrl);
          }
        }

        cleanup();
        resolve(keyframeDataUrls);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Không thể đọc dữ liệu video để phân tích keyframe.'));
    };
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    }, 2000);

    const onSeeked = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    };

    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.max(0, time);
  });
}

/**
 * Analyze video keyframes into Vietnamese motion prompts via the server proxy endpoint.
 * The server resolves the Gemini/OpenLux API key from its own environment (or the caller's
 * saved config, if provided) — the browser never holds a real provider key for this feature.
 */
export async function analyzeVideoPrompts(
  params: VideoPromptAnalysisParams
): Promise<VideoPromptAnalysisResult> {
  const { videoFile, extractedFrames, apiKey, baseUrl, maxKeyframes = 6 } = params;

  let framesToAnalyze: string[] = [];

  // If user already extracted frames in the UI, sample from them
  if (extractedFrames && extractedFrames.length > 0) {
    const total = extractedFrames.length;
    const count = Math.min(total, maxKeyframes);
    const step = total / count;
    for (let i = 0; i < count; i++) {
      const idx = Math.min(total - 1, Math.floor(i * step));
      framesToAnalyze.push(extractedFrames[idx].dataUrl);
    }
  } else if (videoFile) {
    // Extract keyframes directly from the file
    framesToAnalyze = await extractKeyframesForAnalysis(videoFile, maxKeyframes);
  } else {
    throw new Error('Cần cung cấp video mẫu hoặc các khung hình để phân tích.');
  }

  if (framesToAnalyze.length === 0) {
    throw new Error('Không thể trích xuất khung hình từ video để phân tích.');
  }

  // Optionally forward the user's own saved key/endpoint (from Settings); otherwise
  // the server falls back to its own VISION_API_KEY / GEMINI_API_KEY.
  let effectiveKey = (apiKey && apiKey.trim()) || '';
  let visionConfig: { baseUrl?: string } | undefined = baseUrl ? { baseUrl } : undefined;

  if (!effectiveKey) {
    try {
      const saved = localStorage.getItem('gemini_character_outfit_swapper_api_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        effectiveKey =
          parsed?.vision?.apiKey ||
          parsed?.gemini?.apiKey ||
          parsed?.gptImage?.apiKey ||
          '';
        if (!visionConfig && parsed?.vision?.baseUrl) {
          visionConfig = { baseUrl: parsed.vision.baseUrl };
        }
      }
    } catch (_) { }
  }

  const response = await fetch('/api/video/analyze-motion-prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      frames: framesToAnalyze,
      customKey: effectiveKey || undefined,
      visionConfig,
      model: 'gemini-3.7-flash',
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    throw new Error(data?.error || `Lỗi khi phân tích prompt video (HTTP ${response.status}).`);
  }

  if (!Array.isArray(data.prompts) || data.prompts.length === 0) {
    throw new Error('Không thể tạo được danh sách prompt từ video. Vui lòng thử lại.');
  }

  return {
    success: true,
    prompts: data.prompts,
    engine: data.engine || 'Gemini 3.7 Flash',
  };
}
