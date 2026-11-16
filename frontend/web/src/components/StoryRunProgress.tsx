import type { StoryPlan, StoryProgress } from '../../../shared/story';
import { expressionName } from '../../../shared/expression';
import { languageNames } from '../../../shared/languages';
import { Icon } from './ui';
import { useEffect, useState } from 'react';

export function confirmedProgress(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

const statusName: Record<string, string> = { DRAFT: 'Chưa chạy', RUNNING: 'Đang chạy', DONE: 'Đã hoàn tất',
  FAILED: 'Có lỗi', UNCERTAIN: 'Cần đối soát', BLOCKED_QUOTA: 'Đã chạm giới hạn', STALE: 'Nội dung đã đổi',
  COMPLETED: 'Đã hoàn tất', PAUSING: 'Đang dừng cấp đoạn mới', PAUSED: 'Đã tạm dừng',
  NEEDS_ATTENTION: 'Cần kiểm tra', QUEUED: 'Đang chờ', SUBMITTING: 'Đang gửi',
  SUBMITTED: 'Đã gửi', PROCESSING: 'Đang xử lý' };
const itemError = (code?: string | null) => code === 'GEMINI_TTS_QUOTA'
  ? 'Gemini đang giới hạn lượt hoặc hết quota. Thử lại sau, hoặc tạo kế hoạch mới bằng Azure Speech.'
  : code || 'Lỗi tạm thời';
const recoveryName: Record<string, string> = {
  PLAN_STALE: 'Chương đã thay đổi. Hãy tạo kế hoạch audio mới.',
  WORKER_EVENT_FAILED: 'Kết quả worker chưa xác định. Hệ thống không tự gửi lại để tránh tạo job hoặc tính phí trùng.',
  WORKER_REDRIVE_UNCERTAIN: 'Chưa xác nhận được lượt worker. Cần kiểm tra trước khi tiếp tục.',
  HEADLESS_DISABLED: 'Điều phối tự động đang tắt. Có thể bật STORY_HEADLESS_ENABLED sau khi xác minh quyền Sandbox.',
};
const planDate = (value: string) => new Intl.DateTimeFormat('vi-VN',
  { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export default function StoryRunProgress({ plan, progress, plans, voiceLabel, busy, hasCursor,
  onSelectPlan, onNext, onTop, currentId, playing, onPlay, onPause, onResume, onRetry }: {
  plan: StoryPlan; progress: StoryProgress; plans: StoryPlan[]; chapterNumber: number; voiceLabel: string;
  busy: boolean; hasCursor: boolean; onSelectPlan: (id: string) => void; onNext: () => void; onTop: () => void;
  currentId: string | null; playing: boolean; onPlay: (index: number) => void;
  onPause: () => void; onResume: () => void; onRetry: (segmentId: string) => void;
}) {
  const [now, setNow] = useState(Date.now);
  const shownPercent = confirmedProgress(progress.percentComplete);
  useEffect(() => {
    const times = progress.items.filter(item => item.retryable && (item.nextRetryAt || 0) * 1000 > now).map(item => item.nextRetryAt! * 1000);
    if (!times.length) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(...times) - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [progress, now]);
  const counts = [
    ['Đang xử lý', (progress.processing || 0) + (progress.submitted || 0) + (progress.claimed || 0)],
    ['Đang chờ', progress.queued || 0], ['Lỗi', progress.failed || 0],
    ['Giới hạn', progress.blockedQuota || 0], ['Chưa rõ', progress.uncertain || 0],
  ] as const;
  const providerQuotaFailed = progress.items.some(item => item.errorCode === 'GEMINI_TTS_QUOTA');
  return <div className="story-run-panel">
    <div className="story-plan-brief"><strong>{plan.total} đoạn · {plan.totalChars.toLocaleString('vi-VN')} ký tự</strong>
      <span>{plan.provider === 'gemini' ? 'Gemini TTS' : 'Azure Speech'} · {voiceLabel}</span>
      <details className="story-plan-details"><summary>Chi tiết giọng và bản dịch</summary>
        <p>{plan.translateTo ? `${languageNames[plan.language] || plan.language} → ${languageNames[plan.translateTo] || plan.translateTo}`
          : languageNames[plan.language] || plan.language} · tốc độ {plan.speed}× · {expressionName(plan.style)} · cường độ {plan.styleIntensity}×</p>
      </details>
    </div>
    {plan.provider === 'gemini' && <div className="story-estimates">
      <div><small>Ước tính tối thiểu</small><strong>{plan.providerCallsEstimate ?? 0} lượt Gemini TTS</strong></div>
      <div><small>Còn lại hôm nay</small><strong>{progress.providerCallsRemainingEstimate ?? '—'} lượt</strong></div>
    </div>}
    {plans.length > 1 && <details className="story-saved-plans"><summary>Các lần tạo trước ({plans.length})</summary>
      <select aria-label="Chọn lần tạo audio" value={plan.planId} disabled={busy} onChange={event => onSelectPlan(event.target.value)}>
        {plans.map(item => <option key={item.planId} value={item.planId}>{planDate(item.createdAt)} · {item.provider} · {item.total} đoạn</option>)}
      </select></details>}
    <div className="story-run-state">
      <div className="story-run-heading"><span className={`story-status story-status-${progress.status.toLowerCase()}`}>
        {statusName[progress.status] || progress.status}</span><strong>{progress.done}/{progress.total} đoạn hoàn tất</strong>
        <span>{Math.round(shownPercent)}%</span></div>
      <progress value={shownPercent} max={100} aria-label="Tiến độ audio chương"
        aria-valuetext={`${Math.round(shownPercent)} phần trăm`} />
      <div className="story-run-counts">{counts.filter(([, value]) => value > 0).map(([label, value]) => <span key={label}><strong>{value}</strong>{label}</span>)}</div>
      {progress.status === 'RUNNING' && <button type="button" className="story-pause-button" disabled={busy} onClick={onPause}>Tạm dừng</button>}
      {progress.status === 'PAUSING' && <p role="status">Đang chờ lượt đã được cấp hoàn tất; chưa hủy job đang chạy.</p>}
      {progress.recoveryReason && <p role="status">{recoveryName[progress.recoveryReason] || progress.recoveryReason}</p>}
      {['PAUSED', 'BLOCKED_QUOTA', 'NEEDS_ATTENTION'].includes(progress.status) && !providerQuotaFailed && progress.uncertain === 0 &&
        (progress.queued + progress.blockedQuota + progress.submitted + progress.processing + progress.claimed > 0) &&
        <button type="button" disabled={busy} onClick={onResume}>Tiếp tục</button>}
      {progress.uncertain > 0 && <p role="status">Có đoạn chưa xác định được kết quả. Cần đối soát trước khi gửi lại.</p>}
      <ol className="story-audio-items">{progress.items.map(item => <li key={item.segmentId}>
        <div className="story-audio-item-heading"><strong>Đoạn {item.index + 1}</strong>
          <span className={`story-status story-status-${item.status.toLowerCase()}`}>{statusName[item.status] || item.status}</span></div>
        {item.status === 'DONE' && item.audioUrl && item.jobId && <button type="button" className="story-listen-button" disabled={busy}
          aria-label={`${currentId === item.jobId && playing ? 'Tạm dừng' : 'Nghe'} đoạn ${item.index + 1}`}
          aria-pressed={currentId === item.jobId && playing} onClick={() => onPlay(item.index)}>
          <Icon name={currentId === item.jobId && playing ? 'pause' : 'play'} size={17} />
          {currentId === item.jobId && playing ? 'Đang phát' : 'Nghe'}</button>}
        {item.status === 'FAILED' && !item.retryable && <small>{item.errorCode === 'GEMINI_TTS_QUOTA'
          ? itemError(item.errorCode) : `Không thể tự thử lại · ${item.errorCode || 'cần kiểm tra cấu hình'}`}</small>}
        {item.status === 'UNCERTAIN' && <small>Cần đối soát trạng thái trước khi gửi lại.</small>}
        {item.status === 'FAILED' && item.retryable && <div>
          <small>{itemError(item.errorCode)} · lần thử {item.attemptCount || 1}/{progress.maxAttempts || 3}
            {item.nextRetryAt ? ` · thử lại sau ${planDate(new Date(item.nextRetryAt * 1000).toISOString())}` : ''}</small>
          <button type="button" disabled={busy || (item.nextRetryAt || 0) * 1000 > now ||
            (item.attemptCount || 0) >= (progress.maxAttempts || 3)} onClick={() => onRetry(item.segmentId)}>Thử lại đoạn này</button>
        </div>}
      </li>)}</ol>
    {(progress.nextCursor || hasCursor) && <div className="story-audio-pagination">
      {progress.nextCursor && <button type="button" disabled={busy} onClick={onNext}>Xem đoạn tiếp</button>}
      {hasCursor && <button type="button" disabled={busy} onClick={onTop}>Về đầu</button>}
    </div>}
    </div>
  </div>;
}
