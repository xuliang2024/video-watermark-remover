import { useEffect, useRef, useState } from 'react';
import { api, UploadCancelledError } from '../api/client';
import { formatBytes, formatEta, formatSpeed } from '../utils/calc';
import { uploadVideoSmart } from '../utils/directUpload';
import { CheckIcon, CloseIcon } from './Icons';

export interface VideoUploadZoneProps {
  purpose: 'inpaint' | 'translate';
  variant: 'dropzone' | 'strip';
  accept: string;
  idleTitle: string;
  idleSubtitle: string;
  idleTip?: string;
  onAssetUploaded: () => Promise<void>;
  onToast: (msg: string) => void;
}

type UploadItemStatus = 'queued' | 'uploading' | 'probing' | 'cloud_sync' | 'done' | 'error' | 'cancelled';

interface UploadQueueItem {
  localId: string;
  uploadId: string;
  file: File;
  name: string;
  sizeBytes: number;
  status: UploadItemStatus;
  loadedBytes: number;
  totalBytes: number;
  uploadPercent: number;
  speedBps: number;
  etaSec: number | null;
  serverStageLabel: string;
  uploadMode?: 'direct' | 'proxy';
  completedParts?: number;
  totalParts?: number;
  tosConsumedBytes: number;
  tosTotalBytes: number;
  tosPercent: number;
  error?: string;
}

const MAX_CONCURRENT_UPLOADS = 2;
const MAX_BATCH_FILES = 200;
const MAX_FILE_BYTES = 10 * 1024 ** 3;
const ALLOWED_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.flv', '.webm']);

let seqCounter = 0;
function makeId(prefix: string): string {
  seqCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${seqCounter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function validateVideoFile(file: File): string | null {
  const ext = getFileExt(file.name);
  if (!ext || !ALLOWED_EXTS.has(ext)) {
    return `不支持的格式（仅支持 mp4 / mov / avi / mkv / flv / webm）`;
  }
  if (file.size === 0) {
    return '文件为空，无法上传';
  }
  if (file.size > MAX_FILE_BYTES) {
    return '超过单文件 10 GB 上限';
  }
  return null;
}

async function readEntryFiles(entry: any): Promise<File[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file: File) => {
          if (file.name.startsWith('.') || file.name === 'Thumbs.db') {
            resolve([]);
          } else {
            resolve([file]);
          }
        },
        () => resolve([])
      );
    });
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const collected: File[] = [];
    const readBatch = (): Promise<any[]> =>
      new Promise((resolve) => {
        reader.readEntries(
          (entries: any[]) => resolve(entries || []),
          () => resolve([])
        );
      });
    while (true) {
      const entries = await readBatch();
      if (!entries.length) break;
      for (const child of entries) {
        const nested = await readEntryFiles(child);
        collected.push(...nested);
      }
    }
    return collected;
  }
  return [];
}

async function extractDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const entries: any[] = [];
    let hasDirectory = false;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] as any;
      if (typeof item.webkitGetAsEntry === 'function') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) hasDirectory = true;
          entries.push(entry);
        }
      }
    }
    if (hasDirectory && entries.length > 0) {
      const result: File[] = [];
      for (const entry of entries) {
        const files = await readEntryFiles(entry);
        result.push(...files);
      }
      return result;
    }
  }
  return Array.from(dataTransfer.files || []);
}

function isItemActive(status: UploadItemStatus): boolean {
  return status === 'queued' || status === 'uploading' || status === 'probing' || status === 'cloud_sync';
}

export function VideoUploadZone({
  purpose,
  variant,
  accept,
  idleTitle,
  idleSubtitle,
  idleTip,
  onAssetUploaded,
  onToast,
}: VideoUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);

  const queueRef = useRef<UploadQueueItem[]>([]);
  const activeIdsRef = useRef<Set<string>>(new Set());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const pollTimersRef = useRef<Map<string, number>>(new Map());
  const autoClearTimerRef = useRef<number | null>(null);
  const batchSuccessCountRef = useRef(0);
  const mountedRef = useRef(true);

  const onAssetUploadedRef = useRef(onAssetUploaded);
  const onToastRef = useRef(onToast);
  onAssetUploadedRef.current = onAssetUploaded;
  onToastRef.current = onToast;

  function syncQueue(updater: (prev: UploadQueueItem[]) => UploadQueueItem[]) {
    const next = updater(queueRef.current);
    queueRef.current = next;
    if (mountedRef.current) {
      setQueue(next);
    }
  }

  function clearAutoDismiss() {
    if (autoClearTimerRef.current !== null) {
      window.clearTimeout(autoClearTimerRef.current);
      autoClearTimerRef.current = null;
    }
  }

  function stopPolling(localId: string) {
    const timer = pollTimersRef.current.get(localId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      pollTimersRef.current.delete(localId);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAutoDismiss();
      pollTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      pollTimersRef.current.clear();
      controllersRef.current.forEach((ctrl) => ctrl.abort());
      controllersRef.current.clear();
    };
  }, []);

  function startServerProgressPolling(localId: string, uploadId: string) {
    stopPolling(localId);

    const poll = async () => {
      if (!mountedRef.current || !activeIdsRef.current.has(localId)) return;
      try {
        const prog = await api.getUploadProgress(uploadId);
        if (!mountedRef.current || !activeIdsRef.current.has(localId)) return;
        if (prog.found) {
          syncQueue((prev) =>
            prev.map((item) => {
              if (item.localId !== localId) return item;
              if (item.status === 'done' || item.status === 'error' || item.status === 'cancelled') {
                return item;
              }
              const nextStatus: UploadItemStatus =
                prog.stage === 'cloud_sync'
                  ? 'cloud_sync'
                  : prog.stage === 'probing'
                    ? 'probing'
                    : item.status === 'uploading'
                      ? 'probing'
                      : item.status;
              return {
                ...item,
                status: nextStatus,
                serverStageLabel: prog.stage_label || item.serverStageLabel,
                tosConsumedBytes: prog.tos_consumed_bytes || item.tosConsumedBytes,
                tosTotalBytes: prog.tos_total_bytes || item.tosTotalBytes || item.sizeBytes,
                tosPercent: prog.tos_percent ?? item.tosPercent,
              };
            })
          );
        }
      } catch {
        // Ignore transient poll errors; XHR response remains source of truth
      }

      if (mountedRef.current && activeIdsRef.current.has(localId)) {
        const nextTimer = window.setTimeout(poll, 450);
        pollTimersRef.current.set(localId, nextTimer);
      }
    };

    const firstTimer = window.setTimeout(poll, 220);
    pollTimersRef.current.set(localId, firstTimer);
  }

  function checkBatchFinished() {
    const items = queueRef.current;
    const stillWorking = items.some((it) => isItemActive(it.status));
    if (stillWorking) return;

    const uploadedNow = batchSuccessCountRef.current;
    batchSuccessCountRef.current = 0;

    const hasProblems = items.some((it) => it.status === 'error' || it.status === 'cancelled');
    if (uploadedNow > 0) {
      const msg =
        purpose === 'translate'
          ? `已添加 ${uploadedNow} 个源视频到翻译队列`
          : `已上传并解析 ${uploadedNow} 个视频文件`;
      onToastRef.current(hasProblems ? `${msg}（部分文件未成功，可在队列中重试）` : msg);
    }

    if (!hasProblems && items.length > 0) {
      clearAutoDismiss();
      autoClearTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        const latest = queueRef.current;
        if (latest.every((it) => it.status === 'done')) {
          syncQueue(() => []);
        }
      }, 2800);
    }
  }

  function drainQueue() {
    while (activeIdsRef.current.size < MAX_CONCURRENT_UPLOADS) {
      const nextItem = queueRef.current.find(
        (item) => item.status === 'queued' && !activeIdsRef.current.has(item.localId)
      );
      if (!nextItem) break;
      void runUpload(nextItem.localId);
    }
  }

  async function runUpload(localId: string) {
    const target = queueRef.current.find((item) => item.localId === localId);
    if (!target || target.status !== 'queued') return;

    activeIdsRef.current.add(localId);
    const controller = new AbortController();
    controllersRef.current.set(localId, controller);

    syncQueue((prev) =>
      prev.map((item) =>
        item.localId === localId
          ? {
              ...item,
              status: 'uploading',
              loadedBytes: 0,
              uploadPercent: 0,
              speedBps: 0,
              etaSec: null,
              tosConsumedBytes: 0,
              tosTotalBytes: item.sizeBytes,
              tosPercent: 0,
              error: undefined,
            }
          : item
      )
    );

    try {
      await uploadVideoSmart(target.file, purpose, {
        uploadId: target.uploadId,
        signal: controller.signal,
        onModeResolved: (mode, totalParts) => {
          syncQueue((prev) =>
            prev.map((item) =>
              item.localId === localId
                ? {
                    ...item,
                    uploadMode: mode,
                    completedParts: 0,
                    totalParts,
                  }
                : item
            )
          );
        },
        onProgress: (ev) => {
          syncQueue((prev) =>
            prev.map((item) =>
              item.localId === localId && item.status === 'uploading'
                ? {
                    ...item,
                    uploadMode: ev.mode,
                    loadedBytes: ev.loaded,
                    totalBytes: ev.total,
                    uploadPercent: ev.percent,
                    speedBps: ev.speedBps,
                    etaSec: ev.etaSec,
                    completedParts: ev.completedParts,
                    totalParts: ev.totalParts,
                  }
                : item
            )
          );
        },
        onTransferComplete: (mode) => {
          syncQueue((prev) =>
            prev.map((item) =>
              item.localId === localId && item.status === 'uploading'
                ? {
                    ...item,
                    status: 'probing',
                    uploadMode: mode,
                    loadedBytes: item.totalBytes || item.sizeBytes,
                    uploadPercent: 100,
                    speedBps: 0,
                    etaSec: null,
                    serverStageLabel:
                      mode === 'direct' && (item.totalParts || 1) > 1
                        ? '正在合并云端分片并解析元信息'
                        : '正在解析视频元信息与封面',
                  }
                : item
            )
          );
          if (mode === 'proxy') {
            startServerProgressPolling(localId, target.uploadId);
          }
        },
      });

      stopPolling(localId);
      batchSuccessCountRef.current += 1;
      syncQueue((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? {
                ...item,
                status: 'done',
                loadedBytes: item.totalBytes || item.sizeBytes,
                uploadPercent: 100,
                tosPercent: 100,
                speedBps: 0,
                etaSec: 0,
                serverStageLabel: '上传与解析完成',
              }
            : item
        )
      );

      // Immediately refresh asset list so each finished file appears right away
      try {
        await onAssetUploadedRef.current();
      } catch {
        // Ignore refresh error; file is already stored server-side
      }
    } catch (err: any) {
      stopPolling(localId);
      const isCancelled = err instanceof UploadCancelledError || err?.name === 'UploadCancelledError';
      syncQueue((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? {
                ...item,
                status: isCancelled ? 'cancelled' : 'error',
                speedBps: 0,
                etaSec: null,
                error: isCancelled ? '已取消上传' : err?.message || '上传失败',
              }
            : item
        )
      );
    } finally {
      stopPolling(localId);
      activeIdsRef.current.delete(localId);
      controllersRef.current.delete(localId);
      drainQueue();
      checkBatchFinished();
    }
  }

  function enqueueFiles(incoming: File[]) {
    if (!incoming.length) return;
    clearAutoDismiss();

    let filesToAdd = incoming;
    if (filesToAdd.length > MAX_BATCH_FILES) {
      onToast(`单次最多选择 ${MAX_BATCH_FILES} 个文件，已截取前 ${MAX_BATCH_FILES} 个`);
      filesToAdd = filesToAdd.slice(0, MAX_BATCH_FILES);
    }

    const newItems: UploadQueueItem[] = filesToAdd.map((file) => {
      const validationErr = validateVideoFile(file);
      return {
        localId: makeId('item'),
        uploadId: makeId('up'),
        file,
        name: file.name,
        sizeBytes: file.size,
        status: validationErr ? 'error' : 'queued',
        loadedBytes: 0,
        totalBytes: Math.max(1, file.size),
        uploadPercent: 0,
        speedBps: 0,
        etaSec: null,
        serverStageLabel: '等待上传',
        tosConsumedBytes: 0,
        tosTotalBytes: file.size,
        tosPercent: 0,
        error: validationErr || undefined,
      };
    });

    // Clear stale completed-only records when starting a brand new batch
    syncQueue((prev) => {
      const hasOngoingOrErr = prev.some((it) => it.status !== 'done');
      return hasOngoingOrErr ? [...prev, ...newItems] : newItems;
    });

    drainQueue();
    checkBatchFinished();
  }

  function handleCancelItem(localId: string) {
    const target = queueRef.current.find((it) => it.localId === localId);
    if (!target) return;
    if (target.status === 'queued') {
      syncQueue((prev) =>
        prev.map((it) => (it.localId === localId ? { ...it, status: 'cancelled', error: '已取消上传' } : it))
      );
      checkBatchFinished();
      return;
    }
    const ctrl = controllersRef.current.get(localId);
    if (ctrl) {
      ctrl.abort();
    }
  }

  function handleCancelAll() {
    clearAutoDismiss();
    syncQueue((prev) =>
      prev.map((it) =>
        it.status === 'queued' ? { ...it, status: 'cancelled', error: '已取消上传' } : it
      )
    );
    controllersRef.current.forEach((ctrl) => ctrl.abort());
    checkBatchFinished();
  }

  function handleRetryItem(localId: string) {
    clearAutoDismiss();
    syncQueue((prev) =>
      prev.map((it) => {
        if (it.localId !== localId) return it;
        const validationErr = validateVideoFile(it.file);
        if (validationErr) return { ...it, status: 'error', error: validationErr };
        return {
          ...it,
          uploadId: makeId('up'),
          status: 'queued',
          loadedBytes: 0,
          uploadPercent: 0,
          speedBps: 0,
          etaSec: null,
          tosConsumedBytes: 0,
          tosPercent: 0,
          error: undefined,
        };
      })
    );
    drainQueue();
  }

  function handleRetryAllFailed() {
    clearAutoDismiss();
    syncQueue((prev) =>
      prev.map((it) => {
        if (it.status !== 'error' && it.status !== 'cancelled') return it;
        const validationErr = validateVideoFile(it.file);
        if (validationErr) return it;
        return {
          ...it,
          uploadId: makeId('up'),
          status: 'queued',
          loadedBytes: 0,
          uploadPercent: 0,
          speedBps: 0,
          etaSec: null,
          tosConsumedBytes: 0,
          tosPercent: 0,
          error: undefined,
        };
      })
    );
    drainQueue();
  }

  function handleDismissQueue() {
    clearAutoDismiss();
    syncQueue((prev) => prev.filter((it) => isItemActive(it.status)));
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragover(false);
    const extracted = await extractDroppedFiles(e.dataTransfer);
    enqueueFiles(extracted);
  }

  // ---- Aggregate Telemetry ----
  const totalCount = queue.length;
  const activeItems = queue.filter((it) => isItemActive(it.status));
  const uploadingItems = queue.filter((it) => it.status === 'uploading');
  const queuedItems = queue.filter((it) => it.status === 'queued');
  const probingItems = queue.filter((it) => it.status === 'probing');
  const cloudSyncItems = queue.filter((it) => it.status === 'cloud_sync');
  const doneItems = queue.filter((it) => it.status === 'done');
  const errorItems = queue.filter((it) => it.status === 'error');
  const cancelledItems = queue.filter((it) => it.status === 'cancelled');

  const hasActive = activeItems.length > 0;
  const isTransferring = uploadingItems.length > 0 || queuedItems.length > 0;
  const isCloudSyncOnly = !isTransferring && cloudSyncItems.length > 0;
  const isProbingOnly = !isTransferring && !isCloudSyncOnly && probingItems.length > 0;
  const retryableCount = queue.filter(
    (it) => (it.status === 'error' || it.status === 'cancelled') && !validateVideoFile(it.file)
  ).length;

  const validItems = queue.filter((it) => it.status !== 'error' && it.status !== 'cancelled');
  const totalValidBytes = validItems.reduce((sum, it) => sum + Math.max(0, it.sizeBytes), 0);
  const transferredBytes = validItems.reduce((sum, it) => {
    if (it.status === 'done' || it.status === 'probing' || it.status === 'cloud_sync') {
      return sum + Math.max(0, it.sizeBytes);
    }
    if (it.status === 'uploading') {
      return sum + Math.min(it.loadedBytes, it.sizeBytes);
    }
    return sum;
  }, 0);

  const transferPercent =
    totalValidBytes > 0 ? Math.max(0, Math.min(100, Math.round((transferredBytes / totalValidBytes) * 100))) : 0;

  const totalSpeedBps = uploadingItems.reduce((sum, it) => sum + (it.speedBps || 0), 0);
  const remainingTransferBytes =
    uploadingItems.reduce((sum, it) => sum + Math.max(0, (it.totalBytes || it.sizeBytes) - it.loadedBytes), 0) +
    queuedItems.reduce((sum, it) => sum + Math.max(0, it.sizeBytes), 0);
  const overallEtaSec = totalSpeedBps > 0 ? remainingTransferBytes / totalSpeedBps : null;

  const tosTotalBytes = cloudSyncItems.reduce((sum, it) => sum + Math.max(1, it.tosTotalBytes || it.sizeBytes), 0);
  const tosConsumedBytes = cloudSyncItems.reduce((sum, it) => sum + Math.max(0, it.tosConsumedBytes), 0);
  const tosOverallPercent =
    tosTotalBytes > 0 ? Math.max(0, Math.min(100, Math.round((tosConsumedBytes / tosTotalBytes) * 100))) : 0;

  // Headline & status styling
  let overallTone: 'uploading' | 'processing' | 'done' | 'error' = 'done';
  let overallHeadline = '';
  let overallSubline = '';
  let overallPercentText = `${transferPercent}%`;
  let overallBarWidth = transferPercent;
  let overallBarIndeterminate = false;

  if (isTransferring) {
    overallTone = 'uploading';
    const activeTransferCount = Math.max(1, uploadingItems.length);
    overallHeadline =
      validItems.length === 1
        ? `正在上传 ${uploadingItems[0]?.name || queuedItems[0]?.name || '视频'}`
        : `正在上传 ${activeTransferCount} 个视频 · 已完成 ${doneItems.length}/${validItems.length}`;
    const metaParts = [`${formatBytes(transferredBytes)} / ${formatBytes(totalValidBytes)}`];
    if (totalSpeedBps > 0) metaParts.push(formatSpeed(totalSpeedBps));
    const etaStr = formatEta(overallEtaSec);
    if (etaStr) metaParts.push(etaStr);
    overallSubline = metaParts.join(' · ');
    overallPercentText = `${transferPercent}%`;
    overallBarWidth = transferPercent;
  } else if (isCloudSyncOnly) {
    overallTone = 'processing';
    overallHeadline =
      cloudSyncItems.length === 1
        ? `正在同步至云端存储 · ${cloudSyncItems[0].name}`
        : `正在同步 ${cloudSyncItems.length} 个视频至云端存储`;
    overallSubline =
      tosConsumedBytes > 0
        ? `云端同步 ${formatBytes(tosConsumedBytes)} / ${formatBytes(tosTotalBytes)}`
        : '文件已传至服务器，正在同步至对象存储...';
    overallPercentText = tosOverallPercent > 0 ? `${tosOverallPercent}%` : '同步中';
    overallBarWidth = tosOverallPercent > 0 ? tosOverallPercent : 100;
    overallBarIndeterminate = tosOverallPercent === 0;
  } else if (isProbingOnly) {
    overallTone = 'processing';
    overallHeadline =
      probingItems.length === 1
        ? `正在解析视频元信息与封面 · ${probingItems[0].name}`
        : `正在解析 ${probingItems.length} 个视频的元信息与封面`;
    overallSubline = `传输已完成 (${formatBytes(totalValidBytes)}) · ffprobe 提取分辨率、帧率与首帧封面`;
    overallPercentText = '解析中';
    overallBarWidth = 100;
    overallBarIndeterminate = true;
  } else if (errorItems.length > 0 || cancelledItems.length > 0) {
    overallTone = 'error';
    const parts: string[] = [];
    if (doneItems.length > 0) parts.push(`${doneItems.length} 个成功`);
    if (errorItems.length > 0) parts.push(`${errorItems.length} 个失败`);
    if (cancelledItems.length > 0) parts.push(`${cancelledItems.length} 个已取消`);
    overallHeadline = `上传任务结束 · ${parts.join('，')}`;
    overallSubline = retryableCount > 0 ? '可点击重试重新上传失败或取消的文件' : '请检查文件格式与体积限制';
    overallPercentText = doneItems.length > 0 ? `${Math.round((doneItems.length / totalCount) * 100)}%` : '未完成';
    overallBarWidth = totalCount > 0 ? Math.round((doneItems.length / totalCount) * 100) : 0;
  } else if (doneItems.length > 0) {
    overallTone = 'done';
    overallHeadline = `全部 ${doneItems.length} 个视频上传并解析完成`;
    overallSubline = `合计 ${formatBytes(totalValidBytes)} · 已自动加入下方素材列表`;
    overallPercentText = '100%';
    overallBarWidth = 100;
  }

  function renderItemBadge(item: UploadQueueItem) {
    switch (item.status) {
      case 'queued':
        return <span className="uq-badge queued">排队中</span>;
      case 'uploading':
        return <span className="uq-badge uploading">{item.uploadMode === 'direct' ? '直传云端' : '上传中'}</span>;
      case 'probing':
        return <span className="uq-badge processing">解析元信息</span>;
      case 'cloud_sync':
        return <span className="uq-badge processing">云端同步</span>;
      case 'done':
        return <span className="uq-badge done">已完成</span>;
      case 'cancelled':
        return <span className="uq-badge cancelled">已取消</span>;
      case 'error':
        return <span className="uq-badge error">失败</span>;
    }
  }

  function renderItemTelemetry(item: UploadQueueItem) {
    switch (item.status) {
      case 'queued':
        return <span className="uq-telemetry">{formatBytes(item.sizeBytes)} · 等待队列</span>;
      case 'uploading': {
        const parts: string[] = [];
        if (item.uploadMode === 'direct' && item.totalParts && item.totalParts > 1) {
          parts.push(`分片 ${item.completedParts ?? 0}/${item.totalParts}`);
        }
        parts.push(`${formatBytes(item.loadedBytes)} / ${formatBytes(item.sizeBytes)}`);
        if (item.speedBps > 0) parts.push(formatSpeed(item.speedBps));
        return (
          <span className="uq-telemetry">
            <span>{parts.join(' · ')}</span>
            <strong className="uq-pct uploading">{item.uploadPercent}%</strong>
          </span>
        );
      }
      case 'probing':
        return (
          <span className="uq-telemetry">
            <span>
              {formatBytes(item.sizeBytes)} ·{' '}
              {item.uploadMode === 'direct' && (item.totalParts || 1) > 1 ? '合并分片并解析中' : 'ffprobe 解析中'}
            </span>
          </span>
        );
      case 'cloud_sync':
        return (
          <span className="uq-telemetry">
            <span>
              {item.tosConsumedBytes > 0
                ? `${formatBytes(item.tosConsumedBytes)} / ${formatBytes(item.tosTotalBytes || item.sizeBytes)}`
                : '同步对象存储中'}
            </span>
            {item.tosPercent > 0 && <strong className="uq-pct processing">{item.tosPercent}%</strong>}
          </span>
        );
      case 'done':
        return (
          <span className="uq-telemetry">
            <span>{formatBytes(item.sizeBytes)}</span>
            <strong className="uq-pct done">100%</strong>
          </span>
        );
      case 'cancelled':
        return <span className="uq-telemetry muted">{item.error || '已取消上传'}</span>;
      case 'error':
        return (
          <span className="uq-telemetry error" title={item.error}>
            {item.error || '上传失败'}
          </span>
        );
    }
  }

  function renderQueueContent() {
    return (
      <div className={`uq-body ${variant === 'strip' ? 'is-strip' : ''}`}>
        <div className="uq-header">
          <div className="uq-header-left">
            <span className={`uq-status-indicator ${overallTone}`}>
              {overallTone === 'done' ? <CheckIcon /> : null}
            </span>
            <div className="uq-title-block">
              <div className="uq-headline" title={overallHeadline}>
                {overallHeadline}
              </div>
              <div className="uq-subline">{overallSubline}</div>
            </div>
          </div>

          <div className="uq-header-right">
            <span className={`uq-overall-pct ${overallTone}`}>{overallPercentText}</span>
            {variant === 'dropzone' && (
              <button
                type="button"
                className="btn btn-tonal btn-sm uq-action-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                + 继续添加
              </button>
            )}
            {hasActive ? (
              <button type="button" className="btn btn-ghost btn-sm uq-cancel-btn" onClick={handleCancelAll}>
                全部取消
              </button>
            ) : (
              <>
                {retryableCount > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm uq-action-btn" onClick={handleRetryAllFailed}>
                    重试失败 ({retryableCount})
                  </button>
                )}
                <button
                  type="button"
                  className="uq-icon-btn"
                  title="收起上传队列"
                  aria-label="收起上传队列"
                  onClick={handleDismissQueue}
                >
                  <CloseIcon />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="uq-overall-track">
          <div
            className={`uq-overall-fill ${overallTone} ${overallBarIndeterminate ? 'indeterminate' : ''}`}
            style={overallBarIndeterminate ? undefined : { width: `${overallBarWidth}%` }}
          />
        </div>

        <div className="uq-list">
          {queue.map((item) => {
            const barPct =
              item.status === 'done'
                ? 100
                : item.status === 'uploading'
                  ? item.uploadPercent
                  : item.status === 'cloud_sync'
                    ? item.tosPercent
                    : item.status === 'probing'
                      ? 100
                      : 0;
            const barIndeterminate =
              item.status === 'probing' || (item.status === 'cloud_sync' && item.tosPercent === 0);
            const barTone =
              item.status === 'error'
                ? 'error'
                : item.status === 'probing' || item.status === 'cloud_sync'
                  ? 'processing'
                  : item.status === 'done'
                    ? 'done'
                    : 'uploading';

            return (
              <div className={`uq-row status-${item.status}`} key={item.localId}>
                <div className="uq-row-top">
                  <div className="uq-row-name-wrap">
                    {renderItemBadge(item)}
                    <span className="uq-row-name" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div className="uq-row-right">
                    {renderItemTelemetry(item)}
                    {isItemActive(item.status) && (
                      <button
                        type="button"
                        className="uq-row-btn"
                        title="取消此文件"
                        aria-label={`取消上传 ${item.name}`}
                        onClick={() => handleCancelItem(item.localId)}
                      >
                        <CloseIcon />
                      </button>
                    )}
                    {(item.status === 'error' || item.status === 'cancelled') && !validateVideoFile(item.file) && (
                      <button
                        type="button"
                        className="uq-retry-link"
                        onClick={() => handleRetryItem(item.localId)}
                      >
                        重试
                      </button>
                    )}
                  </div>
                </div>
                <div className="uq-row-track">
                  <div
                    className={`uq-row-fill ${barTone} ${barIndeterminate ? 'indeterminate' : ''}`}
                    style={barIndeterminate ? undefined : { width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const fileInputEl = (
    <input
      ref={fileInputRef}
      type="file"
      accept={accept}
      multiple
      hidden
      onChange={(e) => {
        if (e.target.files && e.target.files.length) {
          enqueueFiles(Array.from(e.target.files));
        }
        e.target.value = '';
      }}
    />
  );

  if (variant === 'strip') {
    return (
      <div className="upload-strip-shell">
        <div
          className={`upload-strip ${dragover ? 'dragover' : ''} ${queue.length > 0 ? 'has-queue' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragover(true);
          }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
        >
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="15" cy="15" r="14" stroke={hasActive ? '#4CE0A5' : '#38424E'} strokeWidth="1.2" />
            <path
              d="M15 21V11M11 14.8L15 10.8l4 4"
              stroke="#6FDFB2"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="upload-strip-text">
            <span className="dropzone-title" style={{ fontSize: 13 }}>
              {idleTitle}
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: '#66707C' }}>
              {idleSubtitle}
            </span>
          </div>
          {fileInputEl}
          <button type="button" className="btn btn-tonal btn-sm" onClick={() => fileInputRef.current?.click()}>
            {queue.length > 0 ? '+ 继续添加' : '选择文件（可多选）'}
          </button>
        </div>

        {queue.length > 0 && renderQueueContent()}
      </div>
    );
  }

  return (
    <div
      className={`dropzone ${dragover ? 'dragover' : ''} ${queue.length > 0 ? 'has-queue' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
    >
      {fileInputEl}
      {queue.length === 0 ? (
        <>
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
            <circle cx="17" cy="17" r="16" stroke="#38424E" strokeWidth="1.2" />
            <path
              d="M17 23V12M12.5 16.2L17 11.7l4.5 4.5"
              stroke="#6FDFB2"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="dropzone-title">{idleTitle}</div>
          <div className="dropzone-sub">{idleSubtitle}</div>
          <button
            type="button"
            className="btn btn-tonal"
            style={{ height: 36, padding: '0 18px' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M6.5 1.6v6.6M3.9 4.2l2.6-2.6 2.6 2.6"
                stroke="#4CE0A5"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M1.8 9.6v1.2a1 1 0 001 1h7.4a1 1 0 001-1V9.6"
                stroke="#4CE0A5"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <span>选择文件（可多选）</span>
          </button>
          {idleTip && <div className="dropzone-tip">{idleTip}</div>}
        </>
      ) : (
        <>
          {renderQueueContent()}
          <div className="uq-drop-foot">支持继续拖入视频文件或文件夹追加到上传队列 · 分片并发直传云端存储，断片自动重试</div>
        </>
      )}
    </div>
  );
}
