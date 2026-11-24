import { useEffect, useRef, useState } from 'react';
import type { WorkspaceViewId } from '../types';

const CMD_ITEMS: Array<{ view: WorkspaceViewId; code: string; title: string; desc: string; tone: 'mint' | 'blue' }> = [
  { view: 'overview', code: '01', title: '任务总览', desc: 'KPI 概览、5 态筛选与双算子任务表', tone: 'mint' },
  { view: 'inpaint', code: '02', title: '新建修复任务', desc: '本地批量上传、擦除目标 × 定位方式与实时计费', tone: 'mint' },
  { view: 'annotate', code: '03', title: '区域标注', desc: '1000×1000 归一化框选与三泳道生效时段时间轴', tone: 'mint' },
  { view: 'monitor', code: '04', title: '批次运行监控', desc: '分段总进度、队列明细、Poll 日志与计费累计', tone: 'mint' },
  { view: 'compare', code: '05', title: '修复结果对比', desc: '左右拖动擦除对比滑块与 5 列结果指标条', tone: 'mint' },
  { view: 'translate', code: '06', title: '新建翻译任务', desc: '31 种输出语种、配音模式、去水印前处理与产出预览', tone: 'blue' },
  { view: 'translate-result', code: '07', title: '多语成片结果', desc: '英日韩三语烧录预览、5 列字幕对照与修复原片', tone: 'blue' },
  { view: 'subtitle-style', code: '样式', title: '字幕样式编辑器', desc: '配置烧录字号、位置、描边与背景不透明度', tone: 'blue' },
  { view: 'billing', code: '账单', title: '用量账单', desc: '本月修复与翻译计费汇总及出账明细', tone: 'mint' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (view: WorkspaceViewId) => void;
}

export function CommandPaletteModal({ open, onClose, onSelect }: Props) {
  const [keyword, setKeyword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setKeyword('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  if (!open) return null;

  const q = keyword.trim().toLowerCase();
  const matched = CMD_ITEMS.filter(
    (i) => !q || i.title.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || i.code.includes(q)
  );

  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog">
        <div className="cmd-input-wrap">
          <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
            <circle cx="5.6" cy="5.6" r="4" stroke="#6E7885" strokeWidth="1.3" />
            <path d="M8.6 8.6l2.6 2.6" stroke="#6E7885" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="输入界面名称快速切换（01–07）..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            autoComplete="off"
          />
          <button className="shortcut-btn" onClick={onClose}>
            ESC
          </button>
        </div>
        <div className="cmd-list">
          {matched.map((item) => (
            <button
              key={item.view}
              className="cmd-item"
              onClick={() => {
                onSelect(item.view);
                onClose();
              }}
            >
              <div className="cmd-item-left">
                <span className={`cmd-badge ${item.tone === 'blue' ? 'blue' : ''}`}>{item.code}</span>
                <div>
                  <div className="cmd-title">{item.title}</div>
                  <div className="cmd-desc">{item.desc}</div>
                </div>
              </div>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                ↵
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
