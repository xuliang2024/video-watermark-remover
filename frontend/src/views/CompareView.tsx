import { useEffect, useRef, useState } from 'react';
import { api, triggerDownload } from '../api/client';
import { DownloadIcon } from '../components/Icons';
import type { TaskDetail, WorkspaceViewId } from '../types';

interface Props {
  taskId: string;
  onNavigate: (view: WorkspaceViewId) => void;
  onToast: (msg: string) => void;
}

export function CompareView({ taskId, onNavigate, onToast }: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [pct, setPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getTaskDetail(taskId || 'task-20261113-01a8')
      .then(setTask)
      .catch(() => {
        api.getTaskDetail('task-20261113-01a8').then(setTask).catch(() => {});
      });
  }, [taskId]);

  function setFromClientX(clientX: number) {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.max(2, Math.min(98, next)));
  }

  const res = task?.result || {};
  const previewSrc = task?.thumbnail_url || '/assets/frame_16x9.png';

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <button className="breadcrumb-back" onClick={() => onNavigate('overview')}>
            ← 返回任务总览
          </button>
          <h1 className="page-title">修复完成 · {task?.file || 'S01E01_雨夜来客.mp4'}</h1>
          <p className="page-subtitle">
            {task?.scheme || '专业版 · 精准识别'} · 目标：{task?.sub_scheme || '水印 · 字幕'} · 处理耗时{' '}
            {res.elapsed_label || '4 分 46 秒'} · 原音频已保留
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
        tabIndex={0}
        aria-label="左右拖动对比修复前后效果"
        onPointerDown={(e) => {
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => dragging && setFromClientX(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPct((p) => Math.max(2, p - 3));
          if (e.key === 'ArrowRight') setPct((p) => Math.min(98, p + 3));
        }}
      >
        <div className="compare-layer">
          <img src={previewSrc} alt="修复后画面" />
        </div>

        <div
          className="compare-layer compare-before"
          style={{ clipPath: `inset(0 ${(100 - pct).toFixed(2)}% 0 0)` }}
        >
          <img src={previewSrc} alt="原片画面" />
          <div className="watermark-demo-badge">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 0.6l1.1 2.7 2.7 1.2-2.7 1.2L4.5 8.4 3.4 5.7 0.7 4.5l2.7-1.2z" fill="#FFFFFF" opacity="0.9" />
            </svg>
            <span>星野视频</span>
          </div>
          <div className="compare-demo-subtitle">我不会再等你了</div>
        </div>

        <div className="compare-divider" style={{ left: `${pct.toFixed(2)}%` }}></div>
        <div className="compare-handle" style={{ left: `${pct.toFixed(2)}%` }}>
          <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
            <path d="M5.6 4L2.4 7l3.2 3" stroke="#06231A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.4 4L13.6 7l-3.2 3" stroke="#06231A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="compare-tag before">原片 · 含字幕与水印</div>
        <div className="compare-tag after">修复后</div>
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
          <span className="stat-label">文件</span>
          <span className="stat-value">{res.file_size_mb || 86.4} MB · 原音频保留</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">计费用量</span>
          <span className="stat-value mint">
            {(task?.bill_minutes || 8.4).toFixed(2)} 分钟 · ¥{(task?.cost_cny || 25.2).toFixed(2)}
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
