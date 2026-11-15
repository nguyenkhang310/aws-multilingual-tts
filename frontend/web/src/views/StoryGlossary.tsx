import { useEffect, useState } from 'react';
import type { StoryGlossary as Glossary } from '../../../shared/story-translation';
import { storyTranslationApi } from '../lib/story-translation-api';

export default function StoryGlossary({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState<Glossary | null>(null);
  const [entries, setEntries] = useState<Glossary['entries']>([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    storyTranslationApi.glossary(projectId).then(value => {
      if (live) { setSaved(value); setEntries(value.entries); }
    }).catch(err => { if (live) setError(err instanceof Error ? err.message : 'Chưa tải được thuật ngữ.'); });
    return () => { live = false; };
  }, [projectId]);
  async function save() {
    if (!saved || busy) return;
    setBusy(true); setError('');
    try {
      const value = await storyTranslationApi.saveGlossary(projectId, { revision: saved.revision, entries });
      setSaved(value); setEntries(value.entries);
    } catch (err) { setError(err instanceof Error ? err.message : 'Chưa lưu được thuật ngữ.'); }
    finally { setBusy(false); }
  }
  return <details className="story-glossary"><summary>Thuật ngữ và tên riêng</summary>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p>Để trống nếu không cần cố định tên hoặc thuật ngữ.</p>
    {entries.map((item, index) => <div className="story-glossary-row" key={index}>
      <input aria-label={`Nguyên văn ${index + 1}`} value={item.source} maxLength={80}
        onChange={event => setEntries(current => current.map((entry, n) => n === index
          ? { ...entry, source: event.target.value } : entry))} />
      <input aria-label={`Bản dịch ${index + 1}`} value={item.target} maxLength={120}
        onChange={event => setEntries(current => current.map((entry, n) => n === index
          ? { ...entry, target: event.target.value } : entry))} />
      <button disabled={busy} onClick={() => setEntries(current => current.filter((_, n) => n !== index))}>Xóa</button>
    </div>)}
    <div className="story-glossary-row"><input placeholder="Nguyên văn" aria-label="Thêm nguyên văn" value={source}
      onChange={event => setSource(event.target.value)} />
      <input placeholder="Bản dịch mong muốn" aria-label="Thêm bản dịch" value={target}
        onChange={event => setTarget(event.target.value)} />
      <button disabled={!source.trim() || !target.trim() || busy} onClick={() => {
        setEntries(current => [...current, { source: source.trim(), target: target.trim() }]);
        setSource(''); setTarget('');
      }}>Thêm</button></div>
    <button className="primary-button" disabled={busy || !saved} onClick={() => void save()}>Lưu thuật ngữ</button>
  </details>;
}
