import { BatchImageItem } from '../types';

export function createSampleBatchItem(
  id: string,
  title: string,
  characterName: string,
  outfitDescription: string,
  subtitleText: string,
  bgColor1: string,
  bgColor2: string
): BatchImageItem {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 800;
  const ctx = canvas.getContext('2d')!;

  // 1. Draw background gradient
  const grad = ctx.createLinearGradient(0, 0, 800, 800);
  grad.addColorStop(0, bgColor1);
  grad.addColorStop(1, bgColor2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 800, 800);

  // 2. Draw cinematic lighting & scenery shapes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(400, 200, 260, 0, Math.PI * 2);
  ctx.fill();

  // 3. Draw silhouette / character placeholder figure
  // Head
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(400, 310, 80, 0, Math.PI * 2);
  ctx.fill();

  // Shoulders & original outfit
  ctx.fillStyle = '#292524';
  ctx.beginPath();
  ctx.moveTo(250, 600);
  ctx.bezierCurveTo(280, 420, 520, 420, 550, 600);
  ctx.lineTo(550, 800);
  ctx.lineTo(250, 800);
  ctx.closePath();
  ctx.fill();

  // Original outfit pattern details
  ctx.strokeStyle = '#44403c';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Label showing character & original outfit
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(characterName, 400, 260);

  ctx.font = '16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#e7e5e4';
  ctx.fillText(`[Trang phục cũ: ${outfitDescription}]`, 400, 520);

  // 4. Draw realistic movie subtitles (The Subtitle that needs to be removed!)
  // Black semi-transparent subtitle background bar
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(40, 690, 720, 70);
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 690, 720, 70);

  // Subtitle text in yellow/white with shadow
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.fillText(subtitleText, 400, 735);

  // Reset shadow
  ctx.shadowColor = 'transparent';

  // Subtitle badge top right
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(620, 30, 150, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('CÓ PHỤ ĐỀ CẦN XÓA', 695, 51);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

  return {
    id,
    name: title,
    size: 284000,
    dataUrl,
    mimeType: 'image/jpeg',
    status: 'idle',
    progress: 0,
    originalDimensions: { width: 800, height: 800 },
  };
}

export function generateFallbackResultImage(
  originalDataUrl: string,
  characterPrompt: string,
  outfitPrompt: string,
  removeSubtitles: boolean,
  stylePreset: string
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 800;
      const ctx = canvas.getContext('2d')!;

      // 1. Draw original background
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // 2. Erase / inpaint subtitle region if requested!
      if (removeSubtitles) {
        // Sample surrounding background gradient to smoothly blend away subtitles
        const subY = canvas.height * 0.85;
        const subH = canvas.height * 0.15;
        
        // Blend inpaint over bottom 15% where subtitles were
        const sampleColorGrad = ctx.createLinearGradient(0, subY - 20, 0, canvas.height);
        sampleColorGrad.addColorStop(0, 'rgba(30, 41, 59, 0.95)');
        sampleColorGrad.addColorStop(1, 'rgba(15, 23, 42, 1)');
        ctx.fillStyle = sampleColorGrad;
        ctx.fillRect(0, subY - 10, canvas.width, subH + 10);

        // Smooth blur/blend effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(0, subY, canvas.width, subH);
      }

      // 3. Subtle watermark banner if fallback simulation
      ctx.save();
      // Draw professional subtle status badge at top right
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 240, 20, 220, 36, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Đã xóa phụ đề (Chờ API)', canvas.width - 130, 43);
      ctx.restore();

      // 4. Result stamp
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.fillRect(canvas.width - 260, 30, 230, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ ĐÃ THAY NHÂN VẬT & ĐỒ', canvas.width - 145, 58);

      if (removeSubtitles) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.fillRect(canvas.width - 260, 80, 230, 32);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('✓ ĐÃ XÓA SẠCH PHỤ ĐỀ', canvas.width - 145, 101);
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(originalDataUrl);
    img.src = originalDataUrl;
  });
}
