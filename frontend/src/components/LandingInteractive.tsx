import { useEffect, useRef, useState } from 'react';
import type { WorkspaceViewId } from '../types';

export interface TimelineChapter {
  id: string;
  timecode: string;
  label: string;
  desc: string;
  accent: 'emerald' | 'cobalt' | 'amber' | 'ivory';
  stepSelector?: string;
}

const HERO_PHRASES = [
  { text: '批量抹除角标与硬字幕', accent: 'emerald' as const, icon: 'spark' as const },
  { text: '一键翻译 31 种语言', accent: 'cobalt' as const, icon: 'globe' as const },
  { text: '1:1 复刻原声情绪配音', accent: 'emerald' as const, icon: 'wave' as const },
  { text: '整季 200 集并行出片', accent: 'amber' as const, icon: 'layers' as const },
];

function PhraseIcon({ type }: { type: 'spark' | 'globe' | 'wave' | 'layers' }) {
  if (type === 'spark') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M10 2.5l1.9 4.7 4.6 1.8-4.6 1.9L10 15.5l-1.9-4.6L3.5 9l4.6-1.8L10 2.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === 'globe') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <ellipse cx="10" cy="10" rx="3.2" ry="7" stroke="currentColor" strokeWidth="1.3" />
        <path d="M3.4 7.5h13.2M3.4 12.5h13.2" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (type === 'wave') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M3 10h2m2.5-4v8M10 4v12m2.5-9v6M15 8v4m2-2h0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3.2L17 7l-7 3.8L3 7l7-3.8zM3 10.5l7 3.8 7-3.8M3 13.8l7 3.8 7-3.8"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeroRotatingTitle() {
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(-1);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setIdx((curr) => {
        setPrevIdx(curr);
        return (curr + 1) % HERO_PHRASES.length;
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <h1 className="hero-title hero-enter" style={{ animationDelay: '0ms' }}>
      <span className="sr-only">视频无痕去水印，一键翻译 31 种语言</span>
      <span className="hero-title-static" aria-hidden="true">
        视频无痕去水印，
      </span>
      <span
        className="hero-rot-slot"
        aria-hidden="true"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {HERO_PHRASES.map((item) => (
          <span key={`m-${item.text}`} className="hero-rot-measure">
            <span className="hero-rot-badge">
              <PhraseIcon type={item.icon} />
            </span>
            <span>{item.text}</span>
          </span>
        ))}
        {HERO_PHRASES.map((item, i) => {
          const role = i === idx ? 'in' : i === prevIdx ? 'out' : 'idle';
          return (
            <span
              key={item.text}
              className={`hero-rot-phrase accent-${item.accent}`}
              data-role={role}
            >
              <span className={`hero-rot-badge accent-${item.accent}`}>
                <PhraseIcon type={item.icon} />
              </span>
              <span>{item.text}</span>
            </span>
          );
        })}
      </span>
    </h1>
  );
}

export function TimelineRail({ chapters }: { chapters: TimelineChapter[] }) {
  const [visible, setVisible] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [subStepMap, setSubStepMap] = useState<Record<string, { curr: number; total: number }>>({});
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const hoverRef = useRef(false);

  useEffect(() => {
    const compute = () => {
      const sy = window.scrollY;
      const vh = window.innerHeight;
      setVisible(sy > Math.min(340, vh * 0.45));

      const probe = sy + vh * 0.36;
      let curr = 0;
      const nextSub: Record<string, { curr: number; total: number }> = {};

      chapters.forEach((ch, idx) => {
        const el = document.getElementById(ch.id);
        if (!el) return;
        const top = el.getBoundingClientRect().top + sy;
        if (top <= probe) curr = idx;

        if (ch.stepSelector) {
          const steps = Array.from(el.querySelectorAll<HTMLElement>(ch.stepSelector));
          if (steps.length > 0) {
            let passed = 0;
            steps.forEach((st) => {
              const sTop = st.getBoundingClientRect().top + sy;
              if (sTop <= probe + 40) passed += 1;
            });
            nextSub[ch.id] = { curr: Math.max(0, passed), total: steps.length };
          }
        }
      });

      setActiveIdx(curr);
      setSubStepMap(nextSub);
    };

    const wake = () => {
      setEngaged(true);
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        if (!hoverRef.current) setEngaged(false);
      }, 1500);
    };

    const onScroll = () => {
      compute();
      wake();
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', compute, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', compute);
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
  }, [chapters]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const top = id === 'top' ? 0 : Math.max(0, el.getBoundingClientRect().top + window.scrollY - 68);
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  };

  const activeChapter = chapters[activeIdx] ?? chapters[0];

  return (
    <aside
      className={`timeline-rail ${visible ? 'is-visible' : ''} ${engaged ? 'is-engaged' : ''} accent-${activeChapter?.accent ?? 'emerald'}`}
      aria-label="页面时间码导览"
      onMouseEnter={() => {
        hoverRef.current = true;
        setEngaged(true);
        if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        setHoveredIdx(null);
        idleTimerRef.current = window.setTimeout(() => {
          if (!hoverRef.current) setEngaged(false);
        }, 800);
      }}
    >
      <div className="rail-track" aria-hidden="true">
        <div
          className="rail-progress"
          style={{
            height: `${chapters.length > 1 ? (activeIdx / (chapters.length - 1)) * 100 : 0}%`,
          }}
        />
      </div>

      <div className="rail-items">
        {chapters.map((ch, idx) => {
          const isActive = idx === activeIdx;
          const sub = subStepMap[ch.id];
          const showPeek = hoveredIdx === idx;
          return (
            <div key={ch.id} className="rail-item-wrap">
              <button
                type="button"
                className={`rail-node accent-${ch.accent} ${isActive ? 'is-active' : ''}`}
                aria-current={isActive ? 'location' : undefined}
                onMouseEnter={() => setHoveredIdx(idx)}
                onFocus={() => {
                  setEngaged(true);
                  setHoveredIdx(idx);
                }}
                onBlur={() => setHoveredIdx(null)}
                onClick={() => jumpTo(ch.id)}
              >
                <span className="rail-tick" aria-hidden="true" />
                <span className="rail-meta">
                  <span className="rail-tc mono">{ch.timecode}</span>
                  <span className="rail-lbl">{ch.label}</span>
                  {sub && sub.curr > 0 && isActive && (
                    <span className="rail-sub mono">
                      {sub.curr}/{sub.total}
                    </span>
                  )}
                </span>
              </button>

              {showPeek && (
                <div className={`rail-peek accent-${ch.accent}`} role="tooltip">
                  <div className="rail-peek-tc mono">
                    {ch.timecode}
                    {sub ? ` · ${sub.total} 个步骤` : ''}
                  </div>
                  <div className="rail-peek-title">{ch.label}</div>
                  <div className="rail-peek-desc">{ch.desc}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function MicroSceneStage({
  accent,
  statusText,
  children,
}: {
  accent: 'emerald' | 'cobalt';
  statusText: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`micro-stage stage-${accent} ${inView ? 'is-in' : ''}`}>
      <div className="micro-stage-chrome">
        <span className="micro-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="micro-status-pill">
          <span className={`micro-pulse dot-${accent}`} aria-hidden="true" />
          <span>{statusText}</span>
        </span>
      </div>
      <div className="micro-stage-body">{children}</div>
    </div>
  );
}

const DUB_SAMPLES = [
  { code: 'EN', voice: '原声复刻 · 0.98× 语速', line: "I won't wait for you anymore.", langClass: '', font: 'Inter Medium' },
  { code: 'JA', voice: '原声复刻 · NotoSansJP', line: 'もう、あなたを待たない。', langClass: 'lang-ja', font: 'NotoSansJP' },
  { code: 'KO', voice: '原声复刻 · NotoSansKR', line: '더는 당신을 기다리지 않을게요.', langClass: 'lang-ko', font: 'NotoSansKR' },
  { code: 'ES', voice: '情感配音 · 字幕同步', line: 'Ya no voy a esperarte más.', langClass: '', font: 'Inter Medium' },
] as const;

export function EngineStorySections({
  onEnterWorkspace,
}: {
  onEnterWorkspace: (view?: WorkspaceViewId) => void;
}) {
  const [dubIdx, setDubIdx] = useState(0);
  const [activeRegion, setActiveRegion] = useState<'logo' | 'title' | 'sub'>('logo');
  const [subtitleGuard, setSubtitleGuard] = useState(true);
  const activeDub = DUB_SAMPLES[dubIdx];

  return (
    <>
      <section className="section alt engine-section" id="engine-inpaint">
        <div className="container">
          <div className="engine-chapter-head" data-reveal>
            <div className="engine-chapter-meta">
              <span className="feature-tag tag-emerald">01 · 视频无痕修复</span>
              <span className="engine-chapter-tc mono">01:00 · 3 个步骤</span>
            </div>
            <h2 className="engine-chapter-title">精准抹除角标、台标与硬字幕</h2>
            <p className="engine-chapter-sub">
              不靠手动遮罩，拖入整季素材自动识别省费项并按秒擦除，全链路可视化检视。
            </p>
          </div>

          <div className="story-splits">
            <article className="story-split" data-story-step>
              <MicroSceneStage accent="emerald" statusText="ffprobe 媒体预检中">
                <div className="ms-card ms-main" style={{ '--ms-i': 0 } as React.CSSProperties}>
                  <div className="ms-card-head">
                    <span>整季待处理队列</span>
                    <span className="ms-badge emerald mono">48 个文件</span>
                  </div>
                  <div className="ms-file-list">
                    <div className="ms-file-item is-hl">
                      <span className="ms-file-dot emerald" />
                      <span className="ms-file-name mono">S01E01_雨夜来客.mp4</span>
                      <span className="ms-chip-tag">1080p · 24fps</span>
                      <span className="ms-chip-save emerald">×0.8</span>
                    </div>
                    <div className="ms-file-item">
                      <span className="ms-file-dot emerald" />
                      <span className="ms-file-name mono">S01E02_雨夜来客.mp4</span>
                      <span className="ms-chip-tag">4K · 60fps</span>
                      <span className="ms-chip-save amber">→ 30fps -50%</span>
                    </div>
                    <div className="ms-file-item">
                      <span className="ms-file-dot emerald" />
                      <span className="ms-file-name mono">S01E03_雨夜来客.mp4</span>
                      <span className="ms-chip-tag">1080p · 30fps</span>
                      <span className="ms-chip-save emerald">×1.0</span>
                    </div>
                  </div>
                </div>
                <div className="ms-float-card ms-bottom-right" style={{ '--ms-i': 1 } as React.CSSProperties}>
                  <span className="ms-float-k">自动省费建议</span>
                  <div className="ms-float-v mono">
                    <span className="text-emerald">✓</span> 60fps 降至 30fps · 费用省半
                  </div>
                </div>
              </MicroSceneStage>

              <div className="story-copy" data-reveal>
                <span className="story-lead emerald">首先</span>
                <h3 className="story-title">拖入整季文件夹，自动算好省费参数</h3>
                <p className="story-desc">
                  本地多选或直接拖入多达 200 集目录，系统实时探测分辨率与高帧率，自动标出可降帧省半价的文件。
                </p>
                <div className="story-pills">
                  <span className="story-pill">三档算力 · ¥0.50/分</span>
                  <span className="story-pill">4K / 10 GB</span>
                </div>
                <button className="story-action" onClick={() => onEnterWorkspace('inpaint')}>
                  <span>进入上传 ↗</span>
                </button>
              </div>
            </article>

            <article className="story-split is-flip" data-story-step>
              <MicroSceneStage accent="emerald" statusText="AI 区域与时间轴标注">
                <div className="ms-canvas-frame" style={{ '--ms-i': 0 } as React.CSSProperties}>
                  <img src="/assets/frame_16x9.png" alt="" className="ms-frame-bg" />
                  <button
                    type="button"
                    className={`ms-bbox box-logo ${activeRegion === 'logo' ? 'is-selected' : ''}`}
                    onClick={() => setActiveRegion('logo')}
                  >
                    <span>角标</span>
                    <em className="mono">00:00–02:14</em>
                  </button>
                  <button
                    type="button"
                    className={`ms-bbox box-title ${activeRegion === 'title' ? 'is-selected' : ''}`}
                    onClick={() => setActiveRegion('title')}
                  >
                    <span>片头</span>
                    <em className="mono">00:00–00:12</em>
                  </button>
                  <button
                    type="button"
                    className={`ms-bbox box-sub ${activeRegion === 'sub' ? 'is-selected' : ''} ${subtitleGuard ? 'is-guarded' : ''}`}
                    onClick={() => setActiveRegion('sub')}
                  >
                    <span>{subtitleGuard ? '🛡 底部台词已保护' : '硬字幕'}</span>
                  </button>
                  <div className="ms-scan-beam" aria-hidden="true" />
                </div>

                <div className="ms-timeline-bar" style={{ '--ms-i': 1 } as React.CSSProperties}>
                  <div className="ms-tl-row">
                    <span className="ms-tl-label">生效区间</span>
                    <div className="ms-tl-track">
                      <span className={`ms-tl-seg ${activeRegion === 'title' ? 'is-short' : 'is-full'}`} />
                    </div>
                  </div>
                  <div className="ms-tl-controls">
                    <button
                      type="button"
                      className={`ms-mini-toggle ${subtitleGuard ? 'on' : ''}`}
                      onClick={() => setSubtitleGuard((v) => !v)}
                    >
                      <span className="ms-toggle-dot" />
                      <span>字幕保护</span>
                    </button>
                    <span className="ms-badge emerald mono">✓ 已复用到全季 48 集</span>
                  </div>
                </div>
              </MicroSceneStage>

              <div className="story-copy" data-reveal>
                <span className="story-lead emerald">接着</span>
                <h3 className="story-title">全自动识别，或按秒框选固定角标</h3>
                <p className="story-desc">
                  支持点击切换角标、片头与硬字幕独立时段；只去角标时可一键开启底部字幕保护，模板直接复用到整季。
                </p>
                <div className="story-pills">
                  <span className="story-pill">时段框选</span>
                  <span className="story-pill">字幕保护</span>
                </div>
                <button className="story-action" onClick={() => onEnterWorkspace('annotate')}>
                  <span>区域标注 ↗</span>
                </button>
              </div>
            </article>

            <article className="story-split" data-story-step>
              <MicroSceneStage accent="emerald" statusText="10 路云端并发渲染">
                <div className="ms-card ms-main" style={{ '--ms-i': 0 } as React.CSSProperties}>
                  <div className="ms-card-head">
                    <span>批次执行进度</span>
                    <span className="ms-badge emerald mono">10× 并发</span>
                  </div>
                  <div className="ms-queue-rows">
                    <div className="ms-q-row">
                      <span className="mono">EP01 – EP32</span>
                      <div className="ms-q-bar"><i style={{ width: '100%' }} className="done" /></div>
                      <span className="ms-q-stat text-emerald mono">✓</span>
                    </div>
                    <div className="ms-q-row">
                      <span className="mono">EP33 – EP42</span>
                      <div className="ms-q-bar"><i style={{ width: '76%' }} className="running" /></div>
                      <span className="ms-q-stat mono">76%</span>
                    </div>
                    <div className="ms-q-row">
                      <span className="mono">EP43 – EP48</span>
                      <div className="ms-q-bar"><i style={{ width: '28%' }} className="queued" /></div>
                      <span className="ms-q-stat mono">28%</span>
                    </div>
                  </div>
                </div>

                <div className="ms-float-card ms-bottom-left" style={{ '--ms-i': 1 } as React.CSSProperties}>
                  <div className="ms-compare-mini">
                    <span className="ms-cmp-tag before">原片</span>
                    <span className="ms-cmp-divider" />
                    <span className="ms-cmp-tag after">修复后</span>
                  </div>
                  <span className="ms-float-k">成片滑块逐帧抽检</span>
                </div>
              </MicroSceneStage>

              <div className="story-copy" data-reveal>
                <span className="story-lead emerald">最后</span>
                <h3 className="story-title">并行渲染出片，网页滑块逐帧抽检</h3>
                <p className="story-desc">
                  无需守着电脑或写脚本，多路并发自动完成修复；完成后在审片台左右滑动对比原片与成片，一键打包下载。
                </p>
                <div className="story-actions-row">
                  <button className="btn btn-ghost" onClick={() => onEnterWorkspace('inpaint')}>
                    <span>新建修复任务</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 8h9M8.5 4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button className="story-action" onClick={() => onEnterWorkspace('compare')}>
                    <span>工作台对比 ↗</span>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section engine-section" id="engine-translate">
        <div className="container">
          <div className="engine-chapter-head" data-reveal>
            <div className="engine-chapter-meta">
              <span className="feature-tag tag-cobalt">02 · 多语配音译制</span>
              <span className="engine-chapter-tc mono">02:00 · 3 个步骤</span>
            </div>
            <h2 className="engine-chapter-title">1:1 复刻音色，一次提交多语出片</h2>
            <p className="engine-chapter-sub">
              同一条干净母带直接分发 31 国语言，原声复刻、语速对齐与字幕烧录一步到位。
            </p>
          </div>

          <div className="story-splits">
            <article className="story-split is-flip" data-story-step>
              <MicroSceneStage accent="cobalt" statusText="母带复用 · 零重复扣费">
                <div className="ms-hub-layout" style={{ '--ms-i': 0 } as React.CSSProperties}>
                  <div className="ms-hub-master">
                    <span className="ms-badge emerald mono">已去水印母带</span>
                    <strong className="mono">S01E01_clean.mp4</strong>
                    <span className="ms-muted">仅修复计费 1 次</span>
                  </div>
                  <div className="ms-hub-arrow" aria-hidden="true">→</div>
                  <div className="ms-hub-langs">
                    {['EN', 'JA', 'KO', 'ES', 'RU', 'DE'].map((code, i) => (
                      <span
                        key={code}
                        className="ms-lang-node mono"
                        style={{ animationDelay: `${i * 120}ms` }}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ms-float-card ms-bottom-right" style={{ '--ms-i': 1 } as React.CSSProperties}>
                  <span className="ms-float-k">母带复用</span>
                  <div className="ms-float-v text-cobalt mono">多语共用 · 去水印不重复收费</div>
                </div>
              </MicroSceneStage>

              <div className="story-copy" data-reveal>
                <span className="story-lead cobalt">首先</span>
                <h3 className="story-title">去水印母带全语种共用，只修一次底片</h3>
                <p className="story-desc">
                  串联去水印与多语翻译时，先生成一条无痕母带再同步派发英、日、韩、西、俄等目标语种，大幅降低整季出海成本。
                </p>
                <div className="story-pills">
                  <span className="story-pill">母带复用</span>
                  <span className="story-pill">31 语种</span>
                </div>
                <button className="story-action cobalt" onClick={() => onEnterWorkspace('translate')}>
                  <span>新建翻译任务 ↗</span>
                </button>
              </div>
            </article>

            <article className="story-split" data-story-step>
              <MicroSceneStage accent="cobalt" statusText="声线与情绪 1:1 复刻">
                <div className="ms-card ms-main" style={{ '--ms-i': 0 } as React.CSSProperties}>
                  <div className="ms-card-head">
                    <span>声纹波形对齐预览（点击切语种）</span>
                    <div className="dub-dock-langs" role="tablist">
                      {DUB_SAMPLES.map((item, idx) => (
                        <button
                          key={item.code}
                          type="button"
                          role="tab"
                          aria-selected={dubIdx === idx}
                          className={`dub-lang-chip ${dubIdx === idx ? 'active' : ''}`}
                          onClick={() => setDubIdx(idx)}
                        >
                          {item.code}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ms-wave-compare">
                    <div className="ms-wave-row">
                      <span className="ms-wave-tag mono">ORIG</span>
                      <div className="ms-wave-bars muted" aria-hidden="true">
                        {[38, 72, 54, 90, 66, 42, 82, 58, 46, 74, 60, 36].map((h, i) => (
                          <i key={i} style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="ms-wave-row" key={activeDub.code}>
                      <span className="ms-wave-tag cobalt mono">{activeDub.code}</span>
                      <div className="ms-wave-bars active" aria-hidden="true">
                        {[42, 76, 52, 92, 64, 48, 86, 62, 50, 78, 56, 40].map((h, i) => (
                          <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 75}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="ms-dub-quote" key={`q-${activeDub.code}`}>
                    <span className={`ms-dub-text ${activeDub.langClass}`}>{activeDub.line}</span>
                    <span className="ms-dub-meta mono">{activeDub.voice}</span>
                  </div>
                </div>
              </MicroSceneStage>

              <div className="story-copy" data-reveal>
                <span className="story-lead cobalt">接着</span>
                <h3 className="story-title">1:1 复刻原声色，动态对齐语速与停顿</h3>
                <p className="story-desc">
                  精准保留原片说话人的声线特质与情绪起伏，自动根据译文长短微调语速节奏，听感自然不跳戏。
                </p>
                <div className="story-pills">
                  <span className="story-pill">声线节奏</span>
                  <span className="story-pill">{activeDub.font}</span>
                </div>
                <button className="story-action cobalt" onClick={() => onEnterWorkspace('translate-result')}>
                  <span>查看成片 ↗</span>
                </button>
              </div>
            </article>

            <article className="story-split is-flip" data-story-step>
              <MicroSceneStage accent="cobalt" statusText="多语字幕烧录与打包">
                <div className="ms-card ms-main" style={{ '--ms-i': 0 } as React.CSSProperties}>
                  <div className="ms-card-head">
                    <span>多语种成片交付包</span>
                    <span className="ms-badge cobalt mono">ZIP · READY</span>
                  </div>
                  <div className="ms-export-grid">
                    <div className="ms-export-item">
                      <span className="ms-ext-badge cobalt mono">MP4</span>
                      <div>
                        <strong>烧录成片视频</strong>
                        <span className="ms-muted mono">EN · JA · KO · 1080p</span>
                      </div>
                    </div>
                    <div className="ms-export-item">
                      <span className="ms-ext-badge emerald mono">SRT</span>
                      <div>
                        <strong>多格式字幕文件</strong>
                        <span className="ms-muted mono">SRT / ASS / VTT</span>
                      </div>
                    </div>
                  </div>
                  <div className="ms-font-strip mono">
                    <span>NotoSansJP</span>
                    <span>NotoSansKR</span>
                    <span>Inter</span>
                    <span>✓ 字轨校验通过</span>
                  </div>
                </div>
              </MicroSceneStage>

              <div className="story-copy" data-reveal>
                <span className="story-lead cobalt">最后</span>
                <h3 className="story-title">匹配语种字体烧录，同步导出多格式字幕</h3>
                <p className="story-desc">
                  自动匹配各语种专属字体与安全边距完成硬字幕烧录，并同步产出 SRT / ASS / VTT 方便二次剪辑。
                </p>
                <div className="story-actions-row">
                  <button className="btn btn-ghost" onClick={() => onEnterWorkspace('translate')}>
                    <span>新建翻译任务</span>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 8h9M8.5 4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button className="story-action cobalt" onClick={() => onEnterWorkspace('subtitle-style')}>
                    <span>字幕样式 ↗</span>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
