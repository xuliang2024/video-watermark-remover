import type { LanguageItem } from '../types';

interface Props {
  open: boolean;
  languages: LanguageItem[];
  sourceLang: string;
  selectedLangs: string[];
  onToggle: (code: string) => void;
  onClose: () => void;
}

export function LanguageModal({ open, languages, sourceLang, selectedLangs, onToggle, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" style={{ width: 580 }}>
        <div className="panel-head">
          <div className="panel-title-wrap">
            <span className="panel-title">选择目标输出语种</span>
            <span className="panel-sub">支持 {languages.length} 种配音与字幕语种（不可包含源语言）</span>
          </div>
          <button className="btn btn-primary btn-xs" onClick={onClose}>
            完成
          </button>
        </div>
        <div className="lang-modal-grid">
          {languages.map((lang) => {
            const isSrc = lang.code === sourceLang;
            const active = selectedLangs.includes(lang.code) && !isSrc;
            return (
              <button
                key={lang.code}
                className={`chip ${active ? 'active' : ''}`}
                disabled={isSrc}
                title={isSrc ? '不可与源语言相同' : lang.name}
                style={{ justifyContent: 'space-between', height: 32, padding: '0 10px' }}
                onClick={() => onToggle(lang.code)}
              >
                <span>{lang.name}</span>
                <span className="mono" style={{ fontSize: 9, opacity: 0.75 }}>
                  {lang.code}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
