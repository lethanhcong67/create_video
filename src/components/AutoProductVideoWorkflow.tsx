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
  CheckCircle,
  Tag,
  Box,
  Maximize,
  Palette,
  Save,
  X,
  ShieldCheck,
  Scan,
  FileText
} from 'lucide-react';
import { ApiConfig, CameraMovementType } from '../types';
import { CAMERA_PRESETS, POD_SCENE_ARCHETYPES } from '../data/presets';

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
  category?: string;
  material: string;
  shape: string;
  dimensions: string;
  designDetails: string;
  finish: string;
  keyFeatures?: string;
  promptSnippet?: string;
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
  retryAttempt?: number;
  retryStatusText?: string;
}

export interface VideoScriptOutput {
  scriptTitle: string;
  productSummary: string;
  adConcept: string;
  productSpecs?: ProductSpecifications;
  scenes: VideoScriptScene[];
}

const STORAGE_KEY_PRODUCT = 'clonevideo_product_data';
const STORAGE_KEY_SPECS = 'clonevideo_product_specs';
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

  // Dedicated Product Specifications state (Pre-analyzed & editable)
  const [productSpecs, setProductSpecs] = useState<ProductSpecifications | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_SPECS);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isAnalyzingSpecs, setIsAnalyzingSpecs] = useState(false);
  const [specsError, setSpecsError] = useState<string | null>(null);
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [editSpecsForm, setEditSpecsForm] = useState<ProductSpecifications>({
    productName: '',
    category: '',
    material: '',
    shape: '',
    dimensions: '',
    designDetails: '',
    finish: '',
    keyFeatures: '',
    promptSnippet: '',
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
  const productSpecsRef = useRef<ProductSpecifications | null>(productSpecs);

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
    productSpecsRef.current = productSpecs;
    if (productSpecs) {
      try {
        sessionStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(productSpecs));
      } catch (e) {
        console.warn('Lỗi lưu productSpecs vào sessionStorage:', e);
      }
    }
  }, [productSpecs]);

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

  // 1-Click End-to-End Pipeline state
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [autoCurrentStage, setAutoCurrentStage] = useState<
    'idle' | 'scraping' | 'analyzing_specs' | 'generating_script' | 'generating_images' | 'enqueueing_videos' | 'done'
  >('idle');
  const [autoStageMessage, setAutoStageMessage] = useState<string>('');

  // Reset workflow and clear session storage
  const handleResetWorkflow = () => {
    if (window.confirm("Bạn có muốn làm mới toàn bộ quy trình để nhập link sản phẩm mới?")) {
      try {
        sessionStorage.removeItem(STORAGE_KEY_PRODUCT);
        sessionStorage.removeItem(STORAGE_KEY_SPECS);
        sessionStorage.removeItem(STORAGE_KEY_SCRIPT);
        sessionStorage.removeItem(STORAGE_KEY_STEP);
      } catch {}
      setProductData(null);
      setProductSpecs(null);
      setScriptOutput(null);
      setProductUrl('');
      setIsAutoRunning(false);
      setAutoCurrentStage('idle');
      setAutoStageMessage('');
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
      setProductSpecs(null);
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

  // 1. DEDICATED PRE-ANALYSIS: Phân tích chi tiết đặc tính sản phẩm TRƯỚC
  const handleAnalyzeProductDetails = async () => {
    if (!productData) return;
    setIsAnalyzingSpecs(true);
    setSpecsError(null);

    try {
      const response = await fetch('/api/product/analyze-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: productData.title,
          description: productData.description,
          images: productData.selectedImages.length > 0 ? productData.selectedImages : productData.images,
          customKey: apiConfig.apiKey,
          visionConfig: apiConfig.visionAnalysis,
          model: 'gemini-3.7-flash',
        }),
      });

      const resText = await response.text();
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`Máy chủ trả về dữ liệu không hợp lệ (${response.status}) khi phân tích chi tiết sản phẩm.`);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Không thể phân tích đặc tính sản phẩm');
      }

      const specs: ProductSpecifications = data.productSpecs;
      setProductSpecs(specs);
      productSpecsRef.current = specs;
      setEditSpecsForm(specs);
      try {
        sessionStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(specs));
      } catch {}
    } catch (err: any) {
      setSpecsError(err?.message || 'Lỗi khi phân tích chi tiết sản phẩm với Gemini AI');
    } finally {
      setIsAnalyzingSpecs(false);
    }
  };

  // Save edits to product specifications
  const handleSaveSpecsEdits = () => {
    setProductSpecs(editSpecsForm);
    productSpecsRef.current = editSpecsForm;
    try {
      sessionStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(editSpecsForm));
    } catch {}
    setIsEditingSpecs(false);
  };

  // 2. SCRIPT & PROMPT GENERATION: Lên kịch bản và NHÚNG TRỰC TIẾP THÔNG SỐ VÀO TỪNG PROMPT
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
          images: productData.selectedImages.length > 0 ? productData.selectedImages : productData.images,
          productSpecs: productSpecs || undefined, // Inject pre-analyzed and reviewed specs!
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
      if (script.productSpecs) {
        setProductSpecs(script.productSpecs);
        productSpecsRef.current = script.productSpecs;
        setEditSpecsForm(script.productSpecs);
        try {
          sessionStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(script.productSpecs));
        } catch {}
      }

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

      // TỰ ĐỘNG KÍCH HOẠT CƠ CHẾ TẠO ẢNH ĐA LUỒNG (5 ẢNH CÙNG LÚC, RETRY 5 LẦN, DELAY 5S)
      setTimeout(() => {
        handleGenerateAllSceneImagesParallel(finalScript, productData);
      }, 100);
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

  // Concurrency pool runner for running up to 5 tasks in parallel simultaneously
  const runWithConcurrency = async <T,>(tasks: (() => Promise<T>)[], limit = 5): Promise<T[]> => {
    const results: T[] = [];
    let taskIdx = 0;
    const worker = async () => {
      while (taskIdx < tasks.length) {
        const current = taskIdx++;
        try {
          results[current] = await tasks[current]();
        } catch (e) {
          console.error(`Task ${current} failed in worker:`, e);
        }
      }
    };
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  };

  // Generate Image for a Single Scene with Auto-Retry (Max 5 retries, 5s delay on failure with live countdown)
  const generateSingleSceneImageWithRetry = async (
    index: number,
    customScript?: VideoScriptOutput,
    customProduct?: ScrapedProductData,
    forceRegenerate = false,
    maxRetries = 5,
    retryDelayMs = 5000
  ): Promise<boolean> => {
    const currentScript = customScript || scriptOutputRef.current;
    const currentProduct = customProduct || productDataRef.current;
    if (!currentScript || !currentProduct) return false;
    const initialScene = currentScript.scenes[index];
    if (!initialScene) return false;

    // If image is already generated and not forced, preserve it
    if (initialScene.generatedImageUrl && !forceRegenerate) {
      console.log(`[Cảnh ${initialScene.sceneNumber}] Đã có ảnh phân cảnh, giữ nguyên.`);
      return true;
    }

    const refImage =
      initialScene.selectedRefImage ||
      currentProduct.selectedImages[0] ||
      currentProduct.images[0];
    if (!refImage) {
      handleUpdateScene(index, {
        isGeneratingImage: false,
        imageError: 'Vui lòng chọn hoặc có ít nhất 1 ảnh sản phẩm tham chiếu.',
      });
      return false;
    }

    // Try initial attempt + up to maxRetries (total attempts = 1 + 5 = 6)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // If this is a retry attempt, wait 5 seconds with live countdown
      if (attempt > 0) {
        for (let cd = Math.ceil(retryDelayMs / 1000); cd > 0; cd--) {
          handleUpdateScene(index, {
            isGeneratingImage: true,
            retryAttempt: attempt,
            retryStatusText: `Tạo ảnh lỗi. Đang đợi ${cd}s để tự động thử lại (Lần ${attempt}/${maxRetries})...`,
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      handleUpdateScene(index, {
        isGeneratingImage: true,
        imageError: undefined,
        retryAttempt: attempt,
        retryStatusText:
          attempt > 0
            ? `Đang thử lại tạo ảnh lần ${attempt}/${maxRetries}...`
            : `Đang khởi tạo ảnh phân cảnh AI...`,
      });

      try {
        const liveScene = scriptOutputRef.current?.scenes[index] || initialScene;
        const liveRefImage = liveScene.selectedRefImage || refImage;

        const res = await fetch('/api/scene/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceImageUrl: liveRefImage,
            prompt: liveScene.imagePrompt,
            aspectRatio: targetRatio,
            apiKey: apiConfig.apiKey,
            provider: apiConfig.activeProvider,
            gptImageConfig: apiConfig.gptImage,
          }),
        });

        const resText = await res.text();
        let resData: any;
        try {
          resData = JSON.parse(resText);
        } catch {
          throw new Error(`Máy chủ trả về phản hồi không hợp lệ (${res.status})`);
        }

        if (!res.ok || !resData.success) {
          throw new Error(resData.error || 'Không thể tạo ảnh phân cảnh');
        }

        // Successfully generated
        handleUpdateScene(index, {
          generatedImageUrl: resData.imageUrl,
          isGeneratingImage: false,
          imageError: undefined,
          retryAttempt: 0,
          retryStatusText: undefined,
        });
        return true;
      } catch (err: any) {
        console.warn(
          `❌ [Cảnh ${index + 1}] Lỗi tạo ảnh (Lần thử ${attempt + 1}/${maxRetries + 1}):`,
          err?.message
        );
        if (attempt === maxRetries) {
          handleUpdateScene(index, {
            isGeneratingImage: false,
            imageError: `Tạo ảnh thất bại sau ${maxRetries} lần thử lại: ${err?.message || 'Lỗi không xác định'}`,
            retryAttempt: attempt,
            retryStatusText: `Đã thử lại ${maxRetries} lần thất bại. Bạn có thể bấm "Tạo lại" thủ công.`,
          });
          return false;
        }
      }
    }
    return false;
  };

  // Generate Image for a Single Scene triggered manually by user
  const handleGenerateSceneImage = async (index: number, forceRegenerate = false) => {
    return generateSingleSceneImageWithRetry(index, undefined, undefined, forceRegenerate, 5, 5000);
  };

  // Generate All Scene Images in Parallel (5 concurrent threads, auto retry 5 times with 5s delay)
  const handleGenerateAllSceneImagesParallel = async (
    customScript?: VideoScriptOutput,
    customProduct?: ScrapedProductData,
    forceAll = false
  ) => {
    const targetScript = customScript || scriptOutputRef.current;
    const targetProduct = customProduct || productDataRef.current;
    if (!targetScript || !targetProduct || isGeneratingAllImages) return;

    setIsGeneratingAllImages(true);
    try {
      const tasks = targetScript.scenes.map((_, idx) => () =>
        generateSingleSceneImageWithRetry(idx, targetScript, targetProduct, forceAll, 5, 5000)
      );
      // Run up to 5 concurrent images simultaneously
      await runWithConcurrency(tasks, 5);
    } finally {
      setIsGeneratingAllImages(false);
    }
  };

  // Legacy alias for batch button
  const handleGenerateAllSceneImages = () => {
    handleGenerateAllSceneImagesParallel(undefined, undefined, false);
  };

  // Master 1-Click End-to-End Automation Pipeline (Scrape -> Analyze -> Script -> 5 Parallel Images -> Auto Enqueue Kling AI Videos)
  const handleOneClickAutoPipeline = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!productUrl.trim() || isAutoRunning || isScraping) return;

    setIsAutoRunning(true);
    setScrapeError(null);
    setSpecsError(null);
    setAnalyzeError(null);

    try {
      // 1. STAGE: SCRAPE PRODUCT URL
      setAutoCurrentStage('scraping');
      setAutoStageMessage('Đang cào dữ liệu và hình ảnh sản phẩm từ link website...');

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

      // 2. STAGE: AUTO PRE-ANALYZE PRODUCT SPECIFICATIONS
      setAutoCurrentStage('analyzing_specs');
      setAutoStageMessage('AI đang phân tích cấu trúc vật lý, chất liệu, kích thước & họa tiết in ấn...');

      let analyzedSpecs: ProductSpecifications | null = null;
      try {
        const specsResponse = await fetch('/api/product/analyze-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newProductData.title,
            description: newProductData.description,
            images: newProductData.selectedImages.length > 0 ? newProductData.selectedImages : newProductData.images,
            customKey: apiConfig.apiKey,
            visionConfig: apiConfig.visionAnalysis,
            model: 'gemini-3.7-flash',
          }),
        });

        const specsResText = await specsResponse.text();
        const specsData: any = JSON.parse(specsResText);
        if (specsResponse.ok && specsData.success && specsData.productSpecs) {
          analyzedSpecs = specsData.productSpecs;
          setProductSpecs(analyzedSpecs);
          productSpecsRef.current = analyzedSpecs;
          setEditSpecsForm(analyzedSpecs);
          try {
            sessionStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(analyzedSpecs));
          } catch {}
        }
      } catch (specsErr) {
        console.warn("Lỗi phân tích chi tiết sản phẩm, sẽ phân tích trực tiếp trong kịch bản:", specsErr);
      }

      // 3. STAGE: AUTO GENERATE 5 ADAPTIVE SCENES & SCRIPT
      setAutoCurrentStage('generating_script');
      setAutoStageMessage('AI đang thiết kế kịch bản 5 phân cảnh độc quyền theo đặc tính sản phẩm...');

      const scriptResponse = await fetch('/api/product/analyze-and-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newProductData.title,
          description: newProductData.description,
          images: newProductData.selectedImages.length > 0 ? newProductData.selectedImages : newProductData.images,
          productSpecs: analyzedSpecs || undefined,
          customKey: apiConfig.apiKey,
          visionConfig: apiConfig.visionAnalysis,
          model: 'gemini-3.7-flash',
        }),
      });

      const scriptResText = await scriptResponse.text();
      let scriptData: any;
      try {
        scriptData = JSON.parse(scriptResText);
      } catch (parseErr) {
        throw new Error(`Máy chủ trả về phản hồi không hợp lệ (${scriptResponse.status}) khi phân tích kịch bản.`);
      }

      if (!scriptResponse.ok || !scriptData.success) {
        throw new Error(scriptData.error || 'Không thể tạo kịch bản video sản phẩm');
      }

      const script: VideoScriptOutput = scriptData.script;
      if (script.productSpecs) {
        setProductSpecs(script.productSpecs);
        productSpecsRef.current = script.productSpecs;
        setEditSpecsForm(script.productSpecs);
        try {
          sessionStorage.setItem(STORAGE_KEY_SPECS, JSON.stringify(script.productSpecs));
        } catch {}
      }

      const refPool = newProductData.selectedImages.length > 0 ? newProductData.selectedImages : newProductData.images;
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

      // 4. STAGE: AUTO GENERATE ALL 5 IMAGES IN PARALLEL (WITH 5S RETRY / 5 TIMES)
      setAutoCurrentStage('generating_images');
      setAutoStageMessage('Đang tự động tạo đa luồng 5 ảnh song song (Tự động thử lại 5s nếu lỗi)...');

      await handleGenerateAllSceneImagesParallel(finalScript, newProductData, false);

      // 5. STAGE: AUTO ENQUEUE ALL 5 SCENES TO KLING AI VIDEO GENERATOR
      setAutoCurrentStage('enqueueing_videos');
      setAutoStageMessage('Đang tự động chuyển ảnh và prompt sang Kling AI để render video...');

      const latestScript = scriptOutputRef.current || finalScript;
      const defaultAntiArtifactNegative =
        'self-rotating object, autonomous object spinning, floating in air, levitation, phantom movement, object moving without human hands, spontaneous lifting, deformed fingers, extra fingers, mutated hands, robotic unnatural movement, morphing, warping, artificial slow motion, blurry details, distorted logo, distorted text';

      const itemsToEnqueue = latestScript.scenes.map((scene, idx) => {
        // Enforce exact corresponding reference image for this scene
        const targetImage =
          scene.generatedImageUrl ||
          scene.selectedRefImage ||
          (newProductData && (newProductData.selectedImages[idx % newProductData.selectedImages.length] || newProductData.images[0])) ||
          undefined;

        const enhancedPrompt = `${scene.videoPrompt}, single continuous one-shot take without cuts, continuous uncut mobile camera recording, zero scene switching, authentic smartphone POV handheld video, shot on mobile phone camera, standard 1.0x real-time speed, realistic physics and gravity, product is completely stationary anchored on surface unless held or moved by real human hands, strictly no self-rotation, no autonomous movement, no floating, strictly no slow motion, 4k photorealistic`;

        return {
          prompt: enhancedPrompt,
          negativePrompt: defaultAntiArtifactNegative,
          cameraMovement: scene.cameraMotion || 'handheld',
          duration: scene.duration || '5',
          mode: targetMode,
          aspectRatio: targetRatio,
          cfgScale: 0.6,
          model: apiConfig.kling?.model || 'kling-v2-6',
          startImageUrl: targetImage,
        };
      });

      onBatchEnqueueVideos(itemsToEnqueue);

      setAutoCurrentStage('done');
      setAutoStageMessage('🎉 Đã tự động tạo xong toàn bộ ảnh & đã gửi 5 video vào hàng đợi Kling AI!');

      // Smooth scroll down to generated videos section
      setTimeout(() => {
        const vidSection = document.getElementById('generated-videos-section');
        if (vidSection) {
          vidSection.scrollIntoView({ behavior: 'smooth' });
        }
      }, 800);

    } catch (err: any) {
      console.error("1-Click Auto Pipeline Error:", err);
      setScrapeError(err?.message || 'Lỗi trong quy trình tự động tạo video 1-click');
      setAutoCurrentStage('idle');
    } finally {
      setIsAutoRunning(false);
    }
  };

  // Enqueue a Single Scene to Create Video
  const handleEnqueueSingleScene = (index: number) => {
    if (!scriptOutput) return;
    const scene = scriptOutput.scenes[index];
    if (!scene) return;

    const startImage =
      scene.generatedImageUrl ||
      scene.selectedRefImage ||
      (productData ? (productData.selectedImages[index % productData.selectedImages.length] || productData.images[0]) : undefined);

    const defaultAntiArtifactNegative =
      'self-rotating object, autonomous object spinning, floating in air, levitation, phantom movement, object moving without human hands, spontaneous lifting, deformed fingers, extra fingers, mutated hands, robotic unnatural movement, morphing, warping, artificial slow motion, blurry details, distorted logo, distorted text';

    const enhancedPrompt = `${scene.videoPrompt}, single continuous one-shot take without cuts, continuous uncut mobile camera recording, zero scene switching, authentic smartphone POV handheld video, shot on mobile phone camera, standard 1.0x real-time speed, realistic physics and gravity, product is completely stationary anchored on surface unless held or moved by real human hands, strictly no self-rotation, no autonomous movement, no floating, strictly no slow motion, 4k photorealistic`;

    onBatchEnqueueVideos([
      {
        prompt: enhancedPrompt,
        negativePrompt: defaultAntiArtifactNegative,
        cameraMovement: scene.cameraMotion || 'handheld',
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

    const defaultAntiArtifactNegative =
      'self-rotating object, autonomous object spinning, floating in air, levitation, phantom movement, object moving without human hands, spontaneous lifting, deformed fingers, extra fingers, mutated hands, robotic unnatural movement, morphing, warping, artificial slow motion, blurry details, distorted logo, distorted text';

    const itemsToEnqueue = scriptOutput.scenes.map((scene, index) => {
      const startImage =
        scene.generatedImageUrl ||
        scene.selectedRefImage ||
        (productData ? (productData.selectedImages[index % productData.selectedImages.length] || productData.images[0]) : undefined);

      const enhancedPrompt = `${scene.videoPrompt}, single continuous one-shot take without cuts, continuous uncut mobile camera recording, zero scene switching, authentic smartphone POV handheld video, shot on mobile phone camera, standard 1.0x real-time speed, realistic physics and gravity, product is completely stationary anchored on surface unless held or moved by real human hands, strictly no self-rotation, no autonomous movement, no floating, strictly no slow motion, 4k photorealistic`;

      return {
        prompt: enhancedPrompt,
        negativePrompt: defaultAntiArtifactNegative,
        cameraMovement: scene.cameraMotion || 'handheld',
        duration: scene.duration || '5',
        mode: targetMode,
        aspectRatio: targetRatio,
        cfgScale: 0.6,
        model: apiConfig.kling?.model || 'kling-v2-6',
        startImageUrl: startImage,
      };
    });

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

      {/* STEP 1: INPUT PRODUCT URL & 1-CLICK AUTO PIPELINE */}
      {currentStep === 1 && (
        <div className="space-y-6 max-w-3xl mx-auto py-4">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-500/20 border border-indigo-500/30 text-xs font-bold text-cyan-300 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>Quy Trình Tự Động Hóa Toàn Diện 1-Click (A ➜ Z)</span>
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight">Dán Link Sản Phẩm Thương Mại Điện Tử</h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              Chỉ cần dán link và bấm 1 lần duy nhất — Hệ thống sẽ tự động lần lượt cào dữ liệu, phân tích đặc tính, lên kịch bản, tạo 5 ảnh song song và tự động render 5 video với Kling AI!
            </p>
          </div>

          <form onSubmit={handleOneClickAutoPipeline} className="space-y-5">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <Globe className="w-5 h-5 text-indigo-400" />
              </div>
              <input
                type="url"
                required
                disabled={isAutoRunning}
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://joymade.co/products/... hoặc https://yourstore.com/product/..."
                className="w-full pl-12 pr-4 py-4 bg-slate-950/90 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-inner disabled:opacity-60"
              />
            </div>

            {scrapeError && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scrapeError}</span>
              </div>
            )}

            {/* Live Multi-Stage Automation Progress Tracker */}
            {isAutoRunning && (
              <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/80 border border-indigo-700/50 p-5 rounded-2xl space-y-4 shadow-2xl animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                    <span className="text-xs font-bold text-white">
                      Đang thực thi tự động 1-Click từ A ➜ Z...
                    </span>
                  </div>
                  <span className="text-[10px] bg-cyan-950 text-cyan-300 font-bold px-2 py-0.5 rounded border border-cyan-700/50">
                    Tự động hoàn toàn
                  </span>
                </div>

                <p className="text-xs text-cyan-200 font-medium bg-slate-950/80 p-2.5 rounded-xl border border-indigo-900/60 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
                  <span>{autoStageMessage || 'Đang xử lý...'}</span>
                </p>

                {/* 5 Stage Step Pills */}
                <div className="grid grid-cols-5 gap-1.5 text-[10px] font-semibold text-center">
                  <div className={`p-2 rounded-lg border transition-all ${
                    autoCurrentStage === 'scraping' ? 'bg-indigo-600 border-indigo-400 text-white font-bold animate-pulse ring-1 ring-white/30' :
                    ['analyzing_specs', 'generating_script', 'generating_images', 'enqueueing_videos', 'done'].includes(autoCurrentStage) ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}>
                    1. Cào link
                  </div>
                  <div className={`p-2 rounded-lg border transition-all ${
                    autoCurrentStage === 'analyzing_specs' ? 'bg-indigo-600 border-indigo-400 text-white font-bold animate-pulse ring-1 ring-white/30' :
                    ['generating_script', 'generating_images', 'enqueueing_videos', 'done'].includes(autoCurrentStage) ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}>
                    2. Phân tích
                  </div>
                  <div className={`p-2 rounded-lg border transition-all ${
                    autoCurrentStage === 'generating_script' ? 'bg-indigo-600 border-indigo-400 text-white font-bold animate-pulse ring-1 ring-white/30' :
                    ['generating_images', 'enqueueing_videos', 'done'].includes(autoCurrentStage) ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}>
                    3. Kịch bản
                  </div>
                  <div className={`p-2 rounded-lg border transition-all ${
                    autoCurrentStage === 'generating_images' ? 'bg-indigo-600 border-indigo-400 text-white font-bold animate-pulse ring-1 ring-white/30' :
                    ['enqueueing_videos', 'done'].includes(autoCurrentStage) ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}>
                    4. Tạo 5 ảnh
                  </div>
                  <div className={`p-2 rounded-lg border transition-all ${
                    autoCurrentStage === 'enqueueing_videos' || autoCurrentStage === 'done' ? 'bg-indigo-600 border-indigo-400 text-white font-bold animate-pulse ring-1 ring-white/30' : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}>
                    5. Tạo Video
                  </div>
                </div>
              </div>
            )}

            {/* Primary Action: 1-Click Full Automation */}
            <div className="space-y-2">
              <button
                type="submit"
                disabled={isAutoRunning || !productUrl.trim()}
                className="w-full py-4 px-6 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 shadow-xl shadow-indigo-950/60 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
              >
                {isAutoRunning ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-300" />
                    <span>Hệ thống đang tự động chạy quy trình 1-Click (A ➜ Z)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-cyan-300" />
                    <span>🚀 Bắt Đầu Tự Động Tạo Video 1-Click (A ➜ Z)</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-slate-400">
                <span>⚡ Tự động: Cào link ➔ Phân tích ➔ Kịch bản ➔ 5 ảnh song song ➔ Video Kling AI</span>
                <button
                  type="button"
                  disabled={isAutoRunning || isScraping || !productUrl.trim()}
                  onClick={handleScrapeProductUrl}
                  className="text-indigo-400 hover:underline hover:text-indigo-300 disabled:opacity-40"
                >
                  Hoặc chỉ cào dữ liệu thủ công
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: REVIEW SCRAPED DATA & PRE-ANALYZE PRODUCT DETAILS */}
      {currentStep === 2 && productData && (
        <div className="space-y-6">
          {/* Card 1: Scraped Product Info & Reference Images */}
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
                  Nhấp vào ảnh để chọn làm ảnh tham chiếu AI phân tích
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

          {/* Card 2: DEDICATED PRE-ANALYSIS: PHÂN TÍCH CHI TIẾT SẢN PHẨM TRƯỚC */}
          <div className="bg-gradient-to-br from-slate-950/90 via-slate-900/60 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-indigo-500/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-inner">
                  <Scan className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    Bước 2.1: Phân Tích Chi Tiết Đặc Tính Sản Phẩm
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Giám Định Chất Liệu, Hình Dáng & Họa Tiết Thiết Kế
                  </h3>
                </div>
              </div>

              {productSpecs && !isEditingSpecs && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditSpecsForm(productSpecs);
                      setIsEditingSpecs(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 border border-slate-700"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Chỉnh sửa thông số</span>
                  </button>

                  <button
                    type="button"
                    disabled={isAnalyzingSpecs}
                    onClick={handleAnalyzeProductDetails}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900/80 text-xs font-semibold text-indigo-300 transition-colors flex items-center gap-1.5 border border-indigo-700/50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzingSpecs ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>Phân tích lại</span>
                  </button>
                </div>
              )}
            </div>

            {specsError && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{specsError}</span>
              </div>
            )}

            {/* Case A: Chưa phân tích sản phẩm -> Hiển thị nút Phân Tích Chi Tiết Ngay */}
            {!productSpecs && (
              <div className="py-6 px-4 bg-slate-900/50 rounded-xl border border-slate-800/80 text-center space-y-4">
                <div className="max-w-xl mx-auto space-y-2">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    AI Gemini 3.7 Flash sẽ trực tiếp kiểm tra hình ảnh và mô tả sản phẩm để bóc tách:
                    <strong className="text-cyan-300"> Tên chuẩn xác</strong>,
                    <strong className="text-indigo-300"> Chất liệu thực tế</strong>,
                    <strong className="text-emerald-300"> Cấu trúc hình học 2D/3D (chống méo hình)</strong>,
                    <strong className="text-amber-300"> Kích thước thật</strong>, và
                    <strong className="text-purple-300"> Họa tiết in ấn & Chữ viết</strong>.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Bạn có thể kiểm tra và tùy chỉnh toàn bộ thông số này trước khi đưa vào từng câu lệnh Prompt!
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isAnalyzingSpecs}
                  onClick={handleAnalyzeProductDetails}
                  className="py-3.5 px-8 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 shadow-xl shadow-indigo-950/60 transition-all inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {isAnalyzingSpecs ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
                      <span>Gemini 3.7 Flash đang phân tích chi tiết hình ảnh sản phẩm...</span>
                    </>
                  ) : (
                    <>
                      <Scan className="w-4 h-4 text-cyan-300" />
                      <span>🔍 1. Phân Tích Chi Tiết Sản Phẩm (Gemini AI Vision)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Case B: Đã có kết quả phân tích -> Hiển thị Bảng Thông Số Chi Tiết (View mode) */}
            {productSpecs && !isEditingSpecs && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Tên & Thể loại */}
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      Tên & Phân loại
                    </span>
                    <p className="text-xs text-slate-200 font-semibold">{productSpecs.productName}</p>
                    {productSpecs.category && (
                      <span className="inline-block text-[10px] bg-cyan-950/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/40">
                        {productSpecs.category}
                      </span>
                    )}
                  </div>

                  {/* Chất liệu */}
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Chất liệu thực tế
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{productSpecs.material}</p>
                  </div>

                  {/* Hình dạng hình học */}
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-emerald-500/30 space-y-1 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5" />
                        Hình dạng hình học
                      </span>
                      <span className="text-[9px] bg-emerald-950/80 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700/50">
                        Chống méo hình
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{productSpecs.shape}</p>
                  </div>

                  {/* Kích thước & Tỷ lệ thật */}
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Maximize className="w-3.5 h-3.5" />
                      Kích thước & Tỷ lệ thật
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{productSpecs.dimensions}</p>
                  </div>

                  {/* Họa tiết in ấn & Typography */}
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5" />
                      Họa tiết & Chữ viết (Typography)
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{productSpecs.designDetails}</p>
                  </div>

                  {/* Bề mặt & Phụ kiện */}
                  <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Bề mặt & Phụ kiện đi kèm
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{productSpecs.finish}</p>
                  </div>
                </div>

                {/* Key Features */}
                {productSpecs.keyFeatures && (
                  <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-800/30 text-xs text-indigo-200 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-cyan-300">Điểm nhấn nổi bật: </strong>
                      <span>{productSpecs.keyFeatures}</span>
                    </div>
                  </div>
                )}

                {/* Guaranteed Prompt Injection Badge */}
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Đã sẵn sàng đưa vào Prompt:</strong> Toàn bộ thông số vật lý, chất liệu và họa tiết trên sẽ được tự động chèn vào <strong>imagePrompt</strong> và <strong>videoPrompt</strong> của tất cả các phân cảnh.
                  </span>
                </div>
              </div>
            )}

            {/* Case C: Chế độ Chỉnh Sửa Thông Số Chi Tiết (Edit mode) */}
            {productSpecs && isEditingSpecs && (
              <div className="space-y-4 bg-slate-900/90 p-4 rounded-xl border border-indigo-500/40">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4" />
                    Chỉnh sửa thông số chi tiết sản phẩm trước khi đưa vào Prompt:
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingSpecs(false)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">🏷️ Tên sản phẩm chuẩn xác:</label>
                    <input
                      type="text"
                      value={editSpecsForm.productName}
                      onChange={(e) => setEditSpecsForm({ ...editSpecsForm, productName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">📦 Thể loại sản phẩm:</label>
                    <input
                      type="text"
                      value={editSpecsForm.category || ''}
                      onChange={(e) => setEditSpecsForm({ ...editSpecsForm, category: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">💎 Chất liệu thực tế:</label>
                    <input
                      type="text"
                      value={editSpecsForm.material}
                      onChange={(e) => setEditSpecsForm({ ...editSpecsForm, material: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">📐 Hình dạng hình học (Cấu trúc chống méo 2D/3D):</label>
                    <input
                      type="text"
                      value={editSpecsForm.shape}
                      onChange={(e) => setEditSpecsForm({ ...editSpecsForm, shape: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">📏 Kích thước & Tỷ lệ thật:</label>
                    <input
                      type="text"
                      value={editSpecsForm.dimensions}
                      onChange={(e) => setEditSpecsForm({ ...editSpecsForm, dimensions: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">✨ Bề mặt & Phụ kiện đi kèm:</label>
                    <input
                      type="text"
                      value={editSpecsForm.finish}
                      onChange={(e) => setEditSpecsForm({ ...editSpecsForm, finish: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">🎨 Họa tiết in ấn & Chữ viết (Typography):</label>
                    <textarea
                      rows={2}
                      value={editSpecsForm.designDetails}
                      onChange={(e) => setEditSpecsForm({ ...editSpecsForm, designDetails: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingSpecs(false)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSpecsEdits}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5 shadow"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu thông số & Áp dụng</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {analyzeError && (
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{analyzeError}</span>
            </div>
          )}

          {/* Step 2 Bottom Actions */}
          <div className="flex items-center justify-between gap-4 pt-2">
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
                  <span>Đang nhúng thông số sản phẩm vào từng Prompt phân cảnh...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 text-cyan-300" />
                  <span>🎬 2. Lên Kịch Bản & Nhúng Thông Số Vào Từng Prompt (Tiến sang Bước 3)</span>
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
          {/* Script Header Summary & Injected Product Specs Banner */}
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
                  onClick={() => setCurrentStep(2)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 border border-slate-700"
                >
                  <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Sửa thông số sản phẩm</span>
                </button>

                <button
                  type="button"
                  onClick={handleGenerateScript}
                  disabled={isAnalyzing}
                  className="px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-xs font-semibold text-indigo-200 transition-colors flex items-center gap-1.5 border border-indigo-700/50"
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
            {(scriptOutput.productSpecs || productSpecs) && (
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Thông Số Chi Tiết Sản Phẩm Đã Được Nhúng Vào Từng Prompt Phân Cảnh:
                  </span>
                  <span className="text-[10px] bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/50 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                    Đã đưa vào {scriptOutput.scenes.length} prompt cảnh
                  </span>
                </div>
                {(() => {
                  const specs = scriptOutput.productSpecs || productSpecs!;
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">🏷️ Tên & Loại sản phẩm</span>
                        <p className="text-xs text-slate-200 font-medium">{specs.productName}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">💎 Chất liệu thực tế</span>
                        <p className="text-xs text-slate-200 font-medium">{specs.material}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">📐 Hình dạng vật lý (Chống biến dạng)</span>
                        <p className="text-xs text-slate-200 font-medium">{specs.shape}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">📏 Kích thước & Tỷ lệ thật</span>
                        <p className="text-xs text-slate-200 font-medium">{specs.dimensions}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">🎨 Họa tiết & Thiết kế in</span>
                        <p className="text-xs text-slate-200 font-medium">{specs.designDetails}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">✨ Bề mặt & Phụ kiện</span>
                        <p className="text-xs text-slate-200 font-medium">{specs.finish}</p>
                      </div>
                    </div>
                  );
                })()}
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

            {/* Batch Action Toolbar with Multi-threaded Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-indigo-950/60 via-slate-900/90 to-purple-950/50 border border-indigo-700/40 p-4 rounded-2xl shadow-lg">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    ⚡ Đa luồng 5 ảnh song song
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[11px] font-bold">
                    <RefreshCw className="w-3 h-3 text-amber-400" />
                    Tự động thử lại 5s (tối đa 5 lần)
                  </span>
                </div>
                <p className="text-xs text-indigo-200">
                  Hệ thống tự động kích hoạt tạo ảnh đồng thời cho tất cả các cảnh ngay khi phân tích xong.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {(() => {
                  const missingCount = scriptOutput.scenes.filter((s) => !s.generatedImageUrl).length;
                  return (
                    <button
                      type="button"
                      disabled={isGeneratingAllImages}
                      onClick={() => handleGenerateAllSceneImagesParallel(undefined, undefined, false)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isGeneratingAllImages ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isGeneratingAllImages
                          ? '⚡ Đang tạo 5 ảnh song song...'
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
                    {/* Scene Card Header with Dynamic AI Scene Type & QA Badges */}
                    {(() => {
                      const matchedArch = POD_SCENE_ARCHETYPES.find(
                        (a) =>
                          a.name.toLowerCase().includes((scene.sceneType || '').toLowerCase()) ||
                          (scene.sceneType || '').toLowerCase().includes(a.name.toLowerCase()) ||
                          (scene.sceneType || '').toLowerCase().includes(a.id)
                      ) || POD_SCENE_ARCHETYPES[idx % POD_SCENE_ARCHETYPES.length];

                      const displayBadgeText = scene.sceneType || matchedArch.badge;

                      return (
                        <div className="space-y-2 border-b border-slate-800/80 pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5 truncate">
                              <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="truncate">{scene.title || `Cảnh ${scene.sceneNumber}`}</span>
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-gradient-to-r ${matchedArch.color} flex items-center gap-1 shadow-xs`}
                                title={scene.visualDescription || matchedArch.description}
                              >
                                <span>{matchedArch.icon}</span>
                                <span className="max-w-[180px] truncate">{displayBadgeText}</span>
                              </span>
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-400 line-clamp-1 italic">
                            💡 {scene.visualDescription || matchedArch.description}
                          </div>

                          {/* Strict Commercial QA Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[9px] font-medium">
                            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1">
                              <span>⏱️ 5 giây</span>
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 flex items-center gap-1">
                              <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                              <span>Vật lý thật (Không lơ lửng / méo mó)</span>
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40 text-indigo-300 flex items-center gap-1">
                              <span>👤 Da người thật (No waxy plastic)</span>
                            </span>
                            <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 flex items-center gap-1">
                              <span>🎯 Họa tiết in ấn 100% rõ nét</span>
                            </span>
                          </div>
                        </div>
                      );
                    })()}

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
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1">
                          <span>🖼️ Khung hình phân cảnh (Tỷ lệ dọc 9:16 POD)</span>
                        </span>
                        {scene.retryAttempt && scene.retryAttempt > 0 ? (
                          <span className="text-[10px] text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700/50 font-bold animate-pulse">
                            ⚠️ Thử lại lần {scene.retryAttempt}/5
                          </span>
                        ) : (
                          <span className="text-[10px] text-cyan-400 font-normal">Họa tiết thiết kế rõ nét 100%</span>
                        )}
                      </div>

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
                            <div className="space-y-2.5 p-3">
                              <div className="relative w-10 h-10 mx-auto">
                                <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                                <Sparkles className="w-4 h-4 text-cyan-300 absolute inset-0 m-auto animate-pulse" />
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-indigo-200 block">
                                  {scene.retryAttempt && scene.retryAttempt > 0
                                    ? `Đang thực hiện thử lại (Lần ${scene.retryAttempt}/5)`
                                    : 'AI đang khởi tạo ảnh phân cảnh (Đa luồng)...'}
                                </span>
                                {scene.retryStatusText && (
                                  <span className="text-[11px] text-amber-300 bg-amber-950/60 px-2 py-1 rounded-md border border-amber-800/40 block leading-tight">
                                    {scene.retryStatusText}
                                  </span>
                                )}
                              </div>
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
                        <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[11px] space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                            <span className="font-medium">{scene.imageError}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleGenerateSceneImage(idx, true)}
                            className="px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Thử lại ngay</span>
                          </button>
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
