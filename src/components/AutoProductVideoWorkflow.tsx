import React, { useState, useRef, useEffect } from 'react';
import {
  Globe,
  Sparkles,
  Link,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Film,
  Camera,
  Layers,
  Wand2,
  Play,
  Copy,
  Check,
  Image as ImageIcon,
  Edit3,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Download,
  Eye,
  CheckCircle
} from 'lucide-react';
import { ApiConfig, CameraMovementType } from '../types';
import { CAMERA_PRESETS } from '../data/presets';

interface AutoProductVideoWorkflowProps {
  apiConfig: ApiConfig;
  onBatchEnqueueVideos: (
    items: Array<{
      prompt: string;
      cameraMovement: CameraMovementType;
      duration: '5' | '10';
      mode: 'std' | 'pro';
      aspectRatio: '16:9' | '9:16' | '1:1';
      cfgScale: number;
      model: string;
      startImageUrl?: string;
    }>
  ) => void;
}

export interface ScrapedProductData {
  url: string;
  title: string;
  description: string;
  images: string[];
  selectedImages: string[];
}

export interface ProductSpecifications {
  productName: string;
  material: string;
  shape: string;
  dimensions: string;
  designDetails: string;
  finish: string;
}

export interface VideoScriptScene {
  sceneNumber: number;
  sceneType: string;
  title: string;
  visualDescription: string;
  productFocus?: string;
  voiceover?: string;
  imagePrompt: string;
  videoPrompt: string;
  cameraMotion: CameraMovementType;
  duration: '5' | '10';
  selectedRefImage?: string;
  generatedImageUrl?: string;
  isGeneratingImage?: boolean;
  imageError?: string;
}

export interface VideoScriptOutput {
  scriptTitle: string;
  productSummary: string;
  adConcept: string;
  productSpecs?: ProductSpecifications;
  scenes: VideoScriptScene[];
}

const STORAGE_KEY_PRODUCT = 'clonevideo_product_data';
const STORAGE_KEY_SCRIPT = 'clonevideo_script_output';
const STORAGE_KEY_STEP = 'clonevideo_workflow_step';

export const AutoProductVideoWorkflow: React.FC<AutoProductVideoWorkflowProps> = ({
  apiConfig,
  onBatchEnqueueVideos,
}) => {
  // Scraped product data with session restore
  const [productData, setProductData] = useState<ScrapedProductData | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_PRODUCT);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Script & Analysis state with session restore
  const [scriptOutput, setScriptOutput] = useState<VideoScriptOutput | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_SCRIPT);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Step tracker: 1 = Scrape URL, 2 = Analyze & Script, 3 = Storyboard & Run
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(() => {
    try {
      const savedStep = sessionStorage.getItem(STORAGE_KEY_STEP);
      if (savedStep && ['1', '2', '3'].includes(savedStep)) {
        return Number(savedStep) as 1 | 2 | 3;
      }
      const savedScript = sessionStorage.getItem(STORAGE_KEY_SCRIPT);
      if (savedScript) return 3;
      const savedProduct = sessionStorage.getItem(STORAGE_KEY_PRODUCT);
      if (savedProduct) return 2;
    } catch {}
    return 1;
  });

  // Synchronized refs to prevent stale closure race conditions in async generators
  const scriptOutputRef = useRef<VideoScriptOutput | null>(scriptOutput);
  const productDataRef = useRef<ScrapedProductData | null>(productData);

  useEffect(() => {
    scriptOutputRef.current = scriptOutput;
    if (scriptOutput) {
      try {
        sessionStorage.setItem(STORAGE_KEY_SCRIPT, JSON.stringify(scriptOutput));
      } catch (e) {
        console.warn('Lỗi lưu scriptOutput vào sessionStorage:', e);
      }
    }
  }, [scriptOutput]);

  useEffect(() => {
    productDataRef.current = productData;
    if (productData) {
      try {
        sessionStorage.setItem(STORAGE_KEY_PRODUCT, JSON.stringify(productData));
      } catch (e) {
        console.warn('Lỗi lưu productData vào sessionStorage:', e);
      }
    }
  }, [productData]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_STEP, String(currentStep));
    } catch {}
  }, [currentStep]);

  // Form inputs
  const [productUrl, setProductUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Script & Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Global specs
  const [targetRatio, setTargetRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [targetMode, setTargetMode] = useState<'std' | 'pro'>('pro');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Batch Image Generation state
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);

  // Reset workflow and clear session storage
  const handleResetWorkflow = () => {
    if (window.confirm("Bạn có muốn làm mới toàn bộ quy trình để nhập link sản phẩm mới?")) {
      try {
        sessionStorage.removeItem(STORAGE_KEY_PRODUCT);
        sessionStorage.removeItem(STORAGE_KEY_SCRIPT);
        sessionStorage.removeItem(STORAGE_KEY_STEP);
      } catch {}
      setProductData(null);
      setScriptOutput(null);
      setProductUrl('');
      setCurrentStep(1);
    }
  };

  // Handle URL scraping
  const handleScrapeProductUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productUrl.trim()) return;

    setIsScraping(true);
    setScrapeError(null);

    try {
      const response = await fetch('/api/product/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl.trim() }),
      });

      const resText = await response.text();
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        console.error("Non-JSON scrape response:", resText.slice(0, 300));
        throw new Error(
          `Máy chủ trả về phản hồi không hợp lệ (${response.status}) khi cào URL sản phẩm.`
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Không thể cào dữ liệu từ đường dẫn web này');
      }

      const product = data.product || data;
      const images: string[] = Array.isArray(product.images)
        ? product.images
        : Array.isArray(data.images)
        ? data.images
        : [];
      const initialSelected = images.slice(0, 6);

      const newProductData: ScrapedProductData = {
        url: product.url || data.url || productUrl.trim(),
        title: product.title || data.title || 'Sản phẩm thương mại',
        description: product.description || data.description || 'Không có mô tả chi tiết',
        images: images,
        selectedImages: initialSelected,
      };

      setProductData(newProductData);
      productDataRef.current = newProductData;
      setCurrentStep(2);
    } catch (err: any) {
      setScrapeError(err?.message || 'Lỗi khi cào dữ liệu sản phẩm từ trang web');
    } finally {
      setIsScraping(false);
    }
  };

  // Toggle selection of scraped product images
  const toggleImageSelection = (imgUrl: string) => {
    if (!productData) return;
    const isSelected = productData.selectedImages.includes(imgUrl);
    let updated: string[];
    if (isSelected) {
      if (productData.selectedImages.length <= 1) return; // Keep at least 1 image
      updated = productData.selectedImages.filter((u) => u !== imgUrl);
    } else {
      updated = [...productData.selectedImages, imgUrl];
    }
    const updatedData = {
      ...productData,
      selectedImages: updated,
    };
    setProductData(updatedData);
    productDataRef.current = updatedData;
  };

  // Handle AI Product Analysis & Script Generation
  const handleGenerateScript = async () => {
    if (!productData) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const response = await fetch('/api/product/analyze-and-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: productData.title,
          description: productData.description,
          images: productData.selectedImages,
          customKey: apiConfig.apiKey,
          visionConfig: apiConfig.visionAnalysis,
          model: 'gemini-3.7-flash',
        }),
      });

      const resText = await response.text();
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        console.error("Non-JSON script response:", resText.slice(0, 300));
        throw new Error(
          `Máy chủ trả về phản hồi không hợp lệ (${response.status}) khi phân tích kịch bản.`
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Không thể tạo kịch bản video sản phẩm');
      }

      const script: VideoScriptOutput = data.script;

      // Assign default reference product images to each scene
      const refPool = productData.selectedImages.length > 0 ? productData.selectedImages : productData.images;
      const scenesWithRef = (script.scenes || []).map((sc, idx) => ({
        ...sc,
        selectedRefImage: sc.selectedRefImage || refPool[idx % refPool.length] || refPool[0],
      }));

      const finalScript: VideoScriptOutput = {
        ...script,
        scenes: scenesWithRef,
      };

      setScriptOutput(finalScript);
      scriptOutputRef.current = finalScript;
      setCurrentStep(3);
    } catch (err: any) {
      setAnalyzeError(err?.message || 'Lỗi khi phân tích kịch bản với AI');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Update scene in script safely using functional update to prevent race conditions & stale closures
  const handleUpdateScene = (index: number, updates: Partial<VideoScriptScene>) => {
    setScriptOutput((prev) => {
      if (!prev) return prev;
      const updatedScenes = prev.scenes.map((sc, idx) =>
        idx === index ? { ...sc, ...updates } : sc
      );
      const nextOutput = {
        ...prev,
        scenes: updatedScenes,
      };
      scriptOutputRef.current = nextOutput;
      try {
        sessionStorage.setItem(STORAGE_KEY_SCRIPT, JSON.stringify(nextOutput));
      } catch (e) {
        console.warn("Lỗi lưu sessionStorage:", e);
      }
      return nextOutput;
    });
  };

  // Generate Image for a Single Scene from its Reference Product Image
  const handleGenerateSceneImage = async (index: number, forceRegenerate = false) => {
    const currentScript = scriptOutputRef.current;
    const currentProduct = productDataRef.current;
    if (!currentScript || !currentProduct) return;
    const scene = currentScript.scenes[index];
    if (!scene) return;

    // Check if already generating to prevent accidental double clicks
    if (scene.isGeneratingImage) {
      console.log(`[Cảnh ${scene.sceneNumber}] Đang tạo ảnh, bỏ qua lệnh trùng lặp.`);
      return;
    }

    // If image is already generated and user did not explicitly force recreate, preserve it!
    if (scene.generatedImageUrl && !forceRegenerate) {
      console.log(`[Cảnh ${scene.sceneNumber}] Đã có ảnh phân cảnh, giữ nguyên.`);
      return;
    }

    const refImage = scene.selectedRefImage || currentProduct.selectedImages[0] || currentProduct.images[0];
    if (!refImage) {
      alert("Vui lòng chọn hoặc có ít nhất 1 ảnh sản phẩm tham chiếu.");
      return;
    }

    handleUpdateScene(index, { isGeneratingImage: true, imageError: undefined });

    try {
      const res = await fetch('/api/scene/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceImageUrl: refImage,
          prompt: scene.imagePrompt,
          aspectRatio: targetRatio,
          apiKey: apiConfig.apiKey,
          provider: apiConfig.activeProvider,
          gptImageConfig: apiConfig.gptImage,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Không thể tạo ảnh phân cảnh');
      }

      handleUpdateScene(index, {
        generatedImageUrl: resData.imageUrl,
        isGeneratingImage: false,
      });
    } catch (err: any) {
      console.error("Lỗi tạo ảnh phân cảnh:", err);
      handleUpdateScene(index, {
        isGeneratingImage: false,
        imageError: err.message || 'Lỗi khi tạo ảnh',
      });
    }
  };

  // Generate All Scene Images in Sequence (only missing images unless none exist)
  const handleGenerateAllSceneImages = async () => {
    const currentScript = scriptOutputRef.current;
    const currentProduct = productDataRef.current;
    if (!currentScript || !currentProduct || isGeneratingAllImages) return;

    setIsGeneratingAllImages(true);
    try {
      for (let i = 0; i < currentScript.scenes.length; i++) {
        // Always read latest live state from ref
        const liveScene = scriptOutputRef.current?.scenes[i];
        if (!liveScene?.generatedImageUrl) {
          await handleGenerateSceneImage(i, false);
        }
      }
    } finally {
      setIsGeneratingAllImages(false);
    }
  };

  // Enqueue a Single Scene to Create Video
  const handleEnqueueSingleScene = (index: number) => {
    if (!scriptOutput) return;
    const scene = scriptOutput.scenes[index];
    if (!scene) return;

    const startImage = scene.generatedImageUrl || scene.selectedRefImage || (productData ? productData.images[0] : undefined);

    onBatchEnqueueVideos([
      {
        prompt: `${scene.videoPrompt}, cinematic commercial ad movement, high fidelity 4k`,
        cameraMovement: scene.cameraMotion || 'zoom_in',
        duration: scene.duration || '5',
        mode: targetMode,
        aspectRatio: targetRatio,
        cfgScale: 0.6,
        model: apiConfig.kling?.model || 'kling-v2-6',
        startImageUrl: startImage,
      },
    ]);
  };

  // Enqueue all scenes to Create Video Studio
  const handleEnqueueAllScenes = () => {
    if (!scriptOutput) return;

    const itemsToEnqueue = scriptOutput.scenes.map((scene) => ({
      prompt: `${scene.videoPrompt}, cinematic commercial ad motion`,
      cameraMovement: scene.cameraMotion || 'zoom_in',
      duration: scene.duration || '5',
      mode: targetMode,
      aspectRatio: targetRatio,
      cfgScale: 0.6,
      model: apiConfig.kling?.model || 'kling-v2-6',
      startImageUrl: scene.generatedImageUrl || scene.selectedRefImage || (productData ? productData.images[0] : undefined),
    }));

    onBatchEnqueueVideos(itemsToEnqueue);
  };

  const copyPromptText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-2xl space-y-8 backdrop-blur-md">
      {/* Workflow Header & Step Progress */}
      <div className="space-y-6 border-b border-slate-800 pb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg ring-1 ring-white/20">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Tự động Tạo Video Quảng Cáo từ Link Website
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  AI Auto Workflow
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Tự động cào hình ảnh sản phẩm ➔ Tạo ảnh phân cảnh từ ảnh tham chiếu ➔ Tạo video chuyển động với Kling AI
              </p>
            </div>
          </div>

          {(productData || scriptOutput) && (
            <button
              type="button"
              onClick={handleResetWorkflow}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 hover:border-rose-500/60 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-rose-200 transition-all flex items-center gap-2 shadow-sm"
              title="Làm mới để bắt đầu nhập link sản phẩm mới"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Bắt đầu URL mới</span>
            </button>
          )}
        </div>

        {/* Step Indicator Pills */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
              currentStep === 1
                ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-lg ring-1 ring-indigo-400/20'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                currentStep === 1
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              1
            </div>
            <div className="truncate">
              <div className="text-xs font-bold">1. Nhập Link Sản Phẩm</div>
              <div className="text-[10px] text-slate-400 truncate">Cào dữ liệu & hình ảnh gốc</div>
            </div>
          </button>

          <button
            type="button"
            disabled={!productData}
            onClick={() => setCurrentStep(2)}
            className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 disabled:opacity-40 cursor-pointer ${
              currentStep === 2
                ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-lg ring-1 ring-indigo-400/20'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                currentStep === 2
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              2
            </div>
            <div className="truncate">
              <div className="text-xs font-bold">2. Phân Tích & Kịch Bản</div>
              <div className="text-[10px] text-slate-400 truncate">AI lên storyboard các cảnh</div>
            </div>
          </button>

          <button
            type="button"
            disabled={!scriptOutput}
            onClick={() => setCurrentStep(3)}
            className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 disabled:opacity-40 cursor-pointer ${
              currentStep === 3
                ? 'bg-indigo-950/80 border-indigo-500 text-white shadow-lg ring-1 ring-indigo-400/20'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                currentStep === 3
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              3
            </div>
            <div className="truncate">
              <div className="text-xs font-bold">3. Tạo Ảnh & Video Phân Cảnh</div>
              <div className="text-[10px] text-slate-400 truncate">Dùng ảnh tham chiếu tạo video</div>
            </div>
          </button>
        </div>
      </div>

      {/* STEP 1: INPUT PRODUCT URL & AUTO SCRAPE */}
      {currentStep === 1 && (
        <div className="space-y-6 max-w-3xl mx-auto py-4">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-white">Dán Link Sản Phẩm Thương Mại Điện Tử</h3>
            <p className="text-xs text-slate-400">
              Hệ thống hỗ trợ các trang Shopify, WooCommerce, Shopee, Amazon, Etsy, Joymade,...
            </p>
          </div>

          <form onSubmit={handleScrapeProductUrl} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <Globe className="w-5 h-5 text-indigo-400" />
              </div>
              <input
                type="url"
                required
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://joymade.co/products/... hoặc https://yourstore.com/product/..."
                className="w-full pl-12 pr-4 py-4 bg-slate-950/90 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-inner"
              />
            </div>

            {scrapeError && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scrapeError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isScraping || !productUrl.trim()}
              className="w-full py-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 shadow-xl shadow-indigo-950/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isScraping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
                  <span>Đang bóc tách thông tin & cào hình ảnh sản phẩm...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Cào Dữ Liệu & Phân Tích Sản Phẩm Ngay</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: REVIEW SCRAPED DATA & GENERATE SCRIPT */}
      {currentStep === 2 && productData && (
        <div className="space-y-6">
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Sản phẩm đã cào thành công
                </span>
                <h3 className="text-base font-bold text-white mt-1">{productData.title}</h3>
              </div>
              <a
                href={productData.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-400 hover:underline flex items-center gap-1 shrink-0"
              >
                <span>Mở link gốc</span>
                <Link className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Description */}
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-1">Mô tả sản phẩm:</span>
              <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                {productData.description || 'Không có mô tả chi tiết'}
              </p>
            </div>

            {/* Scraped Images Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  Hình ảnh tham chiếu ({productData.selectedImages.length}/{productData.images.length} được chọn)
                </span>
                <span className="text-[11px] text-slate-400">
                  Nhấp vào ảnh để chọn làm hình ảnh tham chiếu
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {productData.images.map((imgUrl, idx) => {
                  const isSelected = productData.selectedImages.includes(imgUrl);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleImageSelection(imgUrl)}
                      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                        isSelected
                          ? 'border-indigo-500 shadow-md shadow-indigo-950 ring-2 ring-indigo-400/40'
                          : 'border-slate-800 opacity-50 hover:opacity-80'
                      }`}
                    >
                      <img
                        src={imgUrl}
                        alt={`product-img-${idx}`}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {analyzeError && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{analyzeError}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-5 py-3 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Quay lại bước 1
            </button>

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={handleGenerateScript}
              className="py-3.5 px-8 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 shadow-xl shadow-indigo-950/60 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
                  <span>Gemini 3.7 Flash đang phân tích chi tiết & lên kịch bản...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>AI Lên Kịch Bản Phân Cảnh & Tiến Hành Bước 3</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: STORYBOARD WITH SCENE IMAGE GENERATION & VIDEO CREATION */}
      {currentStep === 3 && scriptOutput && (
        <div className="space-y-8">
          {/* Script Header Summary */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                  Concept Kịch Bản Quảng Cáo
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">{scriptOutput.scriptTitle}</h3>
                <p className="text-xs text-slate-400 mt-1">{scriptOutput.adConcept}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateScript}
                  disabled={isAnalyzing}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  <span>Tạo lại kịch bản</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-slate-200">Tóm tắt USP sản phẩm:</strong> {scriptOutput.productSummary}
            </p>

            {/* Detailed Product Physical Specifications Breakdown */}
            {scriptOutput.productSpecs && (
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Phân Tích Chi Tiết Vật Lý & Thiết Kế Sản Phẩm (Được đưa vào Prompt hình ảnh):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">🏷️ Tên & Loại sản phẩm</span>
                    <p className="text-xs text-slate-200 font-medium">{scriptOutput.productSpecs.productName}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">💎 Chất liệu thực tế</span>
                    <p className="text-xs text-slate-200 font-medium">{scriptOutput.productSpecs.material}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">📐 Hình dạng vật lý</span>
                    <p className="text-xs text-slate-200 font-medium">{scriptOutput.productSpecs.shape}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">📏 Kích thước & Tỷ lệ thật</span>
                    <p className="text-xs text-slate-200 font-medium">{scriptOutput.productSpecs.dimensions}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">🎨 Họa tiết & Thiết kế in</span>
                    <p className="text-xs text-slate-200 font-medium">{scriptOutput.productSpecs.designDetails}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">✨ Bề mặt & Phụ kiện</span>
                    <p className="text-xs text-slate-200 font-medium">{scriptOutput.productSpecs.finish}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Storyboard Scenes Grid */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Bảng Phân Cảnh ({scriptOutput.scenes.length} cảnh) - Tạo Ảnh & Video
              </h3>

              {/* Global Render Specs - Locked to 9:16 for POD */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 text-xs font-bold shadow-sm">
                    <span>📐 Tỷ lệ: 9:16 (Dọc TikTok/Reels)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-bold shadow-sm">
                    <span>🎯 Chuẩn POD</span>
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {(['std', 'pro'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTargetMode(m)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                        targetMode === m ? 'bg-indigo-600 text-white' : 'text-slate-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Batch Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-950/40 border border-indigo-800/40 p-3.5 rounded-2xl">
              <div className="text-xs text-indigo-200">
                💡 <strong>Quy trình đề xuất:</strong> Bấm <strong>"Tạo ảnh phân cảnh"</strong> trước ➜ Xem ưng ý ➜ Bấm <strong>"Tạo video"</strong> để Kling AI render chuyển động!
              </div>

              <div className="flex items-center gap-2">
                {(() => {
                  const missingCount = scriptOutput.scenes.filter((s) => !s.generatedImageUrl).length;
                  return (
                    <button
                      type="button"
                      disabled={isGeneratingAllImages}
                      onClick={handleGenerateAllSceneImages}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isGeneratingAllImages ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isGeneratingAllImages
                          ? 'Đang tạo ảnh...'
                          : missingCount === 0
                          ? `✅ Đã tạo đủ ${scriptOutput.scenes.length} ảnh phân cảnh`
                          : `🎨 Tạo ảnh ${missingCount}/${scriptOutput.scenes.length} cảnh còn lại`}
                      </span>
                    </button>
                  );
                })()}

                <button
                  type="button"
                  onClick={handleEnqueueAllScenes}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 shadow-md transition-all flex items-center gap-1.5"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>🚀 Tạo Video Toàn Bộ Cảnh</span>
                </button>
              </div>
            </div>

            {/* Individual Scene Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {scriptOutput.scenes.map((scene, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all"
                >
                  <div className="space-y-3.5">
                    {/* Scene Card Header */}
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-cyan-400" />
                        {scene.title || `Cảnh ${scene.sceneNumber}`}
                      </span>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                        {scene.sceneType || 'Scene'}
                      </span>
                    </div>

                    {/* Section 1: Choose Reference Product Image */}
                    <div className="space-y-1.5 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3 text-cyan-400" />
                          Ảnh sản phẩm tham chiếu cho cảnh này:
                        </span>
                        <span className="text-[10px] text-slate-500">Nhấp để đổi</span>
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        {(productData?.selectedImages || []).map((imgUrl, imgIdx) => {
                          const isRef = scene.selectedRefImage === imgUrl;
                          return (
                            <button
                              key={imgIdx}
                              type="button"
                              onClick={() => handleUpdateScene(idx, { selectedRefImage: imgUrl })}
                              className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                                isRef
                                  ? 'border-cyan-400 ring-2 ring-cyan-400/30'
                                  : 'border-slate-800 opacity-60 hover:opacity-90'
                              }`}
                            >
                              <img
                                src={imgUrl}
                                alt="ref"
                                className="w-full h-full object-cover"
                              />
                              {isRef && (
                                <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-cyan-500 text-white flex items-center justify-center text-[8px]">
                                  ✓
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section 2: Scene Visual Image (Generated or Placeholder) */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-300 block flex items-center justify-between">
                        <span>🖼️ Khung hình phân cảnh (Tỷ lệ dọc 9:16 POD):</span>
                        <span className="text-[10px] text-cyan-400 font-normal">Họa tiết thiết kế rõ nét 100%</span>
                      </span>

                      {scene.generatedImageUrl ? (
                        <div className="relative aspect-[9/16] max-h-[380px] w-auto mx-auto rounded-xl overflow-hidden border border-emerald-500/40 shadow-xl bg-black group/img">
                          <img
                            src={scene.generatedImageUrl}
                            alt={`Scene ${scene.sceneNumber}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shadow-md">
                            <CheckCircle className="w-3 h-3" />
                            <span>9:16 • Rõ nét họa tiết POD</span>
                          </div>

                          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 opacity-90 group-hover/img:opacity-100 transition-opacity">
                            <a
                              href={scene.generatedImageUrl}
                              download={`scene_${scene.sceneNumber}.png`}
                              className="px-2 py-1 rounded bg-slate-900/90 text-white hover:bg-indigo-600 text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-md"
                            >
                              <Download className="w-3 h-3" />
                              <span>Tải PNG</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => handleGenerateSceneImage(idx, true)}
                              disabled={scene.isGeneratingImage}
                              className="px-2 py-1 rounded bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-md"
                            >
                              <RefreshCw className={`w-3 h-3 ${scene.isGeneratingImage ? 'animate-spin' : ''}`} />
                              <span>Tạo lại</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative aspect-[9/16] max-h-[320px] w-auto mx-auto rounded-xl overflow-hidden border border-dashed border-slate-700 bg-slate-900/60 flex flex-col items-center justify-center p-4 text-center">
                          {scene.isGeneratingImage ? (
                            <div className="space-y-2">
                              <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto" />
                              <span className="text-xs font-bold text-indigo-300">
                                AI đang khởi tạo ảnh phân cảnh từ ảnh tham chiếu...
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <ImageIcon className="w-6 h-6 text-slate-500 mx-auto" />
                              <span className="text-xs text-slate-400 block">
                                Chưa tạo ảnh cho cảnh này
                              </span>
                              <button
                                type="button"
                                onClick={() => handleGenerateSceneImage(idx, false)}
                                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all inline-flex items-center gap-1.5"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Tạo Ảnh Phân Cảnh Ngay</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {scene.imageError && (
                        <div className="text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>{scene.imageError}</span>
                        </div>
                      )}
                    </div>

                    {/* Visual Focus & Cinematography (No voiceover) */}
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          Tiêu điểm thị giác (Visual Focus):
                        </span>
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/20">
                          Không lời thoại • 100% Điện ảnh
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium leading-relaxed">
                        {scene.productFocus || scene.visualDescription}
                      </p>
                    </div>

                    {/* Camera Movement Selector */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">📷 Góc quay Camera:</label>
                      <select
                        value={scene.cameraMotion}
                        onChange={(e) =>
                          handleUpdateScene(idx, { cameraMotion: e.target.value as CameraMovementType })
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {CAMERA_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.title} ({preset.badge})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Prompts Section (Image Prompt + Video Prompt) */}
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-400">Prompt tạo hình ảnh (Image Prompt):</span>
                          <button
                            type="button"
                            onClick={() => copyPromptText(scene.imagePrompt, idx + 100)}
                            className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            {copiedIndex === idx + 100 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>Copy</span>
                          </button>
                        </div>
                        <textarea
                          value={scene.imagePrompt}
                          onChange={(e) => handleUpdateScene(idx, { imagePrompt: e.target.value })}
                          rows={2}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-400">Prompt tạo video chuyển động (Motion Prompt):</span>
                          <button
                            type="button"
                            onClick={() => copyPromptText(scene.videoPrompt, idx)}
                            className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>Copy</span>
                          </button>
                        </div>
                        <textarea
                          value={scene.videoPrompt}
                          onChange={(e) => handleUpdateScene(idx, { videoPrompt: e.target.value })}
                          rows={2}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions for this individual scene */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={scene.isGeneratingImage}
                      onClick={() => handleGenerateSceneImage(idx)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {scene.isGeneratingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                      <span>{scene.generatedImageUrl ? 'Tạo lại ảnh' : 'Tạo ảnh cảnh này'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleEnqueueSingleScene(idx)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md transition-all flex items-center gap-1.5"
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Tạo Video Cảnh Này</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Big Batch Execution CTA */}
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border border-indigo-800/60 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div>
              <h3 className="text-base font-bold text-white">Khởi Tạo Toàn Bộ {scriptOutput.scenes.length} Video Phân Cảnh Ngay</h3>
              <p className="text-xs text-slate-300 mt-1">
                Tự động gửi tất cả ảnh phân cảnh và prompt tương ứng sang Kling AI để render video song song
              </p>
            </div>

            <button
              type="button"
              onClick={handleEnqueueAllScenes}
              className="py-4 px-10 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 shadow-xl shadow-indigo-950/80 transition-all inline-flex items-center gap-2"
            >
              <Wand2 className="w-5 h-5 animate-bounce" />
              <span>Gửi {scriptOutput.scenes.length} Phân Cảnh Vào Hàng Đợi Render Video AI</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
