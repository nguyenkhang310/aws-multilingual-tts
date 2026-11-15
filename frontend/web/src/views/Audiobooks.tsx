import { useEffect, useRef, useState } from 'react';
import type { StoryChapter, StoryProject } from '../../../shared/story';
import { checkedBackup, checkedStoryCoverType } from '../../../shared/story';
import { storyApi } from '../lib/story-api';
import StoryChapterEditor from './StoryChapterEditor';
import StoryImport from './StoryImport';
import FilePickerButton from '../components/FilePickerButton';
import Select from '../components/Select';
import { languageNames } from '../../../shared/languages';
import StoryProjectProgress from './StoryProjectProgress';
import StoryGlossary from './StoryGlossary';
import StoryTranslationBatch from './StoryTranslationBatch';
import { Icon } from '../components/ui';

const languages = ['vi-VN', 'en-US', 'ja-JP', 'ko-KR', 'cmn-CN'];
const message = (error: unknown) => error instanceof Error ? error.message : 'Chưa hoàn tất thao tác.';
const language = (code: string) => code === 'und' ? 'Chờ xác nhận ngôn ngữ' : languageNames[code] || code;
const languageOptions = languages.map(value => ({ value, label: language(value) }));
const noop = () => {};
const dateOnly = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa rõ ngày cập nhật' : new Intl.DateTimeFormat('vi-VN',
    { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export default function Audiobooks({ onChaptersChange = noop, onProjectChange = noop, selectedChapterId = null, onChapterChange = noop }: {
  onChaptersChange?: (chapters: StoryChapter[]) => void;
  onProjectChange?: (title: string | null) => void;
  selectedChapterId?: string | null;
  onChapterChange?: (id: string | null) => void;
}) {
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [chapterDirty, setChapterDirty] = useState(false);
  const [chapter, setChapter] = useState<StoryChapter | null>(null);
  const [title, setTitle] = useState('');
  const [sourceLang, setSourceLang] = useState('vi-VN');
  const [targetLang, setTargetLang] = useState('vi-VN');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterNumber, setChapterNumber] = useState(1);
  const [createCover, setCreateCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const refreshedCovers = useRef(new Set<string>());
  const coverRefreshes = useRef(new Map<string, Promise<void>>());
  const [unavailableCovers, setUnavailableCovers] = useState(new Set<string>());
  const [error, setError] = useState('');

  useEffect(() => { onProjectChange(project?.title ?? null); }, [project?.title, onProjectChange]);
  useEffect(() => {
    const target = editor.current;
    const container = target?.closest<HTMLElement>('.route-view');
    if (!chapter || !target || !container) return;
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    const reduced = document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }, [chapter?.chapterId]);
  useEffect(() => () => onProjectChange(null), [onProjectChange]);

  async function reloadProjects() { setProjects(await storyApi.projects()); }
  async function reloadChapters(id: string) {
    const [details, items] = await Promise.all([storyApi.project(id), storyApi.chapters(id)]);
    setProject(details); setChapters(items); onChaptersChange(items);
  }
  useEffect(() => {
    if (!selectedChapterId || selectedChapterId === chapter?.chapterId) return;
    if (chapterDirty && !window.confirm('Bỏ thay đổi chưa lưu của chương này?')) { onChapterChange(chapter?.chapterId ?? null); return; }
    setChapter(chapters.find(item => item.chapterId === selectedChapterId) ?? null); setChapterDirty(false);
  }, [selectedChapterId, chapters, chapter?.chapterId, chapterDirty, onChapterChange]);
  function selectChapter(item: StoryChapter | null, force = false) {
    if (!force && chapterDirty && !window.confirm('Bỏ thay đổi chưa lưu của chương này?')) return false;
    setChapter(item); setChapterDirty(false); onChapterChange(item?.chapterId ?? null); return true;
  }
  useEffect(() => { void reloadProjects().catch(err => setError(message(err))); }, []);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(message(err)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function open(item: StoryProject) {
    if (!selectChapter(null)) return;
    setChapters([]); onChaptersChange([]); setProject(item);
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
  function uploadCover(item: StoryProject, file: File) {
    void run(async () => {
      const updated = await storyApi.uploadCover(item, file);
      setProject(updated);
      await reloadProjects();
    });
  }
  function exported(backup: unknown, name: string) {
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    if (blob.size > 20 * 1024 * 1024) throw new Error('Backup vượt 20 MB; cần chia dự án thành các dự án nhỏ trước khi xuất.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="story-layout">
    <section hidden={!!project} className="surface story-panel">
      <div className="story-actions"><h2>Truyện của bạn</h2>
        <small className="story-note">Lưu backup trước khi kết thúc Lab.</small></div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <details className="story-create"><summary>Thêm truyện</summary>
      <div className="story-fields">
        <label>Tên truyện<input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
        <div className="story-field"><span>Ngôn ngữ gốc</span>
          <Select label="Ngôn ngữ gốc" value={sourceLang} onValueChange={setSourceLang}
            options={[{ value: 'auto', label: 'Tự nhận diện khi nhập chương' }, ...languageOptions]} /></div>
        <div className="story-field"><span>Ngôn ngữ đích</span>
          <Select label="Ngôn ngữ đích" value={targetLang} onValueChange={setTargetLang} options={languageOptions} /></div>
        <div className="story-cover-select"><span>Ảnh bìa (không bắt buộc)</span>
          <FilePickerButton label={createCover ? 'Chọn ảnh khác' : 'Chọn ảnh bìa'} accept="image/jpeg,image/png"
            disabled={busy} onFiles={files => {
              const file = files[0];
              if (!file) return;
              try { checkedStoryCoverType(file.type, file.size); setCreateCover(file); setError(''); }
              catch (err) { setCreateCover(null); setError(message(err)); }
            }} />
          {createCover && <small>{createCover.name} · {(createCover.size / 1024 / 1024).toFixed(1)} MiB</small>}
          <small>JPEG hoặc PNG, tối đa 5 MiB.</small>
        </div>
      </div>
      <div className="story-actions"><button className="primary-button" disabled={busy || !title.trim()} onClick={() => void run(async () => {
        const selectedCover = createCover;
        const item = await storyApi.createProject(title, sourceLang === 'auto' ? 'und' : sourceLang, targetLang);
        setTitle(''); setCreateCover(null); await reloadProjects(); await open(item);
        if (selectedCover) {
          try { setProject(await storyApi.uploadCover(item, selectedCover)); await reloadProjects(); }
          catch (err) { setError(`Dự án đã tạo nhưng chưa lưu được ảnh bìa: ${message(err)}`); }
        }
      })}>Tạo truyện</button></div>
      </details>
    <div className="story-restore" aria-label="Khôi phục dự án">
      <strong>Khôi phục backup</strong>
        <FilePickerButton label="Chọn file backup" accept=".json,application/json" disabled={busy} onFiles={files => {
          const file = files[0];
          if (!file) return;
          void run(async () => {
            if (file.size > 20 * 1024 * 1024) throw new Error('Backup tối đa 20 MB.');
            const backup = checkedBackup(JSON.parse(await file.text()));
            try {
              const imported = await storyApi.importProject(backup);
              await open(imported);
            } finally { await reloadProjects(); }
          });
        }} />
    </div>
      <ul className="story-list story-project-list">{projects.map(item => <li key={item.projectId}>
        <div className="story-project-card"><div className="story-cover-thumb">
          {item.cover && !unavailableCovers.has(`${item.projectId}:${item.cover.updatedAt}`)
            ? <img src={item.cover.url} alt={`Ảnh bìa ${item.title}`} onError={() => void refreshCover(item)} />
            : <Icon name="book" size={23} />}
        </div><button aria-expanded={project?.projectId === item.projectId}
          onClick={() => void run(() => open(item))}><strong>{item.title}</strong>
          <span className="story-project-subtitle">{language(item.sourceLang)} → {language(item.targetLang)} · {dateOnly(item.updatedAt)}</span></button></div>
      </li>)}</ul>
    </section>
    {project && <section className="surface story-panel">
      <div className="story-actions"><h2>{project.title}</h2><button onClick={() => { if (!selectChapter(null)) return; setProject(null); onChaptersChange([]); }}>Truyện của bạn</button></div>
      <StoryProjectProgress chapters={chapters} />
      <details className="story-project-settings"><summary>Tùy chọn truyện</summary>
      <div className="story-cover-detail"><div className="story-cover-large">
        {project.cover && !unavailableCovers.has(`${project.projectId}:${project.cover.updatedAt}`)
          ? <img src={project.cover.url} alt={`Ảnh bìa ${project.title}`} onError={() => void refreshCover(project)} />
          : <Icon name="book" size={30} />}
      </div><div><strong>Ảnh bìa</strong><small>JPEG hoặc PNG · tối đa 5 MiB</small>
        <FilePickerButton label={project.cover ? 'Thay ảnh bìa' : 'Thêm ảnh bìa'} accept="image/jpeg,image/png"
          disabled={busy} onFiles={files => { if (files[0]) uploadCover(project, files[0]); }} />
        {project.cover && <button className="secondary-button story-danger" disabled={busy} onClick={() => void run(async () => {
          if (!window.confirm('Xóa ảnh bìa của dự án này?')) return;
          const updated = await storyApi.deleteCover(project); setProject(updated); await reloadProjects();
        })}>Xóa ảnh bìa</button>}
      </div></div>
      <StoryGlossary key={project.projectId} projectId={project.projectId} />
      <StoryTranslationBatch key={project.projectId} project={project} chapters={chapters} />
      <div className="story-actions story-project-actions">
        <button className="secondary-button" disabled={busy} onClick={() => void run(async () => {
          const name = window.prompt('Tên truyện mới', project.title);
          if (!name || name === project.title) return;
          const updated = await storyApi.renameProject(project, name);
          setProject(updated); await reloadProjects();
        })}>Đổi tên</button>
        <button className="secondary-button" disabled={busy} onClick={() => void run(async () => {
          if (project.cover && !window.confirm('Ảnh bìa không nằm trong file backup. Sau khi nhập backup, bạn cần tải lại ảnh bìa. Tiếp tục xuất?')) return;
          const backup = await storyApi.exportProject(project);
          exported(backup, `audiobook-${project.projectId}.json`);
        })}>Xuất backup</button>
        <button className="secondary-button story-danger" disabled={busy} onClick={() => void run(async () => {
          if (!window.confirm(`Xóa dự án “${project.title}” khỏi danh sách?`)) return;
          await storyApi.deleteProject(project); setProject(null); selectChapter(null, true); onChaptersChange([]); await reloadProjects();
        })}>Xóa dự án</button>
      </div>
      </details>
      <details className="story-create"><summary>Thêm chương trống</summary>
      <div className="story-fields">
        <label>Số chương<input type="number" min={1} max={100000} value={chapterNumber}
          onChange={event => setChapterNumber(Number(event.target.value))} /></label>
        <label>Tên chương<input value={chapterTitle} maxLength={120} onChange={event => setChapterTitle(event.target.value)} /></label>
      </div>
      {project.sourceLang === 'und' && <small>Nhập chương đầu tiên để xác nhận ngôn ngữ trước khi thêm chương thủ công.</small>}
      <button className="primary-button" disabled={busy || project.sourceLang === 'und' || !chapterTitle.trim() || chapterNumber < 1}
        onClick={() => void run(async () => {
          const created = await storyApi.createChapter(project.projectId, chapterNumber, chapterTitle);
          setChapterTitle(''); setChapterNumber(chapterNumber + 1);
          await reloadChapters(project.projectId); selectChapter(created);
        })}>Thêm chương</button>
      </details>
      <StoryImport project={project} onProjectUpdated={updated => {
        setProject(updated); void reloadProjects().catch(err => setError(message(err)));
      }} onImportStart={() => selectChapter(null)} onImported={created => {
        if (created) selectChapter(created);
        void reloadChapters(project.projectId).catch(err => setError(message(err)));
      }} />
    </section>}
    {project && chapter && <div ref={editor} className="story-chapter-workspace"><StoryChapterEditor key={chapter.chapterId} chapter={chapter}
      projectLang={project.sourceLang} targetLang={project.targetLang} onDirty={setChapterDirty}
      onClose={() => selectChapter(null)}
      onDelete={() => void run(async () => {
        if (!window.confirm(`Xóa chương “${chapter.title}”?`)) return;
        await storyApi.deleteChapter(chapter); selectChapter(null, true); await reloadChapters(project.projectId);
      })}
      onSaved={updated => { setChapter(updated); void reloadChapters(project.projectId).catch(err => setError(message(err))); }} /></div>}
  </div>;
}
