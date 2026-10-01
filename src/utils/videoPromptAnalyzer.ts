/**
 * Utility to extract keyframes from video and analyze motion prompts in Vietnamese
 * Calling Gemini 3.7 Flash directly via OpenLux AI:
 * https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent
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

const OPENLUX_GEMINI_ENDPOINT = 'https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent';
const DEFAULT_OPENLUX_KEY = 'sk-***REVOKED-ROTATE-ME***';

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
 * Directly call OpenLux Gemini 3.7 Flash endpoint
 * https://api.openlux.ai/v1beta/models/gemini-3.7-flash:generateContent
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

  const targetUrl = (baseUrl && baseUrl.trim()) || OPENLUX_GEMINI_ENDPOINT;
  let effectiveKey = (apiKey && apiKey.trim()) || '';

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
      }
    } catch (_) { }
  }

  if (!effectiveKey) {
    effectiveKey = DEFAULT_OPENLUX_KEY;
  }

  const inlineParts = framesToAnalyze.map((frame: string) => {
    let base64 = frame;
    let mimeType = 'image/jpeg';
    if (typeof frame === 'string' && frame.startsWith('data:')) {
      const match = frame.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1] || 'image/jpeg';
        base64 = match[2];
      } else {
        const commaIdx = frame.indexOf(',');
        if (commaIdx !== -1) {
          base64 = frame.slice(commaIdx + 1);
        }
      }
    }
    return {
      inlineData: {
        mimeType,
        data: base64,
      },
    };
  });

  const systemPrompt = `Bạn là một đạo diễn hình ảnh và chuyên gia phân tích video AI hàng đầu thế giới.
Dưới đây là chuỗi các khung hình (keyframes) được trích xuất theo trình tự thời gian từ một video mẫu.
Hãy quan sát và phân tích kỹ sự diễn biến, bối cảnh, sự thay đổi hành động/tư thế của nhân vật và chuyển động của góc máy camera (pan, tilt, zoom, dolly, tracking, handheld...) qua từng phân cảnh hoặc nhịp chuyển động chính.

Nhiệm vụ của bạn: Tạo ra một danh sách các câu Prompt video chi tiết hoàn toàn bằng TIẾNG VIỆT, mượt mà, sống động, sẵn sàng sử dụng cho các công cụ AI tạo video. Mỗi câu prompt là một phân cảnh hoặc một nhịp chuyển động chính, mô tả cụ thể hành động của nhân vật kết hợp góc máy camera.

QUY TẮC BẮT BUỘC:
1. Viết 100% bằng TIẾNG VIỆT tự nhiên, sống động, giàu chi tiết chuyển động nhân vật và góc quay.
2. KHÔNG ghi số thứ tự cảnh (ví dụ: TUYỆT ĐỐI KHÔNG ghi "Cảnh 1", "Cảnh 2", "1.", "2.", "Scene 1").
3. KHÔNG ghi mốc thời gian hay thời lượng (ví dụ: KHÔNG ghi "00:00 - 00:03", "(3 giây)").
4. Chỉ trả về DUY NHẤT một mảng JSON các chuỗi prompt tiếng Việt theo định dạng:
[
  "Câu prompt chuyển động tiếng Việt thứ nhất...",
  "Câu prompt chuyển động tiếng Việt thứ hai...",
  "Câu prompt chuyển động tiếng Việt thứ ba..."
]
Tuyệt đối không kèm bất kỳ giải thích, tiêu đề, hoặc văn bản nào ngoài mảng JSON này.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          ...inlineParts,
          {
            text: systemPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': effectiveKey,
    Authorization: `Bearer ${effectiveKey}`,
  };

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  const resText = await response.text();
  let resJson: any = null;
  try {
    resJson = resText ? JSON.parse(resText) : null;
  } catch (_) { }

  if (!response.ok) {
    const errMsg =
      resJson?.error?.message ||
      resJson?.message ||
      `Lỗi HTTP ${response.status} từ Gemini 3.7 Flash (${resText.slice(0, 150)})`;
    throw new Error(errMsg);
  }

  const textOutput = resJson?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p.text || '')
    .join('')
    .trim();

  if (!textOutput) {
    throw new Error('Không nhận được nội dung phân tích từ Gemini 3.7 Flash.');
  }

  let prompts: string[] = [];
  const cleanText = textOutput
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanText);
    if (Array.isArray(parsed)) {
      prompts = parsed.map((item: any) =>
        typeof item === 'string' ? item : item.prompt || JSON.stringify(item)
      );
    }
  } catch (_) {
    const matchArray = cleanText.match(/\[[\s\S]*\]/);
    if (matchArray) {
      try {
        const parsed = JSON.parse(matchArray[0]);
        if (Array.isArray(parsed)) {
          prompts = parsed.map((item: any) =>
            typeof item === 'string' ? item : item.prompt || JSON.stringify(item)
          );
        }
      } catch (e2) { }
    }
  }

  if (prompts.length === 0) {
    prompts = cleanText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && !l.startsWith('[') && !l.startsWith(']'));
  }

  const cleanedPrompts = prompts
    .map((p) => {
      return p
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/^(\d+[\.\:\)\-]|cảnh\s*\d+[\.\:\)\-]?|scene\s*\d+[\.\:\)\-]?)\s*/i, '')
        .trim();
    })
    .filter((p) => p.length > 0);

  if (cleanedPrompts.length === 0) {
    throw new Error('Không thể tạo được danh sách prompt từ video. Vui lòng thử lại.');
  }

  return {
    success: true,
    prompts: cleanedPrompts,
    engine: 'Gemini 3.5 Flash (OpenLux AI)',
  };
}
