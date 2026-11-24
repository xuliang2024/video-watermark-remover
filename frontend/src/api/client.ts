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

  dismissOnboarding: (executionMode: 'auto' | 'mock' = 'auto') =>
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
