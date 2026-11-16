import { useEffect, useRef, useState } from 'react';
import type { StoryChapter, StoryProject } from '../../../shared/story';
import { checkedBackup, checkedStoryCoverType, MAX_STORY_BACKUP_BYTES, serializeStoryBackup } from '../../../shared/story';
import { storyApi } from '../lib/story-api';
import StoryChapterEditor from './StoryChapterEditor';
import StoryImport from './StoryImport';
import FilePickerButton from '../components/FilePickerButton';
import Select from '../components/Select';
import { validChapterNumber } from '../../../shared/story-playback';
import { languageNames } from '../../../shared/languages';
import StoryGlossary from './StoryGlossary';
import StoryTranslationBatch from './StoryTranslationBatch';
import { Icon, Modal } from '../components/ui';

const languages = ['vi-VN', 'en-US', 'ja-JP', 'ko-KR', 'cmn-CN'];
const message = (error: unknown) => error instanceof Error ? error.message : 'Chưa hoàn tất thao tác.';
const language = (code: string) => code === 'und' ? 'Chờ xác nhận ngôn ngữ' : languageNames[code] || code;
const languageOptions = languages.map(value => ({ value, label: language(value) }));


export default function Audiobooks() {
  const [panel, setPanel] = useState<'new' | 'settings' | 'import' | 'chapter' | 'glossary' | 'translate' | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogBusy, setDialogBusy] = useState(false), [dialogDirty, setDialogDirty] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [chapterDirty, setChapterDirty] = useState(false);
  const [chapter, setChapter] = useState<StoryChapter | null>(null);
  const [title, setTitle] = useState('');
  const [renameTitle, setRenameTitle] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [sourceLang, setSourceLang] = useState('vi-VN');
  const [targetLang, setTargetLang] = useState('vi-VN');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterNumber, setChapterNumber] = useState(1);
  const [createCover, setCreateCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const activeProject = useRef<string | null>(null);
  const request = useRef(0), listRequest = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; request.current++; listRequest.current++; return () => { mounted.current = false; }; }, []);
  const refreshedCovers = useRef(new Set<string>());
  const coverRefreshes = useRef(new Map<string, Promise<void>>());
  const [unavailableCovers, setUnavailableCovers] = useState(new Set<string>());
  const [error, setError] = useState('');

  async function reloadProjects() {
    const version = ++listRequest.current;
    const items = await storyApi.projects();
    if (mounted.current && version === listRequest.current) setProjects(items);
  }
  async function reloadChapters(id: string) {
    const version = ++request.current;
    const [details, items] = await Promise.all([storyApi.project(id), storyApi.chapters(id)]);
    if (!mounted.current || version !== request.current || activeProject.current !== id) return;
    setProject(details); setChapters(items);
  }
  function selectChapter(item: StoryChapter | null, force = false) {
    if (chapterBusy) return false;
    if (!force && chapterDirty && !window.confirm('Bỏ thay đổi chưa lưu của chương này?')) return false;
    setChapter(item); setChapterDirty(false); return true;
  }
  useEffect(() => { void reloadProjects().catch(err => setError(message(err))).finally(() => setLoading(false)); }, []);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(message(err)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function open(item: StoryProject) {
    if (!mounted.current || !selectChapter(null)) return;
    activeProject.current = item.projectId;
    setChapters([]); setProject(item);
    await reloadChapters(item.projectId);
  }
  async function refreshCover(item: StoryProject) {
    if (!item.cover) return;
    const key = `${item.projectId}:${item.cover.updatedAt}`;
    const pending = coverRefreshes.current.get(key);
    if (pending) return pending;
    if (refreshedCovers.current.has(key)) {
      setUnavailableCovers(current => new Set(current).add(key));
      return;
    }
    refreshedCovers.current.add(key);
    const refresh = storyApi.refreshCover(item.projectId).then(cover => {
      setProjects(current => current.map(row => row.projectId === item.projectId ? { ...row, cover } : row));
      setProject(current => current?.projectId === item.projectId ? { ...current, cover } : current);
    }).catch(() => { setUnavailableCovers(current => new Set(current).add(key)); })
      .finally(() => coverRefreshes.current.delete(key));
    coverRefreshes.current.set(key, refresh);
    return refresh;
  }
  function leaveProject() {
    activeProject.current = null; request.current++; setProject(null);
  }
  const panelDirty = dialogDirty || (panel === 'new' && (!!title.trim() || !!createCover)) ||
    (panel === 'chapter' && !!chapterTitle.trim()) ||
    (panel === 'settings' && renameOpen && !!renameTitle.trim() && renameTitle.trim() !== project?.title);
  useEffect(() => {
    const leave = (event: Event) => {
      if (busy || dialogBusy) { event.preventDefault(); return; }
      if (panelDirty && !window.confirm('Bỏ thay đổi chưa lưu?')) event.preventDefault();
    };
    window.addEventListener('tts:before-navigate', leave);
    return () => window.removeEventListener('tts:before-navigate', leave);
  }, [busy, dialogBusy, panelDirty]);
  function uploadCover(item: StoryProject, file: File) {
    void run(async () => {
      const updated = await storyApi.uploadCover(item, file);
      setProject(updated);
      await reloadProjects();
    });
  }
  function exported(backup: unknown, name: string) {
    const blob = new Blob([serializeStoryBackup(backup)], { type: 'application/json' });
    if (blob.size > MAX_STORY_BACKUP_BYTES) throw new Error('Backup vượt giới hạn nên chưa được xuất.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function cover(item: StoryProject, large = false) {
    return <div className={`story-book-cover ${large ? 'large' : ''}`}>
      {item.cover && !unavailableCovers.has(`${item.projectId}:${item.cover.updatedAt}`)
        ? <img src={item.cover.url} alt={`Bìa ${item.title}`} onError={() => void refreshCover(item)} />
        : <><Icon name="book" size={large ? 42 : 32} /><span>{item.title}</span></>}
    </div>;
  }
  const filtered = projects.filter(item => item.title.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')));
  return <div className="story-layout" aria-busy={busy || loading}>
    {error && <div role="alert" className="inline-error">{error}<button type="button" disabled={busy} onClick={() => void run(() => project ? reloadChapters(project.projectId) : reloadProjects())}>Tải lại</button></div>}
    {!project ? <>
      <header className="story-library-header">
        <div><h2>Thư viện truyện</h2><span>{projects.length} truyện</span></div>
        <button type="button" className="primary-button" disabled={busy} onClick={() => setPanel('new')}><Icon name="plus" size={18} />Thêm truyện</button>
      </header>
      <div className="story-library-tools"><label className="story-search"><Icon name="search" size={18} />
        <input aria-label="Tìm truyện" placeholder="Tìm truyện" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <FilePickerButton label="Nhập bản sao lưu" accept=".json,application/json" disabled={busy} onFiles={files => {
          const file = files[0]; if (!file) return;
          void run(async () => { if (file.size > MAX_STORY_BACKUP_BYTES) throw new Error('Bản sao lưu tối đa 20 MiB.');
            const backup = checkedBackup(JSON.parse(await file.text()));
            try { await open(await storyApi.importProject(backup)); } finally { await reloadProjects(); }
          });
        }} />
      </div>
      {loading ? <p role="status" className="story-note">Đang tải thư viện…</p> : filtered.length ? <ul className="story-bookshelf">{filtered.map(item => <li key={item.projectId}>
        <button type="button" className="story-book" disabled={busy} onClick={() => void run(() => open(item))}>
          {cover(item)}<strong>{item.title}</strong><span>{item.chapterCount} chương · {language(item.sourceLang)}</span>
        </button></li>)}</ul> : <div className="story-empty"><Icon name="book" size={42} /><h3>{query ? 'Không tìm thấy truyện' : 'Chưa có truyện'}</h3>
          {!query && <button type="button" onClick={() => setPanel('new')}>Thêm truyện đầu tiên</button>}</div>}
      <small className="story-note">Lưu bản sao trước khi kết thúc Lab.</small>
    </> : chapter ? <>
      <div className="story-detail-nav"><button type="button" disabled={chapterBusy} onClick={() => selectChapter(null)}><Icon name="chevron" size={15} />{project.title}</button>
        <span>Chương {chapter.chapterNumber}</span></div>
      <StoryChapterEditor key={chapter.chapterId} chapter={chapter} projectLang={project.sourceLang} targetLang={project.targetLang}
        onDirty={setChapterDirty} onBusy={setChapterBusy} onClose={() => selectChapter(null)}
        onDelete={() => void run(async () => { if (!window.confirm(`Xóa chương “${chapter.title}”?`)) return;
          await storyApi.deleteChapter(chapter); selectChapter(null, true); await reloadChapters(project.projectId); })}
        onSaved={updated => { setChapter(updated); void reloadChapters(project.projectId).catch(err => setError(message(err))); }} />
    </> : <>
      <div className="story-detail-nav"><button type="button" onClick={leaveProject}><Icon name="chevron" size={15} />Thư viện truyện</button>
        <button type="button" aria-label="Tùy chọn truyện" onClick={() => setPanel('settings')}><Icon name="settings" size={19} /></button></div>
      <header className="story-book-heading">{cover(project, true)}<div>
        <h2>{project.title}</h2>
        <p>{chapters.length} chương · {language(project.sourceLang)}</p>
        <div className="story-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => setPanel('import')}><Icon name="upload" size={18} />Nhập chương</button>
          <button type="button" className="secondary-button" disabled={busy || project.sourceLang === 'und'} onClick={() => {
            setChapterTitle(''); setChapterNumber(Math.max(0, ...chapters.map(item => item.chapterNumber)) + 1); setPanel('chapter');
          }}>Viết chương</button></div>
      </div></header>
      <div className="story-section-heading"><h3>Danh sách chương</h3><button type="button" aria-label="Làm mới chương" disabled={busy} onClick={() => void run(() => reloadChapters(project.projectId))}><Icon name="repeat" size={18} /></button></div>
      {chapters.length ? <ol className="story-chapters">{chapters.map(item => <li key={item.chapterId}>
        <button type="button" onClick={() => selectChapter(item)}><span className="story-chapter-number">{String(item.chapterNumber).padStart(2, '0')}</span>
          <span className="story-chapter-title"><strong>{item.title}</strong><small>{item.textLength ? `${item.textLength.toLocaleString('vi-VN')} ký tự` : 'Chưa có nội dung'}</small></span>
          <Icon name="chevron" size={18} /></button>
      </li>)}</ol> : <div className="story-empty"><Icon name="book" size={34} /><h3>Chưa có chương</h3></div>}
    </>}
    {panel && <Modal className="story-dialog" title={{ new: 'Thêm truyện', settings: 'Tùy chọn truyện', import: 'Nhập chương', chapter: 'Viết chương', glossary: 'Tên riêng và thuật ngữ', translate: 'Dịch nhiều chương' }[panel]}
      dismissible={!busy && !dialogBusy} onClose={() => {
        if (panelDirty && !window.confirm('Bỏ thay đổi chưa lưu?')) return;
        setRenameOpen(false); setPanel(null);
      }}><div className="story-dialog-body">
      {error && <p role="alert" className="inline-error">{error}</p>}
      {panel === 'new' && <form className="story-form" onSubmit={event => { event.preventDefault(); if (!title.trim()) return;
        void run(async () => {
          const selectedCover = createCover;
          const item = await storyApi.createProject(title.trim(), sourceLang === 'auto' ? 'und' : sourceLang, targetLang);
          setTitle(''); setCreateCover(null); setPanel(null); await reloadProjects(); await open(item);
          if (selectedCover) { try { const updated = await storyApi.uploadCover(item, selectedCover);
              setProject(current => current?.projectId === item.projectId ? updated : current); await reloadProjects(); }
            catch (err) { setError(`Truyện đã tạo. Chưa lưu được ảnh bìa: ${message(err)}`); } }
        });
      }}><label>Tên truyện<input autoFocus required value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
        <div className="story-field"><span>Ngôn ngữ gốc</span><Select label="Ngôn ngữ gốc" value={sourceLang} onValueChange={setSourceLang} options={[{ value: 'auto', label: 'Tự nhận diện' }, ...languageOptions]} /></div>
        <div className="story-field"><span>Ngôn ngữ bản dịch</span><Select label="Ngôn ngữ bản dịch" value={targetLang} onValueChange={setTargetLang} options={languageOptions} /></div>
        <FilePickerButton label={createCover ? createCover.name : 'Thêm ảnh bìa'} accept="image/jpeg,image/png" disabled={busy} onFiles={files => {
          const file = files[0]; if (!file) return; try { checkedStoryCoverType(file.type, file.size); setCreateCover(file); setError(''); } catch (err) { setError(message(err)); }
        }} /><small>Ảnh JPEG/PNG · tối đa 5 MiB</small>
        <button type="submit" className="primary-button" disabled={busy || !title.trim()}>Tạo truyện</button>
      </form>}
      {project && panel === 'chapter' && <form className="story-form" onSubmit={event => { event.preventDefault();
        if (!chapterTitle.trim() || !validChapterNumber(chapterNumber)) return;
        void run(async () => { const created = await storyApi.createChapter(project.projectId, chapterNumber, chapterTitle.trim());
          await reloadChapters(project.projectId); selectChapter(created); setPanel(null); });
      }}><label>Tên chương<input autoFocus required value={chapterTitle} maxLength={120} onChange={event => setChapterTitle(event.target.value)} /></label>
        <label>Số chương<input required type="number" min={1} max={100000} step={1} value={chapterNumber || ''} onChange={event => setChapterNumber(Number(event.target.value))} /></label>
        <button type="submit" className="primary-button" disabled={busy || !chapterTitle.trim() || !validChapterNumber(chapterNumber)}>Thêm chương</button></form>}
      {project && panel === 'import' && <StoryImport project={project} onBusy={setDialogBusy} onDirty={setDialogDirty} onProjectUpdated={setProject} onImportStart={() => true}
        onImported={(created, complete) => { if (complete) { setPanel(null); if (created) selectChapter(created); } void reloadChapters(project.projectId).catch(err => setError(message(err))); }} />}
      {project && panel === 'glossary' && <StoryGlossary projectId={project.projectId} onBusy={setDialogBusy} onDirty={setDialogDirty} />}
      {project && panel === 'translate' && <StoryTranslationBatch project={project} chapters={chapters} onBusy={setDialogBusy} />}
      {project && panel === 'settings' && <div className="story-form">
        <div className="story-cover-detail">{cover(project)}<FilePickerButton label="Đổi ảnh bìa" accept="image/jpeg,image/png" disabled={busy} onFiles={files => { if (files[0]) uploadCover(project, files[0]); }} /></div>
        {project.cover && <button type="button" disabled={busy} onClick={() => void run(async () => { setProject(await storyApi.deleteCover(project)); await reloadProjects(); })}>Xóa ảnh bìa</button>}
        {!renameOpen ? <button type="button" disabled={busy} onClick={() => { setRenameTitle(project.title); setRenameOpen(true); }}>Đổi tên truyện</button> :
          <form className="story-form" aria-label="Đổi tên truyện" onSubmit={event => { event.preventDefault();
            const name = renameTitle.trim(); if (!name || name === project.title) { setRenameOpen(false); return; }
            void run(async () => { const updated = await storyApi.renameProject(project, name);
              setProject(updated); setRenameOpen(false); await reloadProjects(); });
          }}><label>Tên truyện<input autoFocus required maxLength={120} value={renameTitle}
              onChange={event => setRenameTitle(event.target.value)} /></label>
            <div className="story-actions"><button type="submit" className="primary-button" disabled={busy || !renameTitle.trim()}>Lưu tên</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => setRenameOpen(false)}>Hủy</button></div>
          </form>}
        <button type="button" onClick={() => { setRenameOpen(false); setPanel('translate'); }}>Dịch nhiều chương</button><button type="button" onClick={() => { setRenameOpen(false); setPanel('glossary'); }}>Tên riêng và thuật ngữ</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => { exported(await storyApi.exportProject(project), `audiobook-${project.projectId}.json`); })}>Xuất bản sao lưu</button>
        <small>Bản sao gồm nội dung, glossary và draft dịch đã lưu; không gồm ảnh bìa hoặc MP3.</small>
        <button type="button" className="story-danger" disabled={busy} onClick={() => void run(async () => { if (!window.confirm(`Xóa truyện “${project.title}”?`)) return;
          await storyApi.deleteProject(project); leaveProject(); setPanel(null); selectChapter(null, true); await reloadProjects(); })}>Xóa truyện</button>
      </div>}
    </div></Modal>}
  </div>;
}
