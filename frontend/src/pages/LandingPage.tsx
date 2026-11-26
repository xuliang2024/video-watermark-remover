import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrandLogo } from '../components/Icons';
import {
  EngineStorySections,
  HeroRotatingTitle,
  TimelineRail,
  type TimelineChapter,
} from '../components/LandingInteractive';
import type { WorkspaceViewId } from '../types';

const WIPE_MIN_PCT = 4;
const WIPE_MAX_PCT = 96;
const WIPE_CENTER_PCT = 48;
const WIPE_AMPLITUDE_PCT = 24;
const WIPE_ANGULAR_SPEED = 0.9; // rad/s
const STAGE_CHAPTER_MS = 5200;

interface Props {
  onEnterWorkspace: (view?: WorkspaceViewId) => void;
}

type HeroModeKey = 'wipe' | 'en-US' | 'ja-JP' | 'ko-KR';
const HERO_MODE_ORDER: HeroModeKey[] = ['wipe', 'en-US', 'ja-JP', 'ko-KR'];
type PresetKey = 'drama' | 'ads' | 'course' | 'custom';

const HERO_MODES: Record<
  HeroModeKey,
  {
    isTranslate: boolean;
    badge: string;
    caption: string;
    langClass: string;
    targetView: WorkspaceViewId;
    linkText: string;
  }
> = {
  wipe: {
    isTranslate: false,
    badge: '',
    caption: '',
    langClass: '',
    targetView: 'compare',
    linkText: '工作台对比 ↗',
  },
  'en-US': {
    isTranslate: true,
    badge: '英语配音 · 原声音色',
    caption: "I won't wait for you anymore.",
    langClass: '',
    targetView: 'translate-result',
    linkText: '查看成片 ↗',
  },
  'ja-JP': {
    isTranslate: true,
    badge: '日语配音 · 原声音色',
    caption: 'もう、あなたを待たない。',
    langClass: 'lang-ja',
    targetView: 'translate-result',
    linkText: '查看成片 ↗',
  },
  'ko-KR': {
    isTranslate: true,
    badge: '韩语配音 · 原声音色',
    caption: '더는 당신을 기다리지 않을게요.',
    langClass: 'lang-ko',
    targetView: 'translate-result',
    linkText: '查看成片 ↗',
  },
};

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

const RAIL_CHAPTERS: TimelineChapter[] = [
  {
    id: 'top',
    timecode: '00:00',
    label: '对比舞台',
    desc: '批量擦除角标与硬字幕，1:1 复刻原声配音',
    accent: 'emerald',
  },
  {
    id: 'engine-inpaint',
    timecode: '01:00',
    label: '批量去水印',
    desc: '精准抹除角标、台标与硬字幕',
    accent: 'emerald',
    stepSelector: '[data-story-step]',
  },
  {
    id: 'engine-translate',
    timecode: '02:00',
    label: '多语翻译',
    desc: '1:1 复刻音色，一次提交多语出片',
    accent: 'cobalt',
    stepSelector: '[data-story-step]',
  },
  {
    id: 'scenarios',
    timecode: '03:00',
    label: '应用场景',
    desc: '短剧出海、课程内训与跨境投放',
    accent: 'amber',
  },
  {
    id: 'pricing',
    timecode: '04:00',
    label: '按量计费',
    desc: '修复与翻译独立计价，可单独使用或串联',
    accent: 'emerald',
  },
  {
    id: 'faq',
    timecode: '05:00',
    label: '常见问题',
    desc: '上传、计费与成片保留',
    accent: 'ivory',
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
  const [heroMode, setHeroMode] = useState<HeroModeKey>('wipe');
  const [stageAutoPlay, setStageAutoPlay] = useState(true);
  const [chapterProgress, setChapterProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const compareRef = useRef<HTMLDivElement>(null);
  const beforeLayerRef = useRef<HTMLDivElement>(null);
  const wipeGuideRef = useRef<HTMLDivElement>(null);
  const wipePctRef = useRef(WIPE_CENTER_PCT);
  const sweepPhaseRef = useRef(0);
  const autoSweepRef = useRef(true);
  const stageHoveredRef = useRef(false);
  const stageVisibleRef = useRef(true);
  const hasStartedSweepRef = useRef(false);
  const draggingRef = useRef(false);
  const sweepSpeedScaleRef = useRef(0);
  const dragRafRef = useRef<number | null>(null);
  const pendingDragPctRef = useRef<number | null>(null);
  const stageRectRef = useRef<DOMRect | null>(null);

  const [activePreset, setActivePreset] = useState<PresetKey>('custom');
  const [minutesPerFile, setMinutesPerFile] = useState(1);
  const [fileCount, setFileCount] = useState(1);
  const [inpaintEnabled, setInpaintEnabled] = useState(true);
  const [inpaintTier, setInpaintTier] = useState<'lite' | 'standard' | 'precise'>('lite');
  const [resolution, setResolution] = useState<'1080p' | '4k'>('1080p');
  const [fpsTier, setFpsTier] = useState<'24' | '30' | '60'>('24');
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [translateMode, setTranslateMode] = useState<'standard' | 'high_quality'>('standard');
  const [langCount, setLangCount] = useState(1);

  const presetTabsRef = useRef<HTMLDivElement>(null);
  const [presetPillStyle, setPresetPillStyle] = useState<React.CSSProperties>({});

  const [openFaq, setOpenFaq] = useState<Record<number, boolean>>({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNavId, setActiveNavId] = useState<string>('top');
  const [showBackTop, setShowBackTop] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const heroCfg = HERO_MODES[heroMode];

  const applyPreset = (key: PresetKey) => {
    setActivePreset(key);
    if (key === 'drama') {
      setMinutesPerFile(2);
      setFileCount(60);
      setInpaintEnabled(true);
      setInpaintTier('precise');
      setResolution('1080p');
      setFpsTier('30');
      setTranslateEnabled(true);
      setTranslateMode('high_quality');
      setLangCount(3);
    } else if (key === 'ads') {
      setMinutesPerFile(1);
      setFileCount(10);
      setInpaintEnabled(true);
      setInpaintTier('lite');
      setResolution('1080p');
      setFpsTier('30');
      setTranslateEnabled(true);
      setTranslateMode('standard');
      setLangCount(4);
    } else if (key === 'course') {
      setMinutesPerFile(30);
      setFileCount(4);
      setInpaintEnabled(true);
      setInpaintTier('standard');
      setResolution('1080p');
      setFpsTier('24');
      setTranslateEnabled(true);
      setTranslateMode('standard');
      setLangCount(2);
    }
  };

  const updatePresetPill = useCallback(() => {
    const wrap = presetTabsRef.current;
    if (!wrap) return;
    const btn = wrap.querySelector<HTMLButtonElement>(`[data-preset="${activePreset}"]`);
    if (btn && btn.offsetWidth) {
      setPresetPillStyle({
        width: `${btn.offsetWidth}px`,
        transform: `translateX(${btn.offsetLeft}px)`,
      });
    }
  }, [activePreset]);

  useLayoutEffect(() => {
    updatePresetPill();
  }, [updatePresetPill]);

  useEffect(() => {
    const wrap = presetTabsRef.current;
    if (!wrap || !('ResizeObserver' in window)) return;
    const ro = new ResizeObserver(() => updatePresetPill());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [updatePresetPill]);

  useEffect(() => {
    const sectionIds = ['top', 'engine-inpaint', 'engine-translate', 'scenarios', 'pricing', 'faq'];
    const onScroll = () => {
      const sy = window.scrollY;
      setShowBackTop(sy > window.innerHeight * 0.85);

      const probe = sy + 140;
      let curr = 'top';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top + sy <= probe) {
          curr = id;
        }
      }
      setActiveNavId(curr);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!stageAutoPlay) {
      setChapterProgress(1);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setChapterProgress(1);
      return;
    }

    let raf = 0;
    let elapsed = 0;
    let lastNow: number | null = null;
    setChapterProgress(0);

    const tick = (now: number) => {
      if (lastNow === null) lastNow = now;
      const dt = Math.min(64, Math.max(0, now - lastNow));
      lastNow = now;

      const paused = document.hidden || !stageVisibleRef.current || stageHoveredRef.current || draggingRef.current;
      if (!paused) {
        elapsed += dt;
        const p = Math.min(1, elapsed / STAGE_CHAPTER_MS);
        setChapterProgress(p);
        if (elapsed >= STAGE_CHAPTER_MS) {
          const nextIdx = (HERO_MODE_ORDER.indexOf(heroMode) + 1) % HERO_MODE_ORDER.length;
          setHeroMode(HERO_MODE_ORDER[nextIdx]);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [heroMode, stageAutoPlay]);

  const applyWipePct = useCallback((nextPct: number) => {
    const clamped = Math.max(WIPE_MIN_PCT, Math.min(WIPE_MAX_PCT, nextPct));
    wipePctRef.current = clamped;
    const beforeEl = beforeLayerRef.current;
    const guideEl = wipeGuideRef.current;
    const compareEl = compareRef.current;
    if (beforeEl) {
      beforeEl.style.clipPath = `inset(0 ${(100 - clamped).toFixed(4)}% 0 0)`;
    }
    if (guideEl) {
      guideEl.style.transform = `translate3d(${clamped.toFixed(4)}%, 0, 0)`;
    }
    if (compareEl) {
      compareEl.setAttribute('aria-valuenow', String(Math.round(clamped)));
    }
  }, []);

  useLayoutEffect(() => {
    applyWipePct(wipePctRef.current);
  }, [applyWipePct]);

  useEffect(() => {
    applyWipePct(wipePctRef.current);
    if (heroMode !== 'wipe' || !autoSweepRef.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const compareEl = compareRef.current;
    let observer: IntersectionObserver | null = null;
    if (compareEl && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry) {
            stageVisibleRef.current = entry.isIntersecting;
          }
        },
        { threshold: 0.05 },
      );
      observer.observe(compareEl);
    }

    let raf = 0;
    let lastNow: number | null = null;
    sweepSpeedScaleRef.current = 0;

    const step = (now: number) => {
      if (!autoSweepRef.current) return;
      if (lastNow === null) lastNow = now;
      const dt = Math.min(0.032, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;

      const targetScale =
        document.hidden || !stageVisibleRef.current || stageHoveredRef.current || draggingRef.current ? 0 : 1;
      const rate = targetScale > sweepSpeedScaleRef.current ? 3.5 : 6.0;
      sweepSpeedScaleRef.current += (targetScale - sweepSpeedScaleRef.current) * Math.min(1, dt * rate);
      if (Math.abs(targetScale - sweepSpeedScaleRef.current) < 0.002) {
        sweepSpeedScaleRef.current = targetScale;
      }

      if (sweepSpeedScaleRef.current > 0 && dt > 0) {
        sweepPhaseRef.current += dt * WIPE_ANGULAR_SPEED * sweepSpeedScaleRef.current;
        const nextPct = WIPE_CENTER_PCT + Math.sin(sweepPhaseRef.current) * WIPE_AMPLITUDE_PCT;
        applyWipePct(nextPct);
      }

      raf = requestAnimationFrame(step);
    };

    const delayMs = hasStartedSweepRef.current ? 120 : 720;
    const startTimer = window.setTimeout(() => {
      hasStartedSweepRef.current = true;
      if (autoSweepRef.current) {
        lastNow = null;
        raf = requestAnimationFrame(step);
      }
    }, delayMs);

    const onVisChange = () => {
      if (!document.hidden) lastNow = null;
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      window.clearTimeout(startTimer);
      if (raf) cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [heroMode, applyWipePct]);

  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
    };
  }, []);

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

  function clientXToPct(clientX: number, rect?: DOMRect | null) {
    const el = compareRef.current;
    const box = rect || (el ? el.getBoundingClientRect() : null);
    if (!box || box.width <= 0) return wipePctRef.current;
    const pct = ((clientX - box.left) / box.width) * 100;
    return Math.max(WIPE_MIN_PCT, Math.min(WIPE_MAX_PCT, pct));
  }

  function scheduleDragWipe(clientX: number) {
    pendingDragPctRef.current = clientXToPct(clientX, stageRectRef.current);
    if (dragRafRef.current !== null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      if (pendingDragPctRef.current !== null) {
        applyWipePct(pendingDragPctRef.current);
        pendingDragPctRef.current = null;
      }
    });
  }

  function finishDrag() {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (pendingDragPctRef.current !== null) {
      applyWipePct(pendingDragPctRef.current);
      pendingDragPctRef.current = null;
    }
    stageRectRef.current = null;
    draggingRef.current = false;
    setDragging(false);
  }

  const handleSelectStageMode = (mode: HeroModeKey) => {
    setStageAutoPlay(false);
    setHeroMode(mode);
  };

  const scrollToTop = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

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
            <a href="#engine-inpaint" className={activeNavId === 'engine-inpaint' ? 'is-active' : ''}>
              批量去水印
            </a>
            <a href="#engine-translate" className={activeNavId === 'engine-translate' ? 'is-active' : ''}>
              多语翻译
            </a>
            <a href="#scenarios" className={activeNavId === 'scenarios' ? 'is-active' : ''}>
              应用场景
            </a>
            <a href="#pricing" className={activeNavId === 'pricing' ? 'is-active' : ''}>
              按量计费
            </a>
            <a href="#faq" className={activeNavId === 'faq' ? 'is-active' : ''}>
              常见问题
            </a>
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
            <nav className="mobile-nav-links" aria-label="页面导航">
              <a href="#engine-inpaint" onClick={() => setMobileMenuOpen(false)}>
                批量去水印
              </a>
              <a href="#engine-translate" onClick={() => setMobileMenuOpen(false)}>
                多语翻译
              </a>
              <a href="#scenarios" onClick={() => setMobileMenuOpen(false)}>
                应用场景
              </a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>
                按量计费
              </a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)}>
                常见问题
              </a>
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

      <TimelineRail chapters={RAIL_CHAPTERS} />

      <section className="hero-section" id="top">
        <div className="hero-ambient" aria-hidden="true"></div>
        <div className="container hero">
          <HeroRotatingTitle />

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

              <div className="stage-mode-tabs" role="tablist">
                {(
                  [
                    ['wipe', '擦除对比'],
                    ['en-US', '英语'],
                    ['ja-JP', '日语'],
                    ['ko-KR', '韩语'],
                  ] as const
                ).map(([mode, label]) => {
                  const isActive = heroMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`stage-tab ${isActive ? 'active' : ''}`}
                      onClick={() => handleSelectStageMode(mode)}
                    >
                      <i
                        className="stage-tab-bar"
                        style={{
                          width: `${isActive ? (stageAutoPlay ? chapterProgress * 100 : 100) : 0}%`,
                        }}
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="stage-play-toggle"
                  title={stageAutoPlay ? '暂停自动演示' : '恢复自动演示'}
                  aria-label={stageAutoPlay ? '暂停自动演示' : '恢复自动演示'}
                  onClick={() => setStageAutoPlay((v) => !v)}
                >
                  {stageAutoPlay ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
                      <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M4.5 2.8l8.5 5.2-8.5 5.2V2.8z" />
                    </svg>
                  )}
                </button>
              </div>

              <button className="stage-open-link" onClick={() => onEnterWorkspace(heroCfg.targetView)}>
                {heroCfg.linkText}
              </button>
            </div>

            <div
              ref={compareRef}
              className={`hero-compare ${heroCfg.isTranslate ? 'translate-mode' : ''} ${dragging ? 'dragging' : ''}`}
              role="slider"
              tabIndex={heroCfg.isTranslate ? -1 : 0}
              aria-label="左右拖动对比去水印效果"
              aria-valuemin={WIPE_MIN_PCT}
              aria-valuemax={WIPE_MAX_PCT}
              aria-valuenow={WIPE_CENTER_PCT}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') stageHoveredRef.current = true;
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') stageHoveredRef.current = false;
              }}
              onPointerDown={(e) => {
                if (heroCfg.isTranslate) return;
                autoSweepRef.current = false;
                setStageAutoPlay(false);
                draggingRef.current = true;
                setDragging(true);
                const rect = e.currentTarget.getBoundingClientRect();
                stageRectRef.current = rect;
                e.currentTarget.setPointerCapture(e.pointerId);
                if (dragRafRef.current !== null) {
                  cancelAnimationFrame(dragRafRef.current);
                  dragRafRef.current = null;
                }
                pendingDragPctRef.current = null;
                applyWipePct(clientXToPct(e.clientX, rect));
              }}
              onPointerMove={(e) => {
                if (draggingRef.current) scheduleDragWipe(e.clientX);
              }}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onKeyDown={(e) => {
                if (heroCfg.isTranslate) return;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  autoSweepRef.current = false;
                  setStageAutoPlay(false);
                  const delta = e.key === 'ArrowLeft' ? -2.5 : 2.5;
                  applyWipePct(wipePctRef.current + delta);
                }
              }}
            >
              <div className="hero-layer">
                <img src="/assets/frame_16x9.png" alt="无痕修复后视频画面" />
              </div>

              <div ref={beforeLayerRef} className="hero-layer hero-before-layer">
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

              <div ref={wipeGuideRef} className="hero-wipe-guide" aria-hidden="true">
                <div className="hero-divider"></div>
                <div className="hero-handle">
                  <div className="hero-handle-knob">
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
                </div>
              </div>

              <span className="stage-pill before">原片</span>
              <span className="stage-pill after">修复后</span>
            </div>
          </div>

          <a className="hero-scroll-cue hero-enter" style={{ animationDelay: '260ms' }} href="#engine-inpaint">
            <span>下滑查看完整流水线</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 3.5v9M4.5 9l3.5 3.5L11.5 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
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

      <EngineStorySections onEnterWorkspace={onEnterWorkspace} />

      <section className="section alt" id="scenarios">
        <div className="container">
          <div className="section-head" data-reveal>
            <h2 className="section-title">适用场景</h2>
          </div>

          <div className="scenarios-strip" data-reveal>
            <article
              className="scenario-col accent-emerald is-clickable"
              onClick={() => {
                applyPreset('drama');
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <div className="scenario-top">
                <span className="scenario-label">短剧出海</span>
                <span className="scenario-badge">精准 + 高质量</span>
              </div>
              <p className="scenario-desc">批量擦除角标与硬字幕，多语配音直出海外版本</p>
              <span className="scenario-calc-link">一键代入下方试算 ↗</span>
            </article>

            <article
              className="scenario-col accent-cobalt is-clickable"
              onClick={() => {
                applyPreset('course');
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <div className="scenario-top">
                <span className="scenario-label">课程内训</span>
                <span className="scenario-badge">固定框 + 音色还原</span>
              </div>
              <p className="scenario-desc">支持 3–4 小时长视频去标与多语种标准字幕输出</p>
              <span className="scenario-calc-link">一键代入下方试算 ↗</span>
            </article>

            <article
              className="scenario-col accent-amber is-clickable"
              onClick={() => {
                applyPreset('ads');
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <div className="scenario-top">
                <span className="scenario-label">跨境投放</span>
                <span className="scenario-badge">极速 + 情感复刻</span>
              </div>
              <p className="scenario-desc">清洗爆款广告旧字幕与水印，快速裂变多国素材</p>
              <span className="scenario-calc-link">一键代入下方试算 ↗</span>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <div className="pricing-top-row" data-reveal>
            <div className="section-head pricing-head">
              <h2 className="section-title">纯按量计费</h2>
              <p className="section-sub">修复与翻译独立计价，可单独使用或串联</p>
            </div>

            <div className="calc-preset-tabs" ref={presetTabsRef} role="tablist" aria-label="典型场景快捷试算预设">
              <span className="calc-preset-pill" style={presetPillStyle} aria-hidden="true" />
              {(
                [
                  ['custom', '自由配置'],
                  ['drama', '短剧出海 · 60集'],
                  ['ads', '跨境广告 · 10条'],
                  ['course', '长视频课 · 4节'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  data-preset={key}
                  aria-selected={activePreset === key}
                  className={`calc-preset-btn ${activePreset === key ? 'active' : ''}`}
                  onClick={() => applyPreset(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="calc-shell" data-reveal>
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
                  onChange={(e) => {
                    setActivePreset('custom');
                    setMinutesPerFile(Number(e.target.value));
                  }}
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
                  onChange={(e) => {
                    setActivePreset('custom');
                    setFileCount(Number(e.target.value));
                  }}
                />
              </div>

              <div className="footage-total-badge">
                <span className="footage-total-label">总片长</span>
                <span className="footage-total-val mono">{totalInputMin} 分钟</span>
              </div>
            </div>

            <div className="pricing-modules">
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
                    onClick={() => {
                      setActivePreset('custom');
                      setInpaintEnabled((v) => !v);
                    }}
                  >
                    <span className="switch-track">
                      <span className="switch-thumb"></span>
                    </span>
                    <span className="switch-text">{inpaintEnabled ? '已开启' : '跳过'}</span>
                  </button>
                </div>

                <div className="module-body">
                  <div className="tier-options" role="radiogroup">
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
                            setActivePreset('custom');
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
                            setActivePreset('custom');
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
                            setActivePreset('custom');
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
                              setActivePreset('custom');
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
                    onClick={() => {
                      setActivePreset('custom');
                      setTranslateEnabled((v) => !v);
                    }}
                  >
                    <span className="switch-track">
                      <span className="switch-thumb"></span>
                    </span>
                    <span className="switch-text">{translateEnabled ? '已开启' : '跳过'}</span>
                  </button>
                </div>

                <div className="module-body">
                  <div className="tier-options" role="radiogroup">
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
                            setActivePreset('custom');
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
                      onChange={(e) => {
                        setActivePreset('custom');
                        setLangCount(Number(e.target.value));
                      }}
                    />
                  </div>

                  <div className="module-hint-bar">与分辨率、帧率无关 · 串联去水印仅修 1 次母带</div>
                </div>

                <div className="module-subtotal">
                  <div className="subtotal-expr mono">
                    {translateEnabled
                      ? `${totalInputMin}分 × ${langCount} 语种 × ¥${transUnit.toFixed(2)}`
                      : '已跳过多语翻译'}
                  </div>
                  <div className="subtotal-val mono">¥{animatedTrans.toFixed(2)}</div>
                </div>
              </div>
            </div>

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
                  {translateEnabled ? '前往配置多语翻译' : inpaintEnabled ? '前往批量去水印' : '进入工作台'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" id="faq">
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
            <button onClick={() => onEnterWorkspace('inpaint')}>批量去水印</button>
            <button onClick={() => onEnterWorkspace('translate')}>多语翻译</button>
            <button onClick={() => onEnterWorkspace('annotate')}>区域标注</button>
            <button onClick={() => onEnterWorkspace('subtitle-style')}>字幕样式</button>
          </div>
        </div>
      </footer>

      <button
        type="button"
        className={`back-to-top ${showBackTop ? 'is-on' : ''}`}
        aria-label="回到顶部"
        onClick={scrollToTop}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 12.5V3.5M4.5 7L8 3.5 11.5 7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>回到顶部</span>
      </button>
    </div>
  );
}
