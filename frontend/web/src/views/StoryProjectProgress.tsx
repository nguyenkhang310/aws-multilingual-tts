import { useEffect, useState } from 'react';
import type { StoryChapter } from '../../../shared/story';
import { storyBatchApi } from '../lib/story-batch-api';

const MAX_CHAPTERS = 50;
type Summary = { done: number; total: number };

export default function StoryProjectProgress({ chapters }: { chapters: StoryChapter[] }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setSummary(null); setError('');
    if (chapters.length > MAX_CHAPTERS) {
      setError('Truyện có hơn 50 chương; chưa thể tính đủ tiến độ trong một lượt.');
      return () => { active = false; };
    }
    async function load() {
      let done = 0;
      for (let start = 0; start < chapters.length; start += 4) {
        const batch = await Promise.all(chapters.slice(start, start + 4).map(async chapter => {
          const plans = await storyBatchApi.plans(chapter);
          const latest = plans.items[0];
          if (!latest) return false;
          const progress = await storyBatchApi.progress(chapter, latest.planId);
          return progress.total > 0 && progress.done === progress.total &&
            !progress.failed && !progress.uncertain && !progress.blockedQuota;
        }));
        done += batch.filter(Boolean).length;
        if (!active) return;
      }
      if (active) setSummary({ done, total: chapters.length });
    }
    void load().catch(() => { if (active) setError('Chưa tải đủ tiến độ audio. Hãy thử cập nhật lại.'); });
    return () => { active = false; };
  }, [chapters, revision]);

  const percent = summary?.total ? Math.round(summary.done * 100 / summary.total) : 0;
  const complete = !!summary?.total && summary.done === summary.total;
  return <div className="story-project-progress" aria-label="Tiến độ audio của truyện">
    <div className={`story-progress-ring${complete ? ' is-complete' : ''}`} role="progressbar" aria-valuenow={summary ? percent : undefined}
      aria-valuemin={0} aria-valuemax={100} aria-label="Chương có audio hoàn tất"
      style={{ background: `conic-gradient(${complete ? 'var(--story-complete)' : 'var(--blue)'} ${percent}%, var(--line) ${percent}%)` }}>
      <strong>{summary ? `${percent}%` : '–'}</strong>
    </div>
    <div><strong>Audio đã hoàn thành</strong><small>{error || (summary
      ? `${summary.done}/${summary.total} chương đã có audio đầy đủ.` : 'Đang tính tiến độ…')}</small>
      <button className="text-button" onClick={() => setRevision(value => value + 1)}>Cập nhật tiến độ</button></div>
  </div>;
}
