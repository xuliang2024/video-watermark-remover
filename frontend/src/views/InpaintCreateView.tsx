import { useState } from 'react';
import { api } from '../api/client';
import { CheckIcon, ChevronDownIcon, CloseIcon, InfoIcon } from '../components/Icons';
import { VideoUploadZone } from '../components/VideoUploadZone';
import type { InpaintConfig, MediaAsset, RegionItem, WorkspaceViewId } from '../types';
import { calcInpaintFile, formatDuration, formatDurationCN } from '../utils/calc';

interface Props {
  files: MediaAsset[];
  presets: InpaintConfig[];
  config: InpaintConfig;
  regions: RegionItem[];
  onChangeConfig: (next: InpaintConfig) => void;
  onFilesUpdated: () => Promise<void>;
  onNavigate: (view: WorkspaceViewId, ctx?: { batchId?: string; taskId?: string }) => void;
  onToast: (msg: string) => void;
}

const TARGET_OPTIONS: Array<{ key: InpaintConfig['targets'][number]; label: string }> = [
  { key: 'watermark', label: '水印 · 角标 · Logo' },
  { key: 'subtitle', label: '普通字幕' },
  { key: 'scrolling_subtitle', label: '滚动字幕' },
  { key: 'drama_info', label: '剧集信息' },
];

export function InpaintCreateView({
  files,
  presets,
  config,
  regions,
  onChangeConfig,
  onFilesUpdated,
  onNavigate,
  onToast,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);

  const hasSubtitleTarget = config.targets.includes('subtitle') || config.targets.includes('scrolling_subtitle');
  const protectAllowed =
    config.locate_mode !== 'fixed' && !hasSubtitleTarget && config.targets.includes('watermark');

  function updateCfg(patch: Partial<InpaintConfig>) {
    const next: InpaintConfig = { ...config, ...patch };
    if (next.model_level === 'lite' && next.locate_mode === 'precise') {
      next.locate_mode = 'standard';
    }
    const nextHasSub = next.targets.includes('subtitle') || next.targets.includes('scrolling_subtitle');
    if (next.locate_mode === 'fixed' || nextHasSub || !next.targets.includes('watermark')) {
      next.subtitle_protect = false;
    }
    onChangeConfig(next);
  }

  function cyclePreset() {
    if (!presets.length) return;
    const nextIdx = (presetIdx + 1) % presets.length;
    setPresetIdx(nextIdx);
    const p = presets[nextIdx];
    onChangeConfig({ ...p, targets: [...p.targets] });
    onToast(`已切换方案：${p.name}`);
  }

  function toggleTarget(target: InpaintConfig['targets'][number]) {
    if (config.locate_mode === 'fixed') return;
    const exists = config.targets.includes(target);
    if (exists) {
      if (config.targets.length === 1) {
        onToast('至少需要保留 1 个擦除目标');
        return;
      }
      updateCfg({ targets: config.targets.filter((t) => t !== target) });
    } else {
      updateCfg({ targets: [...config.targets, target] });
    }
  }

  async function handleRemoveFile(id: string) {
    try {
      await api.deleteAsset(id);
      await onFilesUpdated();
    } catch (err: any) {
      onToast(err.message || '移除失败');
    }
  }

  async function handleClearAll() {
    try {
      await api.clearAssets('inpaint');
      await onFilesUpdated();
    } catch (err: any) {
      onToast(err.message || '清空失败');
    }
  }

  async function handleRestoreSamples() {
    try {
      await api.restoreSampleAssets('inpaint');
      await onFilesUpdated();
      onToast('已恢复示例剧集素材');
    } catch (err: any) {
      onToast(err.message || '恢复示例失败');
    }
  }

  async function handleSubmit() {
    if (!files.length) return;
    setSubmitting(true);
    try {
      const payloadCfg: InpaintConfig = {
        ...config,
        regions: config.locate_mode === 'fixed' ? regions : [],
      };
      const res = await api.createInpaintBatch(
        files.map((f) => f.id),
        payloadCfg
      );
      onToast(`已提交 ${res.task_count} 个修复任务至批次 ${res.code}（${res.execution_mode === 'live' ? '火山 LAS 实调' : '本地仿真'}）`);
      onNavigate('monitor', { batchId: res.batch_id });
    } catch (err: any) {
      onToast(err.message || '提交修复任务失败');
    } finally {
      setSubmitting(false);
    }
  }

  let totalSec = 0;
  let totalGB = 0;
  let totalBillMin = 0;
  let totalCost = 0;
  const highFpsFiles: MediaAsset[] = [];

  const fileRows = files.map((f) => {
    const r = calcInpaintFile(f, config);
    totalSec += f.duration_sec;
    totalGB += f.size_gb;
    totalBillMin += r.billMin;
    totalCost += r.cost;
    if (f.fps > config.max_fps) highFpsFiles.push(f);
    return { f, r };
  });

  const protectLabel =
    config.locate_mode === 'fixed'
      ? '字幕区域保护（手动框选模式下不生效）'
      : hasSubtitleTarget
        ? '字幕区域保护（当前含字幕目标，不生效）'
        : !config.targets.includes('watermark')
          ? '字幕区域保护（需勾选水印目标）'
          : '字幕区域保护（排除普通/滚动字幕区）';

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">新建修复任务</h1>
          <p className="page-subtitle">一次上传整季剧集，按同一套方案批量提交；提交后可在任务队列中轮询进度</p>
        </div>
        <div className="head-right">
          <span className="save-hint">草稿已自动保存</span>
          <button className="btn btn-ghost" onClick={cyclePreset}>
            切换方案模板
          </button>
        </div>
      </div>

      <div className="split-layout">
        <div className="col-main">
          <VideoUploadZone
            purpose="inpaint"
            variant="dropzone"
            accept="video/*,.mp4,.mov,.avi,.mkv,.flv,.webm"
            idleTitle="拖入视频文件进行批量上传"
            idleSubtitle="mp4 / mov / avi / mkv · 单文件 ≤ 10 GB · 时长 ≤ 3 小时 · 长边 ≤ 3840"
            idleTip="可一次多选，或直接拖入整个文件夹 · 单次最多 200 个文件 · 实时显示传输与云端解析进度"
            onAssetUploaded={onFilesUpdated}
            onToast={onToast}
          />

          <div className="panel">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">素材列表</span>
                <span className="panel-sub">
                  {files.length} 个文件 · 合计 {formatDurationCN(totalSec)} · {totalGB.toFixed(2)} GB
                </span>
              </div>
              <button className="clear-link" onClick={handleClearAll}>
                全部移除
              </button>
            </div>

            <div>
              {!fileRows.length ? (
                <div className="empty-state" style={{ padding: '32px 20px' }}>
                  暂未添加视频文件 ·{' '}
                  <button className="mode-inline-action" onClick={handleRestoreSamples}>
                    恢复示例素材
                  </button>
                </div>
              ) : (
                fileRows.map(({ f, r }) => (
                  <div className="file-row" key={f.id}>
                    <div className="thumb md">
                      <img src={f.thumbnail_url || '/assets/frame_16x9.png'} alt="" />
                    </div>
                    <div className="cell-stack" style={{ flex: 1 }}>
                      <span className="file-name">{f.name}</span>
                      <span className="file-meta">
                        {f.width}×{f.height} · {f.fps.toFixed(2)}fps · {formatDuration(f.duration_sec)} · {f.size_gb.toFixed(2)} GB
                      </span>
                    </div>
                    <span className="file-row-estimate">≈ ¥{r.cost.toFixed(2)}</span>
                    <button className="remove-btn" title="移除文件" onClick={() => handleRemoveFile(f.id)}>
                      <CloseIcon />
                    </button>
                  </div>
                ))
              )}
            </div>

            {highFpsFiles.length > 0 && (
              <div className="warn-strip">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="5.8" stroke="#E8B04B" strokeWidth="1.2" />
                  <path d="M7 4.2v3.4" stroke="#E8B04B" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="7" cy="9.8" r="0.8" fill="#E8B04B" />
                </svg>
                <span>
                  {highFpsFiles[0].name}
                  {highFpsFiles.length > 1 ? ` 等 ${highFpsFiles.length} 个文件` : ''} 帧率 {highFpsFiles[0].fps.toFixed(2)}fps
                  高于输出上限，将按 {config.max_fps}fps 输出 · 可避免 2 倍帧率系数
                </span>
              </div>
            )}
          </div>
        </div>

        <aside className="col-config">
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-head">
              <span className="panel-title">修复方案</span>
              <button className="preset-chip" onClick={cyclePreset}>
                {config.name || '自定义方案'}
              </button>
            </div>

            <div className="config-body">
              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">模型等级</span>
                  <span className="cfg-hint">决定单价与画质</span>
                </div>
                <div className="seg-tiles">
                  <button
                    className={`seg-tile mono-sub ${config.model_level === 'lite' ? 'active' : ''}`}
                    onClick={() => updateCfg({ model_level: 'lite' })}
                  >
                    <span className="tile-title">极速版</span>
                    <span className="tile-sub">¥0.5 / 分</span>
                  </button>
                  <button
                    className={`seg-tile mono-sub ${config.model_level === 'pro' ? 'active' : ''}`}
                    onClick={() => updateCfg({ model_level: 'pro' })}
                  >
                    <span className="tile-title">专业版</span>
                    <span className="tile-sub">¥1.5-3 / 分</span>
                  </button>
                </div>
              </div>

              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">擦除目标</span>
                  <span className="cfg-hint">可多选</span>
                </div>
                <div className="chip-wrap">
                  {TARGET_OPTIONS.map((t) => (
                    <button
                      key={t.key}
                      className={`chip ${config.targets.includes(t.key) ? 'active' : ''}`}
                      disabled={config.locate_mode === 'fixed'}
                      onClick={() => toggleTarget(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">定位方式</span>
                  <span className="cfg-hint">决定如何找到目标</span>
                </div>
                <div className="seg-tiles">
                  <button
                    className={`seg-tile ${config.locate_mode === 'standard' ? 'active' : ''}`}
                    onClick={() => updateCfg({ locate_mode: 'standard' })}
                  >
                    <span className="tile-title">标准检测</span>
                    <span className="tile-sub">通用文字</span>
                  </button>
                  <button
                    className={`seg-tile ${config.locate_mode === 'precise' ? 'active' : ''}`}
                    disabled={config.model_level === 'lite'}
                    onClick={() => updateCfg({ locate_mode: 'precise' })}
                  >
                    <span className="tile-title">精准识别</span>
                    <span className="tile-sub">大模型</span>
                  </button>
                  <button
                    className={`seg-tile ${config.locate_mode === 'fixed' ? 'active' : ''}`}
                    onClick={() => updateCfg({ locate_mode: 'fixed' })}
                  >
                    <span className="tile-title">手动框选</span>
                    <span className="tile-sub">画框</span>
                  </button>
                </div>
                <p className="mode-desc">
                  {config.locate_mode === 'precise' ? (
                    '精准识别 · 大模型定位水印 / 角标 / Logo，单价为标准模式的 2 倍'
                  ) : config.locate_mode === 'standard' ? (
                    config.targets.length >= 4 ? (
                      '标准检测 · 全文字擦除模式（覆盖字幕、水印及非背景文字），单价更低'
                    ) : (
                      '标准检测 · 通用文字识别引擎，适合常规字幕与静态角落文字水印'
                    )
                  ) : (
                    <>
                      手动框选 · 已配置 {regions.length} 个固定区域，跳过动态检测{' '}
                      <button className="mode-inline-action" onClick={() => onNavigate('annotate')}>
                        编辑区域 →
                      </button>
                    </>
                  )}
                </p>
              </div>

              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">输出规格</span>
                  <span className="cfg-hint">影响计费系数</span>
                </div>
                <div className="select-grid">
                  <div className="select-box mono-val">
                    <select
                      aria-label="分辨率上限"
                      value={config.max_resolution}
                      onChange={(e) => updateCfg({ max_resolution: e.target.value as InpaintConfig['max_resolution'] })}
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                      <option value="4k">4K</option>
                    </select>
                    <span className="select-chevron">
                      <ChevronDownIcon />
                    </span>
                  </div>
                  <div className="select-box mono-val">
                    <select
                      aria-label="帧率上限"
                      value={config.max_fps}
                      onChange={(e) => updateCfg({ max_fps: Number(e.target.value) })}
                    >
                      <option value={24}>24 fps</option>
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                    </select>
                    <span className="select-chevron">
                      <ChevronDownIcon />
                    </span>
                  </div>
                  <div className="select-box">
                    <select
                      aria-label="画质档位"
                      value={config.video_mode}
                      onChange={(e) => updateCfg({ video_mode: e.target.value as InpaintConfig['video_mode'] })}
                    >
                      <option value="economy">经济</option>
                      <option value="balanced">均衡</option>
                      <option value="high">高画质</option>
                      <option value="source">沿用源画质</option>
                    </select>
                    <span className="select-chevron">
                      <ChevronDownIcon />
                    </span>
                  </div>
                  <div className="select-box mono-val">
                    <select
                      aria-label="视频编码"
                      value={config.codec}
                      onChange={(e) => updateCfg({ codec: e.target.value as InpaintConfig['codec'] })}
                    >
                      <option value="h264">H.264</option>
                      <option value="h265">H.265</option>
                    </select>
                    <span className="select-chevron">
                      <ChevronDownIcon />
                    </span>
                  </div>
                </div>
              </div>

              <div className="toggle-list">
                <div
                  className={`toggle-row ${!protectAllowed ? 'disabled' : ''}`}
                  onClick={() => protectAllowed && updateCfg({ subtitle_protect: !config.subtitle_protect })}
                >
                  <span className="toggle-label">{protectLabel}</span>
                  <span className={`switch ${config.subtitle_protect ? 'on' : ''}`}>
                    <span className="knob"></span>
                  </span>
                </div>
                <div
                  className="toggle-row"
                  onClick={() => updateCfg({ subtitle_persistent: !config.subtitle_persistent })}
                >
                  <span className="toggle-label">字幕区域常驻</span>
                  <span className={`switch ${config.subtitle_persistent ? 'on' : ''}`}>
                    <span className="knob"></span>
                  </span>
                </div>
              </div>

              <div className="info-card">
                <div className="info-card-head">
                  <InfoIcon />
                  <span>语种与模型限制</span>
                </div>
                <p className="info-card-body">
                  极速版不支持精准识别与日文检测，繁体中文可能漏检；精准识别支持全部常见语种。
                </p>
              </div>
            </div>

            <div className="config-foot">
              <div className="estimate-row">
                <div className="est-block">
                  <span className="est-label">预计计费用量</span>
                  <span className="est-usage">{totalBillMin.toFixed(1)} 分钟</span>
                </div>
                <div className="est-block right">
                  <span className="est-label">预计费用</span>
                  <span className="est-cost">¥{totalCost.toFixed(2)}</span>
                </div>
              </div>
              <button
                className="btn btn-primary btn-full"
                disabled={files.length === 0 || submitting}
                onClick={handleSubmit}
              >
                <CheckIcon />
                <span>{submitting ? '正在提交至火山 LAS...' : `提交 ${files.length} 个任务`}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
