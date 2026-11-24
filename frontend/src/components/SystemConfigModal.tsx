import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SystemConfig } from '../types';

interface Props {
  open: boolean;
  config: SystemConfig | null;
  onClose: () => void;
  onUpdated: (next: SystemConfig) => void;
  onToast: (msg: string) => void;
}

export function SystemConfigModal({ open, config, onClose, onUpdated, onToast }: Props) {
  const [mode, setMode] = useState<'auto' | 'live' | 'mock'>('auto');
  const [region, setRegion] = useState('cn-beijing');
  const [lasApiKey, setLasApiKey] = useState('');
  const [tosBucket, setTosBucket] = useState('');
  const [tosEndpoint, setTosEndpoint] = useState('tos-cn-beijing.volces.com');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ las: Record<string, any>; tos: Record<string, any>; ready_for_live: boolean } | null>(null);

  useEffect(() => {
    if (open && config) {
      setMode(config.execution_mode);
      setRegion(config.las_region);
      setLasApiKey('');
      setTosBucket(config.tos_bucket || '');
      setTosEndpoint(config.tos_endpoint || 'tos-cn-beijing.volces.com');
      setTestResult(null);
    }
  }, [open, config]);

  if (!open || !config) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        execution_mode: mode,
        las_region: region,
        tos_bucket: tosBucket,
        tos_endpoint: tosEndpoint,
      };
      if (lasApiKey.trim()) payload.las_api_key = lasApiKey.trim();
      const updated = await api.updateSystemConfig(payload as any);
      onUpdated(updated);
      onToast(`火山引擎算子配置已更新（当前模式：${updated.effective_mode === 'live' ? '实调 Live' : '本地仿真 Mock'}）`);
    } catch (err: any) {
      onToast(err.message || '保存配置失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await api.testVolcengineConnection();
      setTestResult(res);
    } catch (err: any) {
      onToast(err.message || '连通性测试失败');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" style={{ width: 540 }}>
        <div className="panel-head">
          <div className="panel-title-wrap">
            <span className="panel-title">火山引擎 LAS / TOS 运行环境</span>
            <span className="panel-sub">
              当前生效：{config.effective_mode === 'live' ? '真实火山算子 (Live)' : '本地全链路仿真 (Mock)'}
            </span>
          </div>
          <button className="shortcut-btn" onClick={onClose}>
            ESC
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="cfg-section">
            <div className="cfg-label-row">
              <span className="cfg-label">执行引擎模式</span>
              <span className="cfg-hint">auto 在配置 LAS_API_KEY + TOS_BUCKET 后自动切 Live</span>
            </div>
            <div className="seg-tiles">
              {(['auto', 'live', 'mock'] as const).map((m) => (
                <button key={m} className={`seg-tile ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
                  <span className="tile-title">{m === 'auto' ? '自动 (Auto)' : m === 'live' ? '实调 (Live)' : '仿真 (Mock)'}</span>
                  <span className="tile-sub">{m === 'live' ? '调用真实 LAS' : m === 'mock' ? '本地状态机' : '有密钥即实调'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="param-fields">
            <div className="param-field">
              <label>LAS 地域</label>
              <select
                value={region}
                onChange={(e) => {
                  const r = e.target.value;
                  setRegion(r);
                  setTosEndpoint(`tos-${r}.volces.com`);
                }}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, fontFamily: 'var(--font-mono)' }}
              >
                {(config.supported_regions || ['cn-beijing', 'cn-shanghai', 'cn-guangzhou']).map((r) => (
                  <option key={r} value={r} style={{ background: '#12161A' }}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="param-field">
              <label style={{ whiteSpace: 'nowrap' }}>TOS Bucket</label>
              <input
                type="text"
                placeholder="例如 cleanframe-prod"
                style={{ flex: 1, width: 'auto', minWidth: 0, textAlign: 'left', marginLeft: 10 }}
                value={tosBucket}
                onChange={(e) => setTosBucket(e.target.value)}
              />
            </div>
          </div>

          <div className="param-field">
            <label style={{ whiteSpace: 'nowrap' }}>LAS_API_KEY</label>
            <input
              type="password"
              placeholder={config.has_las_api_key ? `已配置 (${config.las_api_key_masked})，留空保持不变` : '输入火山引擎 LAS 控制台 API Key'}
              style={{ flex: 1, width: 'auto', minWidth: 0, textAlign: 'left', marginLeft: 12 }}
              value={lasApiKey}
              onChange={(e) => setLasApiKey(e.target.value)}
            />
          </div>

          <div className="info-card">
            <div className="info-card-head">当前接入摘要</div>
            <p className="info-card-body mono" style={{ fontSize: 10 }}>
              BaseURL: {config.las_base_url}
              <br />
              算子: las_video_inpaint_pro v1 · las_video_translate v1
              <br />
              TOS Endpoint: {tosEndpoint} · 并发上限: {config.max_concurrency} · 轮询间隔: {config.poll_interval_seconds}s
            </p>
          </div>

          {testResult && (
            <div className="info-card" style={{ borderColor: testResult.ready_for_live ? 'var(--accent-border)' : 'var(--border-strong)' }}>
              <div className="info-card-head">连通性探测结果</div>
              <p className="info-card-body" style={{ fontSize: 10.5 }}>
                LAS 算子：{testResult.las.ok ? '✅ ' : '⚠️ '}
                {testResult.las.message}
                <br />
                TOS 存储：{testResult.tos.ok ? '✅ ' : '⚠️ '}
                {testResult.tos.message}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingTop: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleTest} disabled={testing}>
              {testing ? '正在探测...' : '测试 LAS / TOS 连通性'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                关闭
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存并应用'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
