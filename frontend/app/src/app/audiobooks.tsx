import { useEffect, useRef, useState } from 'react';
import { strFromU8 } from 'fflate';
import { ActivityIndicator, Image, Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Page } from '../components/layout';
import { Action, Circle, Icon, Label } from '../components/ui';
import Sheet from '../components/Sheet';
import StoryChapter from '../components/StoryChapter';
import StoryGlossary from '../components/StoryGlossary';
import StoryTranslationBatch from '../components/StoryTranslationBatch';
import { StoryCard, StoryError, StoryInput, storyStyles as styles, useStoryAction } from '../components/StoryControls';
import { useStudio } from '../state/Studio';
import { storyApi } from '../lib/story-api';
import { readStoryAsset, shareStoryBackup } from '../lib/story-files';
import { checkedBackup, checkedStoryCoverType, type StoryChapter as Chapter, type StoryProject } from '../../../shared/story';
import { languageNames } from '../../../shared/languages';

const languageLabel = (code: string) => code === 'und' ? 'Tự nhận diện' : languageNames[code] ?? code;
export default function Audiobooks() {
  const { preferences } = useStudio();
  return <AudiobooksSession key={preferences.demoToken} />;
}
function AudiobooksSession() {
  const { colors, allLanguages } = useStudio();
  const [visibleCount, setVisibleCount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<StoryProject[]>([]), [project, setProject] = useState<StoryProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]), [selected, setSelected] = useState<Chapter | null>(null);
  const [sheet, setSheet] = useState<'new' | 'project' | 'delete' | 'glossary' | 'chapter' | 'translate' | null>(null);
  const [languageSheet, setLanguageSheet] = useState<'source' | 'target' | null>(null);
  const [title, setTitle] = useState(''), [chapterTitle, setChapterTitle] = useState('');
  const [sourceLang, setSourceLang] = useState('und'), [targetLang, setTargetLang] = useState('vi-VN');
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [brokenCovers, setBrokenCovers] = useState(new Set<string>());
  const refreshed = useRef(new Set<string>());
  const { busy, error, setError, run } = useStoryAction();
  useEffect(() => {
    let live = true;
    void storyApi.projects().then(items => { if (live) setProjects(items); })
      .catch(error => { if (live) setError(error.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [setError]);
  async function reload(item?: StoryProject) {
    const list = await storyApi.projects(); setProjects(list);
    if (item) { setProject(await storyApi.project(item.projectId)); setChapters(await storyApi.chapters(item.projectId)); }
  }
  async function open(item: StoryProject) {
    const [saved, list] = await Promise.all([storyApi.project(item.projectId), storyApi.chapters(item.projectId)]);
    setProject(saved); setChapters(list); setSelected(null); setCoverAsset(null); setVisibleCount(50);
  }
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
  function cover(item: StoryProject) {
    return item.cover && !brokenCovers.has(`${item.projectId}:${item.cover.updatedAt}`)
      ? <Image accessibilityLabel={`Bìa ${item.title}`} source={{ uri: item.cover.url }} resizeMode="cover"
        onError={() => void refreshCover(item)} style={{ width: 56, height: 84, borderRadius: 10 }} />
      : <View style={{ width: 56, height: 84, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="book" color={colors.blue} /></View>;
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
  return <Page title="Audio Truyện" close>
    <StoryError text={error} />
    {!project ? <>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label size={21} weight="600">Truyện của bạn</Label>
        <View style={styles.row}><Circle name="repeat" label="Làm mới truyện" disabled={busy} onPress={() => void run(() => reload())} /><Circle name="plus" label="Thêm truyện" disabled={busy} onPress={() => { setTitle(''); setCoverAsset(null); setSheet('new'); }} /></View></View>
      {loading && <ActivityIndicator color={colors.blue} />}
      {!loading && !error && !projects.length && <Label muted>Chưa có truyện.</Label>}
      {projects.slice(0, visibleCount).map(item => <Pressable key={item.projectId} accessibilityRole="button" disabled={busy} onPress={() => void run(() => open(item))}>
        <StoryCard><View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>{cover(item)}
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}><Label size={19} weight="600" lines={2}>{item.title}</Label>
            <Label size={13} muted>{item.chapterCount} chương · {languageLabel(item.sourceLang)}</Label></View><Icon name="next" size={18} /></View></StoryCard>
      </Pressable>)}
      {projects.length > visibleCount && <Action onPress={() => setVisibleCount(count => count + 50)}>Xem thêm truyện</Action>}
      <View style={styles.row}><Action icon="upload" disabled={busy} onPress={() => void run(restore)}>Khôi phục backup</Action>
      </View>
    </> : <>
      <Pressable accessibilityRole="button" accessibilityLabel="Danh sách truyện" disabled={busy} onPress={() => { setProject(null); setSelected(null); setVisibleCount(50); }}
        style={{ flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', minHeight: 44 }}><Icon name="back" size={18} color={colors.blue} /><Label style={{ color: colors.blue }}>Truyện của bạn</Label></Pressable>
      <StoryCard><View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>{cover(project)}
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}><Label size={24} weight="700">{project.title}</Label>
          <Label muted size={13}>{languageLabel(project.sourceLang)} → {languageLabel(project.targetLang)}</Label></View>
        <Circle name="more" label="Tùy chọn truyện" disabled={busy} onPress={() => { setTitle(project.title); setSheet('project'); }} /></View></StoryCard>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Label size={21} weight="600">Chương ({chapters.length})</Label>
        <View style={styles.row}><Circle name="repeat" label="Làm mới chương" disabled={busy} onPress={() => void run(() => reload(project))} /><Circle name="plus" label="Thêm chương" disabled={busy} onPress={() => { setChapterTitle(''); setSheet('chapter'); }} /></View></View>
      {!!chapters.length && <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
        {chapters.slice(0, visibleCount).map((item, index) => <Pressable key={item.chapterId} accessibilityRole="button" accessibilityLabel={`${item.chapterNumber}. ${item.title}`} disabled={busy}
          onPress={() => setSelected(item)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, padding: 16,
            borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, backgroundColor: pressed ? colors.raised : 'transparent' })}>
          <Label muted size={14}>{item.chapterNumber}</Label><Label style={{ flex: 1 }}>{item.title}</Label><Icon name="next" size={16} color={colors.secondary} />
        </Pressable>)}
      </View>}
      {!chapters.length && <Label muted>Thêm chương để nhập nội dung.</Label>}
      {chapters.length > visibleCount && <Action onPress={() => setVisibleCount(count => count + 50)}>Xem thêm chương</Action>}
    </>}
    <Sheet title={sheet === 'new' ? 'Thêm truyện' : 'Tùy chọn truyện'} visible={sheet === 'new' || sheet === 'project'} close={() => { if (!busy) setSheet(null); }}>
      <StoryError text={error} /><StoryInput label="Tên truyện" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
      {sheet === 'new' && <><Action disabled={busy} onPress={() => setLanguageSheet('source')}>Ngôn ngữ gốc · {languageLabel(sourceLang)}</Action>
        <Action disabled={busy} onPress={() => setLanguageSheet('target')}>Ngôn ngữ đích · {languageLabel(targetLang)}</Action></>}
      {coverAsset && <Image source={{ uri: coverAsset.uri }} style={{ width: 100, height: 150, borderRadius: 12, alignSelf: 'center' }} />}
      <Action icon="upload" disabled={busy} onPress={() => void run(chooseCover)}>{coverAsset ? 'Đổi ảnh đã chọn' : 'Chọn ảnh bìa'}</Action>
      <Action primary disabled={busy || !title.trim()} onPress={() => void run(async () => {
        let saved = project && sheet === 'project' ? await storyApi.renameProject(project, title) : await storyApi.createProject(title, sourceLang, targetLang);
        setProject(saved); setProjects(items => [saved, ...items.filter(item => item.projectId !== saved.projectId)]);
        // Keep the new project if a separate cover upload fails; retry must not create another project.
        setSheet('project');
        if (coverAsset) saved = await storyApi.uploadCover(saved, coverAsset);
        await open(saved); await reload(); setSheet(null);
      })}>{busy ? 'Đang lưu…' : sheet === 'new' ? 'Tạo truyện' : 'Lưu thay đổi'}</Action>
      {sheet === 'project' && project && <>
        {project.cover && <Action disabled={busy} onPress={() => void run(async () => { setProject(await storyApi.deleteCover(project)); await reload(); })}>Xóa ảnh bìa</Action>}
        <Action disabled={busy} onPress={() => setSheet('translate')}>Dịch nhiều chương</Action>
        <Action disabled={busy} onPress={() => setSheet('glossary')}>Tên riêng và thuật ngữ</Action>
        <Action icon="download" disabled={busy} onPress={() => void run(async () => { await shareStoryBackup(await storyApi.exportProject(project), project.title); })}>Xuất backup</Action>
        <Label muted size={12}>Backup chứa nội dung và bản dịch; không gồm ảnh bìa hoặc MP3.</Label>
        <Action icon="trash" disabled={busy} onPress={() => setSheet('delete')}>Xóa truyện</Action>
      </>}
    </Sheet>
    <Sheet title="Thêm chương" visible={sheet === 'chapter'} close={() => { if (!busy) setSheet(null); }}>
      <StoryError text={error} /><StoryInput label="Tên chương" value={chapterTitle} onChangeText={setChapterTitle} maxLength={120} editable={!busy} />
      <Action primary disabled={busy || !chapterTitle.trim() || !project} onPress={() => void run(async () => {
        if (!project) return;
        if (project.sourceLang === 'und') {
          setSelected({ projectId: project.projectId, chapterId: '', chapterNumber: Math.max(0, ...chapters.map(item => item.chapterNumber)) + 1,
            title: chapterTitle, sourceLang: 'und', revision: 0, contentRevision: null, segmentCount: 0, textLength: 0, order: chapters.length,
            schemaVersion: 1, status: 'DRAFT', updatedAt: '' });
        } else {
          const saved = await storyApi.createChapter(project.projectId, Math.max(0, ...chapters.map(item => item.chapterNumber)) + 1, chapterTitle);
          setChapters(items => [...items, saved]); setSelected(saved);
        }
        setSheet(null);
      })}>Nhập nội dung</Action>
    </Sheet>
    {project && selected && <StoryChapter key={`${project.projectId}/${selected.chapterId}`} project={project} chapter={selected}
      close={() => { setSelected(null); void run(() => reload(project)); }} onSaved={item => { setSelected(item); setChapters(items => [...items.filter(row => row.chapterId !== item.chapterId), item].sort((a, b) => a.order - b.order)); }}
      onProject={setProject} />}
    {project && sheet === 'translate' && <StoryTranslationBatch project={project} chapters={chapters} close={() => setSheet(null)} />}
    {project && sheet === 'glossary' && <StoryGlossary projectId={project.projectId} close={() => setSheet(null)} />}
    <Sheet title="Xóa truyện" visible={sheet === 'delete'} close={() => { if (!busy) setSheet(null); }}><StoryError text={error} />
      <Label>Xóa “{project?.title}” và các chương khỏi danh sách?</Label>
      <Action disabled={busy} onPress={() => setSheet('project')}>Giữ lại</Action>
      <Action icon="trash" disabled={busy} onPress={() => void run(async () => { if (project) await storyApi.deleteProject(project); setProject(null); setSheet(null); await reload(); })}>Xóa truyện</Action>
    </Sheet>
    <Sheet title={languageSheet === 'source' ? 'Ngôn ngữ gốc' : 'Ngôn ngữ đích'} visible={!!languageSheet} close={() => setLanguageSheet(null)}>
      {(languageSheet === 'source' ? ['und', ...languages] : languages).map(code => <Action key={code} onPress={() => {
        if (languageSheet === 'source') setSourceLang(code); else setTargetLang(code); setLanguageSheet(null);
      }}>{languageLabel(code)}</Action>)}
    </Sheet>
  </Page>;
}
