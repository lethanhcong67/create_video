import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  Check,
  Trash2,
  Plus,
  Layers,
  Sparkles,
  CheckCheck,
  Package,
  Copy,
  FileText,
} from 'lucide-react';
import { OutfitReference, ApiConfig } from '../types';
import { fileToDataUrl } from '../utils/imageUtils';
import { updateOutfitPromptWithProductDetails } from '../utils/promptHelper';

interface OutfitSelectorProps {
  productName?: string;
  onChangeProductName?: (val: string) => void;
  productDescription?: string;
  onChangeProductDescription?: (val: string) => void;
  outfitPrompt: string;
  onChangePrompt: (val: string) => void;
  uploadedOutfits: OutfitReference[];
  onAddUploadedOutfits: (outfits: OutfitReference[]) => void;
  onUpdateUploadedOutfit?: (id: string, updates: Partial<OutfitReference>) => void;
  onRemoveUploadedOutfit: (id: string) => void;
  onClearUploadedOutfits: () => void;
  onApplyToAll?: () => void;
  uploadedOutfit?: OutfitReference | null;
  apiConfig?: ApiConfig;
  onOpenVisionSettings?: () => void;
}

export const OutfitSelector: React.FC<OutfitSelectorProps> = ({
  productName = '',
  onChangeProductName,
  productDescription = '',
  onChangeProductDescription,
  outfitPrompt,
  onChangePrompt,
  uploadedOutfits,
  onAddUploadedOutfits,
  onRemoveUploadedOutfit,
  onClearUploadedOutfits,
  onApplyToAll,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedOutfitId, setSelectedOutfitId] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Active outfit reference for inspection
  const activeOutfit =
    uploadedOutfits.find((o) => o.id === selectedOutfitId) ||
    uploadedOutfits[0] ||
    null;

  // Helper to generate default standard prompt
  const getStandardPrompt = (name: string, desc?: string) => {
    const trimmedName = name.trim();
    const trimmedDesc = (desc || '').trim();
    let target = 'sản phẩm';
    if (trimmedName && trimmedDesc) {
      target = `${trimmedName} (${trimmedDesc})`;
    } else if (trimmedName) {
      target = trimmedName;
    } else if (trimmedDesc) {
      target = `sản phẩm (${trimmedDesc})`;
    }
    return `thay ${target} ở hình image2 sang hình image1`;
  };

  const handleProductNameChange = (newName: string) => {
    if (onChangeProductName) {
      onChangeProductName(newName);
    }
    const updatedPrompt = updateOutfitPromptWithProductDetails(outfitPrompt, newName, productDescription);
    onChangePrompt(updatedPrompt);
  };

  const handleProductDescriptionChange = (newDesc: string) => {
    if (onChangeProductDescription) {
      onChangeProductDescription(newDesc);
    }
    const updatedPrompt = updateOutfitPromptWithProductDetails(outfitPrompt, productName, newDesc);
    onChangePrompt(updatedPrompt);
  };

  const handleApplyStandardPrompt = () => {
    onChangePrompt(getStandardPrompt(productName, productDescription));
  };

  const processFiles = async (fileList: FileList | File[]) => {
    const validFiles = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const newOutfits: OutfitReference[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const dataUrl = await fileToDataUrl(file);
        const refIndex = uploadedOutfits.length + i + 2; // ref2, ref3, ...
        const newOutfit: OutfitReference = {
          id: `outfit_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          previewUrl: dataUrl,
          dataUrl,
          mimeType: file.type || 'image/jpeg',
          description: `Sản phẩm tham chiếu ref${refIndex}: ${file.name}`,
          category: 'uploaded',
        };
        newOutfits.push(newOutfit);
      } catch (e) {
        console.error('Lỗi khi đọc file ảnh tham chiếu:', e);
      }
    }

    if (newOutfits.length > 0) {
      onAddUploadedOutfits(newOutfits);
      setSelectedOutfitId(newOutfits[0].id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleCopyPrompt = () => {
    if (!outfitPrompt) return;
    navigator.clipboard.writeText(outfitPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div id="outfit-selector-section" className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs flex flex-col justify-between space-y-3">
      <div>
        {/* Hidden Multi-file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          id="multi-outfit-file-input"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              processFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
              2
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-stone-900">
                Sản phẩm / trang phục thay thế (Tải lên ảnh tham chiếu)
              </h2>
              {uploadedOutfits.length > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {uploadedOutfits.length} ảnh
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm ảnh</span>
            </button>
            {uploadedOutfits.length > 0 && (
              <button
                type="button"
                onClick={onClearUploadedOutfits}
                className="text-[11px] text-stone-400 hover:text-rose-600 px-1.5 py-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                title="Xóa tất cả ảnh sản phẩm"
              >
                Xóa hết
              </button>
            )}
          </div>
        </div>

        {/* Upload & Prompt Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Left: Product Images Preview & Selector (cols 5) */}
          <div className="sm:col-span-5">
            {uploadedOutfits.length === 0 ? (
              <div
                id="multi-outfit-dropzone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all flex flex-col items-center justify-center h-full min-h-[120px] ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-stone-300 hover:border-emerald-400 bg-stone-50/50'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100/80 text-emerald-600 flex items-center justify-center mb-1.5 shadow-2xs">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-stone-800">
                  Kéo thả hoặc <span className="text-emerald-600 underline">chọn ảnh sản phẩm</span>
                </p>
                <p className="text-[10.5px] text-stone-500 mt-0.5">
                  Tải ảnh mẫu trang phục hoặc sản phẩm cần thay thế (ref2, ref3...)
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-stone-500 font-medium mb-1">
                  <span>Ảnh sản phẩm tham chiếu (ref2, ref3...):</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 max-h-[100px]">
                  {uploadedOutfits.map((outfit, index) => {
                    const isSelected = activeOutfit?.id === outfit.id;
                    return (
                      <div
                        key={outfit.id}
                        onClick={() => setSelectedOutfitId(outfit.id)}
                        className={`relative rounded-xl border p-1.5 flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-2xs'
                            : 'border-stone-200 hover:border-emerald-300 bg-stone-50'
                        }`}
                      >
                        <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-stone-200 bg-white shrink-0">
                          <img
                            src={outfit.previewUrl || outfit.dataUrl}
                            alt={outfit.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="max-w-[85px] leading-tight">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-emerald-800">
                              Ref {index + 2}
                            </span>
                          </div>
                          <span className="text-[10px] text-stone-700 font-medium truncate block" title={outfit.name}>
                            {outfit.name}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveUploadedOutfit(outfit.id);
                          }}
                          className="w-5 h-5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer ml-0.5"
                          title="Xóa ảnh này"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-12 h-12 rounded-xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-white hover:bg-emerald-50/40 flex items-center justify-center text-emerald-600 transition-colors cursor-pointer shrink-0"
                    title="Thêm ảnh sản phẩm khác"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Product Name, Product Details & Prompt Textarea (cols 7) */}
          <div className="sm:col-span-7 space-y-2">
            {/* Field 1: Tên sản phẩm */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="product-name-input" className="text-xs font-bold text-stone-800 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tên sản phẩm thay thế:</span>
                </label>
              </div>
              <input
                id="product-name-input"
                type="text"
                value={productName}
                onChange={(e) => handleProductNameChange(e.target.value)}
                placeholder="VD: cốc, tạp dề thêu hoa Mexico, áo sơ mi lụa trắng, đồng hồ dây da..."
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-hidden transition-all bg-white"
              />
            </div>

            {/* Field 2: Thông tin sản phẩm */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="product-description-input" className="text-xs font-bold text-stone-800 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                  <span>Thông tin chi tiết sản phẩm:</span>
                </label>
              </div>
              <input
                id="product-description-input"
                type="text"
                value={productDescription}
                onChange={(e) => handleProductDescriptionChange(e.target.value)}
                placeholder="VD: chất liệu gốm sứ trắng bóng, in hình mèo cute, quai cầm màu cam..."
                className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-hidden transition-all bg-white"
              />
            </div>

            {/* Field 3: Yêu cầu thay thế (Prompt) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="outfit-prompt-input" className="text-xs font-semibold text-stone-700 flex items-center gap-1">
                  <span>Yêu cầu thay thế chi tiết (Prompt):</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="text-[10.5px] font-semibold text-stone-500 hover:text-stone-800 flex items-center gap-0.5 cursor-pointer"
                    title="Sao chép prompt"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedPrompt ? 'Đã chép' : 'Chép'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyStandardPrompt}
                    className="text-[10.5px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                    title="Điền lại câu lệnh chuẩn"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Mẫu chuẩn</span>
                  </button>
                </div>
              </div>

              <textarea
                id="outfit-prompt-input"
                rows={2}
                value={outfitPrompt}
                onChange={(e) => onChangePrompt(e.target.value)}
                placeholder={`thay ${productName.trim() ? productName.trim() : 'sản phẩm'} ở hình image2 sang hình image1`}
                className="w-full rounded-lg border border-stone-300 p-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-hidden transition-all resize-none bg-stone-50/50 hover:bg-white focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {uploadedOutfits.length > 0 && onApplyToAll && (
        <div className="pt-2 mt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
          <span>AI sẽ truyền tải chính xác từng chi tiết theo ảnh tham chiếu vào ảnh gốc</span>
          <button
            type="button"
            onClick={onApplyToAll}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 transition-colors cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Đồng bộ cho tất cả ảnh</span>
          </button>
        </div>
      )}
    </div>
  );
};

