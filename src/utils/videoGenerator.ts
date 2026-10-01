/**
 * Utility to generate a cinematic motion video from an AI result image
 * using HTML5 Canvas captureStream and MediaRecorder.
 * Allows instant client-side video preview and download for the same-row pipeline.
 */

export async function generateMotionVideoFromImage(
  imageUrl: string,
  durationMs: number = 3500,
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Standard video resolution: 720p or matching aspect ratio
        const targetWidth = 720;
        const targetHeight = Math.round((img.height / img.width) * targetWidth) % 2 === 0
          ? Math.round((img.height / img.width) * targetWidth)
          : Math.round((img.height / img.width) * targetWidth) + 1;

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Không thể khởi tạo Canvas 2D context'));
          return;
        }

        // Check MediaRecorder support
        if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
          reject(new Error('Trình duyệt không hỗ trợ MediaRecorder capture'));
          return;
        }

        // Supported mimeTypes
        const mimeTypes = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4',
        ];
        const selectedMime = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm';

        const stream = canvas.captureStream(30);
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: 3000000,
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const videoBlob = new Blob(chunks, { type: selectedMime });
          const videoUrl = URL.createObjectURL(videoBlob);
          resolve(videoUrl);
        };

        mediaRecorder.start();

        const startTime = performance.now();

        function renderFrame(now: number) {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / durationMs, 1);

          if (onProgress) {
            onProgress(Math.round(progress * 100));
          }

          // Subtle slow cinematic zoom-in effect (1.0 -> 1.08)
          const scale = 1 + progress * 0.08;
          // Subtle horizontal cinematic drift
          const panX = Math.sin(progress * Math.PI) * (targetWidth * 0.02);

          ctx!.save();
          ctx!.fillStyle = '#000';
          ctx!.fillRect(0, 0, targetWidth, targetHeight);

          // Center zoom
          ctx!.translate(targetWidth / 2 + panX, targetHeight / 2);
          ctx!.scale(scale, scale);
          ctx!.drawImage(img, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);

          // Add a subtle cinematic vignette gradient
          const grad = ctx!.createRadialGradient(
            0,
            0,
            targetWidth * 0.35,
            0,
            0,
            targetWidth * 0.75
          );
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.3)');
          ctx!.fillStyle = grad;
          ctx!.fillRect(-targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);

          ctx!.restore();

          if (progress < 1) {
            requestAnimationFrame(renderFrame);
          } else {
            setTimeout(() => {
              mediaRecorder.stop();
            }, 100);
          }
        }

        requestAnimationFrame(renderFrame);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Không thể tải ảnh kết quả để tạo video'));
    };

    img.src = imageUrl;
  });
}
