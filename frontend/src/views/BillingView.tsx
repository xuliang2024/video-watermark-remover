import { useEffect, useState } from 'react';
import { api, triggerDownload } from '../api/client';
import type { BillingSummary } from '../types';

interface Props {
  onToast: (msg: string) => void;
}

export function BillingView({ onToast }: Props) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    api
      .getBillingSummary()
      .then(setSummary)
      .catch((err) => onToast(err.message || '加载账单失败'));
  }, []);

  return (
    <section className="view active">
      <div className="page-head">
        <div className="head-left">
          <h1 className="page-title">用量账单</h1>
          <p className="page-subtitle">
            按量计费、每小时出账；视频修复按输出折算分钟计费，视频翻译按输入时长 × 语种数计费
          </p>
        </div>
        <div className="head-right">
          <button
            className="btn btn-ghost"
            onClick={() => {
              triggerDownload('/api/billing/export');
              onToast('已导出对账单 cleanframe-billing-2026-11.csv');
            }}
          >
            导出本月对账单 (.csv)
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">本月总费用</span>
          <span className="kpi-value">¥{(summary?.total_cost ?? 386.4).toFixed(2)}</span>
          <span className="kpi-note">额度已用 {(summary?.quota_percent ?? 42.8).toFixed(1)}%</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">视频修复用量</span>
          <span className="kpi-value">{(summary?.inpaint_minutes ?? 248.6).toFixed(1)} 分</span>
          <span className="kpi-note mint">¥{(summary?.inpaint_cost ?? 248.4).toFixed(2)} · las_video_inpaint_pro</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">视频翻译用量</span>
          <span className="kpi-value">{(summary?.translate_minutes ?? 163.4).toFixed(1)} 分</span>
          <span className="kpi-note">¥{(summary?.translate_cost ?? 138.0).toFixed(2)} · 账单单元：视频智能剪辑</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">账号并发配额</span>
          <span className="kpi-value">{summary?.max_concurrency ?? 10} 并发</span>
          <span className="kpi-note">Submit / Poll 限流 {summary?.rpm_limit ?? 600} RPM</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">出账明细</span>
          <span className="panel-sub">{summary?.month || '2026 年 11 月'}</span>
        </div>
        <div className="bill-head">
          <div>出账时间</div>
          <div>批次 / 文件</div>
          <div>计费项</div>
          <div>单价</div>
          <div>计费用量</div>
          <div style={{ textAlign: 'right' }}>金额</div>
        </div>
        <div>
          {(summary?.records || []).map((b) => (
            <div className="bill-row" key={b.id}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
                {b.date}
              </span>
              <span style={{ color: 'var(--text-high)', fontWeight: 500 }}>{b.batch}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-body)' }}>{b.op}</span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>
                {b.unit}
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {b.usage}
              </span>
              <span className="mono" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--accent)', textAlign: 'right' }}>
                {b.cost}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
