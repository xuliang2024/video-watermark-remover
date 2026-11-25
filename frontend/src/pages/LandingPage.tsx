import { useRef, useState } from 'react';
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

const FAQ_ITEMS = [
  {
    q: '需要懂技术或自己配置云存储吗？',
    a: '不需要。直接从电脑多选文件或拖入整个文件夹上传，排队、进度轮询与打包下载均在工作台内自动完成。',
  },
  {
    q: '极速版、专业标准版和精准版怎么选？',
    a: '常规中英字幕且重性价比选极速版（¥0.50/分）；追求无痕文字修复选标准版（¥1.50/分）；含图片台标、动态角标或花体字选精准版（¥3.00/分）。',
  },
  {
    q: '50/60fps 高帧率视频为什么建议限制 30fps 输出？',
    a: '修复计费在 30fps 内系数为 1.0，高于 30fps 按 2 倍系数折算。短剧与课程保持 30fps 输出观感一致，费用直接省半。',
  },
  {
    q: '同一部剧的角标在固定位置，如何避免误擦？',
    a: '在「区域标注」中框选角标区域并设定生效起止秒数，保存为模板后一键套用整季剧集，仅处理框内画面。',
  },
  {
    q: '处理后的成片与字幕下载链接保留多久？',
    a: '视频修复成片保留 24 小时，多语翻译产物（视频、字幕、纯人声）保留 3 天，批次完成后建议及时打包归档。',
  },
];

export function LandingPage({ onEnterWorkspace }: Props) {
  const [heroMode, setHeroMode] = useState<keyof typeof HERO_MODES>('wipe');
  const [sliderPct, setSliderPct] = useState(54);
  const [dragging, setDragging] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  const [inpaintTab, setInpaintTab] = useState<'inpaint' | 'annotate'>('inpaint');
  const [translateTab, setTranslateTab] = useState<'result' | 'translate'>('result');

  // Cost calculator state
  const [minutesPerFile, setMinutesPerFile] = useState(8);
  const [fileCount, setFileCount] = useState(4);
  const [inpaintTier, setInpaintTier] = useState<'none' | 'lite' | 'standard' | 'precise'>('precise');
  const [resolution, setResolution] = useState<'1080p' | '4k'>('1080p');
  const [translateMode, setTranslateMode] = useState<'none' | 'standard' | 'high_quality'>('high_quality');
  const [langCount, setLangCount] = useState(3);

  const [openFaq, setOpenFaq] = useState<Record<number, boolean>>({ 0: true });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const heroCfg = HERO_MODES[heroMode];

  function updateSliderFromClientX(clientX: number) {
    const el = compareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSliderPct(Math.max(4, Math.min(96, pct)));
  }

  // Calculator math
  const totalInputMin = minutesPerFile * fileCount;
  const inpaintPriceMap = { none: 0, lite: 0.5, standard: 1.5, precise: 3.0 };
  const resCoeff = resolution === '4k' ? 2 : 1;
  const inpaintBillMin = inpaintTier === 'none' ? 0 : totalInputMin * resCoeff;
  const inpaintCost = inpaintBillMin * inpaintPriceMap[inpaintTier];

  const transPriceMap = { none: 0, standard: 1.5, high_quality: 4.0 };
  const translateEnabled = translateMode !== 'none';
  const transBillMin = translateEnabled ? totalInputMin * langCount : 0;
  const transCost = transBillMin * transPriceMap[translateMode];
  const totalPrice = inpaintCost + transCost;

  return (
    <div className="landing-root">
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
        <div className="container hero">
          <h1 className="hero-title">
            整季视频无痕去水印，<span className="hero-title-tail">直出 31 语种成片</span>
          </h1>
          <p className="hero-sub">批量擦除角标与硬字幕，1:1 复刻原声音色并烧录多语字幕</p>

          <div className="hero-ctas">
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
            <a className="btn btn-ghost btn-lg" href="#pricing">
              试算处理成本
            </a>
          </div>

          <div className="hero-stage-wrap">
            <div className="stage-chrome">
              <div className="stage-file-meta">
                <span className="stage-status-dot"></span>
                <span>00:01:14:08 · S01E01_雨夜来客.mp4 · 1080p</span>
              </div>

              <div className="stage-mode-tabs" role="tablist" aria-label="效果预览模式">
                {(
                  [
                    ['wipe', '擦除对比'],
                    ['en-US', '英语成片'],
                    ['ja-JP', '日语成片'],
                    ['ko-KR', '韩语成片'],
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
              onPointerDown={(e) => {
                if (heroCfg.isTranslate) return;
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
                <div className="hero-orig-subtitle">我不会再等你了</div>
              </div>

              <div className="hero-translated-overlay">
                <div className="hero-dub-pill">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2.5 8h2l1.8-4 2.4 8 2-5.5 1.3 1.5h1.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
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
        <div className="container metrics-grid">
          <div className="metric-item">
            <div className="metric-num">4K / 3h</div>
            <div className="metric-desc">单文件上限 · 最高 10 GB</div>
          </div>
          <div className="metric-item">
            <div className="metric-num">31 语种</div>
            <div className="metric-desc">25 种源语识别 · 原声配音</div>
          </div>
          <div className="metric-item">
            <div className="metric-num">200 集</div>
            <div className="metric-desc">整季文件夹直传 · 10 路并发</div>
          </div>
          <div className="metric-item">
            <div className="metric-num">¥0.50 / 分</div>
            <div className="metric-desc">按量结算 · 提交前透明预估</div>
          </div>
        </div>
      </section>

      <section className="section" id="workflow">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">三步跑完清洗、译制与交付</h2>
            <p className="section-sub">拖入本地文件夹即可自动排队，无需脚本与逐集手工遮罩</p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-top">
                <span className="step-num">01</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('inpaint')}>
                  进入上传 ↗
                </button>
              </div>
              <h3 className="step-title">批量导入原片</h3>
              <p className="step-desc">多选文件或直接拖入整季文件夹，自动解析分辨率、帧率与高帧率省费建议</p>
            </div>

            <div className="step-card">
              <div className="step-top">
                <span className="step-num">02</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('annotate')}>
                  区域标注 ↗
                </button>
              </div>
              <h3 className="step-title">套用擦除方案</h3>
              <p className="step-desc">全自动识别动态角标与硬字幕，或手动画框设定生效时段并存为整季模板</p>
            </div>

            <div className="step-card">
              <div className="step-top">
                <span className="step-num">03</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('monitor')}>
                  批次监控 ↗
                </button>
              </div>
              <h3 className="step-title">核验打包成片</h3>
              <p className="step-desc">后台队列并行轮询，网页内拉动滑块抽检画质、核对多语字幕并一键下载</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" id="features">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">双引擎串联，同一工作台闭环</h2>
            <p className="section-sub">可单独批量去水印，也可先生成干净母带再并行渲染多国成片</p>
          </div>

          <div className="features-stack">
            <div className="feature-row">
              <div className="feature-copy">
                <span className="feature-index">01 · 视频无痕修复</span>
                <h3 className="feature-title">擦除角标与硬字幕，复杂背景自然还原</h3>
                <dl className="feature-specs">
                  <div className="feature-spec-row">
                    <dt>三档画质</dt>
                    <dd>常规字幕极速 ¥0.50/分，复杂台标与花体字精准识别</dd>
                  </div>
                  <div className="feature-spec-row">
                    <dt>时段框选</dt>
                    <dd>按秒指定生效区间，其余画面零改动，模板整季复用</dd>
                  </div>
                  <div className="feature-spec-row">
                    <dt>字幕保护</dt>
                    <dd>仅擦角标时自动避开底部台词区域，防止误伤</dd>
                  </div>
                </dl>
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

              <div className="screen-showcase">
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
                      区域标注时间轴
                    </button>
                  </div>
                  <button className="stage-open-link" onClick={() => onEnterWorkspace(inpaintTab)}>
                    打开界面 ↗
                  </button>
                </div>
                <div className="showcase-frame">
                  <img
                    src={inpaintTab === 'inpaint' ? '/assets/screens/screen-inpaint.png' : '/assets/screens/screen-annotate.png'}
                    alt="净影视频修复工作台界面"
                  />
                </div>
              </div>
            </div>

            <div className="feature-row reverse">
              <div className="screen-showcase">
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
                    打开界面 ↗
                  </button>
                </div>
                <div className="showcase-frame">
                  <img
                    src={translateTab === 'result' ? '/assets/screens/screen-result.png' : '/assets/screens/screen-translate.png'}
                    alt="净影多语成片结果界面"
                  />
                </div>
              </div>

              <div className="feature-copy">
                <span className="feature-index">02 · 多语配音译制</span>
                <h3 className="feature-title">复刻原说话人声线，一次提交多语出片</h3>
                <dl className="feature-specs">
                  <div className="feature-spec-row">
                    <dt>声线与节奏</dt>
                    <dd>1:1 还原音色情绪，动态微调语速对齐口型画面</dd>
                  </div>
                  <div className="feature-spec-row">
                    <dt>多格式字幕</dt>
                    <dd>按语种匹配专属字体烧录，同步导出 SRT / ASS / VTT</dd>
                  </div>
                  <div className="feature-spec-row">
                    <dt>母带零重复</dt>
                    <dd>串联去水印仅计费一次，31 语种共用同一份干净底片</dd>
                  </div>
                </dl>
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
          <div className="section-head">
            <h2 className="section-title">适配高频批量视频场景</h2>
          </div>

          <div className="scenarios-strip">
            <article className="scenario-col">
              <h3 className="scenario-title">短剧出海</h3>
              <p className="scenario-desc">批量擦除平台角标与中文硬字幕，保留人物情绪复刻英、日、韩、西语配音与发行字幕</p>
              <div className="scenario-recipe">精准修复 + 高质量配音</div>
            </article>

            <article className="scenario-col">
              <h3 className="scenario-title">课程与内训</h3>
              <p className="scenario-desc">支持单集 3–4 小时录播视频，去除旧机构标识并输出多语种配音与标准字幕轨</p>
              <div className="scenario-recipe">固定区域模板 + 音色还原</div>
            </article>

            <article className="scenario-col">
              <h3 className="scenario-title">跨境投放素材</h3>
              <p className="scenario-desc">快速清洗历史爆款广告旧字幕与活动角标，一稿裂变多国语种版本测试海外市场</p>
              <div className="scenario-recipe">极速修复 + 情感复刻</div>
            </article>
          </div>
        </div>
      </section>

      <section className="section alt" id="pricing">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">纯按量计费，提交前透明预估</h2>
            <p className="section-sub">无套餐捆绑，按实际处理分钟数结算</p>
          </div>

          <div className="pricing-layout">
            <div className="pricing-cards-col">
              <div className="price-card">
                <div className="price-card-head">
                  <span className="price-card-title">视频修复</span>
                  <span className="price-card-meta">按输出折算分钟</span>
                </div>
                <div className="price-tier-list">
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">极速版</div>
                      <div className="price-tier-sub">常规中英字幕 · 1080p ×1，4K ×2</div>
                    </div>
                    <span className="price-tier-val">¥0.50 / 分</span>
                  </div>
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">专业标准版</div>
                      <div className="price-tier-sub">无痕文字修复 · 720p 享 0.6 折</div>
                    </div>
                    <span className="price-tier-val">¥1.50 / 分</span>
                  </div>
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">专业精准版</div>
                      <div className="price-tier-sub">图片台标、动态角标与复杂花体字</div>
                    </div>
                    <span className="price-tier-val">¥3.00 / 分</span>
                  </div>
                </div>
                <p className="price-rule-note">帧率折算：≤24fps 为 0.8，24–30fps 为 1.0，高于 30fps 按 ⌈fps/30⌉ 计</p>
              </div>

              <div className="price-card">
                <div className="price-card-head">
                  <span className="price-card-title">多语翻译</span>
                  <span className="price-card-meta">按输入时长 × 语种数</span>
                </div>
                <div className="price-tier-list">
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">标准配音（音色 / 情感复刻）</div>
                      <div className="price-tier-sub">含音色复刻、字幕翻译与多格式字幕导出</div>
                    </div>
                    <span className="price-tier-val">¥1.50 / 分</span>
                  </div>
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">高质量配音</div>
                      <div className="price-tier-sub">更高情感贴合度与发音准确度</div>
                    </div>
                    <span className="price-tier-val">¥4.00 / 分</span>
                  </div>
                </div>
                <p className="price-rule-note">串联「先去水印再翻译」时，干净母带仅收一次修复费并供全部语种复用</p>
              </div>
            </div>

            <div className="calc-panel">
              <div className="calc-head">
                <span className="calc-title">费用试算</span>
                <span className="price-card-meta">默认 30fps 基准</span>
              </div>

              <div className="calc-group">
                <div className="calc-label-row">
                  <span>单集时长</span>
                  <span className="calc-val">{minutesPerFile} 分钟</span>
                </div>
                <input
                  className="calc-range"
                  type="range"
                  min={1}
                  max={30}
                  value={minutesPerFile}
                  onChange={(e) => setMinutesPerFile(Number(e.target.value))}
                />
              </div>

              <div className="calc-group">
                <div className="calc-label-row">
                  <span>文件数量</span>
                  <span className="calc-val">
                    {fileCount} 集 · 共 {totalInputMin} 分钟
                  </span>
                </div>
                <input
                  className="calc-range"
                  type="range"
                  min={1}
                  max={60}
                  value={fileCount}
                  onChange={(e) => setFileCount(Number(e.target.value))}
                />
              </div>

              <div className="calc-group">
                <div className="calc-label-row">
                  <span>视频修复</span>
                </div>
                <div className="calc-seg">
                  {(
                    [
                      ['none', '不开启'],
                      ['lite', '极速 ¥0.50'],
                      ['standard', '标准 ¥1.50'],
                      ['precise', '精准 ¥3.00'],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      className={`calc-seg-btn ${inpaintTier === k ? 'active' : ''}`}
                      onClick={() => setInpaintTier(k)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="calc-group">
                <div className="calc-label-row">
                  <span>输出画质</span>
                </div>
                <div className="calc-seg cols-2">
                  <button
                    className={`calc-seg-btn ${resolution === '1080p' ? 'active' : ''}`}
                    onClick={() => setResolution('1080p')}
                  >
                    1080p（×1）
                  </button>
                  <button
                    className={`calc-seg-btn ${resolution === '4k' ? 'active' : ''}`}
                    onClick={() => setResolution('4k')}
                  >
                    4K（×2）
                  </button>
                </div>
              </div>

              <div className="calc-group">
                <div className="calc-label-row">
                  <span>多语翻译</span>
                </div>
                <div className="calc-seg cols-3">
                  {(
                    [
                      ['none', '不翻译'],
                      ['standard', '标准 ¥1.50'],
                      ['high_quality', '高质量 ¥4.00'],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      className={`calc-seg-btn ${translateMode === k ? 'active' : ''}`}
                      onClick={() => setTranslateMode(k)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="calc-group" style={{ opacity: translateEnabled ? 1 : 0.4 }}>
                <div className="calc-label-row">
                  <span>目标语种</span>
                  <span className="calc-val">{langCount} 语种</span>
                </div>
                <input
                  className="calc-range"
                  type="range"
                  min={1}
                  max={8}
                  disabled={!translateEnabled}
                  value={langCount}
                  onChange={(e) => setLangCount(Number(e.target.value))}
                />
              </div>

              <div className="calc-result-box">
                <div className="calc-breakdown">
                  <span>视频修复</span>
                  <span className="mono">
                    {inpaintTier === 'none' ? '—' : `¥${inpaintCost.toFixed(2)}（${inpaintBillMin} 分）`}
                  </span>
                </div>
                <div className="calc-breakdown">
                  <span>多语翻译</span>
                  <span className="mono">
                    {!translateEnabled ? '—' : `¥${transCost.toFixed(2)}（${totalInputMin} 分 × ${langCount}）`}
                  </span>
                </div>
                <div className="calc-total-row">
                  <span>预计总计</span>
                  <span className="calc-total-price">¥{totalPrice.toFixed(2)}</span>
                </div>
                <button
                  className="btn btn-primary calc-submit-btn"
                  onClick={() => onEnterWorkspace(translateEnabled ? 'translate' : 'inpaint')}
                >
                  {translateEnabled ? '进入工作台配置多语翻译' : '进入工作台批量去水印'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container faq-layout">
          <div className="faq-intro">
            <h2 className="section-title">常见问题</h2>
            <p className="section-sub">关于上传方式、计费折算与成片归档的说明</p>
          </div>

          <div className="faq-list">
            {FAQ_ITEMS.map((item, idx) => (
              <div className={`faq-item ${openFaq[idx] ? 'open' : ''}`} key={idx}>
                <button
                  className="faq-q"
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
                <div className="faq-a">{item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta-section">
        <div className="container final-cta-bar">
          <div className="final-cta-copy">
            <h2 className="final-cta-title">把下一季成片拖进工作台，今天交付多语版本</h2>
            <p className="final-cta-sub">本地文件夹直传，提交前逐笔看清折算费用</p>
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
            <button className="btn btn-ghost btn-lg" onClick={() => onEnterWorkspace('translate')}>
              新建翻译任务
            </button>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <a className="site-brand" href="#top">
              <BrandLogo size={24} />
              <span className="brand-name">净影</span>
            </a>
            <p className="footer-tagline">面向短剧出海与影视后期团队的批量视频修复与多语译制工作台</p>
          </div>

          <div className="footer-col">
            <h4>核心能力</h4>
            <ul>
              <li><a href="#features">无痕去水印与硬字幕</a></li>
              <li><a href="#features">固定区域时间轴标注</a></li>
              <li><a href="#features">31 语种原声复刻配音</a></li>
              <li><a href="#pricing">按量计费与成本试算</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>直达工作台</h4>
            <ul>
              <li><button onClick={() => onEnterWorkspace('overview')}>任务总览</button></li>
              <li><button onClick={() => onEnterWorkspace('inpaint')}>新建修复任务</button></li>
              <li><button onClick={() => onEnterWorkspace('translate')}>新建翻译任务</button></li>
              <li><button onClick={() => onEnterWorkspace('annotate')}>区域标注模板</button></li>
              <li><button onClick={() => onEnterWorkspace('subtitle-style')}>字幕样式库</button></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>支持规格</h4>
            <ul>
              <li><span>格式：mp4 / mov / avi / mkv</span></li>
              <li><span>上限：4K · 10 GB · 3–4 小时</span></li>
              <li><span>字幕：SRT / ASS / VTT 导出</span></li>
              <li><span>队列：单批 200 集 · 10 路并发</span></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
