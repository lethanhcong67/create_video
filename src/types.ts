export type CameraMovementType =
  | 'static'
  | 'zoom_in'
  | 'zoom_out'
  | 'tilt_up'
  | 'tilt_down'
  | 'pan_left'
  | 'pan_right'
  | 'orbit'
  | 'runway'
  | 'handheld';

export interface CameraMovementPreset {
  id: CameraMovementType;
  title: string;
  subtitle: string;
  iconName: string;
  badge: string;
  prompt: string;
  description: string;
}

export interface VideoGenerationItem {
  id: string;
  title?: string;
  prompt: string;
  negativePrompt?: string;
  type: 'text_to_video' | 'image_to_video';
  // Input images for image-to-video
  startImageUrl?: string;
  startImageName?: string;
  endImageUrl?: string;
  endImageName?: string;
  // Parameters
  cameraMovement: CameraMovementType;
  duration: '5' | '10';
  mode: 'std' | 'pro';
  aspectRatio: '16:9' | '9:16' | '1:1';
  cfgScale: number;
  model: string;
  // Execution status
  status: 'idle' | 'queued' | 'generating' | 'completed' | 'error';
  progress: number;
  taskId?: string;
  resultVideoUrl?: string;
  resultVideoPath?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export type ApiProviderType = 'gemini' | 'kling' | 'gpt-image-2';

export interface VisionAnalysisConfig {
  apiKey: string;
  provider: 'gemini' | 'openai' | 'openlux';
  model: string;
  baseUrl?: string;
  isCustomKeyActive: boolean;
  isValidated: boolean;
  lastValidatedAt?: string;
}

export interface GptImageConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  size?: string;
  quality: 'standard' | 'medium' | 'hd';
  isCustomKeyActive: boolean;
  isValidated: boolean;
  lastValidatedAt?: string;
  endpointKeys?: Record<string, string>;
}

export interface KlingVideoConfig {
  apiKey: string;
  accessKey?: string;
  secretKey?: string;
  baseUrl: string;
  model: string;
  mode: 'std' | 'pro';
  duration: '5' | '10';
  aspectRatio?: '9:16' | '16:9' | '1:1';
  multiShot?: boolean;
  cfgScale?: number;
  negativePrompt?: string;
  watermarkEnabled?: boolean;
  isCustomKeyActive: boolean;
  isValidated: boolean;
  lastValidatedAt?: string;
}

export interface ApiConfig {
  activeProvider: ApiProviderType;
  // Gemini settings
  apiKey: string;
  model: string;
  isCustomKeyActive: boolean;
  isValidated: boolean;
  lastValidatedAt?: string;
  // GPT-Image-2 settings
  gptImage?: GptImageConfig;
  // Kling AI Video settings
  kling?: KlingVideoConfig;
  // Dedicated Vision AI Key for Analysis
  visionAnalysis?: VisionAnalysisConfig;
}

export interface ImageModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  isRecommended?: boolean;
}

export interface ProductAnalysis {
  productName: string;
  category: string;
  colors: string;
  patterns: string;
  materials: string;
  keyFeatures: string;
  suggestedPrompt: string;
  textOrTypography?: string;
}

export interface OutfitReference {
  id: string;
  name: string;
  previewUrl: string;
  dataUrl?: string;
  mimeType?: string;
  description?: string;
  category?: 'uploaded' | 'preset';
  analysis?: ProductAnalysis;
  isAnalyzing?: boolean;
  analysisError?: string;
}

export interface AppliedReplacementConfig {
  enableCharacter?: boolean;
  enableOutfit?: boolean;
  enableBackground?: boolean;
  characterPrompt?: string;
  productName?: string;
  productDescription?: string;
  outfitPrompt?: string;
  backgroundPrompt?: string;
  outfitImageUrl?: string | null;
  outfitImageName?: string | null;
  productReferences?: OutfitReference[];
  preservePose?: boolean;
  preserveBackground?: boolean;
  customPrompt?: string;
  appliedAt?: number;
}

export interface BatchImageItem {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
  mimeType: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  resultImageUrl?: string;
  resultImageUrls?: string[];
  activeResultIndex?: number;
  error?: string;
  originalDimensions?: { width: number; height: number };
  selectedCameraMotion?: CameraMovementType;
  videoPrompt?: string;
  videoUrl?: string;
  videoStatus?: 'idle' | 'generating' | 'completed' | 'error';
  videoProgress?: number;
  videoTaskId?: string;
  videoError?: string;
  videoStartImageUrl?: string;
  videoStartImageName?: string;
  videoEndImageUrl?: string;
  videoEndImageName?: string;
  customPrompt?: string;
  appliedConfig?: AppliedReplacementConfig;
}

export interface BatchSettings {
  enableCharacter: boolean;
  characterPrompt: string;
  enableOutfit: boolean;
  productName?: string;
  productDescription?: string;
  outfitPrompt: string;
  removeSubtitles: boolean;
  preservePose: boolean;
  preserveBackground: boolean;
  backgroundPrompt?: string;
  stylePreset: string;
  aspectRatio: string;
  concurrency: number;
  variationsPerItem?: number;
}

export interface ProjectRecord {
  id?: string;
  name: string;
  author_name: string;
  description?: string;
  settings?: BatchSettings;
  uploaded_outfits?: OutfitReference[];
  items?: BatchImageItem[];
  created_at?: string;
  updated_at?: string;
}
