import {
  api,
  UploadCancelledError,
  type ClientVideoMetaHint,
  type DirectUploadCompletedPart,
  type UploadProgressEvent,
} from '../api/client';
import type { MediaAsset } from '../types';

export interface SmartUploadProgressEvent extends UploadProgressEvent {
  mode: 'direct' | 'proxy';
  completedParts?: number;
  totalParts?: number;
}

export interface SmartUploadOptions {
  uploadId?: string;
  signal?: AbortSignal;
  onModeResolved?: (mode: 'direct' | 'proxy', totalParts?: number) => void;
  onProgress?: (event: SmartUploadProgressEvent) => void;
  onTransferComplete?: (mode: 'direct' | 'proxy') => void;
}

const PART_CONCURRENCY = 3;
const MAX_PART_RETRIES = 3;
const RETRY_DELAYS_MS = [800, 1800, 3500];

class PutHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PutHttpError';
    this.status = status;
  }
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new UploadCancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function probeLocalVideoMeta(file: File): Promise<ClientVideoMetaHint | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      resolve(undefined);
      return;
    }
    let settled = false;
    let objectUrl = '';
    let baseMeta: ClientVideoMetaHint | undefined;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const finish = (hint?: ClientVideoMetaHint) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        // ignore
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(hint);
    };

    const timer = window.setTimeout(() => finish(baseMeta), 3500);

    const captureFrame = () => {
      try {
        const w = Math.round(video.videoWidth || 0);
        const h = Math.round(video.videoHeight || 0);
        if (w <= 0 || h <= 0) {
          finish(baseMeta);
          return;
        }
        const targetW = Math.min(640, w);
        const targetH = Math.max(2, Math.round((h * targetW) / w));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(baseMeta);
          return;
        }
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length < 300_000) {
          finish({ ...(baseMeta || {}), thumbnail_data_url: dataUrl });
        } else {
          finish(baseMeta);
        }
      } catch {
        finish(baseMeta);
      }
    };

    video.onloadedmetadata = () => {
      const w = Math.round(video.videoWidth || 0);
      const h = Math.round(video.videoHeight || 0);
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 100) / 100 : 0;
      if (w > 0 && h > 0 && dur > 0) {
        baseMeta = { width: w, height: h, duration_sec: dur };
      } else if (dur > 0) {
        baseMeta = { duration_sec: dur };
      }

      if (w > 0 && h > 0) {
        const seekTo = dur > 1 ? Math.min(0.5, dur * 0.1) : 0;
        if (seekTo > 0) {
          video.onseeked = captureFrame;
          try {
            video.currentTime = seekTo;
            return;
          } catch {
            // fallback to immediate capture
          }
        }
        video.onloadeddata = captureFrame;
      } else {
        finish(baseMeta);
      }
    };

    video.onerror = () => finish(baseMeta);

    try {
      objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
    } catch {
      finish(baseMeta);
    }
  });
}

function putBlobToPresignedUrl(
  url: string,
  blob: Blob,
  options?: {
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
  }
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    const onAbort = () => xhr.abort();
    const cleanup = () => options?.signal?.removeEventListener('abort', onAbort);
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.onprogress = (ev) => {
      const total = ev.lengthComputable && ev.total > 0 ? ev.total : blob.size;
      const loaded = Math.min(ev.loaded, total);
      options?.onProgress?.(loaded, total);
    };

    xhr.upload.onload = () => {
      options?.onProgress?.(blob.size, blob.size);
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = (xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '').trim();
        resolve({ etag });
        return;
      }
      reject(new PutHttpError(`云端存储响应异常 (${xhr.status})`, xhr.status));
    };

    xhr.onerror = () => {
      cleanup();
      reject(new PutHttpError('直传云端存储连接中断，请检查网络或跨域配置后重试', 0));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new UploadCancelledError());
    };

    xhr.send(blob);
  });
}

export async function uploadVideoSmart(
  file: File,
  purpose: 'inpaint' | 'translate',
  options?: SmartUploadOptions
): Promise<{ items: MediaAsset[] }> {
  if (options?.signal?.aborted) {
    throw new UploadCancelledError();
  }

  // Extract browser-side video metadata in parallel (never blocks upload)
  const metaHintPromise = probeLocalVideoMeta(file);

  const init = await api.initDirectUpload({
    filename: file.name,
    size_bytes: file.size,
    content_type: file.type || 'video/mp4',
    purpose,
  });

  if (options?.signal?.aborted) {
    if (init.session_id) {
      void api.abortDirectUpload(init.session_id).catch(() => {});
    }
    throw new UploadCancelledError();
  }

  // Fallback for local/open-source deployments without TOS configured
  if (init.mode === 'proxy') {
    options?.onModeResolved?.('proxy');
    return api.uploadAssetWithProgress(file, purpose, {
      uploadId: options?.uploadId,
      signal: options?.signal,
      onProgress: (ev) => options?.onProgress?.({ ...ev, mode: 'proxy' }),
      onTransferComplete: () => options?.onTransferComplete?.('proxy'),
    });
  }

  const sessionId = init.session_id;
  if (!sessionId) {
    throw new Error('初始化云端直传会话失败');
  }

  const totalBytes = Math.max(1, file.size);
  const startTime = performance.now();
  let lastSampleTime = startTime;
  let lastSampleLoaded = 0;
  let emaSpeed = 0;

  const emitProgress = (loadedBytes: number, completedParts?: number, totalParts?: number) => {
    const loaded = Math.max(0, Math.min(loadedBytes, totalBytes));
    const now = performance.now();
    const dt = (now - lastSampleTime) / 1000;
    if (dt >= 0.14 && loaded >= lastSampleLoaded) {
      const inst = (loaded - lastSampleLoaded) / dt;
      emaSpeed = emaSpeed > 0 ? emaSpeed * 0.65 + inst * 0.35 : inst;
      lastSampleTime = now;
      lastSampleLoaded = loaded;
    }
    const elapsed = Math.max(0.08, (now - startTime) / 1000);
    const speedBps = emaSpeed > 0 ? emaSpeed : loaded / elapsed;
    const remaining = Math.max(0, totalBytes - loaded);
    const etaSec = speedBps > 0 ? remaining / speedBps : null;
    const percent = Math.max(0, Math.min(100, Math.round((loaded / totalBytes) * 100)));
    options?.onProgress?.({
      loaded,
      total: totalBytes,
      percent,
      speedBps,
      etaSec,
      mode: 'direct',
      completedParts,
      totalParts,
    });
  };

  // ---- Mode 1: Single presigned PUT (<= 16 MiB) ----
  if (init.mode === 'single_put' && init.upload_url) {
    options?.onModeResolved?.('direct', 1);
    let attempt = 0;
    while (true) {
      try {
        await putBlobToPresignedUrl(init.upload_url, file, {
          signal: options?.signal,
          onProgress: (loaded) => emitProgress(loaded, 0, 1),
        });
        break;
      } catch (err: any) {
        if (err instanceof UploadCancelledError || options?.signal?.aborted) {
          void api.abortDirectUpload(sessionId).catch(() => {});
          throw new UploadCancelledError();
        }
        attempt += 1;
        if (attempt > 2) {
          void api.abortDirectUpload(sessionId).catch(() => {});
          throw err;
        }
        await sleepAbortable(RETRY_DELAYS_MS[attempt - 1] || 1200, options?.signal);
      }
    }

    emitProgress(totalBytes, 1, 1);
    options?.onTransferComplete?.('direct');
    const clientMeta = await metaHintPromise;
    return api.completeDirectUpload(sessionId, [], clientMeta);
  }

  // ---- Mode 2: Concurrent presigned multipart upload (> 16 MiB) ----
  const partSize = init.part_size || 16 * 1024 * 1024;
  const partSpecs = init.parts || [];
  const totalParts = partSpecs.length;
  if (!totalParts) {
    throw new Error('未获取到云端分片上传签名');
  }

  options?.onModeResolved?.('direct', totalParts);

  const partUrlMap = new Map<number, string>();
  partSpecs.forEach((p) => partUrlMap.set(p.part_number, p.url));

  const partLoaded = new Array<number>(totalParts).fill(0);
  const completedParts: DirectUploadCompletedPart[] = [];
  let completedCount = 0;
  let nextIndex = 0;

  const internalAbort = new AbortController();
  const forwardExternalAbort = () => internalAbort.abort();
  options?.signal?.addEventListener('abort', forwardExternalAbort, { once: true });

  const sumLoaded = () => {
    let total = 0;
    for (let i = 0; i < partLoaded.length; i += 1) {
      total += partLoaded[i];
    }
    return total;
  };

  const uploadSinglePart = async (partIdx: number): Promise<void> => {
    const partNumber = partIdx + 1;
    const start = partIdx * partSize;
    const end = Math.min(file.size, start + partSize);
    const chunkBlob = file.slice(start, end);

    let attempt = 0;
    while (true) {
      if (internalAbort.signal.aborted) {
        throw new UploadCancelledError();
      }
      const signedUrl = partUrlMap.get(partNumber);
      if (!signedUrl) {
        throw new Error(`缺少第 ${partNumber} 个分片的上传签名`);
      }

      try {
        const { etag } = await putBlobToPresignedUrl(signedUrl, chunkBlob, {
          signal: internalAbort.signal,
          onProgress: (loaded) => {
            partLoaded[partIdx] = loaded;
            emitProgress(sumLoaded(), completedCount, totalParts);
          },
        });
        if (!etag) {
          throw new Error('云端存储未暴露 ETag 响应头，请检查 TOS 桶 CORS ExposeHeaders 配置');
        }
        partLoaded[partIdx] = chunkBlob.size;
        completedCount += 1;
        completedParts.push({ part_number: partNumber, etag });
        emitProgress(sumLoaded(), completedCount, totalParts);
        return;
      } catch (err: any) {
        if (err instanceof UploadCancelledError || internalAbort.signal.aborted) {
          throw new UploadCancelledError();
        }
        attempt += 1;
        partLoaded[partIdx] = 0;
        emitProgress(sumLoaded(), completedCount, totalParts);

        if (attempt > MAX_PART_RETRIES) {
          throw err;
        }

        // If presigned URL expired (403), request fresh signature for this part
        if (err instanceof PutHttpError && err.status === 403) {
          try {
            const refreshed = await api.signDirectUploadParts(sessionId, [partNumber]);
            const fresh = refreshed.parts.find((p) => p.part_number === partNumber);
            if (fresh?.url) {
              partUrlMap.set(partNumber, fresh.url);
            }
          } catch {
            // Keep existing URL and retry
          }
        }

        await sleepAbortable(RETRY_DELAYS_MS[attempt - 1] || 2500, internalAbort.signal);
      }
    }
  };

  let fatalError: unknown = null;
  const workerCount = Math.min(PART_CONCURRENCY, totalParts);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!fatalError && !internalAbort.signal.aborted) {
      const idx = nextIndex;
      if (idx >= totalParts) break;
      nextIndex += 1;
      try {
        await uploadSinglePart(idx);
      } catch (err) {
        if (!fatalError) {
          fatalError = err;
          internalAbort.abort();
        }
        break;
      }
    }
  });

  try {
    await Promise.all(workers);
  } finally {
    options?.signal?.removeEventListener('abort', forwardExternalAbort);
  }

  if (fatalError) {
    void api.abortDirectUpload(sessionId).catch(() => {});
    if (options?.signal?.aborted) {
      throw new UploadCancelledError();
    }
    throw fatalError;
  }

  completedParts.sort((a, b) => a.part_number - b.part_number);
  emitProgress(totalBytes, totalParts, totalParts);
  options?.onTransferComplete?.('direct');

  const clientMeta = await metaHintPromise;
  return api.completeDirectUpload(sessionId, completedParts, clientMeta);
}
