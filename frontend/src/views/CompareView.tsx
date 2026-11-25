import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, triggerDownload } from '../api/client';
import { DownloadIcon } from '../components/Icons';
import type { TaskDetail, WorkspaceViewId } from '../types';

const COMPARE_MIN_PCT = 2;
const COMPARE_MAX_PCT = 98;

interface Props {
  taskId: string;
  onNavigate: (view: WorkspaceViewId) => void;
  onToast: (msg: string) => void;
}

function isVideoMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.split('?', 1)[0].toLowerCase();
  return !clean.endsWith('.png') && !clean.endsWith('.jpg') && !clean.endsWith('.jpeg') && !clean.endsWith('.webp');
}

export function CompareView({ taskId, onNavigate, onToast }: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const beforeLayerRef = useRef<HTMLDivElement>(null);
  const wipeGuideRef = useRef<HTMLDivElement>(null);
  const afterVideoRef = useRef<HTMLVideoElement>(null);
  const beforeVideoRef = useRef<HTMLVideoElement>(null);
  const pctRef = useRef(50);
  const draggingRef = useRef(false);
  const dragRafRef = useRef<number | null>(null);
  const pendingPctRef = useRef<number | null>(null);
  const stageRectRef = useRef<DOMRect | null>(null);

  const applyPct = useCallback((nextPct: number) => {
    const clamped = Math.max(COMPARE_MIN_PCT, Math.min(COMPARE_MAX_PCT, nextPct));
    pctRef.current = clamped;
    const beforeEl = beforeLayerRef.current;
    const guideEl = wipeGuideRef.current;
    const stageEl = stageRef.current;
    if (beforeEl) {
      beforeEl.style.clipPath = `inset(0 ${(100 - clamped).toFixed(4)}% 0 0)`;
    }
    if (guideEl) {
      guideEl.style.transform = `translate3d(${clamped.toFixed(4)}%, 0, 0)`;
    }
    if (stageEl) {
      stageEl.setAttribute('aria-valuenow', String(Math.round(clamped)));
    }
  }, []);

  useLayoutEffect(() => {
    applyPct(pctRef.current);
  }, [applyPct]);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPlaying(false);
    api
      .getTaskDetail(taskId || 'latest')
      .then(setTask)
      .catch(() => {
        setTask(null);
      });
  }, [taskId]);

  function clientXToPct(clientX: number, rect?: DOMRect | null) {
    const stage = stageRef.current;
    const box = rect || (stage ? stage.getBoundingClientRect() : null);
    if (!box || box.width <= 0) return pctRef.current;
    const next = ((clientX - box.left) / box.width) * 100;
    return Math.max(COMPARE_MIN_PCT, Math.min(COMPARE_MAX_PCT, next));
  }

  function scheduleDragPct(clientX: number) {
    pendingPctRef.current = clientXToPct(clientX, stageRectRef.current);
    if (dragRafRef.current !== null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      if (pendingPctRef.current !== null) {
        applyPct(pendingPctRef.current);
        pendingPctRef.current = null;
      }
    });
  }

  function finishDrag() {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (pendingPctRef.current !== null) {
      applyPct(pendingPctRef.current);
      pendingPctRef.current = null;
    }
    stageRectRef.current = null;
    draggingRef.current = false;
    setDragging(false);
  }

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const afterV = afterVideoRef.current;
    const beforeV = beforeVideoRef.current;
    if (!afterV) return;
    if (afterV.paused) {
      if (beforeV) {
        beforeV.currentTime = afterV.currentTime;
        beforeV.play().catch(() => {});
      }
      afterV
        .play()
        .then(() => setPlaying(true))
        .catch(() => {});
    } else {
      afterV.pause();
      beforeV?.pause();
      setPlaying(false);
    }
  }

  function syncBeforeTimeline() {
    const afterV = afterVideoRef.current;
    const beforeV = beforeVideoRef.current;
    if (afterV && beforeV && Math.abs(beforeV.currentTime - afterV.currentTime) > 0.2) {
      beforeV.currentTime = afterV.currentTime;
    }
  }

  const res = task?.result || {};
  const previewSrc = task?.thumbnail_url || '/assets/frame_16x9.png';
  const hasRealOutputVideo = isVideoMediaUrl(task?.output_video_url);
  const hasRealInputVideo = isVideoMediaUrl(task?.input_video_url);

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <button className="breadcrumb-back" onClick={() => onNavigate('overview')}>
            ← 返回任务总览
          </button>
          <h1 className="page-title">修复完成 · {task?.file || '未选择任务'}</h1>
          <p className="page-subtitle">
            {task?.scheme || '专业版 · 精准识别'} · 目标：{task?.sub_scheme || '水印 · 字幕'} · 处理时长{' '}
            {task?.processing_duration && task.processing_duration !== '—'
              ? task.processing_duration
              : res.elapsed_label || '已完成'}{' '}
            · 原音频已保留
          </p>
        </div>
        <div className="head-right">
          <button className="btn btn-ghost" onClick={() => onNavigate('inpaint')}>
            重新处理
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (task) {
                triggerDownload(`/api/tasks/${encodeURIComponent(task.id)}/download`);
                onToast(`正在下载修复成片 ${task.file}`);
              }
            }}
          >
            <DownloadIcon />
            <span>下载修复视频</span>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`compare-stage ${dragging ? 'dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="左右拖动对比修复前后效果"
        aria-valuemin={COMPARE_MIN_PCT}
        aria-valuemax={COMPARE_MAX_PCT}
        aria-valuenow={50}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.compare-video-controls')) return;
          draggingRef.current = true;
          setDragging(true);
          const rect = e.currentTarget.getBoundingClientRect();
          stageRectRef.current = rect;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (dragRafRef.current !== null) {
            cancelAnimationFrame(dragRafRef.current);
            dragRafRef.current = null;
          }
          pendingPctRef.current = null;
          applyPct(clientXToPct(e.clientX, rect));
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) scheduleDragPct(e.clientX);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            applyPct(pctRef.current - 3);
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            applyPct(pctRef.current + 3);
          }
        }}
      >
        <div className="compare-layer">
          {hasRealOutputVideo ? (
            <video
              ref={afterVideoRef}
              src={task?.output_video_url || ''}
              poster={previewSrc}
              playsInline
              loop
              muted={muted}
              onTimeUpdate={syncBeforeTimeline}
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <img src={previewSrc} alt="修复后画面" />
          )}
        </div>

        <div ref={beforeLayerRef} className="compare-layer compare-before">
          {hasRealOutputVideo && hasRealInputVideo ? (
            <video
              ref={beforeVideoRef}
              src={task?.input_video_url || ''}
              poster={previewSrc}
              playsInline
              loop
              muted
            />
          ) : (
            <>
              <img src={previewSrc} alt="原片画面" />
              {!hasRealOutputVideo && (
                <>
                  <div className="watermark-demo-badge">
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path d="M4.5 0.6l1.1 2.7 2.7 1.2-2.7 1.2L4.5 8.4 3.4 5.7 0.7 4.5l2.7-1.2z" fill="#FFFFFF" opacity="0.9" />
                    </svg>
                    <span>星野视频</span>
                  </div>
                  <div className="compare-demo-subtitle">我不会再等你了</div>
                </>
              )}
            </>
          )}
        </div>

        <div ref={wipeGuideRef} className="compare-wipe-guide" aria-hidden="true">
          <div className="compare-divider"></div>
          <div className="compare-handle">
            <div className="compare-handle-knob">
              <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
                <path d="M5.6 4L2.4 7l3.2 3" stroke="#06231A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.4 4L13.6 7l-3.2 3" stroke="#06231A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
        <div className="compare-tag before">原片 · 含字幕与水印</div>
        <div className="compare-tag after">修复后</div>

        {hasRealOutputVideo && (
          <div className="compare-video-controls" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="compare-ctrl-btn" onClick={togglePlay}>
              {playing ? '暂停对比播放' : '▶ 同步播放原片 vs 修复片'}
            </button>
            <button
              type="button"
              className="compare-ctrl-btn subtle"
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
            >
              {muted ? '取消静音' : '静音'}
            </button>
          </div>
        )}
      </div>

      <div className="result-strip">
        <div className="stat-item">
          <span className="stat-label">输出规格</span>
          <span className="stat-value">
            {(task?.output_resolution || '1920x1080').replace('x', '×')} · {(task?.output_fps || 29.97).toFixed(2)}fps ·{' '}
            {res.codec || 'h264'}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">处理时长</span>
          <span className="stat-value">
            {task?.processing_duration && task.processing_duration !== '—'
              ? task.processing_duration
              : res.elapsed_label || '—'}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">文件</span>
          <span className="stat-value">
            {res.file_size_mb ? `${res.file_size_mb} MB` : '云端成片'} · 原音频保留
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">计费用量</span>
          <span className="stat-value mint">
            {(task?.bill_minutes ?? 0).toFixed(2)} 分钟 · ¥{(task?.cost_cny ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">检出目标</span>
          <span className="stat-value">{res.detected_summary || '字幕 1 · 角标 2 · 剧集信息 0'}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">下载有效期</span>
          <span className="stat-value">{task?.expires_label || '24 小时'}</span>
        </div>
      </div>
    </section>
  );
}
