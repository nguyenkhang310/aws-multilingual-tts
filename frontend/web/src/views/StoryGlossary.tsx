import { useEffect, useState } from 'react';
import type { StoryGlossary as Glossary } from '../../../shared/story-translation';
import { storyTranslationApi } from '../lib/story-translation-api';

export default function StoryGlossary({ projectId, onBusy, onDirty }: { projectId: string; onBusy?: (value: boolean) => void; onDirty?: (value: boolean) => void }) {
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
  const dirty = !!source.trim() || !!target.trim() || JSON.stringify(entries) !== JSON.stringify(saved?.entries ?? []);
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  async function save() {
    if (!saved || busy) return;
    setBusy(true); setError('');
    try {
      const value = await storyTranslationApi.saveGlossary(projectId, { revision: saved.revision, entries });
      setSaved(value); setEntries(value.entries);
    } catch (err) { setError(err instanceof Error ? err.message : 'Chưa lưu được thuật ngữ.'); }
    finally { setBusy(false); }
  }
  return <section className="story-glossary" aria-label="Tên riêng và thuật ngữ">
    {error && <p className="inline-error" role="alert">{error}</p>}
    {entries.map((item, index) => <div className="story-glossary-row" key={index}>
      <input disabled={busy} aria-label={`Nguyên văn ${index + 1}`} value={item.source} maxLength={80}
        onChange={event => setEntries(current => current.map((entry, n) => n === index
          ? { ...entry, source: event.target.value } : entry))} />
      <input disabled={busy} aria-label={`Bản dịch ${index + 1}`} value={item.target} maxLength={120}
        onChange={event => setEntries(current => current.map((entry, n) => n === index
          ? { ...entry, target: event.target.value } : entry))} />
      <button type="button" disabled={busy} onClick={() => setEntries(current => current.filter((_, n) => n !== index))}>Xóa</button>
    </div>)}
    <div className="story-glossary-row"><input disabled={busy} placeholder="Nguyên văn" aria-label="Thêm nguyên văn" maxLength={80} value={source}
      onChange={event => setSource(event.target.value)} />
      <input disabled={busy} placeholder="Bản dịch mong muốn" aria-label="Thêm bản dịch" maxLength={120} value={target}
        onChange={event => setTarget(event.target.value)} />
      <button type="button" disabled={!source.trim() || !target.trim() || busy || entries.length >= 200} onClick={() => {
        setEntries(current => [...current.filter(item => item.source !== source.trim()), { source: source.trim(), target: target.trim() }]);
        setSource(''); setTarget('');
      }}>Thêm</button></div>
    <button type="button" className="primary-button" disabled={busy || !saved || !!source.trim() || !!target.trim() || entries.some(item => !item.source.trim() || !item.target.trim())} onClick={() => void save()}>Lưu thuật ngữ</button>
  </section>;
}
