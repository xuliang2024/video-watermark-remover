import type {
  BatchDetail,
  BillingSummary,
  BootstrapData,
  DashboardOverview,
  InpaintConfig,
  MediaAsset,
  RegionItem,
  RegionTemplate,
  SubtitleStyleConfig,
  SystemConfig,
  SystemConfigUpdatePayload,
  TaskDetail,
  TaskRow,
  TranslateConfig,
} from '../types';

export class UploadCancelledError extends Error {
  constructor(message = '已取消上传') {
    super(message);
    this.name = 'UploadCancelledError';
  }
}

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percent: number;
  speedBps: number;
  etaSec: number | null;
}

export interface ServerUploadProgress {
  upload_id: string;
  found: boolean;
  filename: string;
  stage: 'receiving' | 'probing' | 'cloud_sync' | 'done' | 'error';
  stage_label: string;
  received_bytes: number;
  total_bytes: number;
  tos_consumed_bytes: number;
  tos_total_bytes: number;
  tos_percent: number;
  error: string | null;
}

export interface DirectUploadPartSpec {
  part_number: number;
  url: string;
}

export interface DirectUploadInitResponse {
  mode: 'proxy' | 'single_put' | 'multipart';
  session_id?: string;
  asset_id?: string;
  part_size?: number;
  part_count?: number;
  upload_url?: string | null;
  parts?: DirectUploadPartSpec[];
}

export interface DirectUploadCompletedPart {
  part_number: number;
  etag: string;
}

export interface ClientVideoMetaHint {
  width?: number;
  height?: number;
  duration_sec?: number;
  thumbnail_data_url?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    let detail = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      detail = data.detail || data.message || detail;
    } catch {
      // ignore json parse failure
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getBootstrap: () => request<BootstrapData>('/api/system/bootstrap'),

  getSystemConfig: () => request<SystemConfig>('/api/system/config'),

  updateSystemConfig: (payload: SystemConfigUpdatePayload) =>
    request<SystemConfig>('/api/system/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  dismissOnboarding: (executionMode: 'auto' | 'live' | 'mock' = 'live') =>
    request<SystemConfig>('/api/system/onboarding/dismiss', {
      method: 'POST',
      body: JSON.stringify({ execution_mode: executionMode }),
    }),

  resetSystemConfig: (reopenOnboarding = false) =>
    request<SystemConfig>(`/api/system/config/reset?reopen_onboarding=${reopenOnboarding}`, {
      method: 'POST',
    }),

  testVolcengineConnection: (draft?: SystemConfigUpdatePayload) =>
    request<{ las: Record<string, any>; tos: Record<string, any>; ready_for_live: boolean }>(
      '/api/system/test-connection',
      {
        method: 'POST',
        ...(draft ? { body: JSON.stringify(draft) } : {}),
      }
    ),

  getOverview: (status = 'all', q = '') =>
    request<DashboardOverview>(
      `/api/dashboard/overview?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`
    ),

  listAssets: (purpose: 'inpaint' | 'translate' | 'all' = 'all') =>
    request<{ items: MediaAsset[] }>(`/api/assets?purpose=${purpose}`),

  uploadAssets: (files: FileList | File[], purpose: 'inpaint' | 'translate') => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    return request<{ items: MediaAsset[] }>(`/api/assets/upload?purpose=${purpose}`, {
      method: 'POST',
      body: fd,
    });
  },

  getUploadProgress: (uploadId: string) =>
    request<ServerUploadProgress>(`/api/assets/upload-progress/${encodeURIComponent(uploadId)}`),

  initDirectUpload: (payload: {
    filename: string;
    size_bytes: number;
    content_type: string;
    purpose: 'inpaint' | 'translate';
  }) =>
    request<DirectUploadInitResponse>('/api/assets/direct-upload/init', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  signDirectUploadParts: (sessionId: string, partNumbers: number[]) =>
    request<{ session_id: string; parts: DirectUploadPartSpec[] }>('/api/assets/direct-upload/sign-parts', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, part_numbers: partNumbers }),
    }),

  completeDirectUpload: (
    sessionId: string,
    parts: DirectUploadCompletedPart[],
    clientMeta?: ClientVideoMetaHint
  ) =>
    request<{ items: MediaAsset[] }>('/api/assets/direct-upload/complete', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        parts,
        ...(clientMeta ? { client_meta: clientMeta } : {}),
      }),
    }),

  abortDirectUpload: (sessionId: string) =>
    request<{ aborted: boolean }>('/api/assets/direct-upload/abort', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    }),

  uploadAssetWithProgress: (
    file: File,
    purpose: 'inpaint' | 'translate',
    options?: {
      uploadId?: string;
      signal?: AbortSignal;
      onProgress?: (event: UploadProgressEvent) => void;
      onTransferComplete?: () => void;
    }
  ): Promise<{ items: MediaAsset[] }> => {
    return new Promise((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new UploadCancelledError());
        return;
      }

      const fd = new FormData();
      fd.append('files', file);

      const qs = new URLSearchParams({ purpose });
      if (options?.uploadId) qs.set('upload_id', options.uploadId);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/assets/upload?${qs.toString()}`);

      const startTime = performance.now();
      let lastSampleTime = startTime;
      let lastSampleLoaded = 0;
      let emaSpeed = 0;

      const onAbort = () => {
        xhr.abort();
      };
      const cleanup = () => {
        options?.signal?.removeEventListener('abort', onAbort);
      };
      options?.signal?.addEventListener('abort', onAbort, { once: true });

      xhr.upload.onprogress = (ev) => {
        const total = ev.lengthComputable && ev.total > 0 ? ev.total : Math.max(1, file.size);
        const loaded = Math.min(ev.loaded, total);
        const now = performance.now();
        const dt = (now - lastSampleTime) / 1000;
        if (dt >= 0.12 && loaded >= lastSampleLoaded) {
          const instSpeed = (loaded - lastSampleLoaded) / dt;
          emaSpeed = emaSpeed > 0 ? emaSpeed * 0.65 + instSpeed * 0.35 : instSpeed;
          lastSampleTime = now;
          lastSampleLoaded = loaded;
        }
        const elapsed = Math.max(0.08, (now - startTime) / 1000);
        const speedBps = emaSpeed > 0 ? emaSpeed : loaded / elapsed;
        const remaining = Math.max(0, total - loaded);
        const etaSec = speedBps > 0 ? remaining / speedBps : null;
        const percent = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
        options?.onProgress?.({ loaded, total, percent, speedBps, etaSec });
      };

      xhr.upload.onload = () => {
        const total = Math.max(1, file.size);
        const elapsed = Math.max(0.08, (performance.now() - startTime) / 1000);
        options?.onProgress?.({
          loaded: total,
          total,
          percent: 100,
          speedBps: emaSpeed > 0 ? emaSpeed : total / elapsed,
          etaSec: 0,
        });
        options?.onTransferComplete?.();
      };

      xhr.onload = () => {
        cleanup();
        const rawText = xhr.responseText || '';
        let parsed: any = null;
        try {
          parsed = rawText ? JSON.parse(rawText) : null;
        } catch {
          parsed = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve((parsed || { items: [] }) as { items: MediaAsset[] });
          return;
        }

        let detail = parsed?.detail || parsed?.message || `上传失败 (${xhr.status})`;
        if (xhr.status === 413) {
          detail = '文件体积超出网关限制，请压缩或分段后再上传';
        }
        reject(new Error(detail));
      };

      xhr.onerror = () => {
        cleanup();
        reject(new Error('网络连接中断，请检查网络后重试'));
      };

      xhr.onabort = () => {
        cleanup();
        reject(new UploadCancelledError());
      };

      xhr.send(fd);
    });
  },

  deleteAsset: (assetId: string) =>
    request<{ deleted: boolean }>(`/api/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    }),

  clearAssets: (purpose: 'inpaint' | 'translate') =>
    request<{ cleared: boolean }>(`/api/assets/clear?purpose=${purpose}`, {
      method: 'POST',
    }),

  restoreSampleAssets: (purpose: 'inpaint' | 'translate') =>
    request<{ items: MediaAsset[] }>(`/api/assets/restore-samples?purpose=${purpose}`, {
      method: 'POST',
    }),

  createInpaintBatch: (assetIds: string[], config: InpaintConfig, name?: string) =>
    request<{
      batch_id: string;
      code: string;
      task_count: number;
      estimated_bill_min: number;
      estimated_cost: number;
      execution_mode: string;
    }>('/api/batches/inpaint', {
      method: 'POST',
      body: JSON.stringify({ asset_ids: assetIds, config, name }),
    }),

  createTranslateBatch: (assetIds: string[], config: TranslateConfig, name?: string) =>
    request<{
      batch_id: string;
      code: string;
      task_count: number;
      estimated_bill_min: number;
      estimated_cost: number;
      execution_mode: string;
    }>('/api/batches/translate', {
      method: 'POST',
      body: JSON.stringify({ asset_ids: assetIds, config, name }),
    }),

  getBatchDetail: (batchId: string) =>
    request<BatchDetail>(`/api/batches/${encodeURIComponent(batchId)}`),

  pauseBatch: (batchId: string) =>
    request<{ paused: boolean }>(`/api/batches/${encodeURIComponent(batchId)}/pause`, {
      method: 'POST',
    }),

  resumeBatch: (batchId: string) =>
    request<{ paused: boolean }>(`/api/batches/${encodeURIComponent(batchId)}/resume`, {
      method: 'POST',
    }),

  cancelBatch: (batchId: string) =>
    request<{ cancelled_tasks: number }>(`/api/batches/${encodeURIComponent(batchId)}/cancel`, {
      method: 'POST',
    }),

  getTaskDetail: (taskId: string) =>
    request<TaskDetail>(`/api/tasks/${encodeURIComponent(taskId)}`),

  retryTask: (taskId: string) =>
    request<TaskRow>(`/api/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
    }),

  listRegionTemplates: () => request<{ items: RegionTemplate[] }>('/api/templates/regions'),

  createRegionTemplate: (name: string, regions: RegionItem[]) =>
    request<RegionTemplate>('/api/templates/regions', {
      method: 'POST',
      body: JSON.stringify({ name, regions }),
    }),

  getSubtitleStyle: () => request<SubtitleStyleConfig>('/api/settings/subtitle-style'),

  updateSubtitleStyle: (style: SubtitleStyleConfig) =>
    request<SubtitleStyleConfig>('/api/settings/subtitle-style', {
      method: 'PUT',
      body: JSON.stringify(style),
    }),

  resetSubtitleStyle: () =>
    request<SubtitleStyleConfig>('/api/settings/subtitle-style/reset', {
      method: 'POST',
    }),

  getBillingSummary: () => request<BillingSummary>('/api/billing/summary'),
};

export function triggerDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
