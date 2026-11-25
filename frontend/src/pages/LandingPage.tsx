import { useEffect, useRef, useState } from 'react';
import { BrandLogo } from '../components/Icons';
import type { WorkspaceViewId } from '../types';

interface Props {
  onEnterWorkspace: (view?: WorkspaceViewId) => void;
}

const HERO_MODES = {
  wipe: {
    isTranslate: false,
    badge: '',
    caption: '',
    langClass: '',
    targetView: 'compare' as WorkspaceViewId,
    linkText: '工作台对比 ↗',
  },
  'en-US': {
    isTranslate: true,
    badge: '英语配音 · 原声音色',
    caption: "I won't wait for you anymore.",
    langClass: '',
    targetView: 'translate-result' as WorkspaceViewId,
    linkText: '查看成片 ↗',
  },
  'ja-JP': {
    isTranslate: true,
    badge: '日语配音 · 原声音色',
    caption: 'もう、あなたを待たない。',
    langClass: 'lang-ja',
    targetView: 'translate-result' as WorkspaceViewId,
    linkText: '查看成片 ↗',
  },
  'ko-KR': {
    isTranslate: true,
    badge: '韩语配音 · 原声音色',
    caption: '더는 당신을 기다리지 않을게요.',
    langClass: 'lang-ko',
    targetView: 'translate-result' as WorkspaceViewId,
    linkText: '查看成片 ↗',
  },
};

const DUB_SAMPLES = [
  { code: 'EN', label: '英语', voice: '原声复刻 · 0.98× 语速', line: "I won't wait for you anymore.", langClass: '' },
  { code: 'JA', label: '日语', voice: '原声复刻 · NotoSansJP', line: 'もう、あなたを待たない。', langClass: 'lang-ja' },
  { code: 'KO', label: '韩语', voice: '原声复刻 · NotoSansKR', line: '더는 당신을 기다리지 않을게요.', langClass: 'lang-ko' },
  { code: 'ES', label: '西语', voice: '情感配音 · 字幕同步', line: 'Ya no voy a esperarte más.', langClass: '' },
] as const;

const FAQ_ITEMS = [
  {
    q: '需要配置对象存储或写脚本吗？',
    a: '不需要。本地多选或拖入整季文件夹即可上传，排队、轮询与打包下载均在工作台内完成。',
  },
  {
    q: '极速、标准和精准三档怎么选？',
    a: '常规中英字幕选极速版（¥0.50/分）；高质量文字修复选标准版（¥1.50/分）；含图片台标或动态角标选精准版（¥3.00/分）。',
  },
  {
    q: '高帧率视频为什么建议限制 30fps？',
    a: '30fps 以内计费系数为 1.0，高于 30fps 按 2 倍折算。保持 30fps 输出画质观感一致且费用省半。',
  },
  {
    q: '处理后的视频与字幕保留多久？',
    a: '去水印成片保留 24 小时，多语翻译成片与字幕保留 3 天，批次完成后建议及时下载归档。',
  },
];

function useAnimatedNumber(target: number, duration = 260) {
  const [display, setDisplay] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const startVal = currentRef.current;
    if (Math.abs(target - startVal) < 0.005) {
      currentRef.current = target;
      setDisplay(target);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      currentRef.current = target;
      setDisplay(target);
      return;
    }
    let raf = 0;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startVal + (target - startVal) * eased;
      currentRef.current = next;
      setDisplay(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        currentRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

export function LandingPage({ onEnterWorkspace }: Props) {
  const [heroMode, setHeroMode] = useState<keyof typeof HERO_MODES>('wipe');
  const [sliderPct, setSliderPct] = useState(54);
  const [autoSweep, setAutoSweep] = useState(true);
  const [stageHovered, setStageHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  const [inpaintTab, setInpaintTab] = useState<'inpaint' | 'annotate'>('inpaint');
  const [translateTab, setTranslateTab] = useState<'result' | 'translate'>('result');
  const [dubIdx, setDubIdx] = useState(0);

  // Cost calculator state (separated Inpaint & Translate)
  const [minutesPerFile, setMinutesPerFile] = useState(8);
  const [fileCount, setFileCount] = useState(4);
  const [inpaintEnabled, setInpaintEnabled] = useState(true);
  const [inpaintTier, setInpaintTier] = useState<'lite' | 'standard' | 'precise'>('precise');
  const [resolution, setResolution] = useState<'1080p' | '4k'>('1080p');
  const [fpsTier, setFpsTier] = useState<'24' | '30' | '60'>('30');
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [translateMode, setTranslateMode] = useState<'standard' | 'high_quality'>('high_quality');
  const [langCount, setLangCount] = useState(3);

  const [openFaq, setOpenFaq] = useState<Record<number, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const heroCfg = HERO_MODES[heroMode];
  const activeDub = DUB_SAMPLES[dubIdx];

  // Subtle idle wipe sweep on hero stage until user interacts
  useEffect(() => {
    if (heroMode !== 'wipe' || !autoSweep || stageHovered || dragging) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const elapsed = (now - start) / 1000;
      const pct = 48 + Math.sin(elapsed * 1.1) * 24;
      setSliderPct(pct);
      raf = requestAnimationFrame(step);
    };
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(step);
    }, 450);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [heroMode, autoSweep, stageHovered, dragging]);

  // Scroll-triggered reveal for lower sections
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!targets.length) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function updateSliderFromClientX(clientX: number) {
    const el = compareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSliderPct(Math.max(4, Math.min(96, pct)));
  }

  // Calculator math (separated modules)
  const totalInputMin = minutesPerFile * fileCount;
  const inpaintPriceMap = { lite: 0.5, standard: 1.5, precise: 3.0 };
  const inpaintUnit = inpaintPriceMap[inpaintTier];
  const resCoeff = resolution === '4k' ? 2 : 1;
  const fpsCoeff = fpsTier === '24' ? 0.8 : fpsTier === '60' ? 2 : 1;
  const inpaintBillMin = inpaintEnabled ? totalInputMin * resCoeff * fpsCoeff : 0;
  const inpaintCost = inpaintBillMin * inpaintUnit;

  const transUnit = translateMode === 'high_quality' ? 4.0 : 1.5;
  const transBillMin = translateEnabled ? totalInputMin * langCount : 0;
  const transCost = transBillMin * transUnit;

  const totalPrice = inpaintCost + transCost;
  const animatedInpaint = useAnimatedNumber(inpaintCost);
  const animatedTrans = useAnimatedNumber(transCost);
  const animatedTotal = useAnimatedNumber(totalPrice);

  const minPct = ((minutesPerFile - 1) / (30 - 1)) * 100;
  const countPct = ((fileCount - 1) / (60 - 1)) * 100;
  const langPct = ((langCount - 1) / (8 - 1)) * 100;

  return (
    <div className="landing-root" ref={rootRef}>
      <header className="site-header">
        <div className="container header-inner">
          <a className="site-brand" href="#top">
            <BrandLogo size={24} />
            <span className="brand-name">净影</span>
          </a>

          <nav className="header-nav" aria-label="页面导航">
            <a href="#workflow">工作流</a>
            <a href="#features">核心能力</a>
            <a href="#scenarios">应用场景</a>
            <a href="#pricing">按量计费</a>
            <a href="#faq">常见问题</a>
          </nav>

          <div className="header-actions">
            <button className="btn header-cta-btn" onClick={() => onEnterWorkspace('overview')}>
              <span>进入工作台</span>
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
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label={mobileMenuOpen ? '收起导航菜单' : '展开导航菜单'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-nav-drawer">
            <nav className="mobile-nav-links" aria-label="移动端页面导航">
              <a href="#workflow" onClick={() => setMobileMenuOpen(false)}>工作流</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)}>核心能力</a>
              <a href="#scenarios" onClick={() => setMobileMenuOpen(false)}>应用场景</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>按量计费</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)}>常见问题</a>
            </nav>
            <div className="mobile-nav-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnterWorkspace('inpaint');
                }}
              >
                批量去水印
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnterWorkspace('translate');
                }}
              >
                多语翻译
              </button>
              <button
                className="btn btn-primary mobile-nav-primary"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnterWorkspace('overview');
                }}
              >
                <span>进入工作台</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <section className="hero-section" id="top">
        <div className="hero-ambient" aria-hidden="true"></div>
        <div className="container hero">
          <h1 className="hero-title hero-enter" style={{ animationDelay: '0ms' }}>
            <span className="hero-title-part">视频无痕去水印，</span>
            <span className="hero-title-part">一键翻译 31 种语言</span>
          </h1>
          <p className="hero-sub hero-enter" style={{ animationDelay: '60ms' }}>
            批量擦除角标与硬字幕，1:1 复刻原声配音
          </p>

          <div className="hero-ctas hero-enter" style={{ animationDelay: '120ms' }}>
            <button className="btn btn-primary btn-lg" onClick={() => onEnterWorkspace('overview')}>
              <span>进入工作台</span>
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
            <a className="btn btn-ivory btn-lg" href="#pricing">
              试算成本
            </a>
          </div>

          <div className="hero-stage-wrap hero-enter" style={{ animationDelay: '180ms' }}>
            <div className="stage-chrome">
              <div className="stage-file-meta">
                <span className="stage-status-dot"></span>
                <span>00:01:14:08 · S01E01_雨夜来客.mp4</span>
              </div>

              <div className="stage-mode-tabs" role="tablist" aria-label="效果预览模式">
                {(
                  [
                    ['wipe', '擦除对比'],
                    ['en-US', '英语'],
                    ['ja-JP', '日语'],
                    ['ko-KR', '韩语'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    className={`stage-tab ${heroMode === mode ? 'active' : ''}`}
                    onClick={() => setHeroMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button className="stage-open-link" onClick={() => onEnterWorkspace(heroCfg.targetView)}>
                {heroCfg.linkText}
              </button>
            </div>

            <div
              ref={compareRef}
              className={`hero-compare ${heroCfg.isTranslate ? 'translate-mode' : ''} ${dragging ? 'dragging' : ''}`}
              aria-label="左右拖动对比去水印效果"
              onMouseEnter={() => setStageHovered(true)}
              onMouseLeave={() => setStageHovered(false)}
              onPointerDown={(e) => {
                if (heroCfg.isTranslate) return;
                setAutoSweep(false);
                setDragging(true);
                e.currentTarget.setPointerCapture(e.pointerId);
                updateSliderFromClientX(e.clientX);
              }}
              onPointerMove={(e) => dragging && updateSliderFromClientX(e.clientX)}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
            >
              <div className="hero-layer">
                <img src="/assets/frame_16x9.png" alt="无痕修复后视频画面" />
              </div>

              <div
                className="hero-layer hero-before-layer"
                style={{ clipPath: `inset(0 ${(100 - sliderPct).toFixed(2)}% 0 0)` }}
              >
                <img src="/assets/frame_16x9.png" alt="含水印与硬字幕原片画面" />
                <div className="hero-drama-tag">第 01 集 · 雨夜来客</div>
                <div className="hero-watermark-badge">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <rect x="1" y="2" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4.2 3.8l2.2 1.2-2.2 1.2V3.8z" fill="currentColor" />
                  </svg>
                  <span>星野视频</span>
                </div>
                <div className="hero-orig-subtitle">
                  <span>我不会再等你了</span>
                </div>
              </div>

              <div className="hero-translated-overlay" key={heroMode}>
                <div className="hero-dub-pill">
                  <span className="voice-bars" aria-hidden="true">
                    <i></i>
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  <span>{heroCfg.badge}</span>
                </div>
                <div className={`hero-burned-caption ${heroCfg.langClass}`}>{heroCfg.caption}</div>
              </div>

              <div className="hero-divider" style={{ left: `${sliderPct.toFixed(2)}%` }}></div>
              <div className="hero-handle" style={{ left: `${sliderPct.toFixed(2)}%` }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3"
                    stroke="#0D0E10"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <span className="stage-pill before">原片</span>
              <span className="stage-pill after">修复后</span>
            </div>
          </div>
        </div>
      </section>

      <section className="metrics-section">
        <div className="container metrics-grid" data-reveal>
          <div className="metric-item">
            <div className="metric-num">
              <span className="metric-dot dot-emerald"></span>
              <span>4K / 3h</span>
            </div>
            <div className="metric-desc">单文件上限 · 10 GB</div>
          </div>
          <div className="metric-item">
            <div className="metric-num">
              <span className="metric-dot dot-cobalt"></span>
              <span>31 语种</span>
            </div>
            <div className="metric-desc">原声复刻配音与字幕</div>
          </div>
          <div className="metric-item">
            <div className="metric-num">
              <span className="metric-dot dot-amber"></span>
              <span>200 集</span>
            </div>
            <div className="metric-desc">整季文件夹 10 路并发</div>
          </div>
          <div className="metric-item">
            <div className="metric-num">
              <span className="metric-dot dot-ivory"></span>
              <span>¥0.50/分</span>
            </div>
            <div className="metric-desc">按量结算 · 透明预估</div>
          </div>
        </div>
      </section>

      <section className="section" id="workflow">
        <div className="container">
          <div className="section-head" data-reveal>
            <h2 className="section-title">三步直出成片</h2>
          </div>

          <div className="steps-grid">
            <div className="step-card" data-reveal style={{ '--stagger': '0ms' } as React.CSSProperties}>
              <div className="step-visual visual-upload" aria-hidden="true">
                <div className="mini-file-row">
                  <span className="mini-file-dot"></span>
                  <span className="mini-file-name">S01E01_雨夜来客.mp4</span>
                  <span className="mini-file-meta">1080p</span>
                </div>
                <div className="mini-file-row active">
                  <span className="mini-file-dot"></span>
                  <span className="mini-file-name">S01E02_灯下无声.mp4</span>
                  <span className="mini-file-meta">30fps</span>
                </div>
                <div className="mini-file-row">
                  <span className="mini-file-dot"></span>
                  <span className="mini-file-name">S01E03_旧信.mp4</span>
                  <span className="mini-file-meta">4K</span>
                </div>
              </div>
              <div className="step-top">
                <span className="step-num">01</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('inpaint')}>
                  进入上传 ↗
                </button>
              </div>
              <h3 className="step-title">拖入整季原片</h3>
              <p className="step-desc">自动识别分辨率与高帧率省费项</p>
            </div>

            <div className="step-card" data-reveal style={{ '--stagger': '70ms' } as React.CSSProperties}>
              <div className="step-visual visual-reticle" aria-hidden="true">
                <div className="mini-frame">
                  <div className="mini-bbox bbox-emerald">角标</div>
                  <div className="mini-bbox bbox-amber">片头</div>
                  <div className="mini-bbox bbox-cobalt">硬字幕</div>
                  <div className="mini-scan-line"></div>
                </div>
              </div>
              <div className="step-top">
                <span className="step-num">02</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('annotate')}>
                  区域标注 ↗
                </button>
              </div>
              <h3 className="step-title">套用擦除模板</h3>
              <p className="step-desc">全自动检测或按秒框选固定角标</p>
            </div>

            <div className="step-card" data-reveal style={{ '--stagger': '140ms' } as React.CSSProperties}>
              <div className="step-visual visual-tracks" aria-hidden="true">
                <div className="mini-track">
                  <span className="track-lang">EN</span>
                  <span className="track-bar track-cobalt"></span>
                </div>
                <div className="mini-track">
                  <span className="track-lang">JA</span>
                  <span className="track-bar track-emerald"></span>
                </div>
                <div className="mini-track">
                  <span className="track-lang">KO</span>
                  <span className="track-bar track-amber"></span>
                </div>
              </div>
              <div className="step-top">
                <span className="step-num">03</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('monitor')}>
                  批次监控 ↗
                </button>
              </div>
              <h3 className="step-title">并行渲染交付</h3>
              <p className="step-desc">网页内滑块抽检并一键打包下载</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" id="features">
        <div className="container">
          <div className="section-head" data-reveal>
            <h2 className="section-title">双引擎，同一工作台串联</h2>
          </div>

          <div className="features-stack">
            <div className="feature-row" data-reveal>
              <div className="feature-copy">
                <span className="feature-tag tag-emerald">01 · 视频无痕修复</span>
                <h3 className="feature-title">精准抹除角标、台标与硬字幕</h3>
                <ul className="feature-points">
                  <li>
                    <span className="point-key">三档算力</span>
                    <span className="point-val">极速 ¥0.50/分起，精准识别花体字与动态台标</span>
                  </li>
                  <li>
                    <span className="point-key">时段框选</span>
                    <span className="point-val">按秒控制生效区间，模板一键复用全季</span>
                  </li>
                  <li>
                    <span className="point-key">字幕保护</span>
                    <span className="point-val">只擦角标时自动避让底部台词区域</span>
                  </li>
                </ul>
                <div>
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
                </div>
              </div>

              <div className="screen-showcase showcase-emerald">
                <div className="showcase-bar">
                  <div className="showcase-tabs">
                    <button
                      className={`showcase-tab ${inpaintTab === 'inpaint' ? 'active' : ''}`}
                      onClick={() => setInpaintTab('inpaint')}
                    >
                      批量修复配置
                    </button>
                    <button
                      className={`showcase-tab ${inpaintTab === 'annotate' ? 'active' : ''}`}
                      onClick={() => setInpaintTab('annotate')}
                    >
                      区域时间轴标注
                    </button>
                  </div>
                  <button className="stage-open-link" onClick={() => onEnterWorkspace(inpaintTab)}>
                    体验界面 ↗
                  </button>
                </div>
                <div className="showcase-frame">
                  <img
                    key={inpaintTab}
                    className="showcase-img"
                    src={inpaintTab === 'inpaint' ? '/assets/screens/screen-inpaint.png' : '/assets/screens/screen-annotate.png'}
                    alt="净影视频修复工作台界面"
                  />
                </div>
              </div>
            </div>

            <div className="feature-row reverse" data-reveal>
              <div className="screen-showcase showcase-cobalt">
                <div className="showcase-bar">
                  <div className="showcase-tabs">
                    <button
                      className={`showcase-tab ${translateTab === 'result' ? 'active' : ''}`}
                      onClick={() => setTranslateTab('result')}
                    >
                      多语成片交付
                    </button>
                    <button
                      className={`showcase-tab ${translateTab === 'translate' ? 'active' : ''}`}
                      onClick={() => setTranslateTab('translate')}
                    >
                      新建翻译任务
                    </button>
                  </div>
                  <button
                    className="stage-open-link"
                    onClick={() => onEnterWorkspace(translateTab === 'result' ? 'translate-result' : 'translate')}
                  >
                    体验界面 ↗
                  </button>
                </div>
                <div className="showcase-frame">
                  <img
                    key={translateTab}
                    className="showcase-img"
                    src={translateTab === 'result' ? '/assets/screens/screen-result.png' : '/assets/screens/screen-translate.png'}
                    alt="净影多语成片结果界面"
                  />
                </div>
                <div className="dub-interactive-dock">
                  <div className="dub-dock-langs" role="tablist" aria-label="试看多语字幕">
                    {DUB_SAMPLES.map((item, idx) => (
                      <button
                        key={item.code}
                        className={`dub-lang-chip ${dubIdx === idx ? 'active' : ''}`}
                        onClick={() => setDubIdx(idx)}
                      >
                        {item.code}
                      </button>
                    ))}
                  </div>
                  <div className="dub-dock-preview" key={activeDub.code}>
                    <span className="voice-bars bars-cobalt" aria-hidden="true">
                      <i></i>
                      <i></i>
                      <i></i>
                      <i></i>
                    </span>
                    <span className={`dub-dock-line ${activeDub.langClass}`}>{activeDub.line}</span>
                    <span className="dub-dock-voice">{activeDub.voice}</span>
                  </div>
                </div>
              </div>

              <div className="feature-copy">
                <span className="feature-tag tag-cobalt">02 · 多语配音译制</span>
                <h3 className="feature-title">1:1 复刻音色，一次提交多语出片</h3>
                <ul className="feature-points">
                  <li>
                    <span className="point-key">声线节奏</span>
                    <span className="point-val">保留说话人情绪与音色，动态对齐语速</span>
                  </li>
                  <li>
                    <span className="point-key">字幕烧录</span>
                    <span className="point-val">匹配语种字体，同步导出 SRT / ASS / VTT</span>
                  </li>
                  <li>
                    <span className="point-key">母带复用</span>
                    <span className="point-val">去水印底片全语种共用，不重复扣费</span>
                  </li>
                </ul>
                <div>
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="scenarios">
        <div className="container">
          <div className="section-head" data-reveal>
            <h2 className="section-title">适用场景</h2>
          </div>

          <div className="scenarios-strip" data-reveal>
            <article className="scenario-col accent-emerald">
              <div className="scenario-top">
                <span className="scenario-label">短剧出海</span>
                <span className="scenario-badge">精准 + 高质量</span>
              </div>
              <p className="scenario-desc">批量擦除角标与硬字幕，多语配音直出海外版本</p>
            </article>

            <article className="scenario-col accent-cobalt">
              <div className="scenario-top">
                <span className="scenario-label">课程内训</span>
                <span className="scenario-badge">固定框 + 音色还原</span>
              </div>
              <p className="scenario-desc">支持 3–4 小时长视频去标与多语种标准字幕输出</p>
            </article>

            <article className="scenario-col accent-amber">
              <div className="scenario-top">
                <span className="scenario-label">跨境投放</span>
                <span className="scenario-badge">极速 + 情感复刻</span>
              </div>
              <p className="scenario-desc">清洗爆款广告旧字幕与水印，快速裂变多国素材</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section alt" id="pricing">
        <div className="container">
          <div className="section-head pricing-head" data-reveal>
            <h2 className="section-title">纯按量计费</h2>
            <p className="section-sub">修复与翻译独立计价，可单独使用或串联</p>
          </div>

          <div className="calc-shell" data-reveal>
            {/* 1. Shared Footage Duration Bar */}
            <div className="calc-footage-bar">
              <div className="footage-slider-item">
                <div className="calc-label-row">
                  <span>单集时长</span>
                  <span className="calc-val">{minutesPerFile} 分钟</span>
                </div>
                <input
                  className="calc-range range-ivory"
                  type="range"
                  min={1}
                  max={30}
                  value={minutesPerFile}
                  style={{ '--pct': `${minPct}%` } as React.CSSProperties}
                  onChange={(e) => setMinutesPerFile(Number(e.target.value))}
                />
              </div>

              <div className="footage-slider-item">
                <div className="calc-label-row">
                  <span>文件数量</span>
                  <span className="calc-val">{fileCount} 集</span>
                </div>
                <input
                  className="calc-range range-ivory"
                  type="range"
                  min={1}
                  max={60}
                  value={fileCount}
                  style={{ '--pct': `${countPct}%` } as React.CSSProperties}
                  onChange={(e) => setFileCount(Number(e.target.value))}
                />
              </div>

              <div className="footage-total-badge">
                <span className="footage-total-label">总片长</span>
                <span className="footage-total-val mono">{totalInputMin} 分钟</span>
              </div>
            </div>

            {/* 2. Separated Inpaint & Translate Modules */}
            <div className="pricing-modules">
              {/* Left Module: Video Inpaint */}
              <div className={`pricing-module module-inpaint ${inpaintEnabled ? '' : 'is-disabled'}`}>
                <div className="module-head">
                  <div className="module-title-group">
                    <div className="module-title-row">
                      <span className="rate-dot dot-emerald"></span>
                      <h3 className="module-title">视频修复</h3>
                    </div>
                    <span className="module-formula-tag">按输出时长 × 分辨率 × 帧率</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={inpaintEnabled}
                    className={`module-switch switch-emerald ${inpaintEnabled ? 'on' : ''}`}
                    onClick={() => setInpaintEnabled((v) => !v)}
                  >
                    <span className="switch-track">
                      <span className="switch-thumb"></span>
                    </span>
                    <span className="switch-text">{inpaintEnabled ? '已开启' : '跳过'}</span>
                  </button>
                </div>

                <div className="module-body">
                  <div className="tier-options" role="radiogroup" aria-label="视频修复档位">
                    {(
                      [
                        ['lite', '极速版', '常规中英字幕', '¥0.50'],
                        ['standard', '标准版', '无痕文字修复', '¥1.50'],
                        ['precise', '精准版', '台标 · 角标 · 花体字', '¥3.00'],
                      ] as const
                    ).map(([k, name, desc, price]) => {
                      const active = inpaintEnabled && inpaintTier === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`tier-option ${active ? 'active' : ''}`}
                          onClick={() => {
                            setInpaintEnabled(true);
                            setInpaintTier(k);
                          }}
                        >
                          <span className="tier-radio"></span>
                          <span className="tier-info">
                            <span className="tier-name">{name}</span>
                            <span className="tier-desc">{desc}</span>
                          </span>
                          <span className="tier-price mono">{price} / 分</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="module-params-grid">
                    <div className="calc-group">
                      <div className="calc-label-row">
                        <span>输出分辨率</span>
                      </div>
                      <div className="calc-seg cols-2">
                        <button
                          type="button"
                          className={`calc-seg-btn ${resolution === '1080p' ? 'active' : ''}`}
                          onClick={() => {
                            setInpaintEnabled(true);
                            setResolution('1080p');
                          }}
                        >
                          1080p · ×1
                        </button>
                        <button
                          type="button"
                          className={`calc-seg-btn ${resolution === '4k' ? 'active' : ''}`}
                          onClick={() => {
                            setInpaintEnabled(true);
                            setResolution('4k');
                          }}
                        >
                          4K · ×2
                        </button>
                      </div>
                    </div>

                    <div className="calc-group">
                      <div className="calc-label-row">
                        <span>输出帧率</span>
                      </div>
                      <div className="calc-seg cols-3">
                        {(
                          [
                            ['24', '24fps ×0.8'],
                            ['30', '30fps ×1'],
                            ['60', '60fps ×2'],
                          ] as const
                        ).map(([fps, lbl]) => (
                          <button
                            key={fps}
                            type="button"
                            className={`calc-seg-btn ${fpsTier === fps ? 'active' : ''}`}
                            onClick={() => {
                              setInpaintEnabled(true);
                              setFpsTier(fps);
                            }}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="module-subtotal">
                  <div className="subtotal-expr mono">
                    {inpaintEnabled
                      ? `${totalInputMin}分 × ${resCoeff}(${resolution}) × ${fpsCoeff}(${fpsTier}fps) × ¥${inpaintUnit.toFixed(2)}`
                      : '已跳过视频修复'}
                  </div>
                  <div className="subtotal-val mono">¥{animatedInpaint.toFixed(2)}</div>
                </div>
              </div>

              {/* Right Module: Multi-language Translation */}
              <div className={`pricing-module module-translate ${translateEnabled ? '' : 'is-disabled'}`}>
                <div className="module-head">
                  <div className="module-title-group">
                    <div className="module-title-row">
                      <span className="rate-dot dot-cobalt"></span>
                      <h3 className="module-title">多语翻译</h3>
                    </div>
                    <span className="module-formula-tag">按输入时长 × 目标语种</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={translateEnabled}
                    className={`module-switch switch-cobalt ${translateEnabled ? 'on' : ''}`}
                    onClick={() => setTranslateEnabled((v) => !v)}
                  >
                    <span className="switch-track">
                      <span className="switch-thumb"></span>
                    </span>
                    <span className="switch-text">{translateEnabled ? '已开启' : '跳过'}</span>
                  </button>
                </div>

                <div className="module-body">
                  <div className="tier-options" role="radiogroup" aria-label="多语翻译档位">
                    {(
                      [
                        ['standard', '标准配音', '音色 / 情感复刻 · 含字幕导出', '¥1.50'],
                        ['high_quality', '高质量配音', '情绪贴合与发音增强', '¥4.00'],
                      ] as const
                    ).map(([k, name, desc, price]) => {
                      const active = translateEnabled && translateMode === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`tier-option ${active ? 'active' : ''}`}
                          onClick={() => {
                            setTranslateEnabled(true);
                            setTranslateMode(k);
                          }}
                        >
                          <span className="tier-radio"></span>
                          <span className="tier-info">
                            <span className="tier-name">{name}</span>
                            <span className="tier-desc">{desc}</span>
                          </span>
                          <span className="tier-price mono">{price} / 分</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="calc-group translate-lang-box">
                    <div className="calc-label-row">
                      <span>目标语种数量</span>
                      <span className="calc-val">{langCount} 语种</span>
                    </div>
                    <input
                      className="calc-range range-cobalt"
                      type="range"
                      min={1}
                      max={8}
                      disabled={!translateEnabled}
                      value={langCount}
                      style={{ '--pct': `${langPct}%` } as React.CSSProperties}
                      onChange={(e) => setLangCount(Number(e.target.value))}
                    />
                  </div>

                  <div className="module-hint-bar">
                    与分辨率、帧率无关 · 串联去水印仅修 1 次母带
                  </div>
                </div>

                <div className="module-subtotal">
                  <div className="subtotal-expr mono">
                    {translateEnabled
                      ? `${totalInputMin}分 × ${langCount}语种 × ¥${transUnit.toFixed(2)}`
                      : '已跳过多语翻译'}
                  </div>
                  <div className="subtotal-val mono">¥{animatedTrans.toFixed(2)}</div>
                </div>
              </div>
            </div>

            {/* 3. Unified Total Summary Bar */}
            <div className="calc-summary-bar">
              <div className="summary-breakdown">
                <span className="summary-chip">
                  <span className="rate-dot dot-emerald"></span>
                  <span>修复</span>
                  <strong className="mono">{inpaintEnabled ? `¥${animatedInpaint.toFixed(2)}` : '未开启'}</strong>
                </span>
                <span className="summary-plus">+</span>
                <span className="summary-chip">
                  <span className="rate-dot dot-cobalt"></span>
                  <span>翻译</span>
                  <strong className="mono">{translateEnabled ? `¥${animatedTrans.toFixed(2)}` : '未开启'}</strong>
                </span>
                {inpaintEnabled && translateEnabled && (
                  <span className="summary-note">串联母带全语种共用</span>
                )}
              </div>

              <div className="summary-total-action">
                <div className="summary-total-group">
                  <span className="summary-total-label">预计总计</span>
                  <span className="calc-total-price">¥{animatedTotal.toFixed(2)}</span>
                </div>
                <button
                  className="btn btn-primary btn-lg summary-cta-btn"
                  onClick={() =>
                    onEnterWorkspace(translateEnabled ? 'translate' : inpaintEnabled ? 'inpaint' : 'overview')
                  }
                >
                  {translateEnabled
                    ? '前往配置多语翻译'
                    : inpaintEnabled
                      ? '前往批量去水印'
                      : '进入工作台'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container faq-layout" data-reveal>
          <div className="faq-intro">
            <h2 className="section-title">常见问题</h2>
            <p className="section-sub">上传、计费与成片保留</p>
          </div>

          <div className="faq-list">
            {FAQ_ITEMS.map((item, idx) => (
              <div className={`faq-item ${openFaq[idx] ? 'open' : ''}`} key={idx}>
                <button
                  className="faq-q"
                  aria-expanded={Boolean(openFaq[idx])}
                  onClick={() => setOpenFaq((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                >
                  <span>{item.q}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="faq-a-wrap">
                  <div className="faq-a">{item.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta-section">
        <div className="container final-cta-bar" data-reveal>
          <div className="final-cta-copy">
            <h2 className="final-cta-title">拖入整季素材，当天交付多语版本</h2>
          </div>
          <div className="final-cta-actions">
            <button className="btn btn-primary btn-lg" onClick={() => onEnterWorkspace('overview')}>
              <span>进入工作台</span>
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
            <button className="btn btn-ivory btn-lg" onClick={() => onEnterWorkspace('translate')}>
              新建翻译
            </button>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-brand-col">
            <a className="site-brand" href="#top">
              <BrandLogo size={22} />
              <span className="brand-name">净影</span>
            </a>
            <span className="footer-note">批量视频无痕修复与多语译制工作台</span>
          </div>

          <div className="footer-links">
            <button onClick={() => onEnterWorkspace('overview')}>任务总览</button>
            <button onClick={() => onEnterWorkspace('inpaint')}>去水印修复</button>
            <button onClick={() => onEnterWorkspace('translate')}>多语翻译</button>
            <button onClick={() => onEnterWorkspace('annotate')}>区域模板</button>
            <button onClick={() => onEnterWorkspace('subtitle-style')}>字幕样式</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
