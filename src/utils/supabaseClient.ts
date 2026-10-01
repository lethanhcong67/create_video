import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRecord } from '../types';
import {
  getGoogleWebAppUrl,
  testGoogleConnection,
  saveGenerationRecordToGoogle,
  fetchGenerationHistoryFromGoogle,
  saveProjectToGoogle,
  fetchProjectsFromGoogle,
  uploadMediaToGoogleDrive,
  deleteProjectFromGoogle,
} from './googleStorageService';

const meta = import.meta as any;
const SUPABASE_URL = meta.env?.VITE_SUPABASE_URL || 'https://uncjoofippvcytechczr.supabase.co';
const SUPABASE_ANON_KEY = meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_jAZfTvf_pKDi1nAOuRtVrg_TcdfX8rw';

export const BUCKET_NAME = 'media_assets';

export interface GenerationRecord {
  id?: string;
  task_type: 'image_swap' | 'image_to_video' | 'video_swap' | 'text_to_image' | 'video_scene_extract';
  status: 'completed' | 'pending' | 'processing' | 'failed';
  prompt?: string | null;
  negative_prompt?: string | null;
  camera_prompt?: string | null;
  input_media?: Record<string, any>;
  output_media_url?: string | null;
  thumbnail_url?: string | null;
  model_name?: string | null;
  parameters?: Record<string, any>;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  input_base64?: string | null;
  output_base64?: string | null;
}

// Client-side Supabase client singleton
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    });
  }
  return supabaseInstance;
}

/**
 * Check connection status with Google Drive/Sheets or Supabase
 */
export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string; count?: number }> {
  // If Google WebApp URL is configured, prioritize testing Google Drive/Sheets
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl) {
    const googleRes = await testGoogleConnection();
    if (googleRes.ok) {
      return {
        ok: true,
        message: `Đã kết nối Google Sheets: ${googleRes.spreadsheetName || 'AI_History'} | Drive: ${googleRes.folderName || 'Root'}`,
      };
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    if (googleUrl) {
      return { ok: false, message: 'Không thể kết nối đến Google Apps Script' };
    }
    return { ok: false, message: 'Chưa cấu hình Google Apps Script hoặc Supabase' };
  }

  try {
    const { count, error } = await client
      .from('generations')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.warn('[Storage] Lỗi truy vấn bảng generations:', error);
      return { ok: false, message: `Lỗi kết nối bảng: ${error.message}` };
    }

    return {
      ok: true,
      message: 'Kết nối Supabase Cloud thành công!',
      count: count ?? 0,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Không thể kết nối đến Supabase' };
  }
}

/**
 * Convert Base64 or DataURL to Blob for direct Supabase storage upload
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Upload image, video, or dataUrl to Google Drive (or fallback Supabase Storage Bucket)
 */
export async function uploadMediaToSupabase(
  source: string | Blob | File,
  filename: string,
  folder: 'inputs' | 'outputs' | 'thumbnails' = 'outputs'
): Promise<string | null> {
  // 1. Prioritize Google Drive upload if Google Web App URL is configured
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl) {
    try {
      const driveUrl = await uploadMediaToGoogleDrive(source, filename);
      if (driveUrl) return driveUrl;
    } catch (e) {
      console.warn('[Google Storage] Lỗi upload Drive, thử fallback:', e);
    }
  }

  // 2. Try Backend Proxy first (bypasses Supabase Storage RLS policies with service_role_key)
  try {
    let dataUrlPayload: string | null = null;
    if (typeof source === 'string') {
      dataUrlPayload = source;
    } else if (source instanceof Blob) {
      dataUrlPayload = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(source);
      });
    }

    if (dataUrlPayload) {
      const proxyRes = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: dataUrlPayload,
          filename,
          folder,
        }),
      });

      if (proxyRes.ok) {
        const json = await proxyRes.json();
        if (json.success && json.publicUrl) {
          return json.publicUrl;
        }
      }
    }
  } catch (proxyErr) {
    console.warn('[Supabase Storage] Backend proxy upload không khả dụng, thử client upload:', proxyErr);
  }

  // 3. Client-side fallback upload
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let blob: Blob;
    let contentType = 'image/png';

    if (typeof source === 'string') {
      if (source.startsWith('data:')) {
        blob = dataUrlToBlob(source);
        contentType = blob.type;
      } else if (source.startsWith('blob:') || source.startsWith('http')) {
        // Fetch remote blob/file
        const res = await fetch(source);
        blob = await res.blob();
        contentType = blob.type;
      } else {
        // Plain base64 string
        const byteCharacters = atob(source);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        blob = new Blob([byteArray], { type: 'image/png' });
      }
    } else {
      blob = source;
      contentType = source.type || 'application/octet-stream';
    }

    const timestamp = Date.now();
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${folder}/${timestamp}_${cleanName}`;

    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .upload(filePath, blob, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('[Supabase Storage] Lỗi client upload:', error);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl || null;
  } catch (err) {
    console.error('[Supabase Storage] Exception khi upload:', err);
    return null;
  }
}

/**
 * Insert or update a generation record (Google Drive/Sheets or Supabase PostgreSQL)
 */
export async function saveGenerationRecord(
  record: GenerationRecord
): Promise<GenerationRecord | null> {
  // 1. Prioritize Google Drive & Google Sheets
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl) {
    try {
      const savedGoogle = await saveGenerationRecordToGoogle(record);
      if (savedGoogle) return savedGoogle;
    } catch (e) {
      console.warn('[Google Storage] Lỗi lưu Google Sheets, thử fallback:', e);
    }
  }

  // 2. Supabase fallback
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const payload = {
      task_type: record.task_type,
      status: record.status || 'completed',
      prompt: record.prompt || null,
      negative_prompt: record.negative_prompt || null,
      camera_prompt: record.camera_prompt || null,
      input_media: record.input_media || {},
      output_media_url: record.output_media_url || null,
      thumbnail_url: record.thumbnail_url || null,
      model_name: record.model_name || null,
      parameters: record.parameters || {},
      error_message: record.error_message || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('generations')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.warn('[Supabase DB] Lỗi lưu bản ghi:', error);
      return null;
    }

    return data as GenerationRecord;
  } catch (err) {
    console.error('[Supabase DB] Exception khi lưu bản ghi:', err);
    return null;
  }
}

/**
 * Fetch generation records with filtering and pagination (Google Sheets or Supabase)
 */
export async function fetchGenerationHistory(options?: {
  taskType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: GenerationRecord[]; total: number }> {
  // 1. Check Google Sheets first
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl) {
    try {
      const googleHistory = await fetchGenerationHistoryFromGoogle(options);
      if (googleHistory.items.length > 0 || !getSupabaseClient()) {
        return googleHistory;
      }
    } catch (e) {
      console.warn('[Google Storage] Lỗi tải lịch sử từ Google Sheets, thử fallback:', e);
    }
  }

  const client = getSupabaseClient();
  if (!client) return { items: [], total: 0 };

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  try {
    let query = client
      .from('generations')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options?.taskType && options.taskType !== 'all') {
      if (options.taskType === 'video') {
        query = query.in('task_type', ['image_to_video', 'video_swap', 'video_scene_extract']);
      } else if (options.taskType === 'image') {
        query = query.in('task_type', ['image_swap', 'text_to_image']);
      } else {
        query = query.eq('task_type', options.taskType);
      }
    }

    const { data, count, error } = await query;

    if (error) {
      console.warn('[Supabase DB] Lỗi tải lịch sử:', error);
      return { items: [], total: 0 };
    }

    return {
      items: (data as GenerationRecord[]) || [],
      total: count || 0,
    };
  } catch (err) {
    console.error('[Supabase DB] Exception khi tải lịch sử:', err);
    return { items: [], total: 0 };
  }
}

/**
 * Delete a generation record and optional files from Storage
 */
export async function deleteGenerationRecord(
  id: string,
  mediaUrls?: (string | null | undefined)[]
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    // 1. Delete DB record
    const { error: dbError } = await client
      .from('generations')
      .delete()
      .eq('id', id);

    if (dbError) {
      console.warn('[Supabase DB] Lỗi xóa bản ghi:', dbError);
      return false;
    }

    // 2. Delete storage files if public URLs provided
    if (mediaUrls && mediaUrls.length > 0) {
      const pathsToDelete: string[] = [];
      for (const url of mediaUrls) {
        if (!url) continue;
        const bucketPathIdx = url.indexOf(`/${BUCKET_NAME}/`);
        if (bucketPathIdx !== -1) {
          const filePath = url.slice(bucketPathIdx + BUCKET_NAME.length + 2);
          if (filePath) pathsToDelete.push(filePath);
        }
      }

      if (pathsToDelete.length > 0) {
        await client.storage.from(BUCKET_NAME).remove(pathsToDelete);
      }
    }

    return true;
  } catch (err) {
    console.error('[Supabase] Exception khi xóa bản ghi:', err);
    return false;
  }
}

// ==========================================
// PROJECT / SESSION MANAGEMENT API
// ==========================================

/**
 * Fetch list of all projects ordered by newest updated
 */
export async function fetchProjects(): Promise<ProjectRecord[]> {
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl || !getSupabaseClient()) {
    return await fetchProjectsFromGoogle();
  }

  const client = getSupabaseClient();
  if (!client) return await fetchProjectsFromGoogle();

  try {
    const { data, error } = await client
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[Projects] Lỗi tải danh sách dự án từ Supabase, chuyển sang local:', error);
      return await fetchProjectsFromGoogle();
    }

    return (data as ProjectRecord[]) || [];
  } catch (err) {
    console.error('[Projects] Exception khi tải dự án:', err);
    return await fetchProjectsFromGoogle();
  }
}

/**
 * Fetch a single project by ID with full state
 */
export async function fetchProjectById(id: string): Promise<ProjectRecord | null> {
  const projects = await fetchProjects();
  return projects.find((p) => p.id === id) || null;
}

/**
 * Compress base64 data URL using canvas if needed (fallback if storage upload fails)
 */
export async function compressDataUrl(
  dataUrl: string,
  maxDimension = 800,
  quality = 0.75
): Promise<string> {
  if (typeof window === 'undefined' || !dataUrl || !dataUrl.startsWith('data:') || dataUrl.length < 200000) {
    return dataUrl;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch (_) {
      resolve(dataUrl);
    }
  });
}

/**
 * Upload base64 / blob image to Supabase Storage bucket or fallback to compressed dataUrl
 */
async function uploadOrCompressImage(
  urlOrData: string | undefined | null,
  filename: string,
  folder: 'inputs' | 'outputs' = 'inputs'
): Promise<string | null> {
  if (!urlOrData) return null;
  // If already an HTTP public URL (e.g. on Supabase Storage), reuse as-is
  if (urlOrData.startsWith('http://') || urlOrData.startsWith('https://')) {
    return urlOrData;
  }

  // If base64 or blob URL, upload to Supabase Storage to keep project JSON lightweight
  if (urlOrData.startsWith('data:') || urlOrData.startsWith('blob:')) {
    try {
      const publicUrl = await uploadMediaToSupabase(urlOrData, filename, folder);
      if (publicUrl) {
        return publicUrl;
      }
    } catch (e) {
      console.warn('[Supabase Storage] Lỗi upload ảnh, chuyển sang nén dữ liệu:', e);
    }

    // Fallback: compress dataUrl
    return await compressDataUrl(urlOrData, 800, 0.75);
  }

  return urlOrData;
}

/**
 * Sanitize & optimize items before saving to project storage:
 * - Uploads heavy base64 images to Supabase Storage bucket (shrinks JSON from 100MB+ to ~20KB)
 * - Excludes videoUrl & video binaries (only keeps video prompts and parameters)
 * - Preserves videoPrompt, selectedCameraMotion, images, prompts, and settings
 */
export async function sanitizeAndUploadProjectItems(items: any[]): Promise<any[]> {
  if (!Array.isArray(items)) return [];

  // Process items with concurrency limit of 5
  const results: any[] = [];
  const chunkSize = 5;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const processedChunk = await Promise.all(
      chunk.map(async (item, idx) => {
        const itemIdx = i + idx;
        const sanitized = { ...item };

        // 1. Remove video binaries / video URLs
        delete sanitized.videoUrl;
        delete sanitized.videoTaskId;
        sanitized.videoStatus = 'idle';
        sanitized.videoProgress = 0;

        // 2. Upload / convert dataUrls to lightweight Supabase Storage URLs
        if (sanitized.dataUrl?.startsWith('data:')) {
          sanitized.dataUrl = await uploadOrCompressImage(
            sanitized.dataUrl,
            `input_${sanitized.id || itemIdx}.jpg`,
            'inputs'
          );
        }

        if (sanitized.resultImageUrl?.startsWith('data:')) {
          sanitized.resultImageUrl = await uploadOrCompressImage(
            sanitized.resultImageUrl,
            `result_${sanitized.id || itemIdx}.png`,
            'outputs'
          );
        }

        if (Array.isArray(sanitized.resultImageUrls) && sanitized.resultImageUrls.length > 0) {
          sanitized.resultImageUrls = await Promise.all(
            sanitized.resultImageUrls.map((varUrl: string, vIdx: number) =>
              uploadOrCompressImage(varUrl, `var_${sanitized.id || itemIdx}_${vIdx}.png`, 'outputs')
            )
          );
        }

        if (sanitized.videoStartImageUrl?.startsWith('data:')) {
          sanitized.videoStartImageUrl = await uploadOrCompressImage(
            sanitized.videoStartImageUrl,
            `start_${sanitized.id || itemIdx}.jpg`,
            'inputs'
          );
        }

        if (sanitized.videoEndImageUrl?.startsWith('data:')) {
          sanitized.videoEndImageUrl = await uploadOrCompressImage(
            sanitized.videoEndImageUrl,
            `end_${sanitized.id || itemIdx}.jpg`,
            'inputs'
          );
        }

        return sanitized;
      })
    );
    results.push(...processedChunk);
  }

  return results;
}

/**
 * Sanitize & preserve reference outfits images for project storage
 */
export async function sanitizeAndUploadOutfits(outfits: any[]): Promise<any[]> {
  if (!Array.isArray(outfits)) return [];
  return await Promise.all(
    outfits.map(async (outfit, idx) => {
      const sanitized = { ...outfit };
      const rawUrl = sanitized.dataUrl || sanitized.previewUrl;
      if (rawUrl && typeof rawUrl === 'string' && (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:'))) {
        const uploadedUrl = await uploadOrCompressImage(rawUrl, `outfit_${sanitized.id || idx}.jpg`, 'inputs');
        if (uploadedUrl) {
          sanitized.dataUrl = uploadedUrl;
          sanitized.previewUrl = uploadedUrl;
        }
      }
      if (!sanitized.dataUrl && sanitized.previewUrl) {
        sanitized.dataUrl = sanitized.previewUrl;
      }
      if (!sanitized.previewUrl && sanitized.dataUrl) {
        sanitized.previewUrl = sanitized.dataUrl;
      }
      return sanitized;
    })
  );
}

/**
 * Create a new project / session record (Google Sheets / LocalStorage / Supabase)
 */
export async function createProject(project: {
  name: string;
  author_name: string;
  description?: string;
  settings?: any;
  uploaded_outfits?: any;
  items?: any;
}): Promise<ProjectRecord | null> {
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl || !getSupabaseClient()) {
    return await saveProjectToGoogle(project);
  }

  const client = getSupabaseClient();
  if (!client) return await saveProjectToGoogle(project);

  try {
    const [optimizedOutfits, optimizedItems] = await Promise.all([
      sanitizeAndUploadOutfits(project.uploaded_outfits || []),
      sanitizeAndUploadProjectItems(project.items || []),
    ]);

    const payload = {
      name: project.name.trim(),
      author_name: project.author_name.trim(),
      description: project.description?.trim() || null,
      settings: project.settings || {},
      uploaded_outfits: optimizedOutfits,
      items: optimizedItems,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('projects')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.warn('[Projects] Lỗi tạo dự án mới trên Supabase, lưu local/Google:', error);
      return await saveProjectToGoogle(project);
    }

    return data as ProjectRecord;
  } catch (err) {
    console.error('[Projects] Exception khi tạo dự án:', err);
    return await saveProjectToGoogle(project);
  }
}

/**
 * Save / Update an existing project / session in Google Sheets / LocalStorage / Supabase
 */
export async function updateProject(
  id: string,
  updates: Partial<ProjectRecord>
): Promise<ProjectRecord | null> {
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl || !getSupabaseClient()) {
    return await saveProjectToGoogle({ id, ...updates } as any);
  }

  const client = getSupabaseClient();
  if (!client) return await saveProjectToGoogle({ id, ...updates } as any);

  try {
    const payload: Record<string, any> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.uploaded_outfits) {
      payload.uploaded_outfits = await sanitizeAndUploadOutfits(updates.uploaded_outfits);
    }

    if (updates.items) {
      payload.items = await sanitizeAndUploadProjectItems(updates.items);
    }

    const { data, error } = await client
      .from('projects')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('[Projects] Lỗi cập nhật dự án trên Supabase, lưu local/Google:', error);
      return await saveProjectToGoogle({ id, ...updates } as any);
    }

    return data as ProjectRecord;
  } catch (err) {
    console.error('[Projects] Exception khi cập nhật dự án:', err);
    return await saveProjectToGoogle({ id, ...updates } as any);
  }
}

/**
 * Delete a project from Google Sheets / LocalStorage / Supabase
 */
export async function deleteProject(id: string): Promise<boolean> {
  const googleUrl = getGoogleWebAppUrl();
  if (googleUrl || !getSupabaseClient()) {
    return await deleteProjectFromGoogle(id);
  }

  const client = getSupabaseClient();
  if (!client) return await deleteProjectFromGoogle(id);

  try {
    await client
      .from('projects')
      .delete()
      .eq('id', id);
  } catch (err) {
    console.warn('[Projects] Lỗi xóa dự án Supabase, xóa local/Google:', err);
  }

  return await deleteProjectFromGoogle(id);
}
