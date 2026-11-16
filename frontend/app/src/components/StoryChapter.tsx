import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Platform, Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useIsFocused, usePreventRemove } from 'expo-router';
import { Action, Circle, Label } from './ui';
import Sheet from './Sheet';
import { Page } from './layout';
import PlaybackBar from './PlaybackBar';
import { useLayout } from '../hooks/useLayout';
import { useKeyboardState } from '../hooks/useKeyboard';
import { validChapterNumber } from '../../../shared/story-playback';
import PdfReader from './PdfReader';
import DocumentReview from './DocumentReview';
import StoryAudio from './StoryAudio';
import StoryTranslation from './StoryTranslation';
import { StoryError, StoryInput, StoryChoices, storyStyles as styles, useStoryAction } from './StoryControls';
import { usePlayback } from '../state/Playback';
import { useStudio } from '../state/Studio';
import { storyApi } from '../lib/story-api';
import { extractDocument } from '../lib/document';
import { shrinkImage } from '../lib/image';
import { checkStoryAsset, readStoryAsset } from '../lib/story-files';
import { detectLanguage } from '../lib/language-detection';
import { checkedDocument } from '../../../shared/documents';
import { MAX_STORY_CHARS, STORY_CHUNK_CHARS, storyChunks, type StoryChapter as Chapter, type StoryProject } from '../../../shared/story';
import { languageNames } from '../../../shared/languages';

export default function StoryChapter({ project, chapter, close, onSaved, onProject }: {
  project: StoryProject; chapter: Chapter; close: () => void; onSaved: (item: Chapter) => void; onProject: (item: StoryProject) => void;
}) {
  const { allLanguages, reducedMotion, colors } = useStudio();
  const focused = useIsFocused();
  const { usableHeight, fontScale } = useLayout();
  const { current: playingRecord } = usePlayback();
  const keyboard = useKeyboardState();
  const editorHeight = Math.max(180, Math.min(520, usableHeight - (keyboard.visible ? keyboard.height : 0) - 390 * Math.max(1, fontScale) - (playingRecord && !keyboard.visible ? 78 : 0)));
  const leave = useRef<(() => void) | null>(null);
  const [current, setCurrent] = useState(chapter), [text, setText] = useState(''), [original, setOriginal] = useState('');
  const initial = useRef(chapter), saved = useRef(chapter), projectRef = useRef(project);
  const [title, setTitle] = useState(chapter.title), [chapterNumber, setNumber] = useState(String(chapter.chapterNumber));
  const [lang, setLang] = useState(chapter.sourceLang), [suggestedLang, setSuggestedLang] = useState<string | null>(null);
  const [tab, setTab] = useState<'text' | 'translation' | 'audio'>(chapter.contentRevision ? 'audio' : 'text');
  const [fade] = useState(() => new Animated.Value(1));
  useEffect(() => {
    fade.setValue(reducedMotion ? 1 : 0);
    if (!reducedMotion) Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
    return () => fade.stopAnimation();
  }, [fade, tab, reducedMotion]);
  const [options, setOptions] = useState<'metadata' | 'language' | 'delete' | 'discard' | 'scan' | null>(null);
  const [translationDirty, setTranslationDirty] = useState(false);
  const [page, setPage] = useState(0), [loading, setLoading] = useState(!!chapter.contentRevision);
  const [pendingScan, setPendingScan] = useState<{ base64: string; kind: string; name: string } | null>(null);
  const [recognition, setRecognition] = useState<{ text: string; warning: string } | null>(null);
  const [pdf, setPdf] = useState<{ base64: string; kind: string } | null>(null), [stage, setStage] = useState('');
  const { busy, error, setError, run } = useStoryAction();
  useEffect(() => {
    let live = true;
    const item = initial.current;
    if (item.contentRevision) void storyApi.source(item).then(value => { if (live) { setText(value); setOriginal(value); } })
      .catch(reason => { if (live) setError(reason.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [setError]);
  const parts = text.trim() ? storyChunks(text) : [text];
  const index = Math.min(page, parts.length - 1);
  const dirty = text !== original || title !== current.title || Number(chapterNumber) !== current.chapterNumber || lang !== current.sourceLang;
  usePreventRemove(true, () => {
    if (busy || pdf) return;
    if (options) { closeOptions(); return; }
    if (recognition) { setRecognition(null); setPendingScan(null); return; }
    if (dirty || translationDirty) { leave.current = close; setOptions('discard'); }
    else close();
  });
  useEffect(() => {
    if (!focused || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy || pdf) return true;
      if (dirty || translationDirty) setOptions('discard'); else close();
      return true;
    });
    return () => subscription.remove();
  }, [focused, dirty, translationDirty, busy, pdf, close]);
  function closeOptions() {
    if (busy) return;
    if (options === 'discard') leave.current = null;
    if (options === 'scan') setPendingScan(null);
    setOptions(options === 'delete' ? 'metadata' : null);
  }
  function update(value: Chapter) { saved.current = value; setCurrent(value); }
  async function save() {
    if (!title.trim() || !validChapterNumber(Number(chapterNumber))) throw new Error('Tên chương cần có chữ; số chương từ 1 đến 100.000.');
    checkedDocument(text, MAX_STORY_CHARS);
    if (lang === 'und') { setOptions('language'); throw new Error('Chọn ngôn ngữ trước khi lưu chương.'); }
    let item = saved.current;
    if (!item.chapterId) {
      if (projectRef.current.sourceLang === 'und') {
        projectRef.current = await storyApi.updateProjectLanguage(projectRef.current, lang); onProject(projectRef.current);
      }
      item = await storyApi.createChapter(project.projectId, Number(chapterNumber), title, lang); update(item);
    }
    if (item.title !== title || item.chapterNumber !== Number(chapterNumber) || item.sourceLang !== lang) {
      item = await storyApi.updateChapter(item, { title, chapterNumber: Number(chapterNumber), sourceLang: lang }); update(item);
    }
    if (text !== original) { item = await storyApi.saveText(item, text); update(item); }
    setOriginal(text); onSaved(item);
  }
  async function importFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/markdown', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    await checkStoryAsset(asset);
    if (/\.(pdf|png|jpe?g|webp)$/i.test(asset.name)) {
      if (Platform.OS === 'web') throw new Error('Mở bản web Studio để nhập PDF hoặc ảnh trên trình duyệt. App iOS/Android hỗ trợ bộ đọc riêng.');
      const base64 = /\.pdf$/i.test(asset.name) ? await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }) : await shrinkImage(asset.uri);
      setPendingScan({ base64, kind: asset.name.split('.').pop()!.toLowerCase(), name: asset.name }); setOptions('scan'); return;
    }
    setText(extractDocument(await readStoryAsset(asset), asset.name, MAX_STORY_CHARS)); setPage(0);
  }
  const availableLangs = [...new Set([...(suggestedLang ? [suggestedLang] : []), 'vi-VN', 'en-US', 'ja-JP', 'ko-KR', 'cmn-CN', 'zh-TW', ...allLanguages.map(item => item.lang)])];
  return <Page title={`Chương ${current.chapterNumber}`} blurTarget close onClose={() => {
    if (!busy && !pdf) { if (dirty || translationDirty) setOptions('discard'); else close(); }
  }} footer={<View style={{ paddingHorizontal: 16, paddingBottom: 6 }}><PlaybackBar /></View>}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Label size={27} weight="700" style={{ flex: 1 }}>{current.title}</Label>
      <Circle name="more" label="Thông tin chương" disabled={busy || !!pdf} onPress={() => setOptions('metadata')} /></View>
    <View style={[styles.row, { flexWrap: 'nowrap', borderRadius: 28, padding: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 3 }]}>
      {(['audio', 'text', 'translation'] as const).map(value => <Pressable key={value} accessibilityRole="tab"
        accessibilityState={{ selected: tab === value, disabled: busy || (value !== 'text' && (dirty || !current.contentRevision)) }}
        disabled={busy || !!pdf || (value !== 'text' && (dirty || !current.contentRevision)) || (translationDirty && value !== 'translation')}
        style={{ flex: 1, minHeight: 44, padding: 6, borderRadius: 24, backgroundColor: tab === value ? colors.text : 'transparent', justifyContent: 'center', alignItems: 'center' }} onPress={() => setTab(value)}>
        <Label size={13} weight="600" style={{ color: tab === value ? colors.bg : colors.secondary }}>{value === 'text' ? 'Nội dung' : value === 'translation' ? 'Bản dịch' : 'Nghe & tạo'}</Label>
      </Pressable>)}
    </View>
    <StoryError text={error} />
    <Animated.View style={{ gap: 18, opacity: fade }}>
    {tab === 'text' && <>
      <View style={styles.row}><Action icon="upload" disabled={busy || loading || !!pdf} onPress={() => void run(importFile)}>Nhập tệp</Action>
        <Action accessibilityLabel="Ngôn ngữ chương" disabled={busy || loading || !!pdf} onPress={() => setOptions('language')}>{languageNames[lang] ?? 'Chọn ngôn ngữ'}</Action></View>
      <StoryInput label={`Nội dung chương · ${text.length.toLocaleString('vi-VN')} ký tự`} multiline value={parts[index]}
        style={{ height: editorHeight, maxHeight: editorHeight }} editable={!busy && !loading && !pdf} maxLength={STORY_CHUNK_CHARS} placeholder="Nhập hoặc dán nội dung…"
        onChangeText={value => { if (value.includes('\0')) { setError('Nội dung chứa ký tự không hợp lệ.'); return; } const next = [...parts]; next[index] = value; const content = next.join(''); if (content.length <= MAX_STORY_CHARS) setText(content); }} />
      {parts.length > 1 && <View style={styles.row}><Action disabled={index === 0} onPress={() => setPage(index - 1)}>Trước</Action>
        <Label muted>Phần {index + 1}/{parts.length}</Label><Action disabled={index + 1 === parts.length} onPress={() => setPage(index + 1)}>Sau</Action></View>}
      <Action primary disabled={busy || loading || !!pdf || !text.trim() || !title.trim() || !validChapterNumber(Number(chapterNumber))} onPress={() => void run(save)}>{busy ? 'Đang lưu…' : 'Lưu chương'}</Action>
      {!!stage && <Label muted size={13}>{stage}</Label>}
      {pdf && <><Label size={13} muted>Gemini · Trực tuyến. Kiểm tra chữ trước khi lưu.</Label>
        <Action onPress={() => { setPdf(null); setPendingScan(null); setStage(''); }}>Hủy nhập</Action></>}
    </>}
    {tab === 'translation' && <StoryTranslation key={`${current.chapterId}/${current.revision}`} chapter={current} targetLang={project.targetLang} onEditing={setTranslationDirty} />}
    {tab === 'audio' && <StoryAudio key={`${current.chapterId}/${current.revision}`} chapter={current} targetLang={project.targetLang} />}
    </Animated.View>
    <Sheet title={({ metadata: 'Thông tin chương', language: 'Ngôn ngữ chương', delete: 'Xóa chương', discard: 'Chưa lưu thay đổi', scan: 'Đọc tài liệu' } as const)[options ?? 'metadata']} visible={!!options} close={closeOptions}>
      {options === 'metadata' && <>
      <StoryError text={error} /><StoryInput label="Tên chương" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
      <StoryInput label="Số chương" value={chapterNumber} keyboardType="number-pad" onChangeText={setNumber} maxLength={6} editable={!busy} />
      {(!title.trim() || !validChapterNumber(Number(chapterNumber))) && <StoryError text="Nhập tên chương và số nguyên từ 1 đến 100.000." />}
      <Action primary disabled={busy || !title.trim() || !validChapterNumber(Number(chapterNumber))} onPress={() => setOptions(null)}>Xong</Action>
      {!!current.chapterId && <Action icon="trash" disabled={busy} onPress={() => setOptions('delete')}>Xóa chương</Action>}
    </>}
      {options === 'language' && <>
      <StoryError text={error} /><Action disabled={busy || !text.trim()} onPress={() => void run(async () => {
        const result = await detectLanguage(text); setSuggestedLang(result.language);
        if (!result.language) setError('Chưa xác định rõ ngôn ngữ. Bạn chọn bên dưới.');
      })}>Nhận diện từ nội dung</Action>
      <StoryChoices search value={lang} items={availableLangs.map(code => ({ value: code, label: `${languageNames[code] ?? code}${code === suggestedLang ? ' · Đề xuất' : ''}` }))}
        onChange={code => { setLang(code); setOptions(null); }} />
    </>}
      {options === 'delete' && <>
      <StoryError text={error} /><Label>Xóa chương “{current.title}”?</Label>
      <Action disabled={busy} onPress={() => setOptions(null)}>Giữ lại</Action>
      <Action icon="trash" disabled={busy} onPress={() => void run(async () => { await storyApi.deleteChapter(current); close(); })}>Xóa chương</Action>
    </>}
      {options === 'discard' && <>
      <Label>Giữ lại để tiếp tục chỉnh sửa?</Label><Action primary onPress={() => { leave.current = null; setOptions(null); }}>Tiếp tục chỉnh sửa</Action>
      <Action onPress={() => { if (leave.current) leave.current(); else close(); }}>Bỏ thay đổi</Action>
    </>}
      {options === 'scan' && <>
      <Label weight="600">Gemini · Trực tuyến</Label><Label muted size={14}>Trang cần nhận dạng sẽ được gửi tới Gemini. PDF có lớp chữ được đọc trên thiết bị.</Label>
      <Action primary onPress={() => { setPdf(pendingScan); setOptions(null); }}>Đọc chữ</Action>
      <Action onPress={() => { setOptions(null); setPendingScan(null); }}>Hủy</Action>
    </>}
    </Sheet>
    {recognition && <DocumentReview text={recognition.text} warning={recognition.warning} name={pendingScan?.name ?? 'Nội dung chương'} maxChars={MAX_STORY_CHARS}
      close={() => { setRecognition(null); setPendingScan(null); }} onAccept={value => { setText(value); setPage(0); setRecognition(null); setPendingScan(null); }} />}
    {pdf && <PdfReader base64={pdf.base64} kind={pdf.kind} lang={lang === 'und' ? 'vi-VN' : lang} mode="gemini" maxChars={MAX_STORY_CHARS}
      onProgress={setStage} onResult={(value, reason, warning) => { setPdf(null); setStage('');
        if (reason) { setError(reason); return; }
        try { setRecognition({ text: checkedDocument(value ?? '', MAX_STORY_CHARS), warning: warning ?? '' }); }
        catch (reason) { setError((reason as Error).message); }
      }} />}
  </Page>;
}
