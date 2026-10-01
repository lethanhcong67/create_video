import React from 'react';
import { Video, Settings, RotateCcw, Sparkles, Film, Database } from 'lucide-react';
import { ApiConfig } from '../types';

interface HeaderProps {
  apiConfig: ApiConfig;
  videoCount: number;
  completedCount: number;
  onReset: () => void;
  onOpenApiSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  apiConfig,
  videoCount,
  completedCount,
  onReset,
  onOpenApiSettings,
}) => {
  const hasGemini = Boolean(apiConfig.apiKey || apiConfig.isCustomKeyActive);
  const hasKling = Boolean(apiConfig.kling?.apiKey || apiConfig.kling?.accessKey);

  return (
    <header
      id="app-header"
      className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 transition-all shadow-lg"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Title and Branding */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 ring-1 ring-white/10">
            <Video className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                CREATE VIDEO <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">AI Studio</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1">
              Tự động phân tích link sản phẩm, lên kịch bản và tạo Video quảng cáo với Gemini & Kling AI
            </p>
          </div>
        </div>

        {/* Action Controls & Service Badges */}
        <div className="flex items-center flex-wrap gap-2.5 self-end sm:self-auto">
          {/* API Status Badges */}
          <div className="hidden md:flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                hasKling
                  ? 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80'
                  : 'text-slate-400 bg-slate-800/60 border-slate-700'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Kling AI: {hasKling ? 'Sẵn sàng' : 'Chưa nhập key'}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                hasGemini
                  ? 'text-purple-400 bg-purple-950/60 border-purple-800/80'
                  : 'text-slate-400 bg-slate-800/60 border-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Gemini AI: {hasGemini ? 'Sẵn sàng' : 'Chưa nhập key'}
            </span>
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors"
            title="Làm mới không gian làm việc"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          {/* API Settings button */}
          <button
            id="open-api-settings-btn"
            type="button"
            onClick={onOpenApiSettings}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-400/30 transition-all shadow-md shadow-indigo-900/30"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Cấu hình API</span>
          </button>
        </div>
      </div>
    </header>
  );
};
