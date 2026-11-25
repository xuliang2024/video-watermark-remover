import { useEffect, useState } from 'react';
import { api, triggerDownload } from '../api/client';
import type { DashboardOverview, TaskRow, WorkspaceViewId } from '../types';
import {
  cleanOverviewSubtitle,
  formatPercentClean,
  formatProcessedMetric,
  formatTaskDurationTooltip,
  resolveTaskDuration,
} from '../utils/calc';

interface Props {
  searchQuery: string;
  onNavigate: (view: WorkspaceViewId, ctx?: { batchId?: string; taskId?: string }) => void;
  onToast: (msg: string) => void;
  region: string;
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'running', label: '运行中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败' },
  { key: 'timeout', label: '超时' },
];

export function OverviewView({ searchQuery, onNavigate, onToast }: Props) {
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  async function loadOverview() {
    try {
      const res = await api.getOverview(filter, searchQuery);
      const ts = Date.now();
      setData(res);
      setFetchedAt(ts);
      setNowMs(ts);
    } catch (err: any) {
      onToast(err.message || '加载任务总览失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    const timer = window.setInterval(loadOverview, 4000);
    return () => window.clearInterval(timer);
  }, [filter, searchQuery]);

  const hasRunningTask = Boolean(data?.tasks.some((t) => t.status === 'running'));
  useEffect(() => {
    if (!hasRunningTask) return;
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [hasRunningTask]);

  async function handleRetry(e: React.MouseEvent, task: TaskRow) {
    e.stopPropagation();
    try {
      await api.retryTask(task.id);
      onToast(`任务 ${task.file} 已重新入队，正在调度执行`);
      loadOverview();
    } catch (err: any) {
      onToast(err.message || '重试任务失败');
    }
  }

  const queuedCount = data?.kpis.queued_count ?? 0;
  const processedDisplay = formatProcessedMetric(data?.kpis.processed_today);
  const successRateDisplay = formatPercentClean(data?.kpis.success_rate);
  const subtitleText = cleanOverviewSubtitle(data?.subtitle);

  return (
    <section className="view active overview-view">
      <div className="page-head overview-page-head">
        <div className="head-left">
          <h1 className="page-title">任务总览</h1>
          <p className="page-subtitle">{subtitleText}</p>
        </div>
        <div className="head-right">
          <button className="btn btn-ghost" onClick={() => onNavigate('translate')}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2 8h12" stroke="currentColor" strokeWidth="1.3" />
              <ellipse cx="8" cy="8" rx="2.8" ry="6" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            <span>新建翻译</span>
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('inpaint')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2.4v9.2M2.4 7h9.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span>新建修复</span>
          </button>
        </div>
      </div>

      <div className="kpi-strip" aria-label="核心运行指标">
        <div className="kpi-cell">
          <span className="kpi-label">今日处理</span>
          <span className="kpi-value">{processedDisplay}</span>
          <span className="kpi-note">{data?.kpis.processed_delta || '实时统计中'}</span>
        </div>
        <div className="kpi-cell kpi-cell-rate">
          <span className="kpi-label">任务成功率</span>
          <span className="kpi-value">{successRateDisplay}</span>
          <span className="kpi-note">{data?.kpis.recent_count || '空间累计任务'}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">队列中</span>
          <span className={`kpi-value${queuedCount > 0 ? ' is-accent' : ''}`}>{queuedCount}</span>
          <span className="kpi-note">{data?.kpis.queue_eta || '队列空闲'}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">本月费用</span>
          <span className="kpi-value">{data?.kpis.monthly_cost || '¥0.00'}</span>
          <span className="kpi-note">{data?.kpis.monthly_usage || '计费用量 0.0 分钟'}</span>
        </div>
      </div>

      <div className="panel overview-tasks-panel">
        <div className="panel-head overview-panel-head">
          <div className="panel-title-wrap">
            <span className="panel-title">最近任务</span>
            <span className="panel-count mono">{data ? data.tasks.length : 0}</span>
          </div>
          <div className="panel-tools">
            <div className="filter-seg" role="tablist" aria-label="按状态筛选任务">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="panel-tool-actions">
              <button
                className="btn-inline-tool"
                title="导出任务清单 CSV"
                onClick={() => {
                  triggerDownload('/api/tasks/export');
                  onToast('已导出任务清单 CSV');
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v7.2M4.3 6.5L7 9.2l2.7-2.7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2.2 11.2v.9a.8.8 0 00.8.8h8a.8.8 0 00.8-.8v-.9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                </svg>
                <span>导出</span>
              </button>
              <button
                className="btn-inline-tool"
                title="进入当前批次监控"
                onClick={() => onNavigate('monitor', { batchId: data?.active_batch_id || 'latest' })}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1.8 7h2.4l1.5-3.6 2.4 7.2 1.6-3.6h2.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>监控</span>
              </button>
            </div>
          </div>
        </div>

        <div className="task-table-head">
          <div>视频任务</div>
          <div>处理方案</div>
          <div>状态</div>
          <div className="col-num">耗时</div>
          <div className="col-num">用量</div>
          <div className="col-end">提交 / 操作</div>
        </div>

        <div className="task-list-body">
          {loading && !data ? (
            <div className="empty-state">正在加载任务数据</div>
          ) : !data?.tasks.length ? (
            <div className="empty-state">当前筛选条件下暂无匹配任务</div>
          ) : (
            data.tasks.map((t) => {
              const durationText = resolveTaskDuration(t, nowMs, fetchedAt);
              const durationTip = formatTaskDurationTooltip(t, durationText);
              const actionLabel =
                t.status === 'completed'
                  ? t.type === 'translate'
                    ? '成片'
                    : '对比'
                  : '监控';
              const mobileMetaParts = [
                durationText !== '—' ? durationText : '',
                t.usage && t.usage !== '—' ? t.usage : '',
                t.time && t.time !== '—' ? t.time : '',
              ].filter(Boolean);

              return (
                <div
                  key={t.id}
                  className="task-row"
                  title={t.error_msg || `点击查看${actionLabel}`}
                  onClick={() =>
                    onNavigate(t.target_view, {
                      batchId: t.batch_id,
                      taskId: t.id,
                    })
                  }
                >
                  <div className="task-file-cell">
                    <div className="thumb">
                      <img src={t.thumbnail_url || '/assets/frame_16x9.png'} alt="" />
                    </div>
                    <div className="cell-stack">
                      <span className="file-name">{t.file}</span>
                      <span className="file-meta">
                        <span className="meta-desktop">{t.meta}</span>
                        <span className="meta-mobile">{t.scheme}</span>
                      </span>
                    </div>
                  </div>

                  <div className="cell-stack task-scheme-cell">
                    <span className="scheme-main">{t.scheme}</span>
                    <span className="scheme-sub">{t.sub_scheme}</span>
                  </div>

                  <div className="task-state-cell">
                    {t.status === 'running' ? (
                      <div className="task-running-state">
                        <div className="task-running-head">
                          <span className="status-inline running">
                            <span className="dot" />
                            <span>运行中</span>
                          </span>
                          <span className="task-running-pct mono">{t.progress}%</span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill blue" style={{ width: `${Math.max(4, t.progress)}%` }} />
                        </div>
                      </div>
                    ) : (
                      <span className={`status-inline ${t.status}`}>
                        <span className="dot" />
                        <span>{t.status_label}</span>
                      </span>
                    )}
                  </div>

                  <div
                    className={`cell-mono col-num task-duration-cell${t.status === 'running' ? ' is-running' : durationText === '—' ? ' is-empty' : ''}`}
                    title={durationTip}
                  >
                    {t.status === 'running' && <span className="duration-live-dot" aria-hidden="true" />}
                    <span>{durationText}</span>
                  </div>

                  <div className="cell-mono col-num task-usage-cell">{t.usage}</div>

                  <div className="task-end-cell col-end">
                    <span className="cell-time">{t.time}</span>
                    {t.status === 'failed' || t.status === 'timeout' ? (
                      <button className="btn btn-ghost btn-xs" onClick={(e) => handleRetry(e, t)}>
                        重试
                      </button>
                    ) : (
                      <span className={`task-row-link${t.status === 'completed' ? ' is-primary' : ''}`}>
                        {actionLabel}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M4.5 2.8L7.7 6 4.5 9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </div>

                  <div className="task-mobile-foot">
                    {t.status === 'running' ? (
                      <div className="task-mobile-progress">
                        <div className="progress-track">
                          <div className="progress-fill blue" style={{ width: `${Math.max(4, t.progress)}%` }} />
                        </div>
                        <span className="mono">
                          {t.progress}%{durationText !== '—' ? ` · ${durationText}` : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="task-mobile-meta mono">{mobileMetaParts.join(' · ') || t.meta}</span>
                    )}
                    {t.status === 'failed' || t.status === 'timeout' ? (
                      <button className="btn btn-ghost btn-xs" onClick={(e) => handleRetry(e, t)}>
                        重试
                      </button>
                    ) : (
                      <span className={`task-row-link${t.status === 'completed' ? ' is-primary' : ''}`}>
                        {actionLabel}
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M4.5 2.8L7.7 6 4.5 9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="foot-note overview-foot-note">
        <span>实时同步任务队列 · 点击任务行可进入修复对比或成片下载</span>
      </div>
    </section>
  );
}
