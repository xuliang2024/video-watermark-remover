import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { CommandPaletteModal } from '../components/CommandPaletteModal';
import { FirstRunOnboardingModal } from '../components/FirstRunOnboardingModal';
import { BrandLogo } from '../components/Icons';
import { LanguageModal } from '../components/LanguageModal';
import type {
  BillingSummary,
  BootstrapData,
  InpaintConfig,
  MediaAsset,
  RegionItem,
  SubtitleStyleConfig,
  SystemConfig,
  TranslateConfig,
  WorkspaceViewId,
} from '../types';
import { AnnotateView } from '../views/AnnotateView';
import { BillingView } from '../views/BillingView';
import { CompareView } from '../views/CompareView';
import { InpaintCreateView } from '../views/InpaintCreateView';
import { MonitorView } from '../views/MonitorView';
import { OverviewView } from '../views/OverviewView';
import { SettingsView } from '../views/SettingsView';
import { SubtitleStyleView } from '../views/SubtitleStyleView';
import { TranslateCreateView } from '../views/TranslateCreateView';
import { TranslateResultView } from '../views/TranslateResultView';

interface Props {
  initialView: WorkspaceViewId;
  onGoHome: () => void;
  onViewChange?: (view: WorkspaceViewId) => void;
}

const VIEW_TO_NAV: Record<WorkspaceViewId, WorkspaceViewId> = {
  overview: 'overview',
  inpaint: 'inpaint',
  translate: 'translate',
  annotate: 'annotate',
  'subtitle-style': 'subtitle-style',
  billing: 'billing',
  settings: 'settings',
  monitor: 'overview',
  compare: 'overview',
  'translate-result': 'overview',
};

const DEFAULT_INPAINT_CFG: InpaintConfig = {
  name: '预设 · 剧集去水印',
  model_level: 'pro',
  targets: ['watermark', 'subtitle'],
  locate_mode: 'precise',
  max_resolution: '4k',
  max_fps: 30,
  video_mode: 'balanced',
  codec: 'h264',
  subtitle_protect: false,
  subtitle_persistent: false,
};

const DEFAULT_TRANSLATE_CFG: TranslateConfig = {
  source_lang: 'zh-CN',
  target_langs: ['en-US', 'ja-JP', 'ko-KR'],
  dubbing_mode: 'high_quality',
  fast_mode: true,
  dynamic_duration: true,
  burn_subtitles: true,
  caption_formats: ['.srt', '.ass'],
  enable_inpaint: true,
  output_dubbing_audio: false,
};

const DEFAULT_SUB_STYLE: SubtitleStyleConfig = {
  font: 'NotoSans',
  font_size: 60,
  font_color: '#FFFFFF',
  bold: false,
  outline_color: '#000000',
  outline_width: 2,
  bg_color: '#000000',
  bg_opacity: 0,
  top_margin_ratio: 77,
  width_ratio: 88,
  line_spacing: 0,
};

export function WorkspacePage({ initialView, onGoHome, onViewChange }: Props) {
  const [view, setView] = useState<WorkspaceViewId>(initialView);
  const [activeBatchId, setActiveBatchId] = useState('batch-b0412');
  const [activeTaskId, setActiveTaskId] = useState('task-20261113-01a8');
  const [searchQuery, setSearchQuery] = useState('');

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);

  const [inpaintFiles, setInpaintFiles] = useState<MediaAsset[]>([]);
  const [translateFiles, setTranslateFiles] = useState<MediaAsset[]>([]);
  const [inpaintCfg, setInpaintCfg] = useState<InpaintConfig>(DEFAULT_INPAINT_CFG);
  const [translateCfg, setTranslateCfg] = useState<TranslateConfig>(DEFAULT_TRANSLATE_CFG);
  const [regions, setRegions] = useState<RegionItem[]>([]);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>(DEFAULT_SUB_STYLE);

  const [cmdOpen, setCmdOpen] = useState(false);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const refreshAssets = useCallback(async () => {
    try {
      const [inp, tr] = await Promise.all([api.listAssets('inpaint'), api.listAssets('translate')]);
      setInpaintFiles(inp.items);
      setTranslateFiles(tr.items);
    } catch {
      // ignore initial transient error
    }
  }, []);

  const refreshBilling = useCallback(async () => {
    try {
      const b = await api.getBillingSummary();
      setBilling(b);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    api
      .getBootstrap()
      .then((data) => {
        setBootstrap(data);
        setSystemConfig(data.system);
        setSubtitleStyle(data.subtitle_style);
        setRegions(data.default_regions);
        if (data.inpaint_presets.length) {
          setInpaintCfg({ ...data.inpaint_presets[0], targets: [...data.inpaint_presets[0].targets] });
        }
        if (data.system.is_first_run) {
          setOnboardingOpen(true);
        }
      })
      .catch((err) => showToast(`初始化后端连接失败: ${err.message}`));
    refreshAssets();
    refreshBilling();
  }, [refreshAssets, refreshBilling, showToast]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setCmdOpen(false);
        setLangModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function navigate(nextView: WorkspaceViewId, ctx?: { batchId?: string; taskId?: string }) {
    if (ctx?.batchId) setActiveBatchId(ctx.batchId);
    if (ctx?.taskId) setActiveTaskId(ctx.taskId);
    setView(nextView);
    onViewChange?.(nextView);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (nextView === 'billing' || nextView === 'overview') refreshBilling();
  }

  const activeNav = VIEW_TO_NAV[view] || 'overview';
  const usageMin = Math.round(billing?.total_minutes ?? 1284);
  const quotaMin = Math.round(billing?.monthly_quota_minutes ?? 3000);
  const quotaPct = billing?.quota_percent ?? 42.8;

  return (
    <div className="workspace-root">
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand" title="返回任务总览" onClick={() => navigate('overview')}>
            <div className="brand-mark">
              <BrandLogo size={26} />
            </div>
            <div className="brand-text">
              <span className="brand-name">净影</span>
              <span className="brand-sub">CLEANFRAME</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="主导航">
            <div className="nav-group-label">工作区</div>
            <button className={`nav-item ${activeNav === 'overview' ? 'active' : ''}`} onClick={() => navigate('overview')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.6" y="1.6" width="5" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
                <rect x="9.4" y="1.6" width="5" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
                <rect x="1.6" y="9.4" width="5" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
                <rect x="9.4" y="9.4" width="5" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <span>任务总览</span>
            </button>
            <button className={`nav-item ${activeNav === 'inpaint' ? 'active' : ''}`} onClick={() => navigate('inpaint')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.6" y="1.6" width="12.8" height="12.8" rx="4" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5.1v5.8M5.1 8h5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span>新建修复任务</span>
            </button>
            <button className={`nav-item ${activeNav === 'translate' ? 'active' : ''}`} onClick={() => navigate('translate')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.35" />
                <path d="M1.7 8h12.6" stroke="currentColor" strokeWidth="1.2" />
                <ellipse cx="8" cy="8" rx="3" ry="6.3" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span>新建翻译任务</span>
            </button>

            <div className="nav-group-label">资源</div>
            <button className={`nav-item ${activeNav === 'annotate' ? 'active' : ''}`} onClick={() => navigate('annotate')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4.2 1.6v10.2h10.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M11.8 14.4V4.2H1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span>区域模板</span>
            </button>
            <button
              className={`nav-item ${activeNav === 'subtitle-style' ? 'active' : ''}`}
              onClick={() => navigate('subtitle-style')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="4.2" width="13" height="7.6" rx="2" stroke="currentColor" strokeWidth="1.35" />
                <path d="M4.4 9.4h3.6M9.4 9.4h2.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
              <span>字幕样式</span>
            </button>

            <div className="nav-group-label">账户与系统</div>
            <button className={`nav-item ${activeNav === 'billing' ? 'active' : ''}`} onClick={() => navigate('billing')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2.2 13.8h11.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <rect x="2.8" y="7.6" width="2.8" height="4.4" rx="1.1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="6.6" y="3.4" width="2.8" height="8.6" rx="1.1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="10.4" y="6" width="2.8" height="6" rx="1.1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <span>用量账单</span>
            </button>
            <button className={`nav-item ${activeNav === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2.2 4.2h4.2M9.6 4.2h4.2M2.2 8h7.2M12.4 8h1.4M2.2 11.8h2.4M7.6 11.8h6.2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                <circle cx="8" cy="4.2" r="1.5" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="10.9" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="6.1" cy="11.8" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <span style={{ flex: 1 }}>系统设置</span>
              {systemConfig && (!systemConfig.has_las_api_key || !systemConfig.has_tos_credentials) && (
                <span className="nav-setup-badge">待配置</span>
              )}
            </button>
          </nav>

          <div className="sidebar-bottom">
            <div className="usage-card" title="查看用量明细" onClick={() => navigate('billing')}>
              <div className="usage-row">
                <span className="usage-label">本月用量</span>
                <span className="usage-value">
                  {usageMin.toLocaleString()} / {quotaMin.toLocaleString()}
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${quotaPct}%` }}></div>
              </div>
            </div>

            <div className="user-row">
              <div className="avatar"></div>
              <div className="user-text">
                <span className="user-name">林舟</span>
                <span className="user-role">生产环境 · 运维</span>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4.4 5.6L7 3l2.6 2.6M4.4 8.4L7 11l2.6-2.6" stroke="#5A636E" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </aside>

        <div className="main-area">
          <header className="topbar">
            <div className="topbar-left">
              <button className="home-back-link" title="返回产品官网首页" onClick={onGoHome}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M7.6 2.6L4.2 6l3.4 3.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>官网首页</span>
              </button>
              <button
                className="env-chip"
                title="点击前往「系统设置」管理线上凭证"
                onClick={() => navigate('settings')}
              >
                <span
                  className="live-dot"
                  style={{
                    background:
                      systemConfig?.has_las_api_key && systemConfig?.has_tos_credentials ? '#4CE0A5' : '#E8B04B',
                  }}
                ></span>
                <span>
                  {systemConfig?.has_las_api_key && systemConfig?.has_tos_credentials
                    ? `火山 LAS · ${systemConfig.las_region}`
                    : `火山 LAS · 待配置凭证`}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3.2 4.8L6 7.6l2.8-2.8" stroke="#5E6873" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="plan-chip">企业版</span>
            </div>

            <div className="topbar-right">
              <div className="search-box">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="5.6" cy="5.6" r="4" stroke="#5A636E" strokeWidth="1.3" />
                  <path d="M8.6 8.6l2.6 2.6" stroke="#5A636E" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  placeholder="搜索任务 ID / 文件名"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (view !== 'overview') navigate('overview');
                  }}
                  autoComplete="off"
                />
              </div>
              <button className="shortcut-btn" title="快速切换页面 (⌘K)" onClick={() => setCmdOpen(true)}>
                ⌘K
              </button>
              <span className="topbar-divider"></span>
              <button
                className="icon-btn"
                title="任务通知"
                onClick={() => showToast('后台调度器运行正常（10 并发 · 600 RPM）')}
              >
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                  <path d="M4.2 7.1a4.3 4.3 0 018.6 0v2.6l1.1 2.2H3.1l1.1-2.2V7.1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M6.9 13.6a1.8 1.8 0 003.2 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>
              <div className="avatar sm"></div>
            </div>
          </header>

          <main className="view-scroll" ref={scrollRef}>
            {view === 'overview' && (
              <OverviewView
                searchQuery={searchQuery}
                onNavigate={navigate}
                onToast={showToast}
                region={systemConfig?.las_region || 'cn-beijing'}
              />
            )}

            {view === 'inpaint' && (
              <InpaintCreateView
                files={inpaintFiles}
                presets={bootstrap?.inpaint_presets || [DEFAULT_INPAINT_CFG]}
                config={inpaintCfg}
                regions={regions}
                onChangeConfig={setInpaintCfg}
                onFilesUpdated={refreshAssets}
                onNavigate={navigate}
                onToast={showToast}
              />
            )}

            {view === 'annotate' && (
              <AnnotateView
                files={inpaintFiles}
                regions={regions}
                defaultRegions={bootstrap?.default_regions || regions}
                onChangeRegions={setRegions}
                onApplyToInpaint={() => setInpaintCfg((prev) => ({ ...prev, locate_mode: 'fixed' }))}
                onNavigate={navigate}
                onToast={showToast}
              />
            )}

            {view === 'monitor' && (
              <MonitorView batchId={activeBatchId} onNavigate={navigate} onToast={showToast} />
            )}

            {view === 'compare' && (
              <CompareView taskId={activeTaskId} onNavigate={navigate} onToast={showToast} />
            )}

            {view === 'translate' && (
              <TranslateCreateView
                files={translateFiles}
                sourceLanguages={bootstrap?.source_languages || [{ code: 'zh-CN', name: '中文（简体）' }]}
                outputLanguages={
                  bootstrap?.output_languages || [
                    { code: 'en-US', name: '英语', primary: true },
                    { code: 'ja-JP', name: '日语', primary: true },
                    { code: 'ko-KR', name: '韩语', primary: true },
                  ]
                }
                config={translateCfg}
                subtitleStyle={subtitleStyle}
                onChangeConfig={setTranslateCfg}
                onFilesUpdated={refreshAssets}
                onOpenLangModal={() => setLangModalOpen(true)}
                onNavigate={navigate}
                onToast={showToast}
              />
            )}

            {view === 'translate-result' && (
              <TranslateResultView taskId={activeTaskId} onNavigate={navigate} onToast={showToast} />
            )}

            {view === 'subtitle-style' && (
              <SubtitleStyleView
                style={subtitleStyle}
                onChangeStyle={setSubtitleStyle}
                onNavigate={navigate}
                onToast={showToast}
              />
            )}

            {view === 'billing' && <BillingView onToast={showToast} />}

            {view === 'settings' && (
              <SettingsView
                config={systemConfig}
                onUpdated={(next) => {
                  setSystemConfig(next);
                  refreshBilling();
                }}
                onToast={showToast}
                onReopenOnboarding={() => setOnboardingOpen(true)}
                showMonthlyQuota
              />
            )}
          </main>
        </div>
      </div>

      <CommandPaletteModal open={cmdOpen} onClose={() => setCmdOpen(false)} onSelect={(v) => navigate(v)} />

      <LanguageModal
        open={langModalOpen}
        languages={bootstrap?.output_languages || []}
        sourceLang={translateCfg.source_lang}
        selectedLangs={translateCfg.target_langs}
        onToggle={(code) => {
          if (code === translateCfg.source_lang) return;
          setTranslateCfg((prev) => {
            if (prev.target_langs.includes(code)) {
              if (prev.target_langs.length === 1) return prev;
              return { ...prev, target_langs: prev.target_langs.filter((c) => c !== code) };
            }
            return { ...prev, target_langs: [...prev.target_langs, code] };
          });
        }}
        onClose={() => setLangModalOpen(false)}
      />

      <FirstRunOnboardingModal
        open={onboardingOpen && view !== 'settings'}
        onGoToSettings={() => {
          setOnboardingOpen(false);
          navigate('settings');
        }}
        onSkipWithMock={async () => {
          try {
            const next = await api.dismissOnboarding('live');
            setSystemConfig(next);
            setOnboardingOpen(false);
            showToast('已收起配置引导，随时可在左侧「系统设置」补齐线上凭证');
          } catch (err: any) {
            showToast(err.message || '操作失败');
          }
        }}
      />

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
