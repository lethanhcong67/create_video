import React from 'react';
import { Ratio } from 'lucide-react';
import { BatchSettings } from '../types';

interface SubtitleSettingsProps {
  settings: BatchSettings;
  onChangeSettings: (newSettings: Partial<BatchSettings>) => void;
}

export const SubtitleSettings: React.FC<SubtitleSettingsProps> = ({
  settings,
  onChangeSettings,
}) => {
  const aspectRatios: Array<{ id: BatchSettings['aspectRatio']; label: string; title: string }> = [
    { id: '9:16', label: '9:16 (Dọc)', title: 'Dọc TikTok / Story / Reels (Mặc định)' },
    { id: '3:4', label: '3:4', title: 'Chân dung 3:4' },
    { id: '1:1', label: '1:1', title: 'Vuông 1:1' },
    { id: '4:3', label: '4:3', title: 'Tiêu chuẩn 4:3' },
    { id: '16:9', label: '16:9', title: 'Màn ngang 16:9' },
  ];

  return (
    <div id="subtitle-settings-section" className="bg-white rounded-xl border border-stone-200 px-3 py-2 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
        <Ratio className="w-4 h-4 text-indigo-600" />
        <span>Tỉ lệ khung hình xuất ra:</span>
      </div>
      <div className="flex items-center gap-1">
        {aspectRatios.map((ar) => (
          <button
            key={ar.id}
            type="button"
            title={ar.title}
            onClick={() => onChangeSettings({ aspectRatio: ar.id })}
            className={`text-xs font-bold px-2.5 py-1 rounded-md transition-all cursor-pointer ${
              settings.aspectRatio === ar.id
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            {ar.label}
          </button>
        ))}
      </div>
    </div>
  );
};

