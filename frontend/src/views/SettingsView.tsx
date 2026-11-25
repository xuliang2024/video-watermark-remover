import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { ChevronDownIcon } from '../components/Icons';
import type { SystemConfig, SystemConfigUpdatePayload } from '../types';

interface Props {
  config: SystemConfig | null;
  onUpdated: (next: SystemConfig) => void;
  onToast: (msg: string) => void;
  onReopenOnboarding?: () => void;
  showMonthlyQuota?: boolean;
}

const REGION_LABELS: Record<string, string> = {
  'cn-beijing': 'cn-beijing · 华北2（北京）',
  'cn-shanghai': 'cn-shanghai · 华东2（上海）',
  'cn-guangzhou': 'cn-guangzhou · 华南1（广州）',
};

type SecretKeyName = 'las_api_key' | 'volc_access_key_id' | 'volc_access_key_secret';

function getDefaultTosEndpoint(region: string) {
  return `tos-${region || 'cn-beijing'}.volces.com`;
}

function extractCustomTosEndpoint(config: SystemConfig | null): string {
  if (!config) return '';
  const region = config.las_region || 'cn-beijing';
  const expected = getDefaultTosEndpoint(region);
  const current = (config.tos_endpoint || '').trim();
  return current && current !== expected ? current : '';
}

export function SettingsView({
  config,
  onUpdated,
  onToast,
  onReopenOnboarding,
  showMonthlyQuota = false,
}: Props) {
  // Required fields (5 core Volcengine online credentials)
  const [lasRegion, setLasRegion] = useState('cn-beijing');
  const [tosBucket, setTosBucket] = useState('');
  const [lasApiKey, setLasApiKey] = useState('');
  const [volcAk, setVolcAk] = useState('');
  const [volcSk, setVolcSk] = useState('');

  // Optional fields (all have sensible online defaults)
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [lasCallbackUrl, setLasCallbackUrl] = useState('');
  const [monthlyQuota, setMonthlyQuota] = useState(3000);
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [maxConcurrency, setMaxConcurrency] = useState(10);
  const [pollInterval, setPollInterval] = useState(3.0);
  const [lasBaseUrl, setLasBaseUrl] = useState('');
  const [customTosEndpoint, setCustomTosEndpoint] = useState('');
  const [tosInputPrefix, setTosInputPrefix] = useState('cleanframe/inputs');
  const [tosOutputPrefix, setTosOutputPrefix] = useState('cleanframe/outputs');

  // UI state
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [envPreviewOpen, setEnvPreviewOpen] = useState(false);
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
    setLasRegion(config.las_region || 'cn-beijing');
    setTosBucket(config.tos_bucket || '');
    setLasApiKey('');
    setVolcAk('');
    setVolcSk('');

    setPublicBaseUrl(config.public_base_url || '');
    setLasCallbackUrl(config.las_callback_url || '');
    setMonthlyQuota(config.monthly_quota_minutes ?? 3000);
    setSchedulerEnabled(config.scheduler_enabled ?? true);
    setMaxConcurrency(config.max_concurrency ?? 10);
    setPollInterval(config.poll_interval_seconds ?? 3.0);
    setLasBaseUrl(config.las_base_url_raw || '');
    setCustomTosEndpoint(extractCustomTosEndpoint(config));
    setTosInputPrefix(config.tos_input_prefix || 'cleanframe/inputs');
    setTosOutputPrefix(config.tos_output_prefix || 'cleanframe/outputs');
    setClearKeys([]);
  }, [config]);

  const savedCustomTosEndpoint = useMemo(() => extractCustomTosEndpoint(config), [config]);

  const isDirty = useMemo(() => {
    if (!config) return false;
    return (
      lasRegion !== (config.las_region || 'cn-beijing') ||
      tosBucket.trim() !== (config.tos_bucket || '') ||
      lasApiKey.trim().length > 0 ||
      volcAk.trim().length > 0 ||
      volcSk.trim().length > 0 ||
      publicBaseUrl.trim() !== (config.public_base_url || '') ||
      lasCallbackUrl.trim() !== (config.las_callback_url || '') ||
      (showMonthlyQuota && Number(monthlyQuota) !== Number(config.monthly_quota_minutes)) ||
      schedulerEnabled !== config.scheduler_enabled ||
      Number(maxConcurrency) !== Number(config.max_concurrency) ||
      Number(pollInterval) !== Number(config.poll_interval_seconds) ||
      lasBaseUrl.trim() !== (config.las_base_url_raw || '') ||
      customTosEndpoint.trim() !== savedCustomTosEndpoint ||
      tosInputPrefix.trim() !== (config.tos_input_prefix || 'cleanframe/inputs') ||
      tosOutputPrefix.trim() !== (config.tos_output_prefix || 'cleanframe/outputs') ||
      clearKeys.length > 0
    );
  }, [
    config,
    lasRegion,
    tosBucket,
    lasApiKey,
    volcAk,
    volcSk,
    publicBaseUrl,
    lasCallbackUrl,
    showMonthlyQuota,
    monthlyQuota,
    schedulerEnabled,
    maxConcurrency,
    pollInterval,
    lasBaseUrl,
    customTosEndpoint,
    savedCustomTosEndpoint,
    tosInputPrefix,
    tosOutputPrefix,
    clearKeys,
  ]);

  const lasKeyReady = clearKeys.includes('las_api_key')
    ? false
    : Boolean(lasApiKey.trim() || config?.has_las_api_key);
  const akReady = clearKeys.includes('volc_access_key_id')
    ? false
    : Boolean(volcAk.trim() || config?.has_volc_ak);
  const skReady = clearKeys.includes('volc_access_key_secret')
    ? false
    : Boolean(volcSk.trim() || config?.has_volc_sk);
  const bucketReady = Boolean(tosBucket.trim());
  const regionReady = Boolean(lasRegion.trim());

  const requiredChecks = [
    { key: 'las_region', label: '服务地域', ok: regionReady, detail: lasRegion },
    { key: 'tos_bucket', label: 'TOS 存储桶', ok: bucketReady, detail: tosBucket.trim() || '未填写' },
    { key: 'las_api_key', label: 'LAS API Key', ok: lasKeyReady, detail: lasKeyReady ? '已配置' : '未填写' },
    { key: 'volc_ak', label: 'Access Key ID', ok: akReady, detail: akReady ? '已配置' : '未填写' },
    { key: 'volc_sk', label: 'Access Key Secret', ok: skReady, detail: skReady ? '已配置' : '未填写' },
  ];
  const readyRequiredCount = requiredChecks.filter((item) => item.ok).length;
  const missingRequiredCount = requiredChecks.length - readyRequiredCount;
  const allRequiredReady = missingRequiredCount === 0;

  const customOverrideCount = [
    Boolean(lasBaseUrl.trim()),
    Boolean(customTosEndpoint.trim()),
    tosInputPrefix.trim() !== '' && tosInputPrefix.trim() !== 'cleanframe/inputs',
    tosOutputPrefix.trim() !== '' && tosOutputPrefix.trim() !== 'cleanframe/outputs',
  ].filter(Boolean).length;

  const optionalItemCount = showMonthlyQuota ? 10 : 9;

  function buildPayload(): SystemConfigUpdatePayload {
    const effectiveRegion = lasRegion || 'cn-beijing';
    const fallbackOrigin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://127.0.0.1:8000';
    const payload: SystemConfigUpdatePayload = {
      execution_mode: 'live',
      las_region: effectiveRegion,
      tos_bucket: tosBucket.trim(),
      tos_region: effectiveRegion,
      tos_endpoint: customTosEndpoint.trim() || getDefaultTosEndpoint(effectiveRegion),
      public_base_url: publicBaseUrl.trim() || fallbackOrigin,
      las_callback_url: lasCallbackUrl.trim(),
      las_base_url: lasBaseUrl.trim(),
      tos_input_prefix: tosInputPrefix.trim() || 'cleanframe/inputs',
      tos_output_prefix: tosOutputPrefix.trim() || 'cleanframe/outputs',
      scheduler_enabled: schedulerEnabled,
      max_concurrency: Math.min(50, Math.max(1, Math.round(Number(maxConcurrency) || 10))),
      poll_interval_seconds: Math.min(120, Math.max(0.5, Number(pollInterval) || 3.0)),
      clear_keys: clearKeys,
    };
    if (showMonthlyQuota) {
      payload.monthly_quota_minutes = Math.max(10, Number(monthlyQuota) || 3000);
    }
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
      const readyNow = Boolean(updated.has_las_api_key && updated.has_tos_credentials && updated.tos_bucket);
      onToast(
        readyNow
          ? '线上配置已保存并同步至 backend/.env，立即生效'
          : '配置已保存至 backend/.env，请补齐剩余必填凭证以开启线上算子'
      );
    } catch (err: any) {
      onToast(err.message || '保存系统设置失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDismissFirstRun() {
    setSaving(true);
    try {
      const updated = await api.dismissOnboarding('live');
      onUpdated(updated);
      onToast('已收起首次配置提示，随时可在此页补齐必填凭证');
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
      onToast(res.ready_for_live ? 'LAS 算子与 TOS 存储桶连通性测试全部通过' : '连通性测试完成，请查看右侧诊断详情');
    } catch (err: any) {
      onToast(err.message || '连通性测试失败');
    } finally {
      setTesting(false);
    }
  }

  async function handleResetDefaults() {
    if (!window.confirm('确认将系统配置恢复为启动时的默认环境变量吗？')) return;
    try {
      const next = await api.resetSystemConfig(false);
      onUpdated(next);
      setTestResult(null);
      onToast('已恢复默认配置');
    } catch (err: any) {
      onToast(err.message || '重置失败');
    }
  }

  async function handleCopyEnvPreview() {
    if (!config?.env_preview) return;
    try {
      await navigator.clipboard.writeText(config.env_preview);
      onToast('已复制脱敏 .env 配置到剪贴板');
    } catch {
      onToast('复制失败，请手动展开并选中复制');
    }
  }

  function toggleClearSecret(key: SecretKeyName) {
    setClearKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    if (key === 'las_api_key') setLasApiKey('');
    if (key === 'volc_access_key_id') setVolcAk('');
    if (key === 'volc_access_key_secret') setVolcSk('');
  }

  const autoLasBaseUrl = `https://operator.las.${lasRegion}.volces.com/api/v1`;
  const autoTosEndpoint = getDefaultTosEndpoint(lasRegion);
  const regions = config?.supported_regions || ['cn-beijing', 'cn-shanghai', 'cn-guangzhou'];

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">系统设置</h1>
          <p className="page-subtitle">
            配置火山引擎 LAS 算子与 TOS 对象存储线上凭证；保存后立即热生效并持久化同步至{' '}
            <span className="mono">backend/.env</span>
          </p>
        </div>
        <div className="head-right">
          {isDirty && <span className="dirty-indicator">有未保存修改</span>}
          <button className="btn btn-tonal" disabled={testing} onClick={handleTestConnection}>
            {testing ? '正在探测...' : '测试连通性'}
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {config?.is_first_run && !allRequiredReady && (
        <div className="first-run-banner">
          <div className="first-run-banner-left">
            <span className="first-run-tag mono">SETUP</span>
            <div>
              <div className="first-run-banner-title">请先补齐下方 5 项必填的火山引擎线上凭证</div>
              <div className="first-run-banner-sub">
                填齐 <span className="mono">LAS_REGION</span>、<span className="mono">TOS_BUCKET</span>、
                <span className="mono">LAS_API_KEY</span> 与 <span className="mono">VOLC_ACCESS_KEY_ID / SECRET</span>{' '}
                后保存，即可开始线上去水印与视频翻译。
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={saving} onClick={handleDismissFirstRun}>
            稍后配置
          </button>
        </div>
      )}

      <div className="split-layout settings-layout">
        <div className="col-main settings-main">
          {/* Section 1: Required Online Credentials (5 items) */}
          <div className="panel settings-card">
            <div className="panel-head">
              <div className="panel-title-wrap">
                <div className="settings-title-line">
                  <span className="panel-title">必填配置 · 火山引擎线上凭证</span>
                  <span className="field-badge-req">必填</span>
                </div>
                <span className="panel-sub">
                  配齐以下 5 项即可连通 las_video_inpaint_pro 与 las_video_translate 线上算子
                </span>
              </div>
              <span className={`status-pill ${allRequiredReady ? 'done' : 'queued'}`}>
                <span className="dot" style={{ background: allRequiredReady ? 'var(--accent)' : 'var(--amber)' }} />
                <span>{allRequiredReady ? '5 / 5 已就绪' : `待补齐 ${missingRequiredCount} 项`}</span>
              </span>
            </div>

            <div className="settings-card-body">
              <div className="settings-grid-2">
                <div className="env-field">
                  <div className="env-field-head">
                    <label className="env-label-with-tag">
                      <span>服务地域</span>
                      <span className="field-req-mark" aria-hidden="true">*</span>
                    </label>
                    <span className="env-key-chip mono">LAS_REGION</span>
                  </div>
                  <div className="select-box mono-val" style={{ height: 36 }}>
                    <select value={lasRegion} onChange={(e) => setLasRegion(e.target.value)}>
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
                  <span className="env-field-help">LAS 与 TOS 强制同地域，切换时自动同步 TOS 地域与默认 Endpoint</span>
                </div>

                <div className="env-field">
                  <div className="env-field-head">
                    <label className="env-label-with-tag">
                      <span>TOS 存储桶名称</span>
                      <span className="field-req-mark" aria-hidden="true">*</span>
                    </label>
                    <span className="env-key-chip mono">TOS_BUCKET</span>
                  </div>
                  <input
                    name="TOS_BUCKET"
                    type="text"
                    className={`env-input mono ${!bucketReady ? 'is-missing' : ''}`}
                    placeholder="例如 erasevid-prod"
                    value={tosBucket}
                    onChange={(e) => setTosBucket(e.target.value)}
                  />
                  <span className="env-field-help">需与 LAS 同主账号、同地域，用于源视频直传与成片写回</span>
                </div>
              </div>

              <div className="env-field">
                <div className="env-field-head">
                  <label className="env-label-with-tag">
                    <span>火山引擎 LAS API Key</span>
                    <span className="field-req-mark" aria-hidden="true">*</span>
                  </label>
                  <div className="env-head-actions">
                    {config?.has_las_api_key && !clearKeys.includes('las_api_key') && (
                      <span className="secret-saved-badge mono">已存: {config.las_api_key_masked}</span>
                    )}
                    {clearKeys.includes('las_api_key') && <span className="secret-clear-badge">保存后将清空</span>}
                    <span className="env-key-chip mono">LAS_API_KEY</span>
                  </div>
                </div>
                <div className="secret-input-row">
                  <input
                    name="LAS_API_KEY"
                    type={showSecrets.las_api_key ? 'text' : 'password'}
                    className={`env-input mono ${!lasKeyReady ? 'is-missing' : ''}`}
                    placeholder={
                      clearKeys.includes('las_api_key')
                        ? '已标记清空，输入新密钥可重新设置'
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
                      {clearKeys.includes('las_api_key') ? '取消清空' : '清除'}
                    </button>
                  )}
                </div>
                <span className="env-field-help">获取路径：火山引擎 LAS 控制台 → API Key 管理 → 创建密钥</span>
              </div>

              <div className="env-field">
                <div className="env-field-head">
                  <label className="env-label-with-tag">
                    <span>火山引擎 Access Key ID</span>
                    <span className="field-req-mark" aria-hidden="true">*</span>
                  </label>
                  <div className="env-head-actions">
                    {config?.has_volc_ak && !clearKeys.includes('volc_access_key_id') && (
                      <span className="secret-saved-badge mono">已存: {config.volc_access_key_id_masked}</span>
                    )}
                    {clearKeys.includes('volc_access_key_id') && <span className="secret-clear-badge">保存后将清空</span>}
                    <span className="env-key-chip mono">VOLC_ACCESS_KEY_ID</span>
                  </div>
                </div>
                <div className="secret-input-row">
                  <input
                    name="VOLC_ACCESS_KEY_ID"
                    type={showSecrets.volc_access_key_id ? 'text' : 'password'}
                    className={`env-input mono ${!akReady ? 'is-missing' : ''}`}
                    placeholder={
                      clearKeys.includes('volc_access_key_id')
                        ? '已标记清空，输入新 AK 可重新设置'
                        : config?.has_volc_ak
                          ? `已保存 (${config.volc_access_key_id_masked})，留空保持不变，输入新值即覆盖`
                          : '输入具备目标 TOS 桶读写权限的 Access Key ID (AKLT...)'
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
                      {clearKeys.includes('volc_access_key_id') ? '取消清空' : '清除'}
                    </button>
                  )}
                </div>
              </div>

              <div className="env-field">
                <div className="env-field-head">
                  <label className="env-label-with-tag">
                    <span>火山引擎 Access Key Secret</span>
                    <span className="field-req-mark" aria-hidden="true">*</span>
                  </label>
                  <div className="env-head-actions">
                    {config?.has_volc_sk && !clearKeys.includes('volc_access_key_secret') && (
                      <span className="secret-saved-badge mono">已存: {config.volc_access_key_secret_masked}</span>
                    )}
                    {clearKeys.includes('volc_access_key_secret') && (
                      <span className="secret-clear-badge">保存后将清空</span>
                    )}
                    <span className="env-key-chip mono">VOLC_ACCESS_KEY_SECRET</span>
                  </div>
                </div>
                <div className="secret-input-row">
                  <input
                    name="VOLC_ACCESS_KEY_SECRET"
                    type={showSecrets.volc_access_key_secret ? 'text' : 'password'}
                    className={`env-input mono ${!skReady ? 'is-missing' : ''}`}
                    placeholder={
                      clearKeys.includes('volc_access_key_secret')
                        ? '已标记清空，输入新 SK 可重新设置'
                        : config?.has_volc_sk
                          ? `已保存 (${config.volc_access_key_secret_masked})，留空保持不变，输入新值即覆盖`
                          : '输入对应的火山引擎 Access Key Secret'
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
                      {clearKeys.includes('volc_access_key_secret') ? '取消清空' : '清除'}
                    </button>
                  )}
                </div>
                <span className="env-field-help">获取路径：火山引擎访问控制 IAM → 密钥管理</span>
              </div>
            </div>
          </div>

          {/* Section 2: Optional Online Tuning & Overrides (Collapsible) */}
          <div className="panel settings-card">
            <button
              type="button"
              className={`panel-head settings-accordion-head ${optionalOpen ? 'open' : ''}`}
              aria-expanded={optionalOpen}
              onClick={() => setOptionalOpen((v) => !v)}
            >
              <div className="panel-title-wrap">
                <div className="settings-title-line">
                  <span className="panel-title">可选配置 · 并发、回调与接入地址</span>
                  <span className="field-badge-opt">可选</span>
                </div>
                <span className="panel-sub">均已内置线上推荐默认值，无需逐项填写，按需展开微调</span>
              </div>
              <span className="settings-accordion-toggle">
                <span>{optionalOpen ? '收起' : `展开（${optionalItemCount} 项）`}</span>
                <span className={`settings-accordion-chevron ${optionalOpen ? 'open' : ''}`}>
                  <ChevronDownIcon />
                </span>
              </span>
            </button>

            {!optionalOpen ? (
              <div className="optional-summary-bar">
                <span className={`opt-summary-chip mono ${schedulerEnabled ? 'ok' : 'warn'}`}>
                  调度：{schedulerEnabled ? '开启' : '已暂停'}
                </span>
                <span className="opt-summary-chip mono">并发：{maxConcurrency}</span>
                <span className="opt-summary-chip mono">轮询：{pollInterval}s</span>
                {publicBaseUrl.trim() && (
                  <span className="opt-summary-chip mono" title={publicBaseUrl}>
                    域名：{publicBaseUrl.trim()}
                  </span>
                )}
                {lasCallbackUrl.trim() && <span className="opt-summary-chip mono">已配置 Webhook</span>}
                {customOverrideCount > 0 && (
                  <span className="opt-summary-chip mono">自定义覆盖 {customOverrideCount} 项</span>
                )}
              </div>
            ) : (
              <div className="settings-card-body">
                <div className="settings-subhead">
                  <span>调度与回调</span>
                  <span className="settings-subhead-hint">实时热生效</span>
                </div>

                <div className="scheduler-toggle-box" onClick={() => setSchedulerEnabled((v) => !v)}>
                  <div>
                    <div className="scheduler-toggle-title">
                      启用后台异步调度器
                      <span className="env-key-chip mono" style={{ marginLeft: 8 }}>
                        CLEANFRAME_SCHEDULER_ENABLED
                      </span>
                    </div>
                    <div className="env-field-help">关闭后新提交任务保持 PENDING 排队，适合维护窗口临时停发</div>
                  </div>
                  <span className={`switch ${schedulerEnabled ? 'on' : ''}`}>
                    <span className="knob" />
                  </span>
                </div>

                <div className="settings-grid-2">
                  <div className="env-field">
                    <div className="env-field-head">
                      <label>最大并发执行数（1–50）</label>
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
                    <span className="env-field-help">火山 LAS 默认单账号并发配额为 10（600 RPM）</span>
                  </div>

                  <div className="env-field">
                    <div className="env-field-head">
                      <label>状态轮询间隔（秒）</label>
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
                    <span className="env-field-help">轮询运行中任务的周期，线上建议 3.0–5.0 秒</span>
                  </div>
                </div>

                <div className="settings-grid-2">
                  <div className="env-field">
                    <div className="env-field-head">
                      <label>服务公开访问域名</label>
                      <span className="env-key-chip mono">CLEANFRAME_PUBLIC_BASE_URL</span>
                    </div>
                    <input
                      type="text"
                      className="env-input mono"
                      placeholder="https://erasevid.com"
                      value={publicBaseUrl}
                      onChange={(e) => setPublicBaseUrl(e.target.value)}
                    />
                    <span className="env-field-help">站点对外访问基址，用于生成对外链接</span>
                  </div>

                  <div className="env-field">
                    <div className="env-field-head">
                      <label>异步结果回调 Webhook</label>
                      <span className="env-key-chip mono">LAS_CALLBACK_URL</span>
                    </div>
                    <input
                      type="text"
                      className="env-input mono"
                      placeholder="留空则仅使用后台轮询"
                      value={lasCallbackUrl}
                      onChange={(e) => setLasCallbackUrl(e.target.value)}
                    />
                    <span className="env-field-help">需公网可达 https:// 地址（如 https://erasevid.com/api/webhooks/las-callback）</span>
                  </div>
                </div>

                {showMonthlyQuota && (
                  <div className="settings-grid-2">
                    <div className="env-field">
                      <div className="env-field-head">
                        <label>月度用量配额上限（分钟）</label>
                        <span className="env-key-chip mono">CLEANFRAME_MONTHLY_QUOTA_MIN</span>
                      </div>
                      <input
                        type="number"
                        min={10}
                        step={1}
                        className="env-input mono"
                        value={monthlyQuota}
                        onChange={(e) => setMonthlyQuota(Number(e.target.value))}
                      />
                      <span className="env-field-help">用于左下角配额进度条与用量预算提醒</span>
                    </div>
                  </div>
                )}

                <div className="settings-subhead" style={{ marginTop: 4 }}>
                  <span>高级接入覆盖</span>
                  <span className="settings-subhead-hint">留空均按地域与默认值自动推导</span>
                </div>

                <div className="settings-grid-2">
                  <div className="env-field">
                    <div className="env-field-head">
                      <label>自定义 LAS 算子网关</label>
                      <span className="env-key-chip mono">LAS_BASE_URL</span>
                    </div>
                    <input
                      type="text"
                      className="env-input mono"
                      placeholder={`留空自动使用: ${autoLasBaseUrl}`}
                      value={lasBaseUrl}
                      onChange={(e) => setLasBaseUrl(e.target.value)}
                    />
                  </div>

                  <div className="env-field">
                    <div className="env-field-head">
                      <label>自定义 TOS Endpoint</label>
                      <span className="env-key-chip mono">TOS_ENDPOINT</span>
                    </div>
                    <input
                      type="text"
                      className="env-input mono"
                      placeholder={`留空自动使用: ${autoTosEndpoint}`}
                      value={customTosEndpoint}
                      onChange={(e) => setCustomTosEndpoint(e.target.value)}
                    />
                  </div>
                </div>

                <div className="settings-grid-2">
                  <div className="env-field">
                    <div className="env-field-head">
                      <label>TOS 源视频目录前缀</label>
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
                      <label>TOS 成片输出目录前缀</label>
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
              </div>
            )}
          </div>
        </div>

        {/* Right Sticky Diagnostic Column */}
        <aside className="col-config settings-aside">
          <div className="panel settings-sticky-panel">
            <div className="panel-head">
              <span className="panel-title">线上环境状态</span>
              <span className={`preset-chip mono ${allRequiredReady ? 'chip-ready' : 'chip-pending'}`}>
                {allRequiredReady ? '已就绪' : '待配置'}
              </span>
            </div>
            <div className="config-body" style={{ gap: 12 }}>
              <div className="readiness-list">
                {requiredChecks.map((item) => (
                  <div className="readiness-row" key={item.key}>
                    <span className="readiness-label">{item.label}</span>
                    <span className="mono" style={{ color: item.ok ? 'var(--accent)' : 'var(--amber)' }}>
                      {item.detail}
                    </span>
                  </div>
                ))}
                <div className="readiness-divider" />
                <div className="readiness-row">
                  <span className="readiness-label">异步调度器</span>
                  <span className="mono" style={{ color: schedulerEnabled ? 'var(--accent)' : 'var(--amber)' }}>
                    {schedulerEnabled ? `运行中 (${maxConcurrency} 并发 / ${pollInterval}s)` : '已暂停'}
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
                    <span>连通性实测报告</span>
                  </div>
                  <div className="probe-result-lines">
                    <div className="probe-line">
                      <span
                        className="probe-dot"
                        style={{ background: testResult.las.ok ? 'var(--accent)' : 'var(--amber)' }}
                      />
                      <div>
                        <div className="probe-title">LAS 算子网关</div>
                        <div className="probe-msg">{testResult.las.message}</div>
                      </div>
                    </div>
                    <div className="probe-line">
                      <span
                        className="probe-dot"
                        style={{ background: testResult.tos.ok ? 'var(--accent)' : 'var(--amber)' }}
                      />
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
                  <button
                    type="button"
                    className="env-preview-toggle"
                    onClick={() => setEnvPreviewOpen((v) => !v)}
                  >
                    <span>{envPreviewOpen ? '收起 .env 预览' : '查看 .env 预览'}</span>
                    <span className={`settings-accordion-chevron sm ${envPreviewOpen ? 'open' : ''}`}>
                      <ChevronDownIcon />
                    </span>
                  </button>
                  <button type="button" className="style-edit-btn" onClick={handleCopyEnvPreview}>
                    复制脱敏配置
                  </button>
                </div>
                {envPreviewOpen && (
                  <>
                    <div className="env-path-bar mono" title={config?.env_file_path}>
                      {config?.env_file_path || 'backend/.env'}
                    </div>
                    <pre className="env-preview-pre mono">{config?.env_preview || '# 加载中...'}</pre>
                  </>
                )}
              </div>

              <div className="settings-aside-links">
                {onReopenOnboarding && (
                  <button type="button" className="reopen-onboarding-link" onClick={onReopenOnboarding}>
                    查看首次配置引导
                  </button>
                )}
                <button type="button" className="reopen-onboarding-link" onClick={handleResetDefaults}>
                  恢复默认配置
                </button>
              </div>
            </div>

            <div className="config-foot">
              <button className="btn btn-primary btn-full" disabled={saving} onClick={handleSave}>
                {saving ? '正在保存...' : '保存线上配置'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
