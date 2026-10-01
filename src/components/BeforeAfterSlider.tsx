import React, { useState, useRef, useCallback } from 'react';
import { ArrowLeftRight, Sparkles, Image as ImageIcon } from 'lucide-react';

interface BeforeAfterSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeImage,
  afterImage,
  beforeLabel = 'Ảnh gốc (Có phụ đề / cũ)',
  afterLabel = 'AI Đã thay thế & Xóa chữ',
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    []
  );

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  };

  return (
    <div
      id="before-after-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      className="relative select-none overflow-hidden rounded-2xl border border-stone-200 bg-stone-900 shadow-xl w-full h-[60vh] min-h-[420px] max-h-[680px] mx-auto"
    >
      {/* After image (AI Generated - Full background) */}
      <img
        src={afterImage}
        alt="AI Replaced"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-contain pointer-events-none"
      />

      {/* Before image (Original - Clipped) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeImage}
          alt="Original"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full max-w-none object-contain"
          style={{
            width: containerRef.current
              ? `${containerRef.current.clientWidth}px`
              : '100%',
          }}
        />
      </div>

      {/* Divider line & handle */}
      <div
        id="slider-divider-line"
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] cursor-ew-resize z-20"
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div
          id="slider-handle-button"
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white text-stone-800 shadow-2xl flex items-center justify-center border-2 border-stone-800 hover:scale-105 active:scale-95 transition-transform"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </div>
      </div>

      {/* Badges */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/75 backdrop-blur-md text-white text-xs font-semibold tracking-wide">
        <ImageIcon className="w-3.5 h-3.5 text-stone-300" />
        <span>{beforeLabel}</span>
      </div>
      <div className="absolute top-4 right-4 z-10 pointer-events-none flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/90 backdrop-blur-md text-white text-xs font-semibold tracking-wide shadow-md">
        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        <span>{afterLabel}</span>
      </div>

      {/* Helper text on bottom */}
      <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none z-10">
        <span className="text-[11px] font-medium bg-black/60 text-stone-200 px-3 py-1 rounded-full backdrop-blur-sm">
          Kéo thanh trượt trái / phải để so sánh chi tiết
        </span>
      </div>
    </div>
  );
};
