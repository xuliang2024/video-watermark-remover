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
              <span className="plan-chip">首次启动引导</span>
            </div>
          </div>
          <h2 id="onboarding-title" className="onboarding-title">
            欢迎使用净影 CleanFrame，请先完成系统环境配置
          </h2>
          <p className="onboarding-desc">
            检测到系统首次启动，尚未配置运行所需的火山引擎环境变量。前往「系统设置」填入凭证并保存后，将自动持久化写入
            <code className="inline-code">backend/.env</code> 并实时生效。
          </p>
        </div>

        <div className="onboarding-steps">
          <div className="onboarding-step-card">
            <span className="onboarding-step-num mono">01</span>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                火山引擎 LAS 算子凭证
                <span className="env-key-chip mono">LAS_API_KEY</span>
              </div>
              <p className="onboarding-step-sub">
                用于鉴权调用视频去水印（las_video_inpaint_pro）与多语视频翻译（las_video_translate）异步算子。
              </p>
            </div>
          </div>

          <div className="onboarding-step-card">
            <span className="onboarding-step-num mono">02</span>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                TOS 对象存储桶与访问密钥
                <span className="env-key-chip mono">TOS_BUCKET</span>
                <span className="env-key-chip mono">VOLC_ACCESS_KEY_ID</span>
              </div>
              <p className="onboarding-step-sub">
                需与 LAS 同主账号、同地域（如 cn-beijing），承载源视频分片上传与修复/多语成片输出。
              </p>
            </div>
          </div>

          <div className="onboarding-step-card">
            <span className="onboarding-step-num mono">03</span>
            <div className="onboarding-step-body">
              <div className="onboarding-step-title">
                并发调度、回调与存储参数
                <span className="env-key-chip mono">CLEANFRAME_MAX_CONCURRENCY</span>
              </div>
              <p className="onboarding-step-sub">
                支持自定义并发上限（默认 10）、轮询周期、Webhook 回调地址、月度预算配额及数据库路径。
              </p>
            </div>
          </div>
        </div>

        <div className="onboarding-foot">
          <button className="btn btn-ghost" disabled={submitting} onClick={handleSkip}>
            {submitting ? '正在初始化...' : '先以本地仿真模式体验（稍后设置）'}
          </button>
          <button className="btn btn-primary" disabled={submitting} onClick={onGoToSettings}>
            <span>前往「系统设置」配置环境变量</span>
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
