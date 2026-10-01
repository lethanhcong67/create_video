import React from 'react';
import { Sparkles, CheckCheck, User, Layers, Lock } from 'lucide-react';
import { OutfitReference } from '../types';

interface ApplyToAllBannerProps {
  enableCharacter?: boolean;
  characterPrompt: string;
  outfitPrompt: string;
  uploadedOutfit?: OutfitReference | null;
  uploadedOutfits?: OutfitReference[];
  preservePose: boolean;
  totalImagesCount: number;
  onApplyToAll: () => void;
  hasApplied: boolean;
}

export const ApplyToAllBanner: React.FC<ApplyToAllBannerProps> = ({
  enableCharacter = false,
  characterPrompt,
  outfitPrompt,
  uploadedOutfit,
  uploadedOutfits = [],
  preservePose,
  totalImagesCount,
  onApplyToAll,
  hasApplied,
}) => {
  const isCharacterActive = Boolean(enableCharacter && characterPrompt && characterPrompt.trim().length > 0);
  const effectiveOutfits = uploadedOutfits.length > 0
    ? uploadedOutfits
    : (uploadedOutfit ? [uploadedOutfit] : []);
  const hasOutfit = Boolean(effectiveOutfits.length > 0 || (outfitPrompt && outfitPrompt.trim().length > 0));

  return (
    <div
      id="apply-to-all-control-banner"
      className="bg-slate-900 text-white rounded-xl px-3.5 py-2.5 shadow-xs border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-300">
          <Sparkles className="w-3.5 h-3.5" />
        </div>

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs sm:text-sm font-bold text-white tracking-tight shrink-0">
            Đồng bộ cho tất cả ảnh:
          </span>

          {/* Current configuration summary chips */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {/* Character chip */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium max-w-[150px] truncate ${
                isCharacterActive
                  ? 'bg-violet-900/60 text-violet-200 border border-violet-700/50'
                  : 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/50'
              }`}
              title={isCharacterActive ? characterPrompt : 'Giữ người gốc'}
            >
              <User className="w-3 h-3 shrink-0" />
              <span className="truncate">{isCharacterActive ? characterPrompt : 'Giữ người gốc'}</span>
            </span>

            {/* Outfits chip */}
            {effectiveOutfits.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-950/70 text-indigo-200 border border-indigo-700/50">
                <Layers className="w-3 h-3 text-indigo-300 shrink-0" />
                <span>{effectiveOutfits.length} sản phẩm thay thế</span>
              </span>
            )}

            {preservePose && (
              <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-white/10 text-stone-300 border border-white/10">
                Giữ dáng
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Button & Status */}
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {hasApplied && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCheck className="w-3 h-3" />
            Đã đồng bộ
          </span>
        )}
        <button
          type="button"
          onClick={onApplyToAll}
          id="btn-apply-to-all-rows"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>{hasApplied ? 'Áp dụng lại' : 'Áp dụng cho tất cả'}</span>
          {totalImagesCount > 0 && (
            <span className="px-1 py-0.2 rounded bg-black/25 text-[11px] font-mono">
              ({totalImagesCount})
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
