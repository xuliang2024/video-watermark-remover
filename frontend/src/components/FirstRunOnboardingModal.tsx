import { useState } from 'react';
import { BrandLogo } from './Icons';

interface Props {
  open: boolean;
  onGoToSettings: () => void;
  onSkipWithMock: () => Promise<void> | void;
}

export function FirstRunOnboardingModal({ open, onGoToSettings, onSkipWithMock }: Props) {
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSkip() {
    setSubmitting(true);
    try {
      await onSkipWithMock();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop open">
      <div className="modal-dialog onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-head">
          <div className="onboarding-brand-row">
            <div className="onboarding-logo-box">
              <BrandLogo size={26} />
            </div>
            <div className="onboarding-badge-group">
              <span className="onboarding-kicker mono">FIRST-RUN SETUP</span>
              <span className="plan-chip">首次上线配置</span>
            </div>
          </div>
          <h2 id="onboarding-title" className="onboarding-title">
            欢迎使用净影 CleanFrame，请先填写 5 项必填线上凭证
          </h2>
          <p className="onboarding-desc">
            前往「系统设置」补齐火山引擎 LAS 与 TOS 必填凭证并保存后，将自动写入
            <code className="inline-code">backend/.env</code> 并立即生效。
          </p>
        </div>

        <div className="onboarding-steps">
          <div className="onboarding-step-card">
            <span className="onboarding-step-num mono">01</span>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                LAS 算子凭证与地域
                <span className="field-badge-req">必填</span>
                <span className="env-key-chip mono">LAS_API_KEY</span>
                <span className="env-key-chip mono">LAS_REGION</span>
              </div>
              <p className="onboarding-step-sub">
                用于鉴权调用视频去水印（las_video_inpaint_pro）与多语视频翻译（las_video_translate）线上算子。
              </p>
            </div>
          </div>

          <div className="onboarding-step-card">
            <span className="onboarding-step-num mono">02</span>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                TOS 存储桶与访问密钥
                <span className="field-badge-req">必填</span>
                <span className="env-key-chip mono">TOS_BUCKET</span>
                <span className="env-key-chip mono">AK / SK</span>
              </div>
              <p className="onboarding-step-sub">
                需与 LAS 同主账号、同地域（如 cn-beijing），承载源视频直传与去水印/翻译成片输出。
              </p>
            </div>
          </div>

          <div className="onboarding-step-card">
            <span className="onboarding-step-num mono">03</span>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                并发调度与 Webhook 回调
                <span className="field-badge-opt">可选</span>
              </div>
              <p className="onboarding-step-sub">
                并发上限（默认 10）、轮询间隔（默认 3s）、公网域名与自定义端点均已内置默认值，可按需展开调整。
              </p>
            </div>
          </div>
        </div>

        <div className="onboarding-foot">
          <button className="btn btn-ghost" disabled={submitting} onClick={handleSkip}>
            {submitting ? '正在处理...' : '稍后再配置'}
          </button>
          <button className="btn btn-primary" disabled={submitting} onClick={onGoToSettings}>
            <span>前往「系统设置」填写必填凭证</span>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M2.6 6.5h7.8M7.1 3.2l3.3 3.3-3.3 3.3"
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
  );
}
