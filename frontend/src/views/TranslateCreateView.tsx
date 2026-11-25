import { useState } from 'react';
import { api } from '../api/client';
import { CheckIcon, CloseIcon } from '../components/Icons';
import { VideoUploadZone } from '../components/VideoUploadZone';
import type {
  LanguageItem,
  MediaAsset,
  SubtitleStyleConfig,
  TranslateConfig,
  WorkspaceViewId,
} from '../types';
import { calcTranslateBatch, formatDuration, formatDurationCN } from '../utils/calc';

interface Props {
  files: MediaAsset[];
  sourceLanguages: LanguageItem[];
  outputLanguages: LanguageItem[];
  config: TranslateConfig;
  subtitleStyle: SubtitleStyleConfig;
  onChangeConfig: (next: TranslateConfig) => void;
  onFilesUpdated: () => Promise<void>;
  onOpenLangModal: () => void;
  onNavigate: (view: WorkspaceViewId, ctx?: { batchId?: string; taskId?: string }) => void;
  onToast: (msg: string) => void;
}

const CAPTION_FORMATS: Array<TranslateConfig['caption_formats'][number]> = ['.srt', '.ass', '.vtt', '.txt', '.xml'];

export function TranslateCreateView({
  files,
  sourceLanguages,
  outputLanguages,
  config,
  subtitleStyle,
  onChangeConfig,
  onFilesUpdated,
  onOpenLangModal,
  onNavigate,
  onToast,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  function updateCfg(patch: Partial<TranslateConfig>) {
    const next = { ...config, ...patch };
    if (next.dubbing_mode !== 'high_quality') {
      next.fast_mode = false;
    }
    if (next.target_langs.includes(next.source_lang)) {
      next.target_langs = next.target_langs.filter((c) => c !== next.source_lang);
      if (!next.target_langs.length) next.target_langs = [next.source_lang === 'en-US' ? 'ja-JP' : 'en-US'];
    }
    onChangeConfig(next);
  }

  function toggleTargetLang(code: string) {
    if (code === config.source_lang) return;
    if (config.target_langs.includes(code)) {
      if (config.target_langs.length === 1) {
        onToast('至少保留 1 个目标输出语种');
        return;
      }
      updateCfg({ target_langs: config.target_langs.filter((c) => c !== code) });
    } else {
      updateCfg({ target_langs: [...config.target_langs, code] });
    }
  }

  function toggleFormat(fmt: TranslateConfig['caption_formats'][number]) {
    if (config.caption_formats.includes(fmt)) {
      if (config.caption_formats.length === 1) {
        onToast('至少保留 1 种字幕输出格式');
        return;
      }
      updateCfg({ caption_formats: config.caption_formats.filter((f) => f !== fmt) });
    } else {
      updateCfg({ caption_formats: [...config.caption_formats, fmt] });
    }
  }

  async function handleSubmit() {
    if (!files.length || !config.target_langs.length) return;
    setSubmitting(true);
    try {
      const res = await api.createTranslateBatch(
        files.map((f) => f.id),
        { ...config, subtitle_style: subtitleStyle }
      );
      onToast(`已提交 ${res.task_count} 个多语翻译任务至批次 ${res.code}`);
      onNavigate('monitor', { batchId: res.batch_id });
    } catch (err: any) {
      onToast(err.message || '提交翻译任务失败');
    } finally {
      setSubmitting(false);
    }
  }

  const totalGB = files.reduce((s, f) => s + f.size_gb, 0);
  const calc = calcTranslateBatch(files, config);
  const primaryLangs = outputLanguages.filter((l) => l.primary || config.target_langs.includes(l.code));
  const shown = primaryLangs.slice(0, 6);
  const hiddenCount = Math.max(0, outputLanguages.length - shown.length);
  const fmtLabel = config.caption_formats.map((f) => f.replace('.', '')).join('+') || '无';
  const parallelText =
    calc.taskCount <= 10
      ? `${calc.taskCount} 个任务可全部并行`
      : `账号并发上限 10，将分 ${Math.ceil(calc.taskCount / 10)} 批执行`;
  const sampleBase = (files[0]?.name || 'S01E01.mp4').split('_')[0].replace(/\.[^.]+$/, '');
  const sampleNames = config.target_langs.slice(0, 3).map((c) => `${sampleBase}_${c}.mp4`).join(' · ');

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">新建翻译任务</h1>
          <p className="page-subtitle">
            一次提交，按目标语种批量产出配音视频与字幕文件；可同时启用去水印前处理，直接交付干净的多语成片
          </p>
        </div>
        <div className="head-right">
          <span className="save-hint">草稿已自动保存</span>
          <button className="btn btn-ghost" onClick={() => onNavigate('translate-result', { taskId: 'task-20261113-06e7' })}>
            查看多语成片示例
          </button>
        </div>
      </div>

      <div className="split-layout">
        <div className="col-main">
          <VideoUploadZone
            purpose="translate"
            variant="strip"
            accept="video/*,.mp4,.mov,.avi,.mkv,.flv,.webm"
            idleTitle="拖入视频文件批量上传"
            idleSubtitle="mp4 / mov / avi / mkv / flv / webm · 单文件 ≤ 10 GB · 2 秒 – 4 小时"
            onAssetUploaded={onFilesUpdated}
            onToast={onToast}
          />

          <div className="panel panel-sm">
            <div className="panel-head compact">
              <div className="panel-title-wrap">
                <span className="panel-title">源文件</span>
                <span className="panel-sub">
                  {files.length} 个文件 · 合计 {formatDurationCN(calc.totalSec)} · {totalGB.toFixed(2)} GB
                </span>
              </div>
              <button
                className="clear-link"
                onClick={async () => {
                  await api.clearAssets('translate');
                  await onFilesUpdated();
                }}
              >
                全部移除
              </button>
            </div>
            <div>
              {!files.length ? (
                <div className="empty-state" style={{ padding: '28px 20px' }}>
                  暂未添加源文件 ·{' '}
                  <button
                    className="mode-inline-action"
                    onClick={async () => {
                      await api.restoreSampleAssets('translate');
                      await onFilesUpdated();
                    }}
                  >
                    恢复示例素材
                  </button>
                </div>
              ) : (
                files.map((f) => (
                  <div className="file-row" key={f.id} style={{ height: 66 }}>
                    <div className="thumb sm">
                      <img src={f.thumbnail_url || '/assets/frame_16x9.png'} alt="" />
                    </div>
                    <div className="cell-stack" style={{ flex: 1 }}>
                      <span className="file-name">{f.name}</span>
                      <span className="file-meta">
                        {f.resolution} · {f.fps.toFixed(2)}fps · {formatDuration(f.duration_sec)} · {f.size_gb.toFixed(2)} GB
                      </span>
                    </div>
                    <span className="lang-detected-chip">识别为 {f.detected_lang}</span>
                    <button
                      className="remove-btn"
                      title="移除文件"
                      onClick={async () => {
                        await api.deleteAsset(f.id);
                        await onFilesUpdated();
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="output-preview-card">
            <span className="panel-sub" style={{ fontWeight: 500 }}>
              本次提交将产生
            </span>
            <div className="preview-big-row">
              <span className="preview-big-num">{calc.taskCount}</span>
              <span className="preview-big-unit">个任务</span>
            </div>
            <div className="preview-stat-grid">
              <div className="preview-stat-box">
                <span className="stat-label">配音视频</span>
                <span className="preview-stat-val">{calc.taskCount} 个 · MP4</span>
              </div>
              <div className="preview-stat-box">
                <span className="stat-label">字幕文件</span>
                <span className="preview-stat-val">
                  {calc.captionCount} 份 · {fmtLabel}
                </span>
              </div>
              <div className="preview-stat-box">
                <span className="stat-label">纯配音音频</span>
                <span className={`preview-stat-val ${!config.output_dubbing_audio ? 'muted' : ''}`}>
                  {config.output_dubbing_audio ? `${calc.audioCount} 个 · WAV` : '0 个'}
                </span>
              </div>
            </div>
            <p className="preview-note">
              {files.length} 个源文件 × {calc.langCount} 个目标语种 · {parallelText}，预计 {calc.estMinutes} 分钟完成
            </p>
            <p className="naming-sample">命名示例  {sampleNames || '请选择至少 1 种目标语言'}</p>
          </div>
        </div>

        <aside className="col-config">
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-head">
              <span className="panel-title">翻译方案</span>
              <span className="preset-chip">预设 · 短剧出海</span>
            </div>

            <div className="config-body">
              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">语言</span>
                  <span className="cfg-hint">输入 25 种 · 输出 31 种</span>
                </div>
                <div className="source-lang-row">
                  <span className="src-lbl">源语言（自动识别）</span>
                  <select
                    aria-label="源语言"
                    value={config.source_lang}
                    onChange={(e) => updateCfg({ source_lang: e.target.value })}
                  >
                    {sourceLanguages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name} {l.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="chip-wrap">
                  {shown.map((l) => {
                    const isSrc = l.code === config.source_lang;
                    const active = config.target_langs.includes(l.code) && !isSrc;
                    return (
                      <button
                        key={l.code}
                        className={`chip ${active ? 'active' : ''}`}
                        disabled={isSrc}
                        title={isSrc ? '不可与源语言相同' : l.name}
                        onClick={() => toggleTargetLang(l.code)}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                  <button className="chip ghost" onClick={onOpenLangModal}>
                    + {hiddenCount} 种
                  </button>
                </div>
              </div>

              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">配音模式</span>
                  <span className="cfg-hint">决定单价 1.5 / 4 元</span>
                </div>
                <div className="seg-tiles">
                  {(
                    [
                      ['emotion', '情感复刻', '情感饱满'],
                      ['timbre', '音色还原', '音色一致'],
                      ['high_quality', '高质量配音', '最佳效果'],
                    ] as const
                  ).map(([val, title, sub]) => (
                    <button
                      key={val}
                      className={`seg-tile ${config.dubbing_mode === val ? 'active' : ''}`}
                      onClick={() => updateCfg({ dubbing_mode: val })}
                    >
                      <span className="tile-title">{title}</span>
                      <span className="tile-sub">{sub}</span>
                    </button>
                  ))}
                </div>
                <div className="toggle-list" style={{ marginTop: 2 }}>
                  <div
                    className={`toggle-row ${config.dubbing_mode !== 'high_quality' ? 'disabled' : ''}`}
                    onClick={() => config.dubbing_mode === 'high_quality' && updateCfg({ fast_mode: !config.fast_mode })}
                  >
                    <span className="toggle-label">
                      {config.dubbing_mode === 'high_quality' ? '快速模式（缩短耗时）' : '快速模式（仅高质量配音可用）'}
                    </span>
                    <span className={`switch ${config.fast_mode ? 'on' : ''}`}>
                      <span className="knob"></span>
                    </span>
                  </div>
                  <div className="toggle-row" onClick={() => updateCfg({ dynamic_duration: !config.dynamic_duration })}>
                    <span className="toggle-label">动态时长（微调片长对齐配音）</span>
                    <span className={`switch ${config.dynamic_duration ? 'on' : ''}`}>
                      <span className="knob"></span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">字幕</span>
                  <span className="cfg-hint">烧录到成片</span>
                </div>
                <div className="toggle-row" onClick={() => updateCfg({ burn_subtitles: !config.burn_subtitles })}>
                  <span className="toggle-label">烧录翻译字幕</span>
                  <span className={`switch ${config.burn_subtitles ? 'on' : ''}`}>
                    <span className="knob"></span>
                  </span>
                </div>
                <div className="style-summary-row">
                  <span className="style-summary-val">
                    {subtitleStyle.font} · {subtitleStyle.font_size}px · 底部 {subtitleStyle.top_margin_ratio}%
                  </span>
                  <button className="style-edit-btn" onClick={() => onNavigate('subtitle-style')}>
                    编辑样式
                  </button>
                </div>
                <div className="chip-wrap">
                  {CAPTION_FORMATS.map((fmt) => (
                    <button
                      key={fmt}
                      className={`chip mono ${config.caption_formats.includes(fmt) ? 'active' : ''}`}
                      onClick={() => toggleFormat(fmt)}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">前处理与产物</span>
                  <span className="cfg-hint">按需启用</span>
                </div>
                <div className="toggle-list">
                  <div className="toggle-row" onClick={() => updateCfg({ enable_inpaint: !config.enable_inpaint })}>
                    <span className="toggle-label">先去水印再翻译</span>
                    <span className={`switch ${config.enable_inpaint ? 'on' : ''}`}>
                      <span className="knob"></span>
                    </span>
                  </div>
                  <div
                    className="toggle-row"
                    onClick={() => updateCfg({ output_dubbing_audio: !config.output_dubbing_audio })}
                  >
                    <span className="toggle-label">额外输出纯人声配音（.wav）</span>
                    <span className={`switch ${config.output_dubbing_audio ? 'on' : ''}`}>
                      <span className="knob"></span>
                    </span>
                  </div>
                </div>
                <p className="info-card-body" style={{ fontSize: 9 }}>
                  专业版 · 精准识别 · 擦除水印与字幕；修复原片单独返回，不占语种产物
                </p>
              </div>
            </div>

            <div className="config-foot">
              <div className="estimate-row">
                <div className="est-block">
                  <span className="est-label">计费用量</span>
                  <span className="est-usage">{calc.billMin.toFixed(1)} 分钟</span>
                </div>
                <div className="est-block right">
                  <span className="est-label">预计费用</span>
                  <span className="est-cost">¥{calc.cost.toFixed(2)}</span>
                </div>
              </div>
              <span className="est-footnote">
                {calc.unitPrice} 元/分 × {calc.totalMin.toFixed(1)} 分钟 × {calc.langCount} 语种
                {config.enable_inpaint ? '；去水印按修复算子另行计费' : '；未开启去水印前处理'}
              </span>
              <button
                className="btn btn-primary btn-full"
                disabled={calc.taskCount === 0 || submitting}
                onClick={handleSubmit}
              >
                <CheckIcon />
                <span>{submitting ? '正在提交至火山 LAS...' : `提交 ${calc.taskCount} 个任务`}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
