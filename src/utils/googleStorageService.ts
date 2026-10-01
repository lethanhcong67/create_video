import type { ProjectRecord } from '../types';

export const GOOGLE_WEBAPP_URL_KEY = 'ai_app_google_webapp_url';
export const GOOGLE_DRIVE_FOLDER_ID_KEY = 'ai_app_google_drive_folder_id';

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

export const DEFAULT_GOOGLE_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwFwUu_eW_A7sGgAs2HUAm9qcBowMuER_pAIWwFS32_k6bBd9VDxOcg_lUGi75rjHv2/exec';

/**
 * Lấy Web App URL từ localStorage, .env hoặc URL mặc định cố định
 */
export function getGoogleWebAppUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(GOOGLE_WEBAPP_URL_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  const meta = import.meta as any;
  return meta.env?.VITE_GOOGLE_WEBAPP_URL || DEFAULT_GOOGLE_WEBAPP_URL;
}

/**
 * Lưu Web App URL vào localStorage
 */
export function setGoogleWebAppUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem(GOOGLE_WEBAPP_URL_KEY, url.trim());
    } else {
      localStorage.removeItem(GOOGLE_WEBAPP_URL_KEY);
    }
  }
}

/**
 * Gửi yêu cầu tới Google Apps Script (Sử dụng Backend Proxy để theo dõi redirect 302 của Google và tránh lỗi CORS)
 */
export async function sendGoogleRequest(action: string, payload: Record<string, any> = {}, customUrl?: string): Promise<any> {
  const targetUrl = customUrl || getGoogleWebAppUrl();
  if (!targetUrl) {
    throw new Error('Chưa cấu hình Google Apps Script Web App URL. Vui lòng vào Cài đặt để thêm URL.');
  }

  const requestData = {
    action,
    ...payload,
  };

  let cleanTargetUrl = targetUrl.trim();
  if (cleanTargetUrl.endsWith('/edit') || cleanTargetUrl.includes('/edit?')) {
    cleanTargetUrl = cleanTargetUrl.replace(/\/edit(\?.*)?$/, '/exec');
  }

  // 1. Thử gửi qua backend proxy Express (chạy trong Node.js, 100% không bị ảnh hưởng bởi cookie tài khoản Google trên Chrome)
  try {
    const proxyRes = await fetch('/api/google/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: cleanTargetUrl,
        payload: requestData,
      }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json().catch(() => null);
      if (data) {
        if (data.success === false) {
          throw new Error(data.error || data.message || 'Google Apps Script trả về lỗi');
        }
        return data;
      }
    }
  } catch (proxyErr: any) {
    // Nếu lỗi do proxy server chưa khởi động lại thì tiếp tục thử direct fetch
  }

  // 2. Dự phòng: Gửi trực tiếp từ trình duyệt bằng text/plain
  try {
    const directRes = await fetch(cleanTargetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(requestData),
    });

    const directText = await directRes.text();
    try {
      const directJson = JSON.parse(directText);
      if (directJson.success === false) {
        throw new Error(directJson.error || directJson.message || 'Lỗi từ Google Apps Script');
      }
      return directJson;
    } catch (parseErr: any) {
      if (parseErr?.message && !parseErr.message.includes('JSON') && !parseErr.message.includes('token')) {
        throw parseErr;
      }
      if (action === 'ping' && directRes.ok) {
        return {
          success: true,
          message: 'Kết nối Google Apps Script thành công!',
        };
      }
    }
  } catch (directErr: any) {
    if (action === 'ping') {
      try {
        const getRes = await fetch(cleanTargetUrl, { method: 'GET' });
        const getText = await getRes.text();
        const getJson = JSON.parse(getText);
        if (getJson && (getJson.success || getJson.status === 'ok')) {
          return {
            success: true,
            message: getJson.message || 'Kết nối Google Apps Script thành công!',
          };
        }
      } catch (getErr) {}
    }
    console.error('[Google Storage Error]:', directErr);
    throw new Error(directErr?.message || 'Không thể kết nối đến Google Apps Script. Vui lòng khởi động lại server app hoặc kiểm tra phân quyền "Bất kỳ ai".');
  }
}

/**
 * Kiểm tra kết nối tới Google Apps Script & Google Sheet
 */
export async function testGoogleConnection(customUrl?: string): Promise<{ ok: boolean; message: string; spreadsheetName?: string; folderName?: string }> {
  const targetUrl = customUrl || getGoogleWebAppUrl();
  if (!targetUrl) {
    return { ok: false, message: 'Chưa cấu hình Google Apps Script Web App URL' };
  }

  try {
    const res = await sendGoogleRequest('ping', {}, targetUrl);
    if (res && res.success) {
      return {
        ok: true,
        message: res.message || 'Kết nối Google Drive & Sheets thành công!',
        spreadsheetName: res.spreadsheetName,
        folderName: res.folderName,
      };
    }
    return { ok: false, message: res?.error || 'Phản hồi từ Google không hợp lệ' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Không thể kết nối đến Google Apps Script' };
  }
}

/**
 * Upload ảnh/media trực tiếp lên Google Drive
 */
export async function uploadMediaToGoogleDrive(
  source: string | Blob | File,
  filename: string
): Promise<string | null> {
  const targetUrl = getGoogleWebAppUrl();
  if (!targetUrl) return null;

  try {
    let base64Data: string;

    if (typeof source === 'string') {
      if (source.startsWith('http://') || source.startsWith('https://')) {
        // Link đã có sẵn
        return source;
      }
      base64Data = source;
    } else {
      base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(source);
      });
    }

    // 1. Thử gọi action upload_file siêu nhẹ trước
    try {
      const uploadRes = await sendGoogleRequest('upload_file', {
        filename,
        base64: base64Data,
      });

      if (uploadRes && uploadRes.success && (uploadRes.url || uploadRes.directUrl)) {
        return uploadRes.url || uploadRes.directUrl;
      }
    } catch (fastErr) {
      console.warn('[Google Drive] upload_file action không phản hồi, thử save_generation fallback:', fastErr);
    }

    // 2. Dự phòng: gọi save_generation
    const res = await sendGoogleRequest('save_generation', {
      task_type: 'image_swap',
      prompt: `Upload: ${filename}`,
      input_base64: base64Data,
    });

    if (res && res.success && res.data?.input_media_url) {
      return res.data.input_media_url;
    }
    return null;
  } catch (err) {
    console.error('[Google Drive] Lỗi tải file lên Drive:', err);
    return null;
  }
}

/**
 * Lưu lịch sử tạo ảnh / video vào Google Drive + Google Sheet
 */
export async function saveGenerationRecordToGoogle(
  record: GenerationRecord
): Promise<GenerationRecord | null> {
  const targetUrl = getGoogleWebAppUrl();
  if (!targetUrl) {
    console.warn('[Google Storage] Chưa cấu hình Google Web App URL, bỏ qua lưu cloud');
    return null;
  }

  try {
    let inputBase64 = record.input_base64;
    let outputBase64 = record.output_base64;

    // Trích xuất base64 nếu URL là dataUrl
    if (!inputBase64 && record.input_media && typeof record.input_media === 'object') {
      const firstVal = Object.values(record.input_media)[0];
      if (typeof firstVal === 'string' && firstVal.startsWith('data:')) {
        inputBase64 = firstVal;
      }
    }

    if (!outputBase64 && record.output_media_url && record.output_media_url.startsWith('data:')) {
      outputBase64 = record.output_media_url;
    }

    const payload = {
      task_type: record.task_type,
      status: record.status || 'completed',
      prompt: record.prompt || '',
      negative_prompt: record.negative_prompt || record.camera_prompt || '',
      model_name: record.model_name || '',
      input_media_url: (!inputBase64 && typeof record.input_media === 'string') ? record.input_media : '',
      output_media_url: !outputBase64 ? record.output_media_url : '',
      thumbnail_url: record.thumbnail_url || '',
      input_base64: inputBase64 || null,
      output_base64: outputBase64 || null,
      parameters: record.parameters || {},
    };

    const res = await sendGoogleRequest('save_generation', payload);
    if (res && res.success && res.data) {
      return {
        ...record,
        id: res.data.id,
        created_at: res.data.timestamp,
        output_media_url: res.data.output_media_url || record.output_media_url,
        thumbnail_url: res.data.thumbnail_url || record.thumbnail_url,
      };
    }
    return null;
  } catch (err) {
    console.error('[Google Storage] Lỗi lưu vào Google Drive/Sheet:', err);
    return null;
  }
}

/**
 * Lấy lịch sử tạo ảnh / video từ Google Sheet
 */
export async function fetchGenerationHistoryFromGoogle(options?: {
  taskType?: string;
  limit?: number;
}): Promise<{ items: GenerationRecord[]; total: number }> {
  const targetUrl = getGoogleWebAppUrl();
  if (!targetUrl) {
    return { items: [], total: 0 };
  }

  try {
    const res = await sendGoogleRequest('get_history', {
      limit: options?.limit || 100,
    });

    if (res && res.success && Array.isArray(res.items)) {
      let items: GenerationRecord[] = res.items;

      if (options?.taskType && options.taskType !== 'all') {
        if (options.taskType === 'video') {
          items = items.filter((it) => it.task_type === 'image_to_video' || it.task_type === 'video_swap' || it.task_type === 'video_scene_extract');
        } else if (options.taskType === 'image') {
          items = items.filter((it) => it.task_type === 'image_swap' || it.task_type === 'text_to_image');
        } else {
          items = items.filter((it) => it.task_type === options.taskType);
        }
      }

      return {
        items,
        total: res.total || items.length,
      };
    }
    return { items: [], total: 0 };
  } catch (err) {
    console.error('[Google Storage] Lỗi tải lịch sử từ Google Sheet:', err);
    return { items: [], total: 0 };
  }
}

/**
 * Lưu Dự án / Phiên làm việc 100% vào Google Drive & Google Sheets
 */
export async function saveProjectToGoogle(project: {
  id?: string;
  name?: string;
  author_name?: string;
  description?: string;
  settings?: any;
  uploaded_outfits?: any;
  items?: any;
}): Promise<ProjectRecord | null> {
  const projectId = project.id || `proj_${Date.now()}`;
  const now = new Date().toISOString();

  // Dọn dẹp cache cũ nếu có trong localStorage để không lưu dữ liệu dự án trên máy
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('ai_app_local_projects');
    } catch (e) {}
  }

  const record: ProjectRecord = {
    id: projectId,
    name: (project.name && project.name.trim()) || 'Dự án mới',
    author_name: (project.author_name && project.author_name.trim()) || 'Ẩn danh',
    description: project.description !== undefined ? project.description : '',
    settings: project.settings || {},
    uploaded_outfits: project.uploaded_outfits || [],
    items: project.items || [],
    created_at: now,
    updated_at: now,
  };

  // Gửi trực tiếp lên Google Apps Script để lưu ảnh lên Google Drive và ghi thông tin vào Google Sheets
  const targetUrl = getGoogleWebAppUrl();
  if (targetUrl) {
    try {
      const res = await sendGoogleRequest('save_project', record);
      if (res && res.success && res.data) {
        if (res.data.name) {
          record.name = res.data.name;
        }
        if (res.data.author_name) {
          record.author_name = res.data.author_name;
        }
        if (res.data.description !== undefined) {
          record.description = res.data.description;
        }
        if (res.data.settings) {
          record.settings = res.data.settings;
        }
        if (Array.isArray(res.data.uploaded_outfits)) {
          record.uploaded_outfits = res.data.uploaded_outfits;
        }
        if (Array.isArray(res.data.items)) {
          record.items = res.data.items;
        }
        record.created_at = res.data.created_at || record.created_at;
        record.updated_at = res.data.updated_at || record.updated_at;
        return record;
      }
    } catch (err) {
      console.error('[Google Storage] Lỗi lưu dự án lên Google Sheet & Drive:', err);
      throw err;
    }
  }

  return record;
}

/**
 * Lấy danh sách Dự án 100% từ Google Sheets (không đọc localStorage)
 */
export async function fetchProjectsFromGoogle(): Promise<ProjectRecord[]> {
  // Dọn dẹp cache local cũ
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('ai_app_local_projects');
    } catch (e) {}
  }

  const targetUrl = getGoogleWebAppUrl();
  if (!targetUrl) {
    return [];
  }

  try {
    const res = await sendGoogleRequest('get_projects');
    if (res && res.success && Array.isArray(res.projects)) {
      return res.projects;
    }
    return [];
  } catch (err) {
    console.warn('[Google Storage] Lỗi lấy danh sách dự án từ Google Sheet:', err);
    return [];
  }
}

/**
 * Xóa Dự án 100% khỏi Google Sheets & toàn bộ hình ảnh trên Google Drive
 */
export async function deleteProjectFromGoogle(id: string): Promise<boolean> {
  // Dọn dẹp con trỏ dự án đang mở nếu trùng
  if (typeof window !== 'undefined') {
    try {
      const activeId = localStorage.getItem('ai_app_active_project_id');
      if (activeId === id) {
        localStorage.removeItem('ai_app_active_project_id');
      }
      localStorage.removeItem('ai_app_local_projects');
    } catch (e) {}
  }

  // Gửi lệnh xóa lên Google Apps Script
  const targetUrl = getGoogleWebAppUrl();
  if (targetUrl) {
    try {
      const res = await sendGoogleRequest('delete_project', { id });
      return Boolean(res && res.success);
    } catch (err) {
      console.error('[Google Storage] Lỗi xóa dự án trên Google Sheet & Drive:', err);
      return false;
    }
  }

  return true;
}
