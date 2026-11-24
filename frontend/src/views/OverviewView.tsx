import { useEffect, useState } from 'react';
import { api, triggerDownload } from '../api/client';
import type { DashboardOverview, TaskRow, WorkspaceViewId } from '../types';

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

export function OverviewView({ searchQuery, onNavigate, onToast, region }: Props) {
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadOverview() {
    try {
      const res = await api.getOverview(filter, searchQuery);
      setData(res);
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

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">任务总览</h1>
          <p className="page-subtitle">{data?.subtitle || '正在同步实时任务队列...'}</p>
        </div>
        <div className="head-right">
          <button
            className="btn btn-ghost"
            onClick={() => {
              triggerDownload('/api/tasks/export');
              onToast('已导出任务清单 cleanframe-tasks.csv');
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.8v7.4M4.1 6.6L7 9.5l2.9-2.9" stroke="#9AA3AE" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 11.4v1.1a.9.9 0 00.9.9h8.2a.9.9 0 00.9-.9v-1.1" stroke="#9AA3AE" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>导出任务清单</span>
          </button>
          <button className="btn btn-tonal" onClick={() => onNavigate('translate')}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="#7FEBC4" strokeWidth="1.4" />
              <path d="M2 8h12" stroke="#7FEBC4" strokeWidth="1.2" />
              <ellipse cx="8" cy="8" rx="2.8" ry="6" stroke="#7FEBC4" strokeWidth="1.2" />
            </svg>
            <span>新建翻译</span>
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate('inpaint')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2.4v9.2M2.4 7h9.2" stroke="#06231A" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span>新建修复任务</span>
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">今日已处理</span>
          <span className="kpi-value">{data?.kpis.processed_today || '4h 12m'}</span>
          <span className="kpi-note mint">{data?.kpis.processed_delta || '环比昨日 +18.4%'}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">任务成功率</span>
          <span className="kpi-value">{data?.kpis.success_rate || '98.2%'}</span>
          <span className="kpi-note">{data?.kpis.recent_count || '近 24 小时 412 个任务'}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">队列中</span>
          <span className="kpi-value">{data?.kpis.queued_count ?? '—'}</span>
          <span className="kpi-note amber">{data?.kpis.queue_eta || '预计 12 分钟清空'}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">本月费用</span>
          <span className="kpi-value">{data?.kpis.monthly_cost || '¥386.40'}</span>
          <span className="kpi-note">{data?.kpis.monthly_usage || '计费用量 412 分钟'}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head tall">
          <div className="panel-title-wrap">
            <span className="panel-title">最近任务</span>
            <span className="count-chip">{data ? data.tasks.length : 0}</span>
          </div>
          <div className="head-right">
            <div className="filter-seg">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              className="icon-btn"
              title="进入当前批次监控"
              onClick={() => onNavigate('monitor', { batchId: data?.active_batch_id || 'batch-b0412' })}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="3.4" cy="8" r="1.15" fill="#6E7885" />
                <circle cx="8" cy="8" r="1.15" fill="#6E7885" />
                <circle cx="12.6" cy="8" r="1.15" fill="#6E7885" />
              </svg>
            </button>
          </div>
        </div>

        <div className="task-table-head">
          <div>任务 / 文件</div>
          <div>方案</div>
          <div>状态</div>
          <div>进度</div>
          <div>计费用量</div>
          <div>提交时间</div>
          <div></div>
        </div>

        <div>
          {loading && !data ? (
            <div className="empty-state">正在加载任务数据...</div>
          ) : !data?.tasks.length ? (
            <div className="empty-state">当前筛选条件下暂无匹配任务</div>
          ) : (
            data.tasks.map((t) => {
              const barClass = t.status === 'running' ? 'blue' : t.status === 'completed' ? '' : 'dim';
              const barWidth = t.status === 'completed' ? 100 : t.status === 'running' ? t.progress : 4;
              const pctLabel =
                t.status === 'completed'
                  ? '100%'
                  : t.status === 'running'
                    ? `${t.progress}%`
                    : t.status === 'queued'
                      ? '排队'
                      : '—';

              return (
                <div
                  key={t.id}
                  className="task-row"
                  title={t.error_msg || '点击查看详情'}
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
                      <span className="file-meta">{t.meta}</span>
                    </div>
                  </div>
                  <div className="cell-stack">
                    <span className="scheme-main">{t.scheme}</span>
                    <span className="scheme-sub">{t.sub_scheme}</span>
                  </div>
                  <div>
                    <span className={`status-pill ${t.status}`}>
                      <span className="dot"></span>
                      {t.status_label}
                    </span>
                  </div>
                  <div className="progress-cell">
                    <div className="progress-track">
                      <div className={`progress-fill ${barClass}`} style={{ width: `${barWidth}%` }}></div>
                    </div>
                    <span className="progress-pct">{pctLabel}</span>
                  </div>
                  <div className="cell-mono">{t.usage}</div>
                  <div className="cell-time">{t.time}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {t.status === 'failed' || t.status === 'timeout' ? (
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ padding: '0 8px', height: 24, fontSize: 10 }}
                        onClick={(e) => handleRetry(e, t)}
                      >
                        重试
                      </button>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="3.4" cy="8" r="1.15" fill="#4C5560" />
                        <circle cx="8" cy="8" r="1.15" fill="#4C5560" />
                        <circle cx="12.6" cy="8" r="1.15" fill="#4C5560" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="foot-note">
        <span>数据实时轮询刷新 · 计费用量 = 输出时长 × 帧率系数 × 分辨率系数（点击任务行可查看监控或成片结果）</span>
        <span className="foot-note-right">las_video_inpaint_pro / las_video_translate · {region}</span>
      </div>
    </section>
  );
}
