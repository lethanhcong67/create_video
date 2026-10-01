import React from 'react';
import { Sparkles, CheckCheck, ShieldCheck, UserCheck, UserX } from 'lucide-react';

interface CharacterSelectorProps {
  enableCharacter: boolean;
  onToggleEnableCharacter: (val: boolean) => void;
  characterPrompt: string;
  onChangePrompt: (val: string) => void;
  preservePose: boolean;
  onTogglePreservePose: (val: boolean) => void;
  onApplyToAll?: () => void;
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  enableCharacter,
  onToggleEnableCharacter,
  characterPrompt,
  onChangePrompt,
  preservePose,
  onTogglePreservePose,
  onApplyToAll,
}) => {
  return (
    <div id="character-selector-section" className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
              enableCharacter ? 'bg-violet-100 text-violet-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              2
            </div>
            <h2 className="text-xs sm:text-sm font-bold text-stone-900">
              Tùy chọn nhân vật
            </h2>
          </div>

          {/* Toggle between "Keep original" vs "Replace character" */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200 shrink-0">
            <button
              type="button"
              onClick={() => onToggleEnableCharacter(false)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                !enableCharacter
                  ? 'bg-white text-emerald-700 shadow-2xs border border-stone-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Giữ người gốc</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleEnableCharacter(true)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                enableCharacter
                  ? 'bg-violet-600 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Đổi nhân vật</span>
            </button>
          </div>
        </div>

        {/* When character replacement is DISABLED (Default: Keep original) */}
        {!enableCharacter ? (
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-emerald-950 truncate">
                  Giữ 100% người & biểu cảm ảnh gốc
                </p>
                <p className="text-[11px] text-emerald-800">
                  AI chỉ thay thế sản phẩm / trang phục, không thay đổi gương mặt hoặc thêm người mới.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleEnableCharacter(true)}
              className="text-xs font-bold text-violet-700 hover:text-violet-900 hover:underline shrink-0 whitespace-nowrap"
            >
              Đổi nhân vật →
            </button>
          </div>
        ) : (
          /* When character replacement is ENABLED */
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="character-prompt-input" className="text-xs font-semibold text-stone-700">
                Mô tả nhân vật mới:
              </label>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="preserve-pose-checkbox"
                  className="inline-flex items-center gap-1 cursor-pointer text-[11px] font-medium text-stone-700 hover:text-stone-900"
                >
                  <input
                    id="preserve-pose-checkbox"
                    type="checkbox"
                    checked={preservePose}
                    onChange={(e) => onTogglePreservePose(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                  <span>Giữ dáng (pose) gốc</span>
                </label>

                {characterPrompt && (
                  <button
                    type="button"
                    onClick={() => onChangePrompt('')}
                    className="text-[11px] text-stone-400 hover:text-rose-600 px-1 py-0.5 rounded transition-colors"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>

            <textarea
              id="character-prompt-input"
              rows={2}
              value={characterPrompt}
              onChange={(e) => {
                onChangePrompt(e.target.value);
                if (!enableCharacter && e.target.value.trim().length > 0) {
                  onToggleEnableCharacter(true);
                }
              }}
              placeholder="VD: Nam 25 tuổi, người Việt Nam, tóc đen vuốt nhẹ, nụ cười tự nhiên..."
              className="w-full rounded-lg border border-stone-300 p-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-hidden transition-all resize-none"
            />
          </div>
        )}
      </div>

      {enableCharacter && onApplyToAll && (
        <div className="pt-2 mt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
          <span>{characterPrompt.length} ký tự</span>
          <button
            type="button"
            onClick={onApplyToAll}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded-md border border-violet-200 transition-colors"
          >
            <CheckCheck className="w-3 h-3" />
            <span>Đồng bộ cho tất cả ảnh</span>
          </button>
        </div>
      )}
    </div>
  );
};

