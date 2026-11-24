import { useState } from 'react';
import { api } from '../api/client';
import { ChevronDownIcon } from '../components/Icons';
import type { SubtitleStyleConfig, WorkspaceViewId } from '../types';

interface Props {
  style: SubtitleStyleConfig;
  onChangeStyle: (next: SubtitleStyleConfig) => void;
  onNavigate: (view: WorkspaceViewId) => void;
  onToast: (msg: string) => void;
}

const SWATCHES = [
  { color: '#FFFFFF', title: '纯白' },
  { color: '#FDE047', title: '影视暖黄' },
  { color: '#7FEBC4', title: '薄荷浅绿' },
  { color: '#E2E8F0', title: '柔灰白' },
];

export function SubtitleStyleView({ style, onChangeStyle, onNavigate, onToast }: Props) {
  const [saving, setSaving] = useState(false);

  const previewSize = Math.round(style.font_size * 0.34);
  const ow = style.outline_width;
  const textShadow =
    ow > 0
      ? `0 0 ${ow * 2}px #000, ${ow}px ${ow}px 0 #000, -${ow}px -${ow}px 0 #000, ${ow}px -${ow}px 0 #000, -${ow}px ${ow}px 0 #000`
      : 'none';

  async function handleApply() {
    setSaving(true);
    try {
      const saved = await api.updateSubtitleStyle(style);
      onChangeStyle(saved);
      onToast('字幕烧录样式已保存并应用到翻译方案');
      onNavigate('translate');
    } catch (err: any) {
      onToast(err.message || '保存样式失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    try {
      const defaults = await api.resetSubtitleStyle();
      onChangeStyle(defaults);
      onToast('字幕样式已恢复默认值');
    } catch (err: any) {
      onToast(err.message || '重置失败');
    }
  }

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">字幕样式</h1>
          <p className="page-subtitle">配置烧录到成片与 .ass 字幕的字号、配色、描边与垂直位置，实时预览并应用到翻译任务</p>
        </div>
        <div className="head-right">
          <button className="btn btn-ghost" onClick={handleReset}>
            恢复默认
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={handleApply}>
            {saving ? '保存中...' : '应用到翻译方案'}
          </button>
        </div>
      </div>

      <div className="split-layout">
        <div className="col-main">
          <div className="style-preview-box">
            <img src="/assets/frame_16x9.png" alt="字幕样式预览" />
            <div
              className="style-preview-caption"
              style={{
                fontSize: `${previewSize}px`,
                color: style.font_color,
                top: `${style.top_margin_ratio}%`,
                width: `${style.width_ratio}%`,
                padding: style.bg_opacity > 0 ? '4px 12px' : 0,
                background: style.bg_opacity > 0 ? `rgba(0, 0, 0, ${style.bg_opacity / 100})` : 'transparent',
                textShadow,
              }}
            >
              I won&apos;t wait for you anymore.
            </div>
          </div>
          <div className="info-card">
            <div className="info-card-head">字号换算提示</div>
            <p className="info-card-body">
              算子字号以 720p 为基准（默认 40），不随分辨率自动缩放；1080p 成片建议设为 60（1080 ÷ 720 × 40），距顶比例默认 77%。
            </p>
          </div>
        </div>

        <aside className="col-config">
          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-head">
              <span className="panel-title">烧录样式参数</span>
              <span className="preset-chip">ASS 兼容</span>
            </div>
            <div className="config-body">
              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">字体族</span>
                  <span className="cfg-hint">按语种匹配</span>
                </div>
                <div className="select-box mono-val">
                  <select value={style.font} onChange={(e) => onChangeStyle({ ...style, font: e.target.value })}>
                    <option value="NotoSans">NotoSans-Regular</option>
                    <option value="FiraGO">FiraGO-Regular</option>
                    <option value="Atkinson">AtkinsonHyperlegible-Regular</option>
                  </select>
                  <span className="select-chevron">
                    <ChevronDownIcon />
                  </span>
                </div>
              </div>

              <div className="range-row">
                <div className="cfg-label-row">
                  <span className="cfg-label">字幕字号（ASS 像素）</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
                    {style.font_size} px
                  </span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={96}
                  value={style.font_size}
                  onChange={(e) => onChangeStyle({ ...style, font_size: Number(e.target.value) })}
                />
              </div>

              <div className="range-row">
                <div className="cfg-label-row">
                  <span className="cfg-label">距顶位置比例</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
                    {style.top_margin_ratio}%
                  </span>
                </div>
                <input
                  type="range"
                  min={55}
                  max={90}
                  value={style.top_margin_ratio}
                  onChange={(e) => onChangeStyle({ ...style, top_margin_ratio: Number(e.target.value) })}
                />
              </div>

              <div className="range-row">
                <div className="cfg-label-row">
                  <span className="cfg-label">描边宽度</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
                    {Number(style.outline_width).toFixed(1)} px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={0.5}
                  value={style.outline_width}
                  onChange={(e) => onChangeStyle({ ...style, outline_width: Number(e.target.value) })}
                />
              </div>

              <div className="range-row">
                <div className="cfg-label-row">
                  <span className="cfg-label">动态背景不透明度</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)' }}>
                    {style.bg_opacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={10}
                  value={style.bg_opacity}
                  onChange={(e) => onChangeStyle({ ...style, bg_opacity: Number(e.target.value) })}
                />
              </div>

              <div className="cfg-section">
                <span className="cfg-label">文字颜色</span>
                <div className="color-swatches">
                  {SWATCHES.map((sw) => (
                    <button
                      key={sw.color}
                      className={`swatch ${style.font_color === sw.color ? 'active' : ''}`}
                      style={{ background: sw.color }}
                      title={sw.title}
                      onClick={() => onChangeStyle({ ...style, font_color: sw.color })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
