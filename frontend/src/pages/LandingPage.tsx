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
    linkText: '在工作台查看对比 ↗',
    hint: '左右拖动中间白色手柄，核验右上角角标与底部硬字幕的无痕擦除效果',
  },
  'en-US': {
    isTranslate: true,
    badge: 'en-US 英语配音 · 音色 1:1 复刻',
    caption: "I won't wait for you anymore.",
    langClass: '',
    targetView: 'translate-result' as WorkspaceViewId,
    linkText: '查看多语成片 ↗',
    hint: '自动擦除中文原字幕后烧录英文字幕，同步生成原声复刻英语配音与 .srt / .ass 字幕文件',
  },
  'ja-JP': {
    isTranslate: true,
    badge: 'ja-JP 日语配音 · 音色 1:1 复刻',
    caption: 'もう、あなたを待たない。',
    langClass: 'lang-ja',
    targetView: 'translate-result' as WorkspaceViewId,
    linkText: '查看多语成片 ↗',
    hint: '日语字幕自动匹配 NotoSansJP 字体族，短剧台词按本地语境润色',
  },
  'ko-KR': {
    isTranslate: true,
    badge: 'ko-KR 韩语配音 · 音色 1:1 复刻',
    caption: '더는 당신을 기다리지 않을게요.',
    langClass: 'lang-ko',
    targetView: 'translate-result' as WorkspaceViewId,
    linkText: '查看多语成片 ↗',
    hint: '韩语字幕自动匹配 NotoSansKR 字体族，支持同时导出纯人声配音 .wav',
  },
};

const FAQ_ITEMS = [
  {
    q: '需要懂技术或自己接对象存储吗？',
    a: '完全不需要。所有素材直接从本地电脑多选或拖入整个文件夹上传，工作台自动完成后台排队、进度轮询与结果归集，成片直接一键打包下载到本地。',
  },
  {
    q: '极速版、专业标准版和专业精准版怎么选？',
    a: '只擦常规中文/英文字幕且看重性价比选极速版（¥0.5/分，不支持日文与精准识别）；需要无痕高质量文字修复选专业标准版（¥1.5/分）；包含图片台标、角标、动态 Logo 或复杂花体字时，选专业精准版（¥3/分）效果最好。',
  },
  {
    q: '50/60fps 高帧率视频为什么建议封顶 30fps？',
    a: '视频修复计费按输出帧率折算：30fps 以内系数为 1.0，高于 30fps 则向上取整为 2 倍系数。短剧和常规成片把输出帧率上限保持在 30fps，画质观感几乎一致，但能直接省去一半费用。',
  },
  {
    q: '视频修复和视频翻译的计费口径有什么区别？',
    a: '视频修复按「实际输出时长 × 帧率系数 × 分辨率系数」计费；视频翻译按「输入视频时长 × 目标语种数量」计费。两者在工作台提交前都会逐文件给出透明预估。',
  },
  {
    q: '处理完成后的视频和字幕链接能保留多久？',
    a: '视频修复成片的临时下载链接有效期为 24 小时，多语翻译产物（视频/字幕/纯音频）下载链接有效期为 3 天，建议批次完成后及时批量下载归档。',
  },
  {
    q: '同一部剧的角标都在固定位置，能减少误擦吗？',
    a: '可以。在「区域标注」里直接拖框选中角标区域并设置生效起止时间，保存为模板后一键套用到整季所有集数；固定区域模式跳过动态检测，只处理框内范围，更可控也更稳。',
  },
];

export function LandingPage({ onEnterWorkspace }: Props) {
  const [heroMode, setHeroMode] = useState<keyof typeof HERO_MODES>('wipe');
  const [sliderPct, setSliderPct] = useState(50);
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
            <BrandLogo size={28} />
            <div className="brand-text">
              <span className="brand-name">净影</span>
              <span className="brand-sub">CLEANFRAME</span>
            </div>
          </a>

          <nav className="header-nav" aria-label="页面导航">
            <a href="#workflow">工作流</a>
            <a href="#features">核心能力</a>
            <a href="#scenarios">应用场景</a>
            <a href="#pricing">按量计费</a>
            <a href="#faq">常见问题</a>
          </nav>

          <div className="header-actions">
            <button className="btn-link-subtle" onClick={() => onEnterWorkspace('inpaint')}>
              批量去水印
            </button>
            <button className="btn-link-subtle" onClick={() => onEnterWorkspace('translate')}>
              多语翻译
            </button>
            <button className="btn btn-primary" onClick={() => onEnterWorkspace('overview')}>
              <span>进入工作台</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.8 7h8.4M7.8 3.6L11.2 7l-3.4 3.4" stroke="#06231A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <section className="hero-backdrop" id="top">
        <div className="container hero">
          <div className="hero-badge">
            <span className="badge-dot"></span>
            <span>视频修复 + 多语翻译一体化工作台 · 支持最高 4K / 3 小时</span>
          </div>

          <h1 className="hero-title">
            整季视频无痕去水印，<br />
            一键交付 <span className="accent-word">31 语种成片</span>
          </h1>

          <p className="hero-sub">
            本地批量上传整季短剧、课程或宣传片，一套方案统一擦除角标、台标与硬字幕，按需复刻原说话人音色并烧录多语字幕——告别逐集遮罩和反复导出，当天即可全球分发。
          </p>

          <div className="hero-ctas">
            <button className="btn btn-primary btn-lg" onClick={() => onEnterWorkspace('overview')}>
              <span>立即进入工作台</span>
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                <path d="M2.8 7h8.4M7.8 3.6L11.2 7l-3.4 3.4" stroke="#06231A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <a className="btn btn-ghost btn-lg" href="#pricing">
              在线试算处理成本
            </a>
          </div>

          <div className="hero-specs">
            <span>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.4 7.3l3.1 3 6.1-6.4" stroke="#4CE0A5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              本地多选 / 整文件夹拖拽，单次 200 文件
            </span>
            <span>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.4 7.3l3.1 3 6.1-6.4" stroke="#4CE0A5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              100% 保留原始音频
            </span>
            <span>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.4 7.3l3.1 3 6.1-6.4" stroke="#4CE0A5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              纯按量计费，提交前透明预估
            </span>
          </div>

          <div className="hero-stage-wrap">
            <div className="stage-chrome">
              <div className="stage-file-meta">
                <span className="stage-rec-dot"></span>
                <span>S01E01_雨夜来客.mp4 · 1920×1080 · 29.97fps</span>
              </div>

              <div className="stage-mode-tabs" role="tablist" aria-label="效果预览模式">
                {(
                  [
                    ['wipe', '擦除对比（去水印）'],
                    ['en-US', 'en-US 英语成片'],
                    ['ja-JP', 'ja-JP 日语成片'],
                    ['ko-KR', 'ko-KR 韩语成片'],
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
              aria-label="可左右拖动对比去水印效果"
              onPointerDown={(e) => {
                if (heroCfg.isTranslate) return;
                setDragging(true);
                e.currentTarget.setPointerCapture(e.pointerId);
                updateSliderFromClientX(e.clientX);
              }}
              onPointerMove={(e) => dragging && updateSliderFromClientX(e.clientX)}
              onPointerUp={() => setDragging(false)}
            >
              <div className="hero-layer">
                <img src="/assets/frame_16x9.png" alt="无痕修复后视频画面" />
              </div>

              <div
                className="hero-layer hero-before-layer"
                style={{ clipPath: `inset(0 ${(100 - sliderPct).toFixed(2)}% 0 0)` }}
              >
                <img src="/assets/frame_16x9.png" alt="含水印与字幕原片" />
                <div className="hero-drama-tag">第 01 集 · 雨夜来客</div>
                <div className="hero-watermark-badge">
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M4.5 0.6l1.1 2.7 2.7 1.2-2.7 1.2L4.5 8.4 3.4 5.7 0.7 4.5l2.7-1.2z" fill="#FFFFFF" opacity="0.92" />
                  </svg>
                  <span>星野视频</span>
                </div>
                <div className="hero-orig-subtitle">我不会再等你了</div>
              </div>

              <div className="hero-translated-overlay">
                <div className="hero-dub-pill">
                  <span className="sound-bars"><i></i><i></i><i></i><i></i></span>
                  <span>{heroCfg.badge}</span>
                </div>
                <div className={`hero-burned-caption ${heroCfg.langClass}`}>{heroCfg.caption}</div>
              </div>

              <div className="hero-divider" style={{ left: `${sliderPct.toFixed(2)}%` }}></div>
              <div className="hero-handle" style={{ left: `${sliderPct.toFixed(2)}%` }}>
                <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
                  <path d="M5.6 4L2.4 7l3.2 3" stroke="#06231A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10.4 4L13.6 7l-3.2 3" stroke="#06231A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <span className="stage-pill before">原片 · 含角标 / 剧集信息 / 硬字幕</span>
              <span className="stage-pill after">无痕修复后</span>
            </div>

            <div className="stage-footer-bar">
              <span className="stage-footer-hint">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.6" stroke="#4CE0A5" strokeWidth="1.2" />
                  <path d="M7 6.2v3.4" stroke="#4CE0A5" strokeWidth="1.3" strokeLinecap="round" />
                  <circle cx="7" cy="4.2" r="0.7" fill="#4CE0A5" />
                </svg>
                <span>{heroCfg.hint}</span>
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                北京 / 上海 / 广州三地域可用 · 火山引擎 LAS 驱动
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="metrics-section">
        <div className="container metrics-grid">
          <div className="metric-item">
            <div className="metric-num">4K <span>/</span> 3h</div>
            <div className="metric-desc">单文件最高支持 10 GB、4K 超清与 3 小时修复（纯翻译最长 4 小时）</div>
          </div>
          <div className="metric-item">
            <div className="metric-num"><span>31</span> 语种</div>
            <div className="metric-desc">支持 25 种源语自动识别、31 种目标配音与专属语种字体烧录</div>
          </div>
          <div className="metric-item">
            <div className="metric-num"><span>10</span> 并发</div>
            <div className="metric-desc">600 RPM 调度吞吐，整季剧集多语种任务并行自动编排轮询</div>
          </div>
          <div className="metric-item">
            <div className="metric-num">¥<span>0.5</span>/分起</div>
            <div className="metric-desc">按实际用量每小时出账，提交前精确显示帧率与分辨率折算明细</div>
          </div>
        </div>
      </section>

      <section className="section" id="workflow">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">WORKFLOW</span>
            <h2 className="section-title">一条链路跑完「清洗 → 翻译 → 交付」</h2>
            <p className="section-sub">不需要写脚本或逐条调接口，把整季原始视频拖进工作台，一次提交即可完成去水印和多语种成片产出。</p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-top">
                <span className="step-num">STEP 01</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('inpaint')}>进入上传 ↗</button>
              </div>
              <h3 className="step-title">本地批量上传素材</h3>
              <p className="step-desc">支持多选文件或直接拖入整季文件夹，自动通过 ffprobe 读取分辨率、帧率、时长与音轨语种，并即时标记高帧率省费提示。</p>
              <div className="step-tags">
                <span className="mini-tag">mp4 / mov / mkv</span>
                <span className="mini-tag">单批 200 文件</span>
                <span className="mini-tag">断点续传</span>
              </div>
            </div>

            <div className="step-card">
              <div className="step-top">
                <span className="step-num">STEP 02</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('annotate')}>区域标注 ↗</button>
              </div>
              <h3 className="step-title">套用方案或手动框选</h3>
              <p className="step-desc">按「擦除目标 × 定位方式」一键套用全批；针对片头角标或固定台标，可直接在 1000×1000 归一化画布画框并拖动生效时段。</p>
              <div className="step-tags">
                <span className="mini-tag">标准 / 精准 / 手动框选</span>
                <span className="mini-tag">字幕保护</span>
                <span className="mini-tag">模板复用</span>
              </div>
            </div>

            <div className="step-card">
              <div className="step-top">
                <span className="step-num">STEP 03</span>
                <button className="step-jump" onClick={() => onEnterWorkspace('monitor')}>批次监控 ↗</button>
              </div>
              <h3 className="step-title">队列跟踪与成片核验</h3>
              <p className="step-desc">自动排队与状态轮询，实时展示单集进度、日志与累计费用；完成后可直接在网页内拖动对比滑块或抽查多语字幕并打包下载。</p>
              <div className="step-tags">
                <span className="mini-tag">擦除对比滑块</span>
                <span className="mini-tag">SRT / ASS / VTT</span>
                <span className="mini-tag">修复原片共用</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" id="features">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">CORE CAPABILITIES</span>
            <h2 className="section-title">两大专业视觉引擎，无缝衔接在同一工作台</h2>
            <p className="section-sub">既能作为独立的批量去水印与字幕清洗工具使用，也能作为多语种翻译的前处理步骤自动串联，一次交付干净的海外发行成片。</p>
          </div>

          <div className="features-stack">
            <div className="feature-row">
              <div className="feature-copy">
                <span className="feature-pill">能力一 · 无痕视频修复</span>
                <h3 className="feature-title">精准识别角标与硬字幕，复杂背景依然自然无痕</h3>
                <p className="feature-lead">把底层五种检测模式抽象为直观的「擦除目标 + 定位方式」组合，既能全自动清掉动态水印、Logo、滚动字幕与剧集信息，也能手动画框精确控制每一秒。</p>
                <ul className="feature-list">
                  <li>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#4CE0A5" strokeWidth="1.3" /><path d="M5.2 8.2l1.9 1.9 3.8-4.1" stroke="#4CE0A5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span><strong>极速版 &amp; 专业版按需切换</strong>：对成本敏感的常规字幕走极速版 ¥0.5/分；对画质严苛的角标、花体字走专业版大模型精准识别。</span>
                  </li>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#4CE0A5" strokeWidth="1.3" /><path d="M5.2 8.2l1.9 1.9 3.8-4.1" stroke="#4CE0A5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span><strong>固定区域 + 生效时段时间轴</strong>：片头剧集信息只在 4–40 秒出现？拉出对应时间片即可，其余画面零改动，支持保存模板套用全季。</span>
                  </li>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#4CE0A5" strokeWidth="1.3" /><path d="M5.2 8.2l1.9 1.9 3.8-4.1" stroke="#4CE0A5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span><strong>字幕区域保护与常驻模式</strong>：只擦水印时自动避开底部字幕防止误擦；擦除字幕时开启常驻减少逐帧漏检。</span>
                  </li>
                </ul>
                <div style={{ marginTop: 6 }}>
                  <button className="btn btn-primary" onClick={() => onEnterWorkspace('inpaint')}>
                    前往新建修复任务 →
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
                      02 批量修复配置
                    </button>
                    <button
                      className={`showcase-tab ${inpaintTab === 'annotate' ? 'active' : ''}`}
                      onClick={() => setInpaintTab('annotate')}
                    >
                      03 区域标注与时间轴
                    </button>
                  </div>
                  <button className="stage-open-link" onClick={() => onEnterWorkspace(inpaintTab)}>
                    体验此界面 ↗
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
                      07 多语成片交付
                    </button>
                    <button
                      className={`showcase-tab ${translateTab === 'translate' ? 'active' : ''}`}
                      onClick={() => setTranslateTab('translate')}
                    >
                      06 新建翻译任务
                    </button>
                  </div>
                  <button
                    className="stage-open-link"
                    onClick={() => onEnterWorkspace(translateTab === 'result' ? 'translate-result' : 'translate')}
                  >
                    体验此界面 ↗
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
                <span className="feature-pill blue">能力二 · 多语翻译与配音</span>
                <h3 className="feature-title">1:1 复刻原说话人音色，一次提交产出多国成片</h3>
                <p className="feature-lead">勾选「先去水印再翻译」，工作台会自动先生成无字幕洁净底片，再并行渲染英、日、韩、西、印尼等 31 种目标语言的配音视频与多格式字幕。</p>
                <ul className="feature-list">
                  <li>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#5B9BFF" strokeWidth="1.3" /><path d="M5.2 8.2l1.9 1.9 3.8-4.1" stroke="#5B9BFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span><strong>三种配音模式 + 动态时长</strong>：支持情感复刻、音色还原与高质量配音；开启动态时长自动微调画面节奏对齐译后语速。</span>
                  </li>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#5B9BFF" strokeWidth="1.3" /><path d="M5.2 8.2l1.9 1.9 3.8-4.1" stroke="#5B9BFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span><strong>精细字幕烧录与样式库</strong>：自由控制字号、描边、动态背景与位置，自动匹配各语种专属字体，并导出 .srt / .ass / .vtt 等 5 种格式。</span>
                  </li>
                  <li>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#5B9BFF" strokeWidth="1.3" /><path d="M5.2 8.2l1.9 1.9 3.8-4.1" stroke="#5B9BFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span><strong>修复原片共用交付</strong>：一次擦除生成的干净母带由全部语种复用，并作为独立成片返回下载，不重复扣费。</span>
                  </li>
                </ul>
                <div style={{ marginTop: 6 }}>
                  <button className="btn btn-ghost" onClick={() => onEnterWorkspace('translate')}>
                    前往新建翻译任务 →
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
            <span className="section-eyebrow">USE CASES &amp; SPECS</span>
            <h2 className="section-title">为高频批量视频生产团队打造</h2>
            <p className="section-sub">覆盖短剧出海、企业培训本地化与跨境营销素材治理，把繁琐的后期清洗和配音变成标准化流水线。</p>
          </div>

          <div className="scenarios-grid">
            <article className="scenario-card">
              <div className="scenario-head">
                <div className="scenario-icon">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <rect x="2" y="3.5" width="14" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M7.4 6.7l4 2.3-4 2.3V6.7z" fill="currentColor" />
                  </svg>
                </div>
                <span className="mini-tag">短剧出海</span>
              </div>
              <h3 className="scenario-title">整季去硬字幕 + 多语配音发行</h3>
              <p className="scenario-desc">批量擦除国内平台角标、集数信息与中文硬字幕，保留人物情感与音色复刻英/日/韩/西语配音，直接烧录海外发行字幕。</p>
              <div className="scenario-recipe">推荐：先去水印（专业精准）→ 高质量配音 + 动态时长</div>
            </article>

            <article className="scenario-card">
              <div className="scenario-head">
                <div className="scenario-icon">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M2.2 6.8L9 3.2l6.8 3.6L9 10.4 2.2 6.8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M4.8 8.3v4.1c0 1 1.9 2.2 4.2 2.2s4.2-1.2 4.2-2.2V8.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="mini-tag">课程培训</span>
              </div>
              <h3 className="scenario-title">长时长录播课多语言本地化</h3>
              <p className="scenario-desc">支持单文件长达 3–4 小时的课程与内训录像，批量擦除旧机构 Logo 并输出多国语言配音与标准 .vtt / .srt 字幕轨。</p>
              <div className="scenario-recipe">推荐：固定区域模板（仅擦 Logo）+ 音色还原模式</div>
            </article>

            <article className="scenario-card">
              <div className="scenario-head">
                <div className="scenario-icon">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 13.5l3.6-3.6 2.7 2.7L15 6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M11.6 6.9H15v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="mini-tag">营销材料</span>
              </div>
              <h3 className="scenario-title">投放素材复用与多国版本裂变</h3>
              <p className="scenario-desc">快速清洗历史爆款广告片的旧水印与活动字幕，15 秒至 3 分钟竖版视频 1:4 极速出片，迅速测试东南亚、拉美与欧美市场。</p>
              <div className="scenario-recipe">推荐：极速版去水印（¥0.5/分）+ 情感复刻多语输出</div>
            </article>
          </div>
        </div>
      </section>

      <section className="section alt" id="pricing">
        <div className="container">
          <div className="section-head">
            <span className="section-eyebrow">TRANSPARENT PRICING</span>
            <h2 className="section-title">纯按量计费，每一分钱算得明明白白</h2>
            <p className="section-sub">无包年套餐绑定，按实际处理分钟数每小时出账。拖动右侧试算器，提前看清整批视频的预估成本。</p>
          </div>

          <div className="pricing-layout">
            <div className="pricing-cards-col">
              <div className="price-card">
                <div className="price-card-head">
                  <span className="price-card-title">视频修复（去水印 / 去字幕）</span>
                  <span className="mini-tag">按输出折算分钟</span>
                </div>
                <div className="price-tier-list">
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">极速版修复</div>
                      <div className="price-tier-sub">速度优先 · 1080p 内系数 ×1，4K 系数 ×2</div>
                    </div>
                    <span className="price-tier-val">¥0.50 / 分</span>
                  </div>
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">专业版 · 标准检测</div>
                      <div className="price-tier-sub">无痕画质 · 720p 享 0.6 折系数，1080p ×1，4K ×2</div>
                    </div>
                    <span className="price-tier-val">¥1.50 / 分</span>
                  </div>
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">专业版 · 精准识别</div>
                      <div className="price-tier-sub">大模型精准识别非文字水印、Logo、角标与剧集信息</div>
                    </div>
                    <span className="price-tier-val">¥3.00 / 分</span>
                  </div>
                </div>
                <p className="price-rule-note">帧率系数：≤24fps 为 0.8，24–30fps 为 1.0，高于 30fps 按 ⌈帧率/30⌉ 折算。</p>
              </div>

              <div className="price-card">
                <div className="price-card-head">
                  <span className="price-card-title">视频翻译（配音 + 字幕）</span>
                  <span className="mini-tag">按输入时长 × 语种数</span>
                </div>
                <div className="price-tier-list">
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">情感复刻 / 音色还原</div>
                      <div className="price-tier-sub">含音色 1:1 复刻、字幕翻译与多格式字幕文件导出</div>
                    </div>
                    <span className="price-tier-val">¥1.50 / 分</span>
                  </div>
                  <div className="price-tier-row">
                    <div>
                      <div className="price-tier-name">高质量配音</div>
                      <div className="price-tier-sub">更贴近原声情感与发音准确度，支持开启快速模式提速</div>
                    </div>
                    <span className="price-tier-val">¥4.00 / 分</span>
                  </div>
                </div>
                <p className="price-rule-note">若开启「先去水印再翻译」，修复原片仅生成一次并按视频修复单价另计，所有目标语种共用同一份干净母带。</p>
              </div>
            </div>

            <div className="calc-panel">
              <div className="calc-head">
                <span className="calc-title">在线成本试算器</span>
                <span className="mini-tag">默认 30fps 系数 ×1</span>
              </div>

              <div className="calc-group">
                <div className="calc-label-row">
                  <span>单集平均时长</span>
                  <span className="calc-val">{minutesPerFile} 分钟/集</span>
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
                  <span>本批文件数量</span>
                  <span className="calc-val">{fileCount} 集（合计 {totalInputMin} 分钟）</span>
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
                  <span>视频修复档位</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>去水印 / 去硬字幕</span>
                </div>
                <div className="calc-seg">
                  {(
                    [
                      ['none', '不开启'],
                      ['lite', '极速 ¥0.5'],
                      ['standard', '标准 ¥1.5'],
                      ['precise', '精准 ¥3.0'],
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
                  <span>修复输出分辨率上限</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>4K 分辨率系数 ×2</span>
                </div>
                <div className="calc-seg cols-2">
                  <button
                    className={`calc-seg-btn ${resolution === '1080p' ? 'active' : ''}`}
                    onClick={() => setResolution('1080p')}
                  >
                    1080p（系数 ×1）
                  </button>
                  <button
                    className={`calc-seg-btn ${resolution === '4k' ? 'active' : ''}`}
                    onClick={() => setResolution('4k')}
                  >
                    4K 超清（系数 ×2）
                  </button>
                </div>
              </div>

              <div className="calc-group">
                <div className="calc-label-row">
                  <span>叠加多语种配音翻译</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>31 语种任选</span>
                </div>
                <div className="calc-seg" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
                  {(
                    [
                      ['none', '不翻译'],
                      ['standard', '标准 ¥1.5'],
                      ['high_quality', '高质量 ¥4.0'],
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
                  <span>目标翻译语种数量</span>
                  <span className="calc-val">{langCount} 种语种</span>
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
                  <span>视频修复预估</span>
                  <span className="mono">
                    {inpaintTier === 'none' ? '未启用' : `¥${inpaintCost.toFixed(2)}（${inpaintBillMin} 折算分）`}
                  </span>
                </div>
                <div className="calc-breakdown">
                  <span>多语翻译预估</span>
                  <span className="mono">
                    {!translateEnabled ? '未启用' : `¥${transCost.toFixed(2)}（${totalInputMin} 分 × ${langCount} 语种）`}
                  </span>
                </div>
                <div className="calc-total-row">
                  <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>预计总计</span>
                  <span className="calc-total-price">¥{totalPrice.toFixed(2)}</span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', height: 42, marginTop: 4 }}
                  onClick={() => onEnterWorkspace(translateEnabled ? 'translate' : 'inpaint')}
                >
                  {translateEnabled ? '进入工作台配置多语翻译 →' : '进入工作台批量去水印 →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container">
          <div className="section-head center">
            <span className="section-eyebrow">FAQ</span>
            <h2 className="section-title">开始批量处理前，你可能想了解的</h2>
            <p className="section-sub">关于批量上传、计费折算规则、画质档位与成片下载有效期的常见说明。</p>
          </div>

          <div className="faq-grid">
            {FAQ_ITEMS.map((item, idx) => (
              <div className={`faq-item ${openFaq[idx] ? 'open' : ''}`} key={idx}>
                <button
                  className="faq-q"
                  onClick={() => setOpenFaq((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                >
                  <span>{item.q}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="faq-a">{item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20, paddingBottom: 84 }}>
        <div className="container">
          <div className="final-cta-card">
            <span className="section-eyebrow">READY TO SHIP</span>
            <h2 className="final-cta-title">把下一季成片拖进工作台，今天就能交付多语版本</h2>
            <p className="final-cta-sub">本地多选直接上传，提交前看清每一笔折算费用，支持随时暂停队列与逐帧核验效果。</p>
            <div className="hero-ctas" style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-lg" onClick={() => onEnterWorkspace('overview')}>
                <span>进入工作台</span>
                <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                  <path d="M2.8 7h8.4M7.8 3.6L11.2 7l-3.4 3.4" stroke="#06231A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => onEnterWorkspace('translate')}>
                直接新建翻译任务
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <a className="site-brand" href="#top">
                <BrandLogo size={26} />
                <div className="brand-text">
                  <span className="brand-name">净影</span>
                  <span className="brand-sub">CLEANFRAME</span>
                </div>
              </a>
              <p className="footer-tagline">面向影视后期、短剧出海与媒资治理团队的批量视频无痕修复与多语种翻译工作台。</p>
            </div>

            <div className="footer-col">
              <h4>核心能力</h4>
              <ul>
                <li><a href="#features">无痕去水印与硬字幕</a></li>
                <li><a href="#features">1000×1000 固定区域标注</a></li>
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
              <h4>规格与地域</h4>
              <ul>
                <li><span>支持格式：mp4 / mov / avi / mkv</span></li>
                <li><span>最高规格：4K · 10 GB · 3–4 小时</span></li>
                <li><span>可用地域：北京 / 上海 / 广州</span></li>
                <li><span>调度配额：10 并发 · 600 RPM</span></li>
              </ul>
            </div>
          </div>
          <div className="footer-wordmark" aria-hidden="true">CLEANFRAME</div>
        </div>
      </footer>
    </div>
  );
}
