export interface ExtractedVideoFrame {
  id: string;
  timestamp: number; // in seconds
  timestampFormatted: string; // e.g. "00:02.4"
  dataUrl: string;
  width: number;
  height: number;
  selected: boolean;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  name: string;
  size: number;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return `${mm}:${ss}.${ms}`;
}

/**
 * Load video metadata without full processing
 */
export function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const meta: VideoMetadata = {
        duration: video.duration || 0,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        name: file.name,
        size: file.size,
      };
      cleanup();
      resolve(meta);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Không thể đọc dữ liệu video. Vui lòng kiểm tra lại định dạng file (hỗ trợ MP4, WebM, MOV).'));
    };
  });
}

/**
 * Safely seek video to a given time with timeout fallback
 */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    }, 2500);

    const onSeeked = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    };

    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
  });
}

/**
 * Compute average pixel difference between two 32x32 image data buffers
 */
function computeDiff(data1: Uint8ClampedArray, data2: Uint8ClampedArray): number {
  let diffSum = 0;
  const total = data1.length;
  // Compare R, G, B channels
  for (let i = 0; i < total; i += 4) {
    diffSum += Math.abs(data1[i] - data2[i]); // R
    diffSum += Math.abs(data1[i + 1] - data2[i + 1]); // G
    diffSum += Math.abs(data1[i + 2] - data2[i + 2]); // B
  }
  // Max possible diff = 255 * 3 * (total / 4)
  const maxDiff = 255 * 3 * (total / 4);
  return diffSum / maxDiff;
}

export interface ExtractionOptions {
  mode: 'interval' | 'scene';
  intervalSeconds: number; // For interval mode, e.g. 1, 2, 3, 5s
  sceneSensitivity: 'low' | 'medium' | 'high'; // For scene mode
  targetAspectRatio?: '9:16' | '16:9' | 'original'; // Aspect ratio mode
  maxFrames?: number;
  quality?: number; // 0.85 - 0.95
  onProgress?: (percent: number, count: number, currentTimestamp: number) => void;
  signal?: AbortSignal;
}

/**
 * Extract frames from a video file based on interval or smart scene changes
 */
export async function extractVideoFrames(
  file: File,
  options: ExtractionOptions
): Promise<ExtractedVideoFrame[]> {
  const {
    mode,
    intervalSeconds = 2,
    sceneSensitivity = 'high',
    targetAspectRatio = '9:16',
    maxFrames = 100,
    quality = 0.92,
    onProgress,
    signal,
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Lỗi trong khi tải video để trích xuất khung hình.'));
    };

    video.onloadeddata = async () => {
      try {
        const duration = video.duration;
        if (!duration || duration <= 0) {
          cleanup();
          reject(new Error('Video không có thời lượng hợp lệ.'));
          return;
        }

        const vW = video.videoWidth || 1280;
        const vH = video.videoHeight || 720;

        // Calculate aspect ratio crop (Default: 9:16 vertical TikTok/Reels)
        let sx = 0;
        let sy = 0;
        let sw = vW;
        let sh = vH;
        let outWidth = vW;
        let outHeight = vH;

        if (targetAspectRatio === '9:16') {
          const targetRatio = 9 / 16;
          const currentRatio = vW / vH;
          if (currentRatio > targetRatio) {
            // Video is wider than 9:16 -> center crop horizontally
            sw = Math.round(vH * targetRatio);
            sh = vH;
            sx = Math.round((vW - sw) / 2);
            sy = 0;
          } else if (currentRatio < targetRatio) {
            // Video is taller than 9:16 -> center crop vertically
            sw = vW;
            sh = Math.round(vW / targetRatio);
            sx = 0;
            sy = Math.round((vH - sh) / 2);
          }
          outWidth = sw;
          outHeight = sh;
        } else if (targetAspectRatio === '16:9') {
          const targetRatio = 16 / 9;
          const currentRatio = vW / vH;
          if (currentRatio > targetRatio) {
            sw = Math.round(vH * targetRatio);
            sh = vH;
            sx = Math.round((vW - sw) / 2);
            sy = 0;
          } else if (currentRatio < targetRatio) {
            sw = vW;
            sh = Math.round(vW / targetRatio);
            sx = 0;
            sy = Math.round((vH - sh) / 2);
          }
          outWidth = sw;
          outHeight = sh;
        }

        // Main canvas for high quality snapshots
        const canvas = document.createElement('canvas');
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
          cleanup();
          reject(new Error('Không thể khởi tạo Canvas 2D context.'));
          return;
        }

        // Downscaled canvas for fast scene detection
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 32;
        thumbCanvas.height = 32;
        const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });

        const results: ExtractedVideoFrame[] = [];

        // Determine scene threshold based on sensitivity
        const thresholdMap = {
          low: 0.35, // Requires large change
          medium: 0.22, // Standard scene change
          high: 0.14, // Sensitive to smaller changes
        };
        const sceneThreshold = thresholdMap[sceneSensitivity] || 0.22;

        if (mode === 'interval') {
          // --- INTERVAL MODE ---
          const step = Math.max(0.2, intervalSeconds);
          const timestamps: number[] = [];

          for (let t = 0; t < duration; t += step) {
            timestamps.push(t);
            if (timestamps.length >= maxFrames) break;
          }

          if (timestamps.length === 0) {
            timestamps.push(0);
          }

          for (let i = 0; i < timestamps.length; i++) {
            if (signal?.aborted) {
              cleanup();
              reject(new DOMException('Quá trình cắt ảnh đã bị hủy.', 'AbortError'));
              return;
            }

            const t = timestamps[i];
            await seekTo(video, t);

            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);

            results.push({
              id: `frame_${i}_${Math.round(t * 1000)}`,
              timestamp: t,
              timestampFormatted: formatTime(t),
              dataUrl,
              width: outWidth,
              height: outHeight,
              selected: true,
            });

            const percent = Math.round(((i + 1) / timestamps.length) * 100);
            if (onProgress) {
              onProgress(percent, results.length, t);
            }
          }
        } else {
          // --- SMART SCENE DETECTION MODE ---
          const sampleStep = 0.4;
          const minSceneDistance = 1.0;
          let lastSceneTime = -minSceneDistance;
          let prevData: Uint8ClampedArray | null = null;

          let currentTime = 0;
          let frameIndex = 0;

          // Always capture the initial frame
          await seekTo(video, 0);
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
          const firstDataUrl = canvas.toDataURL('image/jpeg', quality);
          results.push({
            id: `frame_0_0`,
            timestamp: 0,
            timestampFormatted: formatTime(0),
            dataUrl: firstDataUrl,
            width: outWidth,
            height: outHeight,
            selected: true,
          });
          lastSceneTime = 0;

          if (thumbCtx) {
            thumbCtx.drawImage(video, 0, 0, 32, 32);
            prevData = thumbCtx.getImageData(0, 0, 32, 32).data;
          }

          currentTime += sampleStep;

          while (currentTime < duration && results.length < maxFrames) {
            if (signal?.aborted) {
              cleanup();
              reject(new DOMException('Quá trình cắt ảnh đã bị hủy.', 'AbortError'));
              return;
            }

            await seekTo(video, currentTime);

            if (thumbCtx && prevData) {
              thumbCtx.drawImage(video, 0, 0, 32, 32);
              const currentThumbData = thumbCtx.getImageData(0, 0, 32, 32).data;
              const diff = computeDiff(prevData, currentThumbData);

              // Detected scene change
              if (diff >= sceneThreshold && currentTime - lastSceneTime >= minSceneDistance) {
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                frameIndex++;
                results.push({
                  id: `frame_${frameIndex}_${Math.round(currentTime * 1000)}`,
                  timestamp: currentTime,
                  timestampFormatted: formatTime(currentTime),
                  dataUrl,
                  width: outWidth,
                  height: outHeight,
                  selected: true,
                });

                lastSceneTime = currentTime;
                prevData = currentThumbData;
              }
            }

            currentTime += sampleStep;
            const percent = Math.min(99, Math.round((currentTime / duration) * 100));
            if (onProgress) {
              onProgress(percent, results.length, currentTime);
            }
          }
        }

        cleanup();
        resolve(results);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
  });
}
