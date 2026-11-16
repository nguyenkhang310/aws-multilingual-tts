import { useEffect, useRef, useState } from 'react';
import type { StoryChapter, StoryProject } from '../../../shared/story';
import { readStoryFile } from '../lib/story-document';
import { storyApi } from '../lib/story-api';
import FilePickerButton from '../components/FilePickerButton';
import Select from '../components/Select';
import { languageNames } from '../../../shared/languages';
import { Icon } from '../components/ui';
import { validChapterNumber } from '../../../shared/story-playback';
import { detectLanguage, type LanguageDetection } from '../lib/language-detection';

type Draft = { name: string; title: string; number: number; order: number; text: string;
  key: string; chapter?: StoryChapter };

const languageOptions = ['vi-VN', 'en-US', 'ja-JP', 'ko-KR', 'cmn-CN', 'zh-TW']
  .map(value => ({ value, label: languageNames[value] }));

export default function StoryImport({ project, onImported, onImportStart, onProjectUpdated, onBusy, onDirty }: {
  project: StoryProject; onImported: (chapter?: StoryChapter, complete?: boolean) => void;
  onBusy?: (value: boolean) => void; onDirty?: (value: boolean) => void;
  onImportStart?: () => void; onProjectUpdated: (item: StoryProject) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [draftLang, setDraftLang] = useState(project.sourceLang === 'und' ? '' : project.sourceLang);
  const [confirmed, setConfirmed] = useState(project.sourceLang !== 'und');
  const [detected, setDetected] = useState<LanguageDetection | null>(null);
  const currentProject = useRef(project);
  const detectionRevision = useRef(0);
  useEffect(() => {
    detectionRevision.current++;
    currentProject.current = project;
    setDraftLang(project.sourceLang === 'und' ? '' : project.sourceLang);
    setConfirmed(project.sourceLang !== 'und');
  }, [project.projectId, project.sourceLang]);

  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);
  useEffect(() => { onDirty?.(drafts.length > 0); return () => onDirty?.(false); }, [drafts.length, onDirty]);
  const invalid = drafts.some(d => !d.title.trim() || !validChapterNumber(d.number) || !Number.isInteger(d.order) || d.order < 0 || d.order > 100000);

  async function redetect(text: string) {
    const revision = ++detectionRevision.current;
    let found: LanguageDetection;
    try { found = await detectLanguage(text); }
    catch { if (revision === detectionRevision.current) setError('Chưa tải được bộ nhận diện. Hãy chọn ngôn ngữ thủ công.'); return; }
    if (revision !== detectionRevision.current) return;
    setDetected(found);
    setDraftLang(found.status === 'detected' ? found.language || '' : '');
    setConfirmed(false);
  }

  async function select(files: File[]) {
    if (!files.length || locked.current) return;
    if (files.length > 10) { setError('Mỗi lần chọn tối đa 10 file chương.'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      const result: Draft[] = [];
      for (const file of files) {
        setProgress(`Đang đọc ${file.name}…`);
        const name = file.name.replace(/\.[^.]+$/, '');
        const match = name.match(/(?:ch(?:apter|uong|ương)?\s*[-_. ]*)?(\d{1,5})/i);
        const number = match ? Number(match[1]) : result.length + 1;
        result.push({ name: file.name, title: name.slice(0, 120), number, key: crypto.randomUUID(),
          order: number, text: await readStoryFile(file, project.sourceLang === 'und' ? 'vi-VN' : project.sourceLang) });
      }
      if (currentProject.current.sourceLang === 'und') await redetect(result[0].text);
      setDrafts(result); setProgress('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Chưa đọc được file.'); }
    finally { locked.current = false; setBusy(false); setProgress(''); }
  }

  function edit(index: number, change: Partial<Draft>) {
    setDrafts(items => items.map((item, at) => at === index ? { ...item, ...change } : item));
  }

  async function saveAll() {
    if (locked.current || !confirmed || !draftLang || invalid) return;
    locked.current = true; setBusy(true); setError('');
    let completed = 0;
    let firstSaved: StoryChapter | undefined;
    onImportStart?.();
    try {
      if (currentProject.current.sourceLang === 'und') {
        const updated = await storyApi.updateProjectLanguage(currentProject.current, draftLang);
        currentProject.current = updated; onProjectUpdated(updated);
      }
      for (let index = 0; index < drafts.length; index++) {
        const draft = drafts[index];
        setProgress(`Đang lưu ${index + 1}/${drafts.length}: ${draft.title}`);
        let chapter = draft.chapter ?? await storyApi.createChapter(project.projectId, draft.number, draft.title,
          draftLang === currentProject.current.sourceLang ? undefined : draftLang, draft.key);
        setDrafts(items => items.map((item, at) => at === index ? { ...item, chapter } : item));
        if (draft.order !== chapter.order) {
          chapter = await storyApi.updateChapter(chapter, { order: draft.order });
          setDrafts(items => items.map((item, at) => at === index ? { ...item, chapter } : item));
        }
        const saved = await storyApi.saveText(chapter, draft.text);
        completed++;
        firstSaved ??= saved;
      }
      setDrafts([]); setProgress('Đã lưu các chương.');
      onImported(firstSaved, true);
    } catch (err) {
      setError(`Chưa lưu chương ${completed + 1}/${drafts.length}: ${err instanceof Error ? err.message : 'Chưa lưu được.'} Các chương trước đó đã lưu được giữ lại.`);
      setDrafts(items => items.slice(completed));
      onImported(undefined, false);
    } finally { locked.current = false; setBusy(false); }
  }

  return <section className="story-import" aria-label="Nhập nhiều chương">
    <div className={`story-file-picker ${drafts.length ? 'compact' : ''}`}>
      <Icon name="upload" size={30} />
      <FilePickerButton label={busy ? 'Đang đọc…' : drafts.length ? 'Chọn lại tệp' : 'Chọn tài liệu'} multiple
        accept=".txt,.md,.docx,.pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onFiles={files => { void select(files); }} />
      <small>PDF, Word, TXT, ảnh · 50 MiB/tệp · tối đa 10 tệp</small>
    </div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    {progress && <p role="status">{progress}</p>}
    {!!drafts.length && <div className="story-field story-import-language"><span>Ngôn ngữ</span>
      <Select label="Ngôn ngữ chương" value={draftLang} onValueChange={value => { detectionRevision.current++; setDraftLang(value); setConfirmed(false); }}
        disabled={busy} options={[{ value: '', label: 'Chọn ngôn ngữ' }, ...languageOptions]} />
      {detected && <small role="status">{detected.status === 'detected'
        ? `Dự đoán: ${languageNames[detected.language || ''] || detected.language}. Hãy xác nhận.`
        : 'Chưa nhận diện chắc chắn. Hãy chọn ngôn ngữ thủ công.'}</small>}
      {!confirmed && <button type="button" className="secondary-button" disabled={!draftLang || busy} onClick={() => setConfirmed(true)}>Xác nhận ngôn ngữ</button>}
    </div>}
    {!!drafts.length && <div className="story-import-drafts">{drafts.map((draft, index) => <details className="story-draft" open={drafts.length === 1} key={`${draft.name}-${index}`}>
      <summary><strong>Chương {String(draft.number).padStart(2, '0')} · {draft.title || 'Chưa đặt tên'}</strong></summary>
      <div className="story-draft-content"><small>{draft.name} · {draft.text.length.toLocaleString('vi-VN')} ký tự</small>
        <div className="story-fields">
          <label>Tên chương<input disabled={busy} maxLength={120} value={draft.title} onChange={event => edit(index, { title: event.target.value })} /></label>
          <label>Số chương<input disabled={busy} type="number" min={1} max={100000} value={draft.number}
            onChange={event => edit(index, { number: Number(event.target.value) })} /></label>
          <label>Thứ tự<input disabled={busy} type="number" min={0} max={100000} value={draft.order}
            onChange={event => edit(index, { order: Number(event.target.value) })} /></label>
        </div>
        <details className="story-draft-preview"><summary>Xem nội dung</summary>
          <p className="story-preview">{draft.text.slice(0, 1000)}</p></details>
      </div>
    </details>)}</div>}
    {invalid && <p role="alert" className="inline-error">Nhập tên chương, số nguyên 1–100.000 và thứ tự 0–100.000.</p>}
    {!!drafts.length && <button type="button" className="primary-button" disabled={busy || !confirmed || invalid}
      onClick={() => void saveAll()}>{busy ? 'Đang lưu…' : `Lưu ${drafts.length} chương`}</button>}
  </section>;
}
