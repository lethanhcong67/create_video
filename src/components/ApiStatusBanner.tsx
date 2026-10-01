import React from 'react';
import { KeyRound, ShieldCheck, CheckCircle2, Wand2, Sparkles, SlidersHorizontal } from 'lucide-react';
import { ApiConfig } from '../types';

interface ApiStatusBannerProps {
  config: ApiConfig;
  systemHasKey: boolean;
  systemHasOpenAiKey?: boolean;
  onOpenSettings: () => void;
}

export const ApiStatusBanner: React.FC<ApiStatusBannerProps> = ({
  config,
  systemHasKey,
  systemHasOpenAiKey = false,
  onOpenSettings,
}) => {
  const isGptActive = config.activeProvider === 'gpt-image-2';

  // GPT status
  const isUsingCustomGpt = Boolean(config.gptImage?.isCustomKeyActive && config.gptImage?.apiKey);
  const isGptReady = isUsingCustomGpt || systemHasOpenAiKey;

  // Gemini status
  const isUsingCustomGemini = Boolean(config.isCustomKeyActive && config.apiKey);
  const isGeminiReady = isUsingCustomGemini || systemHasKey;

  // Current active status
  const isCurrentUsingCustom = isGptActive ? isUsingCustomGpt : isUsingCustomGemini;
  const isCurrentReady = isGptActive ? isGptReady : isGeminiReady;
  const currentModel = isGptActive
    ? (config.gptImage?.model || 'gpt-image-2')
    : (config.model || 'gemini-3.1-flash-image');

  return (
    <div
      id="api-status-bar"
      className={`rounded-2xl border p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
        isGptActive
          ? 'bg-gradient-to-r from-emerald-50/40 via-white to-white border-emerald-200/90'
          : 'bg-white border-stone-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isGptActive
              ? isCurrentReady
                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
              : isCurrentUsingCustom
              ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
              : isCurrentReady
              ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
              : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
          }`}
        >
          {isGptActive ? (
            <Wand2 className="w-5 h-5" />
          ) : isCurrentUsingCustom ? (
            <ShieldCheck className="w-5 h-5" />
          ) : isCurrentReady ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <KeyRound className="w-5 h-5" />
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <span>Động cơ:</span>
              {isGptActive ? (
                <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                  <Wand2 className="w-3.5 h-3.5" />
                  OpenAI GPT-Image-2
                </span>
              ) : (
                <span className="text-indigo-700 font-extrabold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Google Gemini
                </span>
              )}
            </span>

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isCurrentUsingCustom
                  ? isGptActive ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-700'
                  : isCurrentReady
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isCurrentUsingCustom ? 'Khóa riêng' : isCurrentReady ? 'Khóa mặc định' : 'Chưa nhập Key'}
            </span>

            <span className="text-[11px] font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200/60">
              Model: {currentModel}
            </span>
          </div>

        </div>
      </div>

      <button
        id="open-api-config-btn"
        type="button"
        onClick={onOpenSettings}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 self-end sm:self-auto shrink-0 shadow-2xs ${
          isGptActive
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-emerald-100'
            : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-200/80'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Cấu hình API & Key</span>
      </button>
    </div>
  );
};
