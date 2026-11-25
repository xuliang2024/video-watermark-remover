import type { InpaintConfig, MediaAsset, TaskRow, TranslateConfig } from '../types';

const CAP_MAP: Record<string, number> = {
  '720p': 1280 * 720,
  '1080p': 1920 * 1080,
  '4k': 3840 * 2160,
};

export function calcInpaintFile(file: MediaAsset, cfg: InpaintConfig) {
  const durationMin = file.duration_sec / 60;
  const outFps = Math.min(file.fps, Number(cfg.max_fps) || 30);
  let fpsCoeff = 1;
  if (outFps <= 24) fpsCoeff = 0.8;
  else if (outFps <= 30) fpsCoeff = 1;
  else fpsCoeff = Math.ceil(outFps / 30);

  const maxPixels = CAP_MAP[cfg.max_resolution] || CAP_MAP['1080p'];
  const effPixels = Math.min(file.width * file.height, maxPixels);

  let resCoeff = 1;
  if (cfg.model_level === 'lite') {
    resCoeff = effPixels <= 1920 * 1080 ? 1 : 2;
  } else {
    if (effPixels <= 1280 * 720) resCoeff = 0.6;
    else if (effPixels <= 1920 * 1080) resCoeff = 1;
    else resCoeff = 2;
  }

  let unitPrice = 0.5;
  if (cfg.model_level === 'pro') {
    unitPrice = cfg.locate_mode === 'precise' ? 3.0 : 1.5;
  }

  const billMin = durationMin * fpsCoeff * resCoeff;
  const cost = billMin * unitPrice;
  return { billMin, cost, fpsCoeff, resCoeff, unitPrice, outFps };
}

export function calcTranslateBatch(files: MediaAsset[], cfg: TranslateConfig) {
  const totalSec = files.reduce((s, f) => s + f.duration_sec, 0);
  const totalMin = totalSec / 60;
  const langCount = Math.max(0, cfg.target_langs.length);
  const unitPrice = cfg.dubbing_mode === 'high_quality' ? 4.0 : 1.5;
  const billMin = totalMin * langCount;
  const cost = billMin * unitPrice;
  const taskCount = files.length * langCount;
  const captionCount = taskCount * cfg.caption_formats.length;
  const audioCount = cfg.output_dubbing_audio ? taskCount : 0;
  const estMinutes = taskCount
    ? Math.max(
        1,
        Math.round(
          totalMin *
            (cfg.dubbing_mode === 'high_quality' && cfg.fast_mode ? 4 : 5) *
            Math.max(1, Math.ceil(taskCount / 10))
        )
      )
    : 0;
  return { totalSec, totalMin, langCount, unitPrice, billMin, cost, taskCount, captionCount, audioCount, estMinutes };
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function formatDurationCN(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} 分 ${String(r).padStart(2, '0')} 秒`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : idx >= 3 ? 2 : 1;
  return `${val.toFixed(digits)} ${units[idx]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '--';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 1) return '即将完成';
  const s = Math.ceil(seconds);
  if (s < 60) return `剩余 ${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `剩余 ${m} 分 ${String(r).padStart(2, '0')} 秒`;
  const h = Math.floor(m / 60);
  return `剩余 ${h} 时 ${m % 60} 分`;
}

export function formatProcessingDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const sec = Math.floor(seconds);
  if (sec < 60) return `${sec}秒`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}小时${String(m).padStart(2, '0')}分${String(s).padStart(2, '0')}秒`;
  return `${m}分${String(s).padStart(2, '0')}秒`;
}

export function resolveTaskDuration(task: TaskRow, nowMs: number, fetchedAtMs: number): string {
  if (task.status === 'running' && task.elapsed_seconds != null) {
    const deltaSec = Math.max(0, Math.floor((nowMs - fetchedAtMs) / 1000));
    return formatProcessingDuration(task.elapsed_seconds + deltaSec);
  }
  if (task.processing_duration) return task.processing_duration;
  if (task.elapsed_seconds != null) return formatProcessingDuration(task.elapsed_seconds);
  return '—';
}

function formatClockHMS(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatTaskDurationTooltip(task: TaskRow, durationText: string): string {
  if (task.status === 'queued') return '排队等待调度';
  const startStr = formatClockHMS(task.started_at);
  const finStr = formatClockHMS(task.finished_at);
  if (task.status === 'running') {
    return startStr ? `开始于 ${startStr} · 已处理 ${durationText}` : `正在处理中 · 已处理 ${durationText}`;
  }
  if (startStr && finStr) {
    return `开始 ${startStr} · 结束 ${finStr} · 处理时长 ${durationText}`;
  }
  return durationText !== '—' ? `处理时长 ${durationText}` : '暂无处理时长记录';
}
