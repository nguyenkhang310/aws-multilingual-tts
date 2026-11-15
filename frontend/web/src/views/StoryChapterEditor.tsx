import { useEffect, useRef, useState } from 'react';
import type { StoryChapter, StorySegment } from '../../../shared/story';
import { storyApi } from '../lib/story-api';
import { readStoryFile } from '../lib/story-document';
import StoryAudio from './StoryAudio';
import StoryTranslation from './StoryTranslation';
import type { ApprovedTranslation } from '../../../shared/story-translation';
import FilePickerButton from '../components/FilePickerButton';
import Select from '../components/Select';
import { languageNames } from '../../../shared/languages';

function segmentPreview(text: string) {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  if (chars.length <= 100) return { start: chars.join(''), end: '' };
  const first = chars.slice(0, 48).join('');
  const last = chars.slice(-48).join('');
  return { start: (first.replace(/\s+\S*$/, '') || first) + '…',
    end: '…' + (last.replace(/^\S*\s+/, '') || last) };
}

export default function StoryChapterEditor({ chapter, projectLang, targetLang, onSaved, onClose, onDelete }: {
  chapter: StoryChapter; projectLang: string; targetLang?: string; onSaved: (item: StoryChapter) => void;
  onClose: () => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [number, setNumber] = useState(chapter.chapterNumber);
  const [sourceLang, setSourceLang] = useState(chapter.sourceLang);
  const [showLanguage, setShowLanguage] = useState(chapter.sourceLang !== projectLang);
  const [text, setText] = useState('');
  const [original, setOriginal] = useState('');
  const [segments, setSegments] = useState<StorySegment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const locked = useRef(false);
  const saved = useRef(chapter);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState<ApprovedTranslation | null>(null);

  useEffect(() => {
    let active = true;
    saved.current = chapter;
    setLoading(true); setText(''); setSegments([]); setCursor(null); setError('');
    Promise.all([storyApi.source(chapter), storyApi.segmentPage(chapter)]).then(([source, page]) => {
      if (!active) return;
      setText(source); setOriginal(source); setSegments(page.items); setCursor(page.nextCursor);
      setTitle(chapter.title); setNumber(chapter.chapterNumber); setSourceLang(chapter.sourceLang);
      setLoading(false);
    }).catch(err => { if (active) { setError(err.message); setLoading(false); } });
    return () => { active = false; };
  }, [chapter.chapterId, chapter.revision]);

  async function save() {
    if (locked.current || loading) return;
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

  async function more() {
    if (!cursor) return;
    setBusy(true); setError('');
    try {
      const page = await storyApi.segmentPage(chapter, cursor);
      setSegments(items => [...items, ...page.items]); setCursor(page.nextCursor);
    } catch (err) { setError(err instanceof Error ? err.message : 'Chưa tải được đoạn.'); }
    finally { setBusy(false); }
  }

  return <><section className="surface story-panel story-editor" aria-label="Chỉnh chương">
    <div className="story-actions story-editor-heading"><h3>Chỉnh chương · {chapter.chapterNumber}. {chapter.title}</h3>
      <button className="story-danger" onClick={onDelete}>Xóa chương</button><button onClick={onClose}>Đóng</button></div>
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
      <textarea className="story-text" value={text} onChange={event => setText(event.target.value)}
        maxLength={1_000_000} spellCheck={false} aria-label="Nội dung chương" readOnly={busy || loading} />
    </label>
    <div className="story-actions story-editor-save"><button className="primary-button" disabled={busy || loading || !text.trim()} onClick={() => void save()}>
      {busy || loading ? 'Đang xử lý…' : 'Lưu chương'}</button><span>{chapter.segmentCount} đoạn đã lưu</span></div>
  </section>
  {targetLang && <StoryTranslation chapter={chapter} targetLang={targetLang} onApproved={setApproved} />}
  <section className="surface story-panel story-audio-workspace" aria-label="Audio chương">
    <h2>Đoạn đã lưu theo thứ tự</h2>
    <ol className="story-segments">{segments.map(item => {
      const preview = segmentPreview(item.sourceText);
      return <li key={item.segmentId}>
        <div className="story-segment-meta"><strong>Đoạn {item.order + 1}</strong>
          <span>{item.textLength.toLocaleString('vi-VN')} ký tự</span></div>
        <p className="story-segment-preview"><span>{preview.start}</span>
          {preview.end && <><span className="story-segment-arrow" aria-hidden="true">→</span>
            <span>{preview.end}</span></>}</p>
      </li>;
    })}</ol>
    {cursor && <button disabled={busy} onClick={() => void more()}>Xem thêm đoạn</button>}
    <StoryAudio chapter={chapter} targetLang={targetLang} approvedRevision={approved?.revision} dirty={busy || loading || text !== original ||
      title !== chapter.title || number !== chapter.chapterNumber || sourceLang !== chapter.sourceLang} />
  </section></>;
}
