import { BatchImageItem, BatchSettings, OutfitReference } from '../types';

/**
 * Automatically updates the outfit prompt when the product name or product description changes.
 * Replaces "sản phẩm" with the product name and description (if provided),
 * and reverts to "sản phẩm" if both are cleared.
 */
export const updateOutfitPromptWithProductDetails = (
  currentPrompt: string,
  newProductName: string,
  newProductDescription?: string
): string => {
  const prodName = newProductName.trim();
  const prodDesc = (newProductDescription || '').trim();

  let targetLabel = 'sản phẩm';
  if (prodName && prodDesc) {
    targetLabel = `${prodName} (${prodDesc})`;
  } else if (prodName) {
    targetLabel = prodName;
  } else if (prodDesc) {
    targetLabel = `sản phẩm (${prodDesc})`;
  }

  if (!currentPrompt || !currentPrompt.trim()) {
    return `thay ${targetLabel} ở hình image2 sang hình image1`;
  }

  // Check if prompt matches standard pattern: "thay <anything> ở hình <rest>"
  const match = currentPrompt.match(/^thay\s+(.+?)\s+(ở\s+hình\s+.*)$/i);
  if (match) {
    const rest = match[2];
    return `thay ${targetLabel} ${rest}`;
  }

  // Check if prompt matches "thay <anything>" without "ở hình"
  const matchShort = currentPrompt.match(/^thay\s+(.+?)$/i);
  if (matchShort) {
    return `thay ${targetLabel} ở hình image2 sang hình image1`;
  }

  // If prompt contains the exact word "sản phẩm" anywhere
  if (currentPrompt.includes('sản phẩm')) {
    return currentPrompt.replace('sản phẩm', targetLabel);
  }

  return `thay ${targetLabel} ở hình image2 sang hình image1`;
};

// Backwards compatibility alias
export const updateOutfitPromptWithProductName = (
  currentPrompt: string,
  newProductName: string,
  _previousProductName?: string
): string => {
  return updateOutfitPromptWithProductDetails(currentPrompt, newProductName);
};

/**
 * Constructs the standard prompt text for a specific pipeline row item
 * taking into account all row-specific overrides (character, background, reference images, outfit, subtitles, etc.)
 */
export const generateFullPromptText = (
  item: BatchImageItem,
  settings: BatchSettings,
  uploadedOutfits: OutfitReference[] = [],
  uploadedOutfit?: OutfitReference | null
): string => {
  // If user explicitly entered/saved a custom prompt for this row, ALWAYS prioritize that prompt!
  const custom = (item.customPrompt || item.appliedConfig?.customPrompt)?.trim();
  if (custom) {
    return custom;
  }

  const isCharEnabled = Boolean(item.appliedConfig?.enableCharacter);
  const charPrompt = item.appliedConfig?.characterPrompt?.trim() || '';

  const isBgEnabled = Boolean(item.appliedConfig?.enableBackground);
  const bgPrompt = (item.appliedConfig?.backgroundPrompt !== undefined ? item.appliedConfig.backgroundPrompt : settings.backgroundPrompt)?.trim() || '';

  const isOutfitEnabled = item.appliedConfig?.enableOutfit !== false;
  const outfitPrompt = item.appliedConfig?.outfitPrompt?.trim() || settings.outfitPrompt?.trim() || '';

  const removeSubtitles = settings.removeSubtitles ?? true;

  const prods = item.appliedConfig?.productReferences && item.appliedConfig.productReferences.length > 0
    ? item.appliedConfig.productReferences
    : (uploadedOutfits.length > 0 ? uploadedOutfits : (uploadedOutfit ? [uploadedOutfit] : []));

  const isCharChange = Boolean(isCharEnabled && charPrompt);
  const isBgChange = Boolean(isBgEnabled && bgPrompt);
  const productName = (item.appliedConfig?.productName || settings.productName || '').trim();
  const productDescription = (item.appliedConfig?.productDescription || settings.productDescription || '').trim();

  let targetLabel = 'sản phẩm';
  if (productName && productDescription) {
    targetLabel = `${productName} (${productDescription})`;
  } else if (productName) {
    targetLabel = productName;
  } else if (productDescription) {
    targetLabel = `sản phẩm (${productDescription})`;
  }

  const parts: string[] = [];

  // 1. Thay nhân vật (nếu có)
  if (isCharChange) {
    parts.push(`thay nhân vật thành ${charPrompt}`);
  }

  // 2. Thay bối cảnh (nếu có)
  if (isBgChange) {
    parts.push(`thay bối cảnh ${bgPrompt}`);
  }

  // 3. Thay sản phẩm ở hình image2 sang hình image1 (phổ quát cho mọi loại sản phẩm)
  if (isOutfitEnabled) {
    if (prods.length > 1) {
      const refList = prods.map((_, idx) => `image${idx + 2}`).join(', ');
      parts.push(`thay ${targetLabel} ở hình ${refList} sang hình image1 (xóa bỏ sản phẩm cũ ở image1 và thay thế chính xác bằng sản phẩm mới từ ${refList})`);
    } else {
      parts.push(`thay ${targetLabel} ở hình image2 sang hình image1 (xóa bỏ sản phẩm cũ ở image1 và thay thế chính xác bằng sản phẩm mới từ image2)`);
    }
    // If extra outfit prompt notes are provided, append them cleanly
    if (
      outfitPrompt &&
      !outfitPrompt.toLowerCase().includes('thay sản phẩm ở hình image2') &&
      !outfitPrompt.toLowerCase().includes('thay sản phẩm ở hình ref2') &&
      !outfitPrompt.toLowerCase().includes('thay thế chính xác') &&
      outfitPrompt.trim() !== `thay ${targetLabel} ở hình image2 sang hình image1`
    ) {
      parts.push(outfitPrompt);
    }
  }

  // 4. Luôn mặc định xóa phụ đề subtext trong hình
  parts.push('xóa phụ đề subtext trong hình');

  // 5. Giữ nguyên bối cảnh, bố cục và người mẫu (nếu có) mà không bảo toàn sản phẩm cũ
  if (!isCharChange && !isBgChange) {
    parts.push('giữ nguyên bố cục, ánh sáng, phông nền và người mẫu (nếu có)');
  } else if (!isBgChange) {
    parts.push('giữ nguyên bố cục, ánh sáng và phông nền');
  } else if (!isCharChange) {
    parts.push('giữ nguyên người mẫu và tư thế (nếu có)');
  }

  // 6. Luôn có tỉ lệ khung hình 9:16 ở cuối prompt
  parts.push(`tỉ lệ khung hình ${settings.aspectRatio || '9:16'}`);

  return parts.join(', ');
};
