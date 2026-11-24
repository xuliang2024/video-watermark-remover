import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { ChevronDownIcon } from '../components/Icons';
import type { SystemConfig, SystemConfigUpdatePayload } from '../types';

interface Props {
  config: SystemConfig | null;
  onUpdated: (next: SystemConfig) => void;
  onToast: (msg: string) => void;
  onReopenOnboarding?: () => void;
}

const REGION_LABELS: Record<string, string> = {
  'cn-beijing': 'cn-beijing · 华北2（北京）',
  'cn-shanghai': 'cn-shanghai · 华东2（上海）',
  'cn-guangzhou': 'cn-guangzhou · 华南1（广州）',
};

type SecretKeyName = 'las_api_key' | 'volc_access_key_id' | 'volc_access_key_secret';

export function SettingsView({ config, onUpdated, onToast, onReopenOnboarding }: Props) {
  // 1. Execution & Service
  const [executionMode, setExecutionMode] = useState<'auto' | 'live' | 'mock'>('auto');
  const [publicBaseUrl, setPublicBaseUrl] = useState('http://127.0.0.1:8000');
  const [monthlyQuota, setMonthlyQuota] = useState(3000);

  // 2. Volcengine LAS
  const [lasApiKey, setLasApiKey] = useState('');
  const [lasRegion, setLasRegion] = useState('cn-beijing');
  const [lasBaseUrl, setLasBaseUrl] = useState('');
  const [lasCallbackUrl, setLasCallbackUrl] = useState('');
  const [syncTosWithLasRegion, setSyncTosWithLasRegion] = useState(true);

  // 3. Volcengine TOS
  const [tosBucket, setTosBucket] = useState('');
  const [tosRegion, setTosRegion] = useState('cn-beijing');
  const [tosEndpoint, setTosEndpoint] = useState('tos-cn-beijing.volces.com');
  const [tosInputPrefix, setTosInputPrefix] = useState('cleanframe/inputs');
  const [tosOutputPrefix, setTosOutputPrefix] = useState('cleanframe/outputs');
  const [volcAk, setVolcAk] = useState('');
  const [volcSk, setVolcSk] = useState('');

  // 4. Scheduler & Concurrency
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [maxConcurrency, setMaxConcurrency] = useState(10);
  const [pollInterval, setPollInterval] = useState(3.0);

  // 5. Storage & Database
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [storageDir, setStorageDir] = useState('');

  // Secret visibility & explicit clear flags
  const [showSecrets, setShowSecrets] = useState<Record<SecretKeyName, boolean>>({
    las_api_key: false,
    volc_access_key_id: false,
    volc_access_key_secret: false,
  });
  const [clearKeys, setClearKeys] = useState<SecretKeyName[]>([]);

  // Action states
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    las: Record<string, any>;
    tos: Record<string, any>;
    ready_for_live: boolean;
  } | null>(null);

  useEffect(() => {
    if (!config) return;
    setExecutionMode(config.execution_mode);
    setPublicBaseUrl(config.public_base_url || 'http://127.0.0.1:8000');
    setMonthlyQuota(config.monthly_quota_minutes ?? 3000);

    setLasApiKey('');
    setLasRegion(config.las_region || 'cn-beijing');
    setLasBaseUrl(config.las_base_url_raw || '');
    setLasCallbackUrl(config.las_callback_url || '');

    setTosBucket(config.tos_bucket || '');
    setTosRegion(config.tos_region || config.las_region || 'cn-beijing');
    setTosEndpoint(config.tos_endpoint || 'tos-cn-beijing.volces.com');
    setTosInputPrefix(config.tos_input_prefix || 'cleanframe/inputs');
    setTosOutputPrefix(config.tos_output_prefix || 'cleanframe/outputs');
    setVolcAk('');
    setVolcSk('');

    setSchedulerEnabled(config.scheduler_enabled ?? true);
    setMaxConcurrency(config.max_concurrency ?? 10);
    setPollInterval(config.poll_interval_seconds ?? 3.0);

    setDatabaseUrl(config.database_url || '');
    setStorageDir(config.storage_dir || '');
    setClearKeys([]);
  }, [config]);

  const isDirty = useMemo(() => {
    if (!config) return false;
    return (
      executionMode !== config.execution_mode ||
      publicBaseUrl !== config.public_base_url ||
      Number(monthlyQuota) !== Number(config.monthly_quota_minutes) ||
      lasApiKey.trim().length > 0 ||
      lasRegion !== config.las_region ||
      lasBaseUrl.trim() !== (config.las_base_url_raw || '') ||
      lasCallbackUrl.trim() !== (config.las_callback_url || '') ||
      tosBucket.trim() !== (config.tos_bucket || '') ||
      tosRegion.trim() !== (config.tos_region || '') ||
      tosEndpoint.trim() !== (config.tos_endpoint || '') ||
      tosInputPrefix.trim() !== (config.tos_input_prefix || '') ||
      tosOutputPrefix.trim() !== (config.tos_output_prefix || '') ||
      volcAk.trim().length > 0 ||
      volcSk.trim().length > 0 ||
      schedulerEnabled !== config.scheduler_enabled ||
      Number(maxConcurrency) !== Number(config.max_concurrency) ||
      Number(pollInterval) !== Number(config.poll_interval_seconds) ||
      databaseUrl.trim() !== (config.database_url || '') ||
      storageDir.trim() !== (config.storage_dir || '') ||
      clearKeys.length > 0
    );
  }, [
    config,
    executionMode,
    publicBaseUrl,
    monthlyQuota,
    lasApiKey,
    lasRegion,
    lasBaseUrl,
    lasCallbackUrl,
    tosBucket,
    tosRegion,
    tosEndpoint,
    tosInputPrefix,
    tosOutputPrefix,
    volcAk,
    volcSk,
    schedulerEnabled,
    maxConcurrency,
    pollInterval,
    databaseUrl,
    storageDir,
    clearKeys,
  ]);

  function buildPayload(): SystemConfigUpdatePayload {
    const payload: SystemConfigUpdatePayload = {
      execution_mode: executionMode,
      public_base_url: publicBaseUrl.trim() || 'http://127.0.0.1:8000',
      monthly_quota_minutes: Math.max(10, Number(monthlyQuota) || 3000),
      las_region: lasRegion,
      las_base_url: lasBaseUrl.trim(),
      las_callback_url: lasCallbackUrl.trim(),
      tos_bucket: tosBucket.trim(),
      tos_region: tosRegion.trim() || lasRegion,
      tos_endpoint: tosEndpoint.trim() || `tos-${tosRegion || lasRegion}.volces.com`,
      tos_input_prefix: tosInputPrefix.trim() || 'cleanframe/inputs',
      tos_output_prefix: tosOutputPrefix.trim() || 'cleanframe/outputs',
      scheduler_enabled: schedulerEnabled,
      max_concurrency: Math.min(50, Math.max(1, Math.round(Number(maxConcurrency) || 10))),
      poll_interval_seconds: Math.min(120, Math.max(0.5, Number(pollInterval) || 3.0)),
      database_url: databaseUrl.trim(),
      storage_dir: storageDir.trim(),
      clear_keys: clearKeys,
    };
    if (lasApiKey.trim()) payload.las_api_key = lasApiKey.trim();
    if (volcAk.trim()) payload.volc_access_key_id = volcAk.trim();
    if (volcSk.trim()) payload.volc_access_key_secret = volcSk.trim();
    return payload;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateSystemConfig(buildPayload());
      onUpdated(updated);
      onToast(
        `系统环境变量已保存并写入 .env（当前生效：${updated.effective_mode === 'live' ? '火山引擎 Live 实调' : '本地仿真 Mock'}）`
      );
    } catch (err: any) {
      onToast(err.message || '保存系统设置失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickCompleteMock() {
    setSaving(true);
    try {
      const updated = await api.dismissOnboarding('auto');
      onUpdated(updated);
      onToast('已完成首次初始化，当前运行于本地全链路仿真模式');
    } catch (err: any) {
      onToast(err.message || '操作失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const res = await api.testVolcengineConnection(buildPayload());
      setTestResult(res);
      onToast(res.ready_for_live ? 'LAS 算子与 TOS 存储桶连通性探测全部通过' : '连通性探测完成，请查看右侧诊断详情');
    } catch (err: any) {
      onToast(err.message || '连通性测试失败');
    } finally {
      setTesting(false);
    }
  }

  async function handleResetDefaults() {
    try {
      const next = await api.resetSystemConfig(false);
      onUpdated(next);
      setTestResult(null);
      onToast('已恢复默认环境变量配置');
    } catch (err: any) {
      onToast(err.message || '重置失败');
    }
  }

  async function handleCopyEnvPreview() {
    if (!config?.env_preview) return;
    try {
      await navigator.clipboard.writeText(config.env_preview);
      onToast('已复制 .env 配置模板到剪贴板（敏感密钥已自动脱敏）');
    } catch {
      onToast('复制失败，请手动选中右侧文本复制');
    }
  }

  function toggleClearSecret(key: SecretKeyName) {
    setClearKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    if (key === 'las_api_key') setLasApiKey('');
    if (key === 'volc_access_key_id') setVolcAk('');
    if (key === 'volc_access_key_secret') setVolcSk('');
  }

  function handleLasRegionChange(nextRegion: string) {
    setLasRegion(nextRegion);
    if (syncTosWithLasRegion) {
      setTosRegion(nextRegion);
      setTosEndpoint(`tos-${nextRegion}.volces.com`);
    }
  }

  const autoLasBaseUrl = `https://operator.las.${lasRegion}.volces.com/api/v1`;
  const regions = config?.supported_regions || ['cn-beijing', 'cn-shanghai', 'cn-guangzhou'];

  const lasConfigured = clearKeys.includes('las_api_key')
    ? false
    : Boolean(lasApiKey.trim() || config?.has_las_api_key);
  const akConfigured = clearKeys.includes('volc_access_key_id')
    ? false
    : Boolean(volcAk.trim() || config?.has_volc_ak);
  const skConfigured = clearKeys.includes('volc_access_key_secret')
    ? false
    : Boolean(volcSk.trim() || config?.has_volc_sk);
  const tosConfigured = Boolean(tosBucket.trim() && akConfigured && skConfigured);

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">系统设置</h1>
          <p className="page-subtitle">
            集中配置系统用到的全部 18 项运行环境变量，保存后立即更新运行态并持久化同步至 <span className="mono">backend/.env</span>
          </p>
        </div>
        <div className="head-right">
          {isDirty && <span className="dirty-indicator">有未保存的环境变量修改</span>}
          <button className="btn btn-ghost" onClick={handleResetDefaults}>
            恢复默认
          </button>
          <button className="btn btn-tonal" disabled={testing} onClick={handleTestConnection}>
            {testing ? '正在探测...' : '测试 LAS / TOS 连通性'}
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存并写入 .env'}
          </button>
        </div>
      </div>

      {config?.is_first_run && (
        <div className="first-run-banner">
          <div className="first-run-banner-left">
            <span className="first-run-tag mono">FIRST RUN</span>
            <div>
              <div className="first-run-banner-title">首次启动配置向导：请填写火山引擎凭证或确认运行参数</div>
              <div className="first-run-banner-sub">
                填入下方 <span className="mono">LAS_API_KEY</span>、<span className="mono">TOS_BUCKET</span> 与{' '}
                <span className="mono">VOLC_ACCESS_KEY_ID / SECRET</span> 后点击右上角「保存并写入 .env」即可开启真实算子调度。
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={saving} onClick={handleQuickCompleteMock}>
            暂不填密钥，以仿真模式完成初始化
          </button>
        </div>
      )}

      {config?.restart_required && (
        <div className="warn-strip" style={{ borderRadius: 'var(--r-card)', border: '1px solid rgba(232, 176, 75, 0.28)' }}>
          <span>
            检测到 <span className="mono">CLEANFRAME_DATABASE_URL</span> 或 <span className="mono">CLEANFRAME_STORAGE_DIR</span>{' '}
            已变更并写入 .env，请重启后端服务使新的数据库或本地存储目录生效。
          </span>
        </div>
      )}

      <div className="split-layout settings-layout">
        <div className="col-main settings-main">
          {/* Group 1: Execution Mode & Base Service */}
          <div className="panel settings-card">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">1. 运行模式与基础服务</span>
                <span className="panel-sub">控制算子调用策略、本机/公网对外访问基址与月度预算基准</span>
              </div>
              <span className="preset-chip">实时热生效</span>
            </div>
            <div className="settings-card-body">
              <div className="cfg-section">
                <div className="cfg-label-row">
                  <span className="cfg-label">执行引擎模式</span>
                  <span className="env-key-chip mono">CLEANFRAME_EXECUTION_MODE</span>
                </div>
                <div className="seg-tiles">
                  {(
                    [
                      { key: 'auto', title: '自动切换 (auto)', sub: '配齐 LAS+TOS 自动切实调，否则本地仿真' },
                      { key: 'live', title: '强制实调 (live)', sub: '始终请求火山引擎真实异步算子 API' },
                      { key: 'mock', title: '本地仿真 (mock)', sub: '不消耗云端算力，使用本地全链路状态机' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`seg-tile ${executionMode === item.key ? 'active' : ''}`}
                      onClick={() => setExecutionMode(item.key)}
                    >
                      <span className="tile-title">{item.title}</span>
                      <span className="tile-sub">{item.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-grid-2">
                <div className="env-field">
                  <div className="env-field-head">
                    <label>服务公开访问基址</label>
                    <span className="env-key-chip mono">CLEANFRAME_PUBLIC_BASE_URL</span>
                  </div>
                  <input
                    type="text"
                    className="env-input mono"
                    placeholder="http://127.0.0.1:8000"
                    value={publicBaseUrl}
                    onChange={(e) => setPublicBaseUrl(e.target.value)}
                  />
                  <span className="env-field-help">未启用 TOS 时用于拼接本地媒体预览与算子回退 URL</span>
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>月度用量配额上限（分钟）</label>
                    <span className="env-key-chip mono">CLEANFRAME_MONTHLY_QUOTA_MIN</span>
                  </div>
                  <input
                    type="number"
                    min={10}
                    step={100}
                    className="env-input mono"
                    value={monthlyQuota}
                    onChange={(e) => setMonthlyQuota(Number(e.target.value))}
                  />
                  <span className="env-field-help">用于左下角配额进度条与「用量账单」页面的月度预算预警计算</span>
                </div>
              </div>
            </div>
          </div>

          {/* Group 2: Volcengine LAS */}
          <div className="panel settings-card">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">2. 火山引擎 LAS 算子配置</span>
                <span className="panel-sub">对接 las_video_inpaint_pro v1（去水印）与 las_video_translate v1（多语翻译）</span>
              </div>
              <span className={`status-pill ${lasConfigured ? 'done' : 'queued'}`}>
                <span className="dot" style={{ background: lasConfigured ? 'var(--accent)' : '#8E98A4' }} />
                <span>{lasConfigured ? 'API Key 已就绪' : '待配置密钥'}</span>
              </span>
            </div>
            <div className="settings-card-body">
              <div className="env-field">
                <div className="env-field-head">
                  <label>火山引擎 LAS API Key</label>
                  <div className="env-head-actions">
                    {config?.has_las_api_key && !clearKeys.includes('las_api_key') && (
                      <span className="secret-saved-badge mono">当前已存: {config.las_api_key_masked}</span>
                    )}
                    {clearKeys.includes('las_api_key') && <span className="secret-clear-badge">保存后将清空密钥</span>}
                    <span className="env-key-chip mono">LAS_API_KEY</span>
                  </div>
                </div>
                <div className="secret-input-row">
                  <input
                    name="LAS_API_KEY"
                    type={showSecrets.las_api_key ? 'text' : 'password'}
                    className="env-input mono"
                    placeholder={
                      clearKeys.includes('las_api_key')
                        ? '已标记清空，直接输入新密钥可重新设置'
                        : config?.has_las_api_key
                          ? `已保存 (${config.las_api_key_masked})，留空保持不变，输入新值即覆盖`
                          : '粘贴火山引擎 LAS 控制台签发的 Bearer API Key'
                    }
                    value={lasApiKey}
                    onChange={(e) => {
                      setLasApiKey(e.target.value);
                      if (e.target.value.trim()) {
                        setClearKeys((prev) => prev.filter((k) => k !== 'las_api_key'));
                      }
                    }}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowSecrets((s) => ({ ...s, las_api_key: !s.las_api_key }))}
                  >
                    {showSecrets.las_api_key ? '隐藏' : '显示'}
                  </button>
                  {config?.has_las_api_key && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => toggleClearSecret('las_api_key')}
                    >
                      {clearKeys.includes('las_api_key') ? '取消清空' : '清除密钥'}
                    </button>
                  )}
                </div>
                <span className="env-field-help">获取路径：火山引擎 LAS 控制台 → API Key 管理 → 创建密钥</span>
              </div>

              <div className="settings-grid-2">
                <div className="env-field">
                  <div className="env-field-head">
                    <label>LAS 算子服务地域</label>
                    <span className="env-key-chip mono">LAS_REGION</span>
                  </div>
                  <div className="select-box mono-val" style={{ height: 36 }}>
                    <select value={lasRegion} onChange={(e) => handleLasRegionChange(e.target.value)}>
                      {regions.map((r) => (
                        <option key={r} value={r}>
                          {REGION_LABELS[r] || r}
                        </option>
                      ))}
                    </select>
                    <span className="select-chevron">
                      <ChevronDownIcon />
                    </span>
                  </div>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={syncTosWithLasRegion}
                      onChange={(e) => setSyncTosWithLasRegion(e.target.checked)}
                    />
                    <span>切换地域时自动同步下方 TOS_REGION 与 TOS_ENDPOINT</span>
                  </label>
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>自定义算子网关地址（可选）</label>
                    <span className="env-key-chip mono">LAS_BASE_URL</span>
                  </div>
                  <input
                    type="text"
                    className="env-input mono"
                    placeholder={`留空自动拼接: ${autoLasBaseUrl}`}
                    value={lasBaseUrl}
                    onChange={(e) => setLasBaseUrl(e.target.value)}
                  />
                  <span className="env-field-help">留空时按 LAS_REGION 自动推导官方端点，私网专线接入时可覆盖</span>
                </div>
              </div>

              <div className="env-field">
                <div className="env-field-head">
                  <label>异步任务结果回调 Webhook（可选）</label>
                  <span className="env-key-chip mono">LAS_CALLBACK_URL</span>
                </div>
                <input
                  type="text"
                  className="env-input mono"
                  placeholder="例如 https://your-domain.com/api/webhooks/las-callback（留空则仅使用后台轮询）"
                  value={lasCallbackUrl}
                  onChange={(e) => setLasCallbackUrl(e.target.value)}
                />
                <span className="env-field-help">火山引擎回调要求公网可达的 https:// 地址（不支持 localhost / 127.0.0.1）</span>
              </div>
            </div>
          </div>

          {/* Group 3: Volcengine TOS */}
          <div className="panel settings-card">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">3. 火山引擎 TOS 对象存储配置</span>
                <span className="panel-sub">管理源视频直传与算子结果写回的对象存储桶、路径前缀及 IAM AK/SK</span>
              </div>
              <span className={`status-pill ${tosConfigured ? 'done' : 'queued'}`}>
                <span className="dot" style={{ background: tosConfigured ? 'var(--accent)' : '#8E98A4' }} />
                <span>{tosConfigured ? 'TOS 已配齐' : '待配置存储桶与 AK/SK'}</span>
              </span>
            </div>
            <div className="settings-card-body">
              <div className="settings-grid-3">
                <div className="env-field">
                  <div className="env-field-head">
                    <label>TOS 存储桶名称</label>
                    <span className="env-key-chip mono">TOS_BUCKET</span>
                  </div>
                  <input
                    name="TOS_BUCKET"
                    type="text"
                    className="env-input mono"
                    placeholder="例如 cleanframe-prod"
                    value={tosBucket}
                    onChange={(e) => setTosBucket(e.target.value)}
                  />
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>TOS 地域</label>
                    <span className="env-key-chip mono">TOS_REGION</span>
                  </div>
                  <div className="select-box mono-val" style={{ height: 36 }}>
                    <select
                      value={tosRegion}
                      onChange={(e) => {
                        const r = e.target.value;
                        setTosRegion(r);
                        setTosEndpoint(`tos-${r}.volces.com`);
                      }}
                    >
                      {regions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <span className="select-chevron">
                      <ChevronDownIcon />
                    </span>
                  </div>
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>TOS Endpoint</label>
                    <span className="env-key-chip mono">TOS_ENDPOINT</span>
                  </div>
                  <input
                    type="text"
                    className="env-input mono"
                    placeholder="tos-cn-beijing.volces.com"
                    value={tosEndpoint}
                    onChange={(e) => setTosEndpoint(e.target.value)}
                  />
                </div>
              </div>

              <div className="settings-grid-2">
                <div className="env-field">
                  <div className="env-field-head">
                    <label>源视频上传对象前缀</label>
                    <span className="env-key-chip mono">TOS_INPUT_PREFIX</span>
                  </div>
                  <input
                    type="text"
                    className="env-input mono"
                    placeholder="cleanframe/inputs"
                    value={tosInputPrefix}
                    onChange={(e) => setTosInputPrefix(e.target.value)}
                  />
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>处理成片输出对象前缀</label>
                    <span className="env-key-chip mono">TOS_OUTPUT_PREFIX</span>
                  </div>
                  <input
                    type="text"
                    className="env-input mono"
                    placeholder="cleanframe/outputs"
                    value={tosOutputPrefix}
                    onChange={(e) => setTosOutputPrefix(e.target.value)}
                  />
                </div>
              </div>

              <div className="settings-grid-2">
                <div className="env-field">
                  <div className="env-field-head">
                    <label>火山引擎 Access Key ID</label>
                    <div className="env-head-actions">
                      {config?.has_volc_ak && !clearKeys.includes('volc_access_key_id') && (
                        <span className="secret-saved-badge mono">{config.volc_access_key_id_masked}</span>
                      )}
                      <span className="env-key-chip mono">VOLC_ACCESS_KEY_ID</span>
                    </div>
                  </div>
                  <div className="secret-input-row">
                    <input
                      name="VOLC_ACCESS_KEY_ID"
                      type={showSecrets.volc_access_key_id ? 'text' : 'password'}
                      className="env-input mono"
                      placeholder={
                        clearKeys.includes('volc_access_key_id')
                          ? '保存后将清空 AK'
                          : config?.has_volc_ak
                            ? `已保存 (${config.volc_access_key_id_masked})，留空不变`
                            : '输入具备 TOS 读写权限的 AKLT...'
                      }
                      value={volcAk}
                      onChange={(e) => {
                        setVolcAk(e.target.value);
                        if (e.target.value.trim()) {
                          setClearKeys((prev) => prev.filter((k) => k !== 'volc_access_key_id'));
                        }
                      }}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSecrets((s) => ({ ...s, volc_access_key_id: !s.volc_access_key_id }))}
                    >
                      {showSecrets.volc_access_key_id ? '隐藏' : '显示'}
                    </button>
                    {config?.has_volc_ak && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => toggleClearSecret('volc_access_key_id')}
                      >
                        {clearKeys.includes('volc_access_key_id') ? '取消' : '清除'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>火山引擎 Access Key Secret</label>
                    <div className="env-head-actions">
                      {config?.has_volc_sk && !clearKeys.includes('volc_access_key_secret') && (
                        <span className="secret-saved-badge mono">{config.volc_access_key_secret_masked}</span>
                      )}
                      <span className="env-key-chip mono">VOLC_ACCESS_KEY_SECRET</span>
                    </div>
                  </div>
                  <div className="secret-input-row">
                    <input
                      name="VOLC_ACCESS_KEY_SECRET"
                      type={showSecrets.volc_access_key_secret ? 'text' : 'password'}
                      className="env-input mono"
                      placeholder={
                        clearKeys.includes('volc_access_key_secret')
                          ? '保存后将清空 SK'
                          : config?.has_volc_sk
                            ? `已保存 (${config.volc_access_key_secret_masked})，留空不变`
                            : '输入对应的 Secret Key'
                      }
                      value={volcSk}
                      onChange={(e) => {
                        setVolcSk(e.target.value);
                        if (e.target.value.trim()) {
                          setClearKeys((prev) => prev.filter((k) => k !== 'volc_access_key_secret'));
                        }
                      }}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSecrets((s) => ({ ...s, volc_access_key_secret: !s.volc_access_key_secret }))}
                    >
                      {showSecrets.volc_access_key_secret ? '隐藏' : '显示'}
                    </button>
                    {config?.has_volc_sk && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => toggleClearSecret('volc_access_key_secret')}
                      >
                        {clearKeys.includes('volc_access_key_secret') ? '取消' : '清除'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Group 4: Scheduler & Concurrency */}
          <div className="panel settings-card">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">4. 异步队列调度与并发控制</span>
                <span className="panel-sub">控制后台任务派发 Worker 开关、最大并发槽位与状态轮询频率</span>
              </div>
              <span className="preset-chip">实时热生效</span>
            </div>
            <div className="settings-card-body">
              <div className="scheduler-toggle-box" onClick={() => setSchedulerEnabled((v) => !v)}>
                <div>
                  <div className="scheduler-toggle-title">
                    启用后台异步调度与轮询服务
                    <span className="env-key-chip mono" style={{ marginLeft: 8 }}>
                      CLEANFRAME_SCHEDULER_ENABLED
                    </span>
                  </div>
                  <div className="env-field-help">关闭后新提交批次将保持 PENDING 排队状态，不会自动派发到算子</div>
                </div>
                <span className={`switch ${schedulerEnabled ? 'on' : ''}`}>
                  <span className="knob" />
                </span>
              </div>

              <div className="settings-grid-2">
                <div className="env-field">
                  <div className="env-field-head">
                    <label>最大并发执行任务数（1–50）</label>
                    <span className="env-key-chip mono">CLEANFRAME_MAX_CONCURRENCY</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="env-input mono"
                    value={maxConcurrency}
                    onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                  />
                  <span className="env-field-help">火山引擎 LAS 单账号默认并发配额为 10（600 RPM），提额后可调大</span>
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>任务状态轮询间隔（秒）</label>
                    <span className="env-key-chip mono">CLEANFRAME_POLL_INTERVAL</span>
                  </div>
                  <input
                    type="number"
                    min={0.5}
                    max={120}
                    step={0.5}
                    className="env-input mono"
                    value={pollInterval}
                    onChange={(e) => setPollInterval(Number(e.target.value))}
                  />
                  <span className="env-field-help">后台轮询 RUNNING 任务的周期，建议生产环境设为 3.0–5.0 秒</span>
                </div>
              </div>
            </div>
          </div>

          {/* Group 5: Database & Storage */}
          <div className="panel settings-card">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <span className="panel-title">5. 数据库与本地存储路径</span>
                <span className="panel-sub">配置 SQLAlchemy 数据库连接串与本地视频上传/缩略图缓存目录</span>
              </div>
              <span className="restart-chip">写入 .env · 重启生效</span>
            </div>
            <div className="settings-card-body">
              <div className="settings-grid-2">
                <div className="env-field">
                  <div className="env-field-head">
                    <label>数据库连接 URL</label>
                    <span className="env-key-chip mono">CLEANFRAME_DATABASE_URL</span>
                  </div>
                  <input
                    type="text"
                    className="env-input mono"
                    placeholder="sqlite:///./storage/cleanframe.db"
                    value={databaseUrl}
                    onChange={(e) => setDatabaseUrl(e.target.value)}
                  />
                  <span className="env-field-help">支持 SQLite、PostgreSQL（postgresql+psycopg://）或 MySQL 8.4</span>
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label>本地媒体缓存目录</label>
                    <span className="env-key-chip mono">CLEANFRAME_STORAGE_DIR</span>
                  </div>
                  <input
                    type="text"
                    className="env-input mono"
                    placeholder="./storage"
                    value={storageDir}
                    onChange={(e) => setStorageDir(e.target.value)}
                  />
                  <span className="env-field-help">存放 uploads/、thumbnails/ 与本地仿真输出的 outputs/ 目录</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sticky Diagnostic & .env Preview Column */}
        <aside className="col-config settings-aside">
          <div className="panel settings-sticky-panel">
            <div className="panel-head">
              <span className="panel-title">环境就绪度与连通诊断</span>
              <span className="preset-chip mono">{config?.effective_mode === 'live' ? 'LIVE' : 'MOCK'}</span>
            </div>
            <div className="config-body" style={{ gap: 12 }}>
              <div className="readiness-list">
                <div className="readiness-row">
                  <span className="readiness-label">当前实际运行模式</span>
                  <span className="mono" style={{ color: config?.effective_mode === 'live' ? 'var(--accent)' : 'var(--amber)' }}>
                    {config?.effective_mode === 'live' ? '火山实调 (Live)' : '本地仿真 (Mock)'}
                  </span>
                </div>
                <div className="readiness-row">
                  <span className="readiness-label">LAS 算子密钥</span>
                  <span className="mono" style={{ color: lasConfigured ? 'var(--accent)' : 'var(--text-dim)' }}>
                    {lasConfigured ? '已配置' : '未配置'}
                  </span>
                </div>
                <div className="readiness-row">
                  <span className="readiness-label">TOS 存储桶 + AK/SK</span>
                  <span className="mono" style={{ color: tosConfigured ? 'var(--accent)' : 'var(--text-dim)' }}>
                    {tosConfigured ? '已配齐' : '未配齐'}
                  </span>
                </div>
                <div className="readiness-row">
                  <span className="readiness-label">异步调度器</span>
                  <span className="mono" style={{ color: schedulerEnabled ? 'var(--accent)' : 'var(--amber)' }}>
                    {schedulerEnabled ? `开启 (${maxConcurrency} 并发 / ${pollInterval}s)` : '已暂停'}
                  </span>
                </div>
              </div>

              {testResult && (
                <div
                  className="info-card"
                  style={{
                    borderColor: testResult.ready_for_live ? 'var(--accent-border)' : 'rgba(232, 176, 75, 0.35)',
                  }}
                >
                  <div className="info-card-head">
                    <span>连通性实时探测报告</span>
                  </div>
                  <div className="probe-result-lines">
                    <div className="probe-line">
                      <span className="probe-dot" style={{ background: testResult.las.ok ? 'var(--accent)' : 'var(--amber)' }} />
                      <div>
                        <div className="probe-title">LAS 算子网关</div>
                        <div className="probe-msg">{testResult.las.message}</div>
                      </div>
                    </div>
                    <div className="probe-line">
                      <span className="probe-dot" style={{ background: testResult.tos.ok ? 'var(--accent)' : 'var(--amber)' }} />
                      <div>
                        <div className="probe-title">TOS 对象存储桶</div>
                        <div className="probe-msg">{testResult.tos.message}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="cfg-section" style={{ marginTop: 2 }}>
                <div className="cfg-label-row">
                  <span className="cfg-label">.env 持久化文件预览</span>
                  <button type="button" className="style-edit-btn" onClick={handleCopyEnvPreview}>
                    复制脱敏配置
                  </button>
                </div>
                <div className="env-path-bar mono" title={config?.env_file_path}>
                  {config?.env_file_path || 'backend/.env'}
                </div>
                <pre className="env-preview-pre mono">{config?.env_preview || '# 加载中...'}</pre>
              </div>

              {onReopenOnboarding && (
                <button type="button" className="reopen-onboarding-link" onClick={onReopenOnboarding}>
                  重新查看首次启动配置引导
                </button>
              )}
            </div>

            <div className="config-foot">
              <button className="btn btn-primary btn-full" disabled={saving} onClick={handleSave}>
                {saving ? '正在保存...' : '保存全部环境变量'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
