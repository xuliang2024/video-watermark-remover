import { useEffect, useState } from 'react';
import { api, triggerDownload } from '../api/client';
import { DownloadIcon } from '../components/Icons';
import type { TaskDetail, WorkspaceViewId } from '../types';

interface Props {
  taskId: string;
  onNavigate: (view: WorkspaceViewId) => void;
  onToast: (msg: string) => void;
}

interface CaptionLineItem {
  time: string;
  zh?: string;
  en?: string;
  ja?: string;
  ko?: string;
  by_lang?: Record<string, string>;
}

const DEFAULT_LINES: CaptionLineItem[] = [
  {
    time: '00:00:12',
    zh: '我已经等了三年。',
    en: "I've waited three years.",
    ja: 'もう三年も待ったのよ。',
    ko: '벌써 삼 년이나 기다렸어요.',
  },
  {
    time: '00:00:16',
    zh: '你还要我等到什么时候？',
    en: 'How much longer do you want me to wait?',
    ja: 'いつまで待てばいいの？',
    ko: '언제까지 기다리라는 거예요?',
  },
  {
    time: '00:01:02',
    zh: '我不会再等你了。',
    en: "I won't wait for you anymore.",
    ja: 'もう、あなたを待たない。',
    ko: '더는 당신을 기다리지 않을게요.',
  },
];

function isVideoMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.split('?', 1)[0].toLowerCase();
  return !clean.endsWith('.png') && !clean.endsWith('.jpg') && !clean.endsWith('.jpeg') && !clean.endsWith('.webp');
}

function getLineTextForLang(line: CaptionLineItem | undefined, langCode: string): string {
  if (!line) return '';
  if (line.by_lang && line.by_lang[langCode]) {
    return line.by_lang[langCode];
  }
  const shortMap: Record<string, 'zh' | 'en' | 'ja' | 'ko'> = {
    'zh-CN': 'zh',
    'en-US': 'en',
    'ja-JP': 'ja',
    'ko-KR': 'ko',
  };
  const key = shortMap[langCode];
  return (key && line[key]) || line.en || '';
}

export function TranslateResultView({ taskId, onNavigate, onToast }: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setActiveIdx(0);
    api
      .getTaskDetail(taskId || 'latest')
      .then(setTask)
      .catch(() => {
        setTask(null);
      });
  }, [taskId]);

  const res = task?.result || {};
  const lines: CaptionLineItem[] =
    res.caption_lines && res.caption_lines.length > 0 ? res.caption_lines : DEFAULT_LINES;
  const activeLine = lines[activeIdx] || lines[0];
  const cards: Array<{
    code: string;
    label: string;
    font_class: string;
    size: string;
    captions: string;
    video_url?: string;
    audio_url?: string;
  }> = res.cards || [
    { code: 'en-US', label: 'en-US · 英语', font_class: 'lang-en', size: 'MP4 · 86.4 MB', captions: 'SRT + ASS' },
    { code: 'ja-JP', label: 'ja-JP · 日语', font_class: 'lang-ja', size: 'MP4 · 84.1 MB', captions: 'SRT + ASS' },
    { code: 'ko-KR', label: 'ko-KR · 韩语', font_class: 'lang-ko', size: 'MP4 · 88.9 MB', captions: 'SRT + ASS' },
  ];
  const captionCount = Array.isArray(res.caption_files) ? res.caption_files.length : cards.length * 2;
  const totalFiles = res.total_files || cards.length + captionCount + (res.repaired_video ? 1 : 0);
  const currentTaskId = task?.id || 'task-20261113-06e7';
  const hasRealByLang = Boolean(lines[0]?.by_lang);
  const tableLangCols = hasRealByLang ? cards.map((c) => c.code) : ['en-US', 'ja-JP', 'ko-KR'];
  const gridColsStyle = hasRealByLang
    ? { gridTemplateColumns: `88px ${tableLangCols.map(() => 'minmax(180px, 1fr)').join(' ')}` }
    : undefined;

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <button className="breadcrumb-back" onClick={() => onNavigate('overview')}>
            ← 返回任务总览
          </button>
          <h1 className="page-title">翻译完成 · {task?.file || '未选择任务'}</h1>
          <p className="page-subtitle">
            {res.source_lang || '中文（简体）'} → {cards.map((c) => c.label.split(' · ')[1] || c.code).join(' / ')} ·{' '}
            {task?.scheme || '高质量配音'}
            {res.enable_inpaint !== false ? ' · 已启用去水印前处理' : ''} · 总耗时 {res.elapsed_label || '已完成'}
          </p>
        </div>
        <div className="head-right">
          <button className="btn btn-ghost" onClick={() => onNavigate('translate')}>
            重新翻译
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              triggerDownload(`/api/tasks/${encodeURIComponent(currentTaskId)}/download-captions`);
              onToast(`已开始打包下载多语字幕压缩包`);
            }}
          >
            <DownloadIcon />
            <span>打包下载字幕 (.zip)</span>
          </button>
        </div>
      </div>

      <div className="summary-strip" style={{ padding: '13px 16px' }}>
        <div className="summary-row">
          <div className="summary-left">
            <span className="panel-sub">{cards.length} 个目标语种</span>
            <span className="summary-val">{totalFiles} 个产物</span>
            <span className="panel-sub">
              · 配音视频 {cards.length} 个 · 字幕 {captionCount} 份 ·{' '}
              {res.repaired_video ? '修复原片 1 个 · ' : ''}下载链接 3 天有效
            </span>
          </div>
          <span className="summary-meta">
            计费 {(task?.bill_minutes ?? 0).toFixed(2)} 分钟 · ¥{(task?.cost_cny ?? 0).toFixed(2)}
            {res.inpaint_extra_cost ? `（含去水印 ¥${Number(res.inpaint_extra_cost).toFixed(2)}）` : ''}
          </span>
        </div>
      </div>

      <div className="lang-grid">
        {cards.map((card) => {
          const text = getLineTextForLang(activeLine, card.code);
          const realVid = isVideoMediaUrl(card.video_url);
          return (
            <article className="lang-card" key={card.code}>
              <div className="lang-thumb">
                {realVid ? (
                  <video
                    className="lang-video-player"
                    src={card.video_url}
                    poster={task?.thumbnail_url || '/assets/frame_16x9.png'}
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <>
                    <img src={task?.thumbnail_url || '/assets/frame_16x9.png'} alt={card.label} />
                    <div className={`burned-sub ${card.font_class}`}>{text}</div>
                  </>
                )}
                <span className="lang-badge">{card.label}</span>
              </div>
              <div className="lang-card-body">
                {activeLine?.zh && !hasRealByLang && <span className="lang-orig">原文  {activeLine.zh}</span>}
                {text && <span className={`lang-trans ${card.font_class}`}>{text}</span>}
                <div className="lang-chips">
                  <span className="meta-chip">{card.size}</span>
                  <span className="meta-chip">{card.captions}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-tonal btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => {
                      triggerDownload(
                        `/api/tasks/${encodeURIComponent(currentTaskId)}/download?lang=${encodeURIComponent(card.code)}`
                      );
                      onToast(`已开始下载 ${card.code} 配音烧录成片`);
                    }}
                  >
                    下载成片 (.mp4)
                  </button>
                  {card.audio_url && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        triggerDownload(
                          `/api/tasks/${encodeURIComponent(currentTaskId)}/download?lang=${encodeURIComponent(card.code)}&kind=audio`
                        );
                        onToast(`已开始下载 ${card.code} 纯人声配音 (.wav)`);
                      }}
                    >
                      配音 (.wav)
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="panel panel-sm">
        <div className="panel-head compact">
          <span className="panel-title">字幕对照 · 抽查前 {lines.length} 句（点击行切换上方台词高亮）</span>
          <span className="panel-sub" style={{ fontSize: 10 }}>
            术语已按短剧语境本地化 · 人物称谓保持一致
          </span>
        </div>
        <div className="caption-head" style={gridColsStyle}>
          <div>时间码</div>
          {!hasRealByLang && <div>原文 zh-CN</div>}
          {tableLangCols.map((lc) => (
            <div key={lc}>译文 {lc}</div>
          ))}
        </div>
        <div>
          {lines.map((line, idx) => (
            <div
              key={`${line.time}-${idx}`}
              className={`caption-row ${idx === activeIdx ? 'active' : ''}`}
              style={gridColsStyle}
              onClick={() => setActiveIdx(idx)}
            >
              <span className="cap-time">{line.time}</span>
              {!hasRealByLang && <span className="cap-orig">{line.zh}</span>}
              {tableLangCols.map((lc) => (
                <span
                  key={lc}
                  className={`cap-trans ${lc === 'ja-JP' ? 'lang-ja' : lc === 'ko-KR' ? 'lang-ko' : ''}`}
                >
                  {getLineTextForLang(line, lc) || '—'}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {res.repaired_video !== null && (
        <div className="repaired-strip">
          <div className="repaired-left">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect x="1.4" y="1.4" width="23.2" height="23.2" rx="6" stroke="#3C5470" strokeWidth="1.2" />
              <path d="M13 8.4l4.6 2.6-4.6 2.6-4.6-2.6z" stroke="#6FA8E8" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M8.4 13.6l4.6 2.6 4.6-2.6" stroke="#6FA8E8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="cell-stack">
              <span className="repaired-title">修复原片（去水印）· 所有语种共用</span>
              <span className="repaired-meta">
                {res.repaired_video?.resolution || '1920×1080'} · {res.repaired_video?.duration || '已同步'} ·{' '}
                {res.repaired_video?.size_mb ? `${res.repaired_video.size_mb} MB` : '云端成片'} · 修复任务{' '}
                {res.repaired_video?.task_id || 'repair-task-8f2a'}
              </span>
            </div>
          </div>
          <div className="repaired-actions">
            <button
              className="btn btn-ghost btn-sm"
              style={{ background: '#16202B', borderColor: '#293848', color: '#9FB4C8' }}
              onClick={() => {
                triggerDownload(`/api/tasks/${encodeURIComponent(currentTaskId)}/download-captions`);
                onToast('已打包下载多语字幕压缩包 .zip');
              }}
            >
              打包字幕 .zip
            </button>
            <button
              className="btn btn-tonal btn-sm"
              onClick={() => {
                triggerDownload(`/api/tasks/${encodeURIComponent(currentTaskId)}/download?kind=repaired`);
                onToast('正在下载共用去水印修复原片');
              }}
            >
              下载修复原片
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
