import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { BatchDetail, WorkspaceViewId } from '../types';

interface Props {
  batchId: string;
  onNavigate: (view: WorkspaceViewId, ctx?: { batchId?: string; taskId?: string }) => void;
  onToast: (msg: string) => void;
}

export function MonitorView({ batchId, onNavigate, onToast }: Props) {
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  async function loadBatch() {
    try {
      const res = await api.getBatchDetail(batchId || 'latest');
      setBatch(res);
      setNotFound(false);
    } catch {
      setNotFound(true);
    }
  }

  useEffect(() => {
    loadBatch();
    const timer = window.setInterval(loadBatch, 2500);
    return () => window.clearInterval(timer);
  }, [batchId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [batch?.logs.length]);

  async function handleTogglePause() {
    if (!batch) return;
    setBusy(true);
    try {
      if (batch.paused) {
        await api.resumeBatch(batch.id);
        onToast('队列已继续运行');
      } else {
        await api.pauseBatch(batch.id);
        onToast('队列已暂停，当前运行中任务将继续收尾');
      }
      await loadBatch();
    } catch (err: any) {
      onToast(err.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!batch) return;
    setBusy(true);
    try {
      const res = await api.cancelBatch(batch.id);
      onToast(`已取消批次中 ${res.cancelled_tasks} 个未完成任务`);
      await loadBatch();
    } catch (err: any) {
      onToast(err.message || '取消批次失败');
    } finally {
      setBusy(false);
    }
  }

  if (!batch) {
    return (
      <section className="view active">
        <div className="empty-state">
          {notFound ? '当前空间暂无运行批次，请先新建修复或翻译任务' : '正在同步批次运行状态...'}
        </div>
      </section>
    );
  }

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <button className="breadcrumb-back" onClick={() => onNavigate('overview')}>
            ← 返回任务总览
          </button>
          <h1 className="page-title">{batch.name}</h1>
          <p className="page-subtitle">
            算子 {batch.operator_id} {batch.operator_version} · {batch.region} · 提交于 {batch.submitted_at} · 已完成{' '}
            {batch.counts.completed} / {batch.counts.total} ·{' '}
            {batch.execution_mode === 'live' ? '火山 LAS 实调' : '本地全链路仿真'}
          </p>
        </div>
        <div className="head-right">
          <button className="btn btn-ghost" disabled={busy} onClick={handleTogglePause}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2.4" y="2" width="2.6" height="8" rx="1" fill="#9AA3AE" />
              <rect x="7" y="2" width="2.6" height="8" rx="1" fill="#9AA3AE" />
            </svg>
            <span>{batch.paused ? '继续队列' : '暂停队列'}</span>
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={handleCancel}>
            取消批次
          </button>
        </div>
      </div>

      <div className="split-layout">
        <div className="col-main">
          <div className="summary-strip">
            <div className="summary-row">
              <div className="summary-left">
                <span className="panel-sub">总进度</span>
                <span className="summary-val">
                  {batch.counts.completed} / {batch.counts.total}
                </span>
                <span className="panel-sub">
                  完成 · {batch.counts.running} 个运行中 · {batch.counts.queued} 个排队
                  {batch.counts.failed > 0 ? ` · ${batch.counts.failed} 个异常` : ''}
                </span>
              </div>
              <span className="summary-meta">
                已产生 ¥{batch.billing.accrued_cost.toFixed(2)} · 预计 ¥{batch.billing.estimated_cost.toFixed(2)}
              </span>
            </div>
            <div className="segmented-rail">
              <div className="rail-done" style={{ width: `${batch.progress_bars.done_pct}%` }}></div>
              <div className="rail-running" style={{ width: `${batch.progress_bars.running_pct}%` }}></div>
            </div>
          </div>

          <div className="panel panel-sm" style={{ flex: 1 }}>
            <div className="queue-head">
              <div>文件</div>
              <div>状态</div>
              <div>进度</div>
              <div>预计完成</div>
            </div>
            <div>
              {batch.queue.map((q) => {
                const barClass = q.status === 'running' ? 'blue' : q.status === 'completed' ? '' : 'dim';
                const barW = q.status === 'completed' ? 100 : q.status === 'running' ? q.progress : 3;
                const pct = q.status === 'completed' ? '100%' : q.status === 'running' ? `${q.progress}%` : '—';
                const clickable = q.status === 'completed';
                return (
                  <div
                    key={q.id}
                    className={`queue-row ${clickable ? 'clickable' : ''}`}
                    title={clickable ? '点击查看成片结果' : q.error_msg || ''}
                    onClick={() => {
                      if (clickable) {
                        onNavigate(q.type === 'translate' ? 'translate-result' : 'compare', { taskId: q.id });
                      }
                    }}
                  >
                    <div className="cell-stack">
                      <span className="file-name">{q.file}</span>
                      <span className="file-meta">
                        {q.meta} · {q.status === 'completed' ? `计费 ${q.bill_minutes.toFixed(2)} 分钟` : `预计 ${q.estimated_bill_min.toFixed(2)} 分钟`}
                      </span>
                    </div>
                    <div>
                      <span className={`status-pill ${q.status}`}>
                        <span className="dot"></span>
                        {q.status_label}
                      </span>
                    </div>
                    <div className="progress-cell">
                      <div className="progress-track">
                        <div className={`progress-fill ${barClass}`} style={{ width: `${barW}%` }}></div>
                      </div>
                      <span className="progress-pct">{pct}</span>
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 10, color: q.status === 'running' ? 'var(--blue-text)' : 'var(--text-dim)' }}
                    >
                      {q.eta}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="col-side">
          <div className="log-panel">
            <div className="panel-head compact">
              <div className="panel-title-wrap">
                <span className="panel-title" style={{ fontSize: 11.5 }}>
                  运行日志
                </span>
                <span className="live-chip">
                  <span className="dot"></span>实时
                </span>
              </div>
              <span className="mono" style={{ fontSize: 9, color: '#4C5560' }}>
                poll 3s
              </span>
            </div>
            <div className="log-body" ref={logRef}>
              {batch.logs.map((l) => (
                <div key={l.id} className={`log-line ${l.tone}`}>
                  {l.time}  {l.tag.padEnd(9, ' ')} {l.msg}
                </div>
              ))}
              <div className="log-tail">
                — {batch.paused ? '队列已暂停' : '等待下一个事件 · Poll RPM 600'} —
              </div>
            </div>
          </div>

          <div className="billing-card">
            <div className="cfg-label-row">
              <span className="panel-title" style={{ fontSize: 11.5 }}>
                计费实时累计
              </span>
              <span className="count-chip" style={{ fontFamily: 'var(--font-sans)', fontSize: 9 }}>
                按量计费
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="billing-amount">¥{batch.billing.accrued_cost.toFixed(2)}</span>
              <span className="panel-sub">
                已完成 {batch.counts.completed} 个文件 · 计费 {batch.billing.accrued_bill_min.toFixed(2)} 分钟
              </span>
            </div>
            <div className="divider-h"></div>
            <div className="cfg-label-row">
              <span className="panel-sub" style={{ fontSize: 10 }}>
                预计本批总计
              </span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                ¥{batch.billing.estimated_cost.toFixed(2)}
              </span>
            </div>
            <p style={{ fontSize: 9.5, color: 'var(--text-hint)', lineHeight: '14px' }}>
              {batch.billing.estimated_bill_min.toFixed(1)} 计费分钟 · 单价 ¥{batch.billing.unit_price.toFixed(2)}/分
            </p>
            <p style={{ fontSize: 9, color: 'var(--text-ghost)', lineHeight: '13px' }}>
              计费时长按输出视频帧率与分辨率折算 · 每小时出账
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
