import { useRef, useState } from 'react';
import { api } from '../api/client';
import { InfoIcon } from '../components/Icons';
import type { MediaAsset, RegionItem, WorkspaceViewId } from '../types';
import { formatDuration } from '../utils/calc';

interface Props {
  files: MediaAsset[];
  regions: RegionItem[];
  defaultRegions: RegionItem[];
  onChangeRegions: (next: RegionItem[]) => void;
  onApplyToInpaint: () => void;
  onNavigate: (view: WorkspaceViewId) => void;
  onToast: (msg: string) => void;
}

export function AnnotateView({
  files,
  regions,
  defaultRegions,
  onChangeRegions,
  onApplyToInpaint,
  onNavigate,
  onToast,
}: Props) {
  const [fileIdx, setFileIdx] = useState(0);
  const [tool, setTool] = useState<'select' | 'draw'>('select');
  const [selectedId, setSelectedId] = useState<string>(regions[1]?.id || regions[0]?.id || '');
  const [applyAllBatch, setApplyAllBatch] = useState(true);
  const [savingTpl, setSavingTpl] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const safeFiles = files.length
    ? files
    : [
        {
          id: 'fallback-1',
          name: 'S01E01_雨夜来客.mp4',
          purpose: 'inpaint' as const,
          thumbnail_url: '/assets/frame_16x9.png',
          width: 1920,
          height: 1080,
          resolution: '1920×1080',
          fps: 29.97,
          duration_sec: 504,
          frames: 15105,
          size_bytes: 0,
          size_gb: 1.24,
          detected_lang: '中文（简体）',
          detected_lang_code: 'zh-CN',
          is_sample: true,
        },
      ];

  const activeFile = safeFiles[fileIdx % safeFiles.length];
  const totalSec = Math.max(10, activeFile.duration_sec);
  const activeRegion = regions.find((r) => r.id === selectedId) || regions[0];

  function updateRegion(id: string, patch: Partial<RegionItem>) {
    onChangeRegions(regions.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function startBboxPointerDown(e: React.PointerEvent, reg: RegionItem, handle: string) {
    if (tool === 'draw') return;
    e.stopPropagation();
    setSelectedId(reg.id);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig: [number, number, number, number] = [...reg.bbox];

    const onMove = (ev: PointerEvent) => {
      const dx = Math.round(((ev.clientX - startX) / rect.width) * 1000);
      const dy = Math.round(((ev.clientY - startY) / rect.height) * 1000);
      let [x1, y1, x2, y2] = orig;
      if (handle === 'move') {
        const w = x2 - x1;
        const h = y2 - y1;
        x1 = Math.max(0, Math.min(1000 - w, x1 + dx));
        y1 = Math.max(0, Math.min(1000 - h, y1 + dy));
        x2 = x1 + w;
        y2 = y1 + h;
      } else {
        if (handle.includes('w')) x1 = Math.max(0, Math.min(x2 - 30, x1 + dx));
        if (handle.includes('e')) x2 = Math.min(1000, Math.max(x1 + 30, x2 + dx));
        if (handle.includes('n')) y1 = Math.max(0, Math.min(y2 - 30, y1 + dy));
        if (handle.includes('s')) y2 = Math.min(1000, Math.max(y1 + 30, y2 + dy));
      }
      updateRegion(reg.id, { bbox: [x1, y1, x2, y2] });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleCanvasPointerDown(e: React.PointerEvent) {
    if (tool !== 'draw') return;
    if ((e.target as HTMLElement).closest('.floating-toolbar')) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = Math.max(0, Math.min(1000, Math.round(((e.clientX - rect.left) / rect.width) * 1000)));
    const sy = Math.max(0, Math.min(1000, Math.round(((e.clientY - rect.top) / rect.height) * 1000)));
    const colors: Array<'mint' | 'blue' | 'amber'> = ['mint', 'blue', 'amber'];
    const n = regions.length + 1;
    const newId = `reg-${Date.now()}`;
    const newReg: RegionItem = {
      id: newId,
      name: `区域 ${n} · 自定义`,
      short_name: `区域 ${n} · 自定义`,
      color: colors[(n - 1) % colors.length],
      bbox: [sx, sy, Math.min(1000, sx + 80), Math.min(1000, sy + 60)],
      start_sec: 0,
      end_sec: totalSec,
      until_end: true,
    };
    const baseList = [...regions, newReg];
    onChangeRegions(baseList);
    setSelectedId(newId);

    const onMove = (ev: PointerEvent) => {
      const cx = Math.max(0, Math.min(1000, Math.round(((ev.clientX - rect.left) / rect.width) * 1000)));
      const cy = Math.max(0, Math.min(1000, Math.round(((ev.clientY - rect.top) / rect.height) * 1000)));
      const bbox: [number, number, number, number] = [
        Math.min(sx, cx),
        Math.min(sy, cy),
        Math.min(1000, Math.max(sx, cx, Math.min(sx, cx) + 25)),
        Math.min(1000, Math.max(sy, cy, Math.min(sy, cy) + 25)),
      ];
      onChangeRegions(baseList.map((r) => (r.id === newId ? { ...r, bbox } : r)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setTool('select');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startTimelineDrag(e: React.PointerEvent, reg: RegionItem, mode: 'move' | 'left' | 'right') {
    e.stopPropagation();
    setSelectedId(reg.id);
    const trackEl = (e.currentTarget as HTMLElement).closest('.lane-track');
    if (!trackEl) return;
    const trackRect = trackEl.getBoundingClientRect();
    const startX = e.clientX;
    const origStart = reg.start_sec;
    const origEnd = reg.until_end ? totalSec : Math.min(totalSec, reg.end_sec);

    const onMove = (ev: PointerEvent) => {
      const deltaSec = ((ev.clientX - startX) / trackRect.width) * totalSec;
      if (mode === 'move') {
        const len = origEnd - origStart;
        const nextStart = Math.max(0, Math.min(totalSec - len, origStart + deltaSec));
        const nextEnd = nextStart + len;
        updateRegion(reg.id, {
          start_sec: Number(nextStart.toFixed(1)),
          end_sec: Number(nextEnd.toFixed(1)),
          until_end: nextEnd >= totalSec - 1 ? reg.until_end : false,
        });
      } else if (mode === 'left') {
        updateRegion(reg.id, {
          start_sec: Number(Math.max(0, Math.min(origEnd - 2, origStart + deltaSec)).toFixed(1)),
        });
      } else {
        const nextEnd = Math.min(totalSec, Math.max(origStart + 2, origEnd + deltaSec));
        updateRegion(reg.id, {
          end_sec: Number(nextEnd.toFixed(1)),
          until_end: nextEnd >= totalSec - 1,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleAddRegion() {
    const colors: Array<'mint' | 'blue' | 'amber'> = ['mint', 'blue', 'amber'];
    const n = regions.length + 1;
    const item: RegionItem = {
      id: `reg-${Date.now()}`,
      name: `区域 ${n} · 自定义`,
      short_name: `区域 ${n} · 自定义`,
      color: colors[(n - 1) % colors.length],
      bbox: [280, 260, 560, 420],
      start_sec: 0,
      end_sec: totalSec,
      until_end: true,
    };
    onChangeRegions([...regions, item]);
    setSelectedId(item.id);
  }

  async function handleSaveTemplate() {
    setSavingTpl(true);
    try {
      const tpl = await api.createRegionTemplate(`自定义模板 · ${activeFile.name.slice(0, 12)}`, regions);
      onToast(`区域模板「${tpl.name}」已持久化保存到后端`);
    } catch (err: any) {
      onToast(err.message || '保存模板失败');
    } finally {
      setSavingTpl(false);
    }
  }

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">区域标注</h1>
          <p className="page-subtitle">
            固定区域模式跳过动态检测，直接在 1000×1000 归一化画布上框选，并为每个区域单独设置生效时段
          </p>
        </div>
        <div className="head-right">
          <div className="file-chip">
            <span>{activeFile.name}</span>
            <span className="file-chip-idx">
              {(fileIdx % safeFiles.length) + 1} / {safeFiles.length}
            </span>
            <span className="file-chip-nav">
              <button title="上一个文件" onClick={() => setFileIdx((i) => (i - 1 + safeFiles.length) % safeFiles.length)}>
                ‹
              </button>
              <button title="下一个文件" onClick={() => setFileIdx((i) => (i + 1) % safeFiles.length)}>
                ›
              </button>
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleSaveTemplate} disabled={savingTpl}>
            {savingTpl ? '保存中...' : '保存为模板'}
          </button>
        </div>
      </div>

      <div className="split-layout">
        <div className="col-main">
          <div
            ref={canvasRef}
            className={`video-viewer ${tool === 'draw' ? 'draw-mode' : ''}`}
            onPointerDown={handleCanvasPointerDown}
          >
            <img className="video-viewer-img" src={activeFile.thumbnail_url || '/assets/frame_16x9.png'} alt="视频帧预览" />
            <div className="frame-info-chip">
              {activeFile.width}×{activeFile.height} · {activeFile.fps.toFixed(2)}fps · {activeFile.frames} 帧
            </div>

            <div>
              {regions.map((r) => {
                const [x1, y1, x2, y2] = r.bbox;
                const sel = r.id === activeRegion?.id;
                return (
                  <div
                    key={r.id}
                    className={`bbox-rect ${r.color} ${sel ? 'selected' : ''}`}
                    style={{
                      left: `${(x1 / 10).toFixed(2)}%`,
                      top: `${(y1 / 10).toFixed(2)}%`,
                      width: `${((x2 - x1) / 10).toFixed(2)}%`,
                      height: `${((y2 - y1) / 10).toFixed(2)}%`,
                    }}
                    onPointerDown={(e) => startBboxPointerDown(e, r, 'move')}
                  >
                    <span className="bbox-tag">{r.name}</span>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                      <span
                        key={h}
                        className={`bbox-handle ${h}`}
                        onPointerDown={(e) => startBboxPointerDown(e, r, h)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="floating-toolbar">
              <button
                className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
                title="选择与拖动区域"
                onClick={() => setTool('select')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 2.2l7.4 3.4-3.1 1.1-1.1 3.1L3 2.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className={`tool-btn ${tool === 'draw' ? 'active' : ''}`}
                title="绘制新修复区域"
                onClick={() => {
                  setTool('draw');
                  onToast('在视频画面上按住拖动即可框选新区域');
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="3.2" width="10" height="7.6" rx="1.4" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.4 1.8" />
                </svg>
              </button>
              <button
                className="tool-btn"
                title="重置默认区域"
                onClick={() => {
                  onChangeRegions(defaultRegions.map((r) => ({ ...r, bbox: [...r.bbox] as [number, number, number, number] })));
                  setSelectedId(defaultRegions[1]?.id || defaultRegions[0]?.id || '');
                  onToast('已重置为初始 3 个标注区域');
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5.2 4.2L2.4 6.8l2.8 2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2.6 6.8h5.2a3.4 3.4 0 010 6.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
              <span className="tool-divider"></span>
              <span className="tool-zoom">100%</span>
            </div>
          </div>

          <div className="panel panel-sm">
            <div className="panel-head compact">
              <div className="panel-title-wrap">
                <span className="panel-title">生效时段</span>
                <span className="panel-sub">拖动色块或两端调整区间，单位秒</span>
              </div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                总时长 {formatDuration(totalSec)} · {Math.round(activeFile.fps)}fps
              </span>
            </div>
            <div className="timeline-body">
              <div className="ruler-row">
                <div className="lane-label-col"></div>
                <div className="ruler-ticks">
                  {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                    <span key={p}>{formatDuration(totalSec * p)}</span>
                  ))}
                </div>
              </div>
              <div>
                {regions.map((r) => {
                  const end = r.until_end ? totalSec : Math.min(totalSec, r.end_sec);
                  const start = Math.max(0, Math.min(r.start_sec, end - 1));
                  const leftPct = (start / totalSec) * 100;
                  const widthPct = Math.max(3, ((end - start) / totalSec) * 100);
                  return (
                    <div className="timeline-lane" key={r.id}>
                      <div className="lane-label-col">
                        <span className={`lane-dot ${r.color}`}></span>
                        <span>{r.short_name}</span>
                      </div>
                      <div className="lane-track">
                        <div
                          className={`lane-clip ${r.color}`}
                          style={{ left: `${leftPct.toFixed(2)}%`, width: `${widthPct.toFixed(2)}%` }}
                          onPointerDown={(e) => startTimelineDrag(e, r, 'move')}
                        >
                          <span className="clip-edge" onPointerDown={(e) => startTimelineDrag(e, r, 'left')} />
                          <span className="clip-edge" onPointerDown={(e) => startTimelineDrag(e, r, 'right')} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <aside className="col-side">
          <div className="panel panel-sm" style={{ flex: 1 }}>
            <div className="panel-head compact">
              <div className="panel-title-wrap">
                <span className="panel-title">区域列表</span>
                <span className="count-chip">{regions.length}</span>
              </div>
              <button className="btn btn-tonal btn-xs" onClick={handleAddRegion}>
                + 新增区域
              </button>
            </div>

            <div className="region-panel-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {regions.map((r) => {
                  const sel = r.id === activeRegion?.id;
                  const end = r.until_end ? totalSec : Math.min(totalSec, r.end_sec);
                  const dur = Math.max(0, end - r.start_sec);
                  const timeStr = r.until_end
                    ? `${r.start_sec.toFixed(1)} s – 片尾`
                    : `${r.start_sec.toFixed(1)} – ${end.toFixed(1)} s · 持续 ${dur.toFixed(1)} s`;
                  return (
                    <div
                      key={r.id}
                      className={`region-card ${r.color} ${sel ? 'selected' : ''}`}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <div className="region-card-head">
                        <span className={`lane-dot ${r.color}`}></span>
                        <span className="region-card-name">{r.name}</span>
                        {sel && <span className="region-editing-tag">编辑中</span>}
                      </div>
                      <span className="region-coords">bbox [{r.bbox.join(', ')}]</span>
                      <span className="region-time">{timeStr}</span>
                    </div>
                  );
                })}
              </div>

              {activeRegion && (
                <div className="region-card" style={{ cursor: 'default' }}>
                  <div className="cfg-label-row">
                    <span className="panel-title" style={{ fontSize: 11 }}>
                      {activeRegion.short_name.split(' · ')[0]} 参数
                    </span>
                    <span className="cfg-hint">时间区间</span>
                  </div>
                  <div className="param-fields">
                    <div className="param-field">
                      <label>起始</label>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        value={activeRegion.start_sec}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(totalSec - 1, parseFloat(e.target.value) || 0));
                          updateRegion(activeRegion.id, {
                            start_sec: Number(val.toFixed(1)),
                            end_sec: !activeRegion.until_end && activeRegion.end_sec <= val ? Math.min(totalSec, val + 5) : activeRegion.end_sec,
                          });
                        }}
                      />
                    </div>
                    <div className="param-field">
                      <label>结束</label>
                      {activeRegion.until_end ? (
                        <input type="text" value="至片尾" disabled />
                      ) : (
                        <input
                          type="number"
                          step="0.5"
                          value={Math.min(totalSec, activeRegion.end_sec)}
                          onChange={(e) => {
                            const val = Math.max(activeRegion.start_sec + 1, Math.min(totalSec, parseFloat(e.target.value) || totalSec));
                            updateRegion(activeRegion.id, { end_sec: Number(val.toFixed(1)) });
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div
                    className="toggle-row"
                    onClick={() =>
                      updateRegion(activeRegion.id, {
                        until_end: !activeRegion.until_end,
                        end_sec: activeRegion.end_sec <= activeRegion.start_sec ? Math.min(totalSec, activeRegion.start_sec + 60) : activeRegion.end_sec,
                      })
                    }
                  >
                    <span className="toggle-label" style={{ fontSize: 10 }}>
                      持续到视频结束
                    </span>
                    <span className={`switch ${activeRegion.until_end ? 'on' : ''}`}>
                      <span className="knob"></span>
                    </span>
                  </div>
                  <p className="info-card-body" style={{ fontSize: 9 }}>
                    该区域跳过动态检测；若同时开启字幕保护，重叠区域将保留水印。
                  </p>
                </div>
              )}

              <div className="info-card">
                <div className="info-card-head">
                  <InfoIcon />
                  <span>固定区域模式说明</span>
                </div>
                <p className="info-card-body">
                  在画面上框选后，该区域将跳过自动识别，直接按框选范围修复；检测模式与目标类别不再生效。生效时段可指定起止秒数，也可设为持续到视频结束。
                </p>
              </div>
            </div>

            <div className="config-foot" style={{ padding: '12px 12px 14px' }}>
              <div className="toggle-row" onClick={() => setApplyAllBatch((v) => !v)}>
                <span className="toggle-label" style={{ fontSize: 10 }}>
                  应用到同批次全部文件
                </span>
                <span className={`switch ${applyAllBatch ? 'on' : ''}`}>
                  <span className="knob"></span>
                </span>
              </div>
              <button
                className="btn btn-primary btn-full"
                style={{ height: 36 }}
                onClick={() => {
                  onApplyToInpaint();
                  onToast(`已将 ${regions.length} 个固定区域应用至修复方案并切换为「手动框选」`);
                  onNavigate('inpaint');
                }}
              >
                {applyAllBatch ? `保存并应用到 ${safeFiles.length} 个文件` : '保存当前文件标注'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
