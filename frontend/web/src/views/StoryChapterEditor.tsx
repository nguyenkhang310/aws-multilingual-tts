import { useEffect, useRef, useState } from 'react';
import type { StoryChapter } from '../../../shared/story';
import { storyApi } from '../lib/story-api';
import { storyTranslationApi } from '../lib/story-translation-api';
import { readStoryFile } from '../lib/story-document';
import StoryAudio from './StoryAudio';
import StoryTranslation from './StoryTranslation';
import type { ApprovedTranslation } from '../../../shared/story-translation';
import FilePickerButton from '../components/FilePickerButton';
import Select from '../components/Select';
import { validChapterNumber } from '../../../shared/story-playback';
import { languageNames } from '../../../shared/languages';

export default function StoryChapterEditor({ chapter, projectLang, targetLang, onSaved, onClose, onDelete, onDirty, onBusy }: {
  chapter: StoryChapter; projectLang: string; targetLang?: string; onSaved: (item: StoryChapter) => void;
  onClose: () => void; onDelete: () => void; onDirty?: (value: boolean) => void; onBusy?: (value: boolean) => void;
}) {
  const [tab, setTab] = useState<'text' | 'translation' | 'audio'>(chapter.contentRevision ? 'audio' : 'text');
  const [translationDirty, setTranslationDirty] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  const [number, setNumber] = useState(chapter.chapterNumber);
  const [sourceLang, setSourceLang] = useState(chapter.sourceLang);
  const [showLanguage, setShowLanguage] = useState(chapter.sourceLang !== projectLang);
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const locked = useRef(false);
  const saved = useRef(chapter), initial = useRef(chapter);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState<ApprovedTranslation | null>(null);

  useEffect(() => {
    let active = true;
    const chapter = initial.current;
    saved.current = chapter;
    setLoading(true); setText(''); setError('');
    storyApi.source(chapter).then(source => {
      if (!active) return;
      setText(source); setOriginal(source);
      setTitle(chapter.title); setNumber(chapter.chapterNumber); setSourceLang(chapter.sourceLang);
      setLoading(false);
    }).catch(err => { if (active) { setError(err.message); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let live = true;
    void storyTranslationApi.approvedOrNull(chapter).then(value => { if (live) setApproved(value); }).catch(() => {});
    return () => { live = false; };
  }, [chapter.chapterId, chapter.revision]);

  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);

  async function save() {
    if (locked.current || loading || !title.trim() || !validChapterNumber(number)) return;
    if (text !== original && chapter.contentRevision && !window.confirm('Lưu nội dung mới và chia lại các đoạn của chương này?')) return;
    locked.current = true;
    setBusy(true); setError('');
    let current = saved.current;
    try {
      if (title !== current.title || number !== current.chapterNumber || sourceLang !== current.sourceLang) {
        current = await storyApi.updateChapter(current, { title, chapterNumber: number, sourceLang });
        saved.current = current;
      }
      if (text !== original) {
        current = await storyApi.saveText(current, text);
        saved.current = current;
      }
      setOriginal(text);
      onSaved(current);
    } catch (err) { setError(err instanceof Error ? err.message : 'Chưa lưu được chương.'); }
    finally { locked.current = false; setBusy(false); }
  }

  async function importFile(file?: File) {
    if (!file || locked.current || loading) return;
    locked.current = true;
    setBusy(true); setError('');
    try { setText(await readStoryFile(file, chapter.sourceLang)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Chưa đọc được tài liệu.'); }
    finally { locked.current = false; setBusy(false); }
  }

  const dirty = busy || loading || text !== original || title !== chapter.title || number !== chapter.chapterNumber || sourceLang !== chapter.sourceLang;
  const changed = text !== original || title !== chapter.title || number !== chapter.chapterNumber || sourceLang !== chapter.sourceLang || translationDirty;
  useEffect(() => {
    onDirty?.(changed);
    const warn = (event: BeforeUnloadEvent) => { if (changed) { event.preventDefault(); event.returnValue = ''; } };
    const leave = (event: Event) => { if (busy) { event.preventDefault(); return; } if (changed && !window.confirm('Bỏ thay đổi chưa lưu của chương này?')) event.preventDefault(); };
    window.addEventListener('tts:before-navigate', leave);
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('tts:before-navigate', leave); };
  }, [changed, busy, onDirty]);
  return <><h2 className="story-chapter-heading">{chapter.title}</h2><div className="story-editor-tabs" role="group" aria-label="Mục của chương">
    {(['audio', 'text', 'translation'] as const).map(value => <button key={value} className={tab === value ? 'active' : ''}
      aria-pressed={tab === value} disabled={(translationDirty && value !== tab) || (value !== 'text' && (dirty || !chapter.contentRevision))} onClick={() => setTab(value)}>
      {value === 'text' ? 'Nội dung' : value === 'translation' ? 'Bản dịch' : 'Nghe & tạo giọng'}</button>)}
  </div><section hidden={tab !== 'text'} className="surface story-panel story-editor" aria-label="Chỉnh chương">
    <div className="story-actions story-editor-heading"><h3>Nội dung chương</h3>
      <button className="story-danger" disabled={busy || loading} onClick={onDelete}>Xóa chương</button><button disabled={busy || loading} onClick={onClose}>Đóng</button></div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <div className="story-fields story-editor-fields">
      <label>Tên chương<input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
      <label>Số chương<input type="number" min={1} max={100000} value={number} onChange={event => setNumber(Number(event.target.value))} /></label>
    </div>
    <details className="story-language-override" open={showLanguage} onToggle={event => setShowLanguage(event.currentTarget.open)}>
      <summary>Thay đổi ngôn ngữ nguồn</summary>
      <div className="story-field"><span>Ngôn ngữ nguồn</span><Select label="Ngôn ngữ nguồn" value={sourceLang}
        onValueChange={setSourceLang} options={['vi-VN', 'en-US', 'ja-JP', 'ko-KR', 'cmn-CN', 'zh-TW']
          .map(value => ({ value, label: languageNames[value] }))} /></div>
    </details>
    <div className="story-actions story-editor-import"><span>Nhập tài liệu cho chương</span>
      <FilePickerButton label={busy ? 'Đang đọc…' : 'Nhập tệp'}
        accept=".txt,.md,.docx,.pdf,.jpg,.jpeg,.png,.webp" disabled={busy || loading}
        onFiles={files => { void importFile(files[0]); }} />
    </div>
    <label className="story-editor-content">Nội dung nguồn · {text.length.toLocaleString('vi-VN')} ký tự
      <textarea className="story-text" value={text} onChange={event => { if (event.target.value.includes('\0')) { setError('Nội dung chứa ký tự không hợp lệ.'); return; } setText(event.target.value); }}
        maxLength={1_000_000} spellCheck={false} aria-label="Nội dung chương" readOnly={busy || loading} />
    </label>
    <div className="story-actions story-editor-save"><button className="primary-button" disabled={busy || loading || !text.trim() || !title.trim() || !validChapterNumber(number)} onClick={() => void save()}>
      {busy || loading ? 'Đang xử lý…' : 'Lưu chương'}</button><span>{chapter.segmentCount} đoạn đã lưu</span></div>
  </section>
  {tab === 'translation' && targetLang && <StoryTranslation chapter={chapter} targetLang={targetLang} onApproved={setApproved} onEditing={setTranslationDirty} />}
  <section hidden={tab !== 'audio'} className="surface story-panel story-audio-workspace" aria-label="Audio chương">
    {tab === 'audio' && <StoryAudio chapter={chapter} targetLang={targetLang} approvedRevision={approved?.revision} dirty={dirty} />}
  </section></>;
}
