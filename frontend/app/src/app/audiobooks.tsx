import { useEffect, useRef, useState } from 'react';
import { strFromU8 } from 'fflate';
import { usePreventRemove } from 'expo-router';
import { ActivityIndicator, Alert, Image, Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Page } from '../components/layout';
import { Action, Circle, Icon, Label, SearchField } from '../components/ui';
import Sheet from '../components/Sheet';
import StoryChapter from '../components/StoryChapter';
import PlaybackBar from '../components/PlaybackBar';
import { BlurScene } from '../components/BlurScene';
import StoryGlossary from '../components/StoryGlossary';
import StoryTranslationBatch from '../components/StoryTranslationBatch';
import { StoryError, StoryInput, StoryChoices, storyStyles as styles, useStoryAction } from '../components/StoryControls';
import { useStudio } from '../state/Studio';
import { storyApi } from '../lib/story-api';
import { readStoryAsset, shareStoryBackup } from '../lib/story-files';
import { checkedBackup, checkedStoryCoverType, type StoryChapter as Chapter, type StoryProject } from '../../../shared/story';
import { useLayout } from '../hooks/useLayout';
import { languageNames } from '../../../shared/languages';

const languageLabel = (code: string) => code === 'und' ? 'Tự nhận diện' : languageNames[code] ?? code;
export default function Audiobooks() {
  const { preferences } = useStudio();
  return <BlurScene><AudiobooksSession key={preferences.demoToken} /></BlurScene>;
}
function AudiobooksSession() {
  const { colors, allLanguages } = useStudio();
  const { contentWidth, fontScale } = useLayout();
  const [query, setQuery] = useState('');
  const columns = fontScale > 1.5 ? 1 : Math.max(2, Math.floor(Math.min(contentWidth, 968) / 180));
  const bookWidth = (Math.min(contentWidth, 968) - 18 * (columns - 1)) / columns;
  const [visibleCount, setVisibleCount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<StoryProject[]>([]), [project, setProject] = useState<StoryProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]), [selected, setSelected] = useState<Chapter | null>(null);
  const [sheet, setSheet] = useState<'new' | 'project' | 'delete' | 'glossary' | 'chapter' | 'translate' | null>(null);
  const [childBusy, setChildBusy] = useState(false), [childDirty, setChildDirty] = useState(false);
  const [languageSheet, setLanguageSheet] = useState<'source' | 'target' | null>(null);
  const [title, setTitle] = useState(''), [chapterTitle, setChapterTitle] = useState('');
  const [sourceLang, setSourceLang] = useState('und'), [targetLang, setTargetLang] = useState('vi-VN');
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [brokenCovers, setBrokenCovers] = useState(new Set<string>());
  const refreshed = useRef(new Set<string>());
  const activeProject = useRef<string | null>(null), request = useRef(0), listRequest = useRef(0), mounted = useRef(true);
  const [editorSession, setEditorSession] = useState(0);
  useEffect(() => { mounted.current = true; request.current++; listRequest.current++; return () => { mounted.current = false; }; }, []);
  const { busy, error, setError, run } = useStoryAction();
  useEffect(() => {
    let live = true;
    void storyApi.projects().then(items => { if (live) setProjects(items); })
      .catch(error => { if (live) setError(error.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [setError]);
  async function reload(item?: StoryProject) {
    const listVersion = ++listRequest.current;
    const version = item ? ++request.current : 0;
    const [list, details] = await Promise.all([storyApi.projects(), item
      ? Promise.all([storyApi.project(item.projectId), storyApi.chapters(item.projectId)]) : null]);
    if (!mounted.current) return;
    if (listVersion === listRequest.current) setProjects(list);
    if (item && details && version === request.current && activeProject.current === item.projectId) {
      setProject(details[0]); setChapters(details[1]);
    }
  }
  async function open(item: StoryProject) {
    const version = ++request.current;
    activeProject.current = item.projectId;
    setProject(item); setChapters([]); setSelected(null); setCoverAsset(null); setVisibleCount(50);
    const [saved, list] = await Promise.all([storyApi.project(item.projectId), storyApi.chapters(item.projectId)]);
    if (mounted.current && version === request.current && activeProject.current === item.projectId) {
      setProject(saved); setChapters(list);
    }
  }
  function selectChapter(item: Chapter) {
    setEditorSession(value => value + 1); setSelected(item);
  }
  function leaveProject() {
    activeProject.current = null; request.current++; setProject(null); setVisibleCount(50);
  }
  const panelDirty = childDirty || !!coverAsset || (sheet === 'new' && !!title.trim()) ||
    (sheet === 'project' && title !== project?.title) || (sheet === 'chapter' && !!chapterTitle.trim());
  function dismissPanel() { setSheet(null); setCoverAsset(null); setLanguageSheet(null); }
  function closePanel() {
    if (busy || childBusy) return;
    if (languageSheet) { setLanguageSheet(null); return; }
    if (!panelDirty) { dismissPanel(); return; }
    if (Platform.OS === 'web') { if (window.confirm('Bỏ thay đổi chưa lưu?')) dismissPanel(); }
    else Alert.alert('Chưa lưu thay đổi', 'Bỏ các thay đổi này?', [{ text: 'Giữ lại', style: 'cancel' },
      { text: 'Bỏ thay đổi', style: 'destructive', onPress: dismissPanel }]);
  }
  usePreventRemove(!selected && (!!project || !!sheet), () => {
    if (sheet) closePanel(); else leaveProject();
  });
  async function chooseCover() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const info = asset.fileSize || Platform.OS === 'web' ? null : await FileSystem.getInfoAsync(asset.uri);
    const fileSize = asset.fileSize ?? asset.file?.size ?? (info && 'size' in info ? info.size : 0);
    const type = asset.mimeType || (/\.png$/i.test(asset.fileName || '') ? 'image/png' : 'image/jpeg');
    checkedStoryCoverType(type, fileSize); setCoverAsset({ ...asset, fileSize, mimeType: type });
  }
  async function refreshCover(item: StoryProject) {
    const key = `${item.projectId}:${item.cover?.updatedAt}`;
    if (refreshed.current.has(key)) { setBrokenCovers(current => new Set(current).add(key)); return; }
    refreshed.current.add(key);
    try {
      const cover = await storyApi.refreshCover(item.projectId);
      setProjects(items => items.map(row => row.projectId === item.projectId ? { ...row, cover } : row));
      setProject(current => current?.projectId === item.projectId ? { ...current, cover } : current);
    } catch { setBrokenCovers(current => new Set(current).add(key)); }
  }
  function cover(item: StoryProject, width = bookWidth) {
    return <View style={{ width, height: width * 4 / 3, flexShrink: 0, borderRadius: 16, overflow: 'hidden', backgroundColor: '#153e5c',
      boxShadow: '0 8px 18px rgba(6,20,27,0.14)' }}>
      {item.cover && !brokenCovers.has(`${item.projectId}:${item.cover.updatedAt}`)
        ? <Image accessibilityLabel={`Bìa ${item.title}`} source={{ uri: item.cover.url }} resizeMode="cover" onError={() => void refreshCover(item)} style={{ width: '100%', height: '100%' }} />
        : <View style={{ flex: 1, padding: width < 130 ? 12 : 18, justifyContent: width < 130 ? 'center' : 'space-between', alignItems: width < 130 ? 'center' : undefined }}><Icon name="book" color="#d8efff" size={28} />
          {width >= 130 && <Label size={21} weight="600" lines={4} style={{ color: '#e8f6ff', lineHeight: 26 }}>{item.title}</Label>}</View>}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 4, width: 4, backgroundColor: '#00000020' }} />
    </View>;
  }
  async function restore() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const bytes = await readStoryAsset(result.assets[0]);
    if (bytes.length > 20 * 1024 * 1024) throw new Error('Backup tối đa 20 MiB.');
    const saved = await storyApi.importProject(checkedBackup(JSON.parse(strFromU8(bytes))));
    await reload(); await open(saved);
  }
  const languages = [...new Set(['vi-VN', 'en-US', 'ja-JP', 'ko-KR', 'cmn-CN', 'zh-TW', ...allLanguages.map(item => item.lang)])];
  if (project && selected) return <StoryChapter key={`${project.projectId}/${editorSession}`} project={project} chapter={selected}
      close={() => { setSelected(null); void run(() => reload(project)); }} onSaved={item => { setSelected(item); setChapters(items => [...items.filter(row => row.chapterId !== item.chapterId), item].sort((a, b) => a.order - b.order)); }}
      onProject={setProject} />;
  return <Page title="Audio Truyện" blurTarget close onClose={project ? leaveProject : undefined} footer={<View style={{ paddingHorizontal: 16, paddingBottom: 6 }}><PlaybackBar /></View>}>
    <StoryError text={error} />
    {!project ? <>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><View style={{ gap: 4 }}><Label size={27} weight="700">Thư viện truyện</Label><Label muted size={13}>{projects.length} truyện</Label></View>
        <Circle name="plus" label="Thêm truyện" disabled={busy} onPress={() => { setTitle(''); setCoverAsset(null); setSheet('new'); }} /></View>
      <SearchField label="Tìm truyện" placeholder="Tìm truyện" value={query} onChange={setQuery} />
      {loading && <ActivityIndicator color={colors.blue} />}
      {!loading && !error && !projects.length && <View style={{ paddingVertical: 40, alignItems: 'center', gap: 16 }}><Icon name="book" size={40} color={colors.secondary} /><Label muted>Chưa có truyện</Label><Action onPress={() => setSheet('new')}>Thêm truyện đầu tiên</Action></View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, columnGap: 18 }}>
        {projects.filter(item => item.title.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))).slice(0, visibleCount).map(item =>
          <Pressable key={item.projectId} accessibilityRole="button" accessibilityLabel={`Mở truyện ${item.title}`} disabled={busy} onPress={() => void run(() => open(item))}
            style={({ pressed }) => ({ width: bookWidth, gap: 8, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            {cover(item)}<Label size={16} weight="600" lines={2}>{item.title}</Label><Label size={12} muted>{item.chapterCount} chương · {languageLabel(item.sourceLang)}</Label>
          </Pressable>)}
      </View>
      {query && !projects.some(item => item.title.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))) && <Label muted>Không tìm thấy truyện</Label>}
      {projects.length > visibleCount && <Action onPress={() => setVisibleCount(count => count + 50)}>Xem thêm truyện</Action>}
      <Action icon="upload" disabled={busy} onPress={() => void run(restore)}>Nhập bản sao lưu</Action>
      <Label muted size={12}>Lưu bản sao trước khi kết thúc Lab.</Label>
    </> : <>
      <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center', paddingVertical: 12 }}>{cover(project, contentWidth < 360 ? 90 : 120)}
        <View style={{ flex: 1, minWidth: 0, gap: 12 }}><Label size={28} weight="700">{project.title}</Label>
          <Label muted size={13}>{chapters.length} chương · {languageLabel(project.sourceLang)}</Label>
          <Action icon="settings" disabled={busy} onPress={() => { setTitle(project.title); setCoverAsset(null); setSheet('project'); }}>Tùy chọn</Action></View></View>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label size={21} weight="600">Chương ({chapters.length})</Label>
        <View style={styles.row}><Circle name="repeat" label="Làm mới chương" disabled={busy} onPress={() => void run(() => reload(project))} /><Circle name="plus" label="Thêm chương" disabled={busy} onPress={() => { setChapterTitle(''); setSheet('chapter'); }} /></View></View>
      {!!chapters.length && <View style={{ minWidth: 0 }}>
        {chapters.slice(0, visibleCount).map((item, index) => <Pressable key={item.chapterId} accessibilityRole="button" accessibilityLabel={`${item.chapterNumber}. ${item.title}`} disabled={busy}
          onPress={() => selectChapter(item)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 18,
            borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, backgroundColor: pressed ? colors.raised : 'transparent' })}>
          <Label muted size={14}>{item.chapterNumber}</Label><View style={{ flex: 1, gap: 4 }}><Label weight="600">{item.title}</Label><Label size={12} muted>{item.textLength ? `${item.textLength.toLocaleString('vi-VN')} ký tự` : 'Chưa có nội dung'}</Label></View><Icon name="next" size={16} color={colors.secondary} />
        </Pressable>)}
      </View>}
      {!chapters.length && <Label muted>Thêm chương để nhập nội dung.</Label>}
      {chapters.length > visibleCount && <Action onPress={() => setVisibleCount(count => count + 50)}>Xem thêm chương</Action>}
    </>}
    <Sheet title={languageSheet ? languageSheet === 'source' ? 'Ngôn ngữ gốc' : 'Ngôn ngữ bản dịch' : ({ new: 'Thêm truyện', project: 'Tùy chọn truyện', chapter: 'Thêm chương', glossary: 'Tên riêng và thuật ngữ', translate: 'Dịch nhiều chương', delete: 'Xóa truyện' } as const)[sheet ?? 'new']}
      visible={!!sheet} close={closePanel}>
      {(sheet === 'new' || sheet === 'project') && <>
      {languageSheet ? <StoryChoices search value={languageSheet === 'source' ? sourceLang : targetLang}
        items={(languageSheet === 'source' ? ['und', ...languages] : languages).map(code => ({ value: code, label: languageLabel(code) }))}
        onChange={code => { if (languageSheet === 'source') setSourceLang(code); else setTargetLang(code); setLanguageSheet(null); }} /> : <>
      <StoryError text={error} /><StoryInput label="Tên truyện" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
      {sheet === 'new' && <><Action disabled={busy} onPress={() => setLanguageSheet('source')}>Ngôn ngữ gốc · {languageLabel(sourceLang)}</Action>
        <Action disabled={busy} onPress={() => setLanguageSheet('target')}>Ngôn ngữ đích · {languageLabel(targetLang)}</Action></>}
      {coverAsset && <Image source={{ uri: coverAsset.uri }} style={{ width: 100, height: 150, borderRadius: 12, alignSelf: 'center' }} />}
      <Action icon="upload" disabled={busy} onPress={() => void run(chooseCover)}>{coverAsset ? 'Đổi ảnh đã chọn' : 'Chọn ảnh bìa'}</Action>
      <Action primary disabled={busy || !title.trim()} onPress={() => void run(async () => {
        let saved = project && sheet === 'project' ? await storyApi.renameProject(project, title) : await storyApi.createProject(title, sourceLang, targetLang);
        activeProject.current = saved.projectId; setProject(saved); setProjects(items => [saved, ...items.filter(item => item.projectId !== saved.projectId)]);
        // Keep the new project if a separate cover upload fails; retry must not create another project.
        setSheet('project');
        if (coverAsset) saved = await storyApi.uploadCover(saved, coverAsset);
        await open(saved); await reload(); setSheet(null);
      })}>{busy ? 'Đang lưu…' : sheet === 'new' ? 'Tạo truyện' : 'Lưu thay đổi'}</Action>
      {sheet === 'project' && project && <>
        {project.cover && <Action disabled={busy} onPress={() => void run(async () => { setProject(await storyApi.deleteCover(project)); await reload(); })}>Xóa ảnh bìa</Action>}
        <Action disabled={busy} onPress={() => setSheet('translate')}>Dịch nhiều chương</Action>
        <Action disabled={busy} onPress={() => setSheet('glossary')}>Tên riêng và thuật ngữ</Action>
        <Action icon="download" disabled={busy} onPress={() => void run(async () => { await shareStoryBackup(await storyApi.exportProject(project), project.title); })}>Xuất bản sao lưu</Action>
        <Label muted size={12}>Bản sao chứa nội dung và bản dịch; không gồm ảnh bìa hoặc MP3.</Label>
        <Action icon="trash" disabled={busy} onPress={() => setSheet('delete')}>Xóa truyện</Action>
      </>}
      </>}
    </>}
      {sheet === 'chapter' && <>
      <StoryError text={error} /><StoryInput label="Tên chương" value={chapterTitle} onChangeText={setChapterTitle} maxLength={120} editable={!busy} />
      <Action primary disabled={busy || !chapterTitle.trim() || !project} onPress={() => void run(async () => {
        if (!project) return;
        if (project.sourceLang === 'und') {
          selectChapter({ projectId: project.projectId, chapterId: '', chapterNumber: Math.max(0, ...chapters.map(item => item.chapterNumber)) + 1,
            title: chapterTitle, sourceLang: 'und', revision: 0, contentRevision: null, segmentCount: 0, textLength: 0, order: chapters.length,
            schemaVersion: 1, status: 'DRAFT', updatedAt: '' });
        } else {
          const saved = await storyApi.createChapter(project.projectId, Math.max(0, ...chapters.map(item => item.chapterNumber)) + 1, chapterTitle);
          setChapters(items => [...items, saved]); selectChapter(saved);
        }
        setSheet(null);
      })}>Nhập nội dung</Action>
    </>}
      {sheet === 'delete' && <><StoryError text={error} />
      <Label>Xóa “{project?.title}” và các chương khỏi danh sách?</Label>
      <Action disabled={busy} onPress={() => setSheet('project')}>Giữ lại</Action>
      <Action icon="trash" disabled={busy} onPress={() => void run(async () => { if (project) await storyApi.deleteProject(project); leaveProject(); setSheet(null); await reload(); })}>Xóa truyện</Action>
    </>}
      {project && sheet === 'glossary' && <StoryGlossary embedded projectId={project.projectId} close={() => setSheet(null)} onBusy={setChildBusy} onDirty={setChildDirty} />}
      {project && sheet === 'translate' && <StoryTranslationBatch embedded project={project} chapters={chapters} onBusy={setChildBusy} close={() => setSheet(null)} />}
    </Sheet>
  </Page>;
}
