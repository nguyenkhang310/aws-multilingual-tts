import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Action, Circle, Label } from './ui';
import Sheet from './Sheet';
import PdfReader from './PdfReader';
import DocumentReview from './DocumentReview';
import StoryAudio from './StoryAudio';
import StoryTranslation from './StoryTranslation';
import { StoryError, StoryInput, storyStyles as styles, useStoryAction } from './StoryControls';
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
  const { allLanguages, reducedMotion } = useStudio();
  const [current, setCurrent] = useState(chapter), [text, setText] = useState(''), [original, setOriginal] = useState('');
  const initial = useRef(chapter), saved = useRef(chapter), projectRef = useRef(project);
  const [title, setTitle] = useState(chapter.title), [chapterNumber, setNumber] = useState(String(chapter.chapterNumber));
  const [lang, setLang] = useState(chapter.sourceLang), [suggestedLang, setSuggestedLang] = useState<string | null>(null);
  const [tab, setTab] = useState<'text' | 'translation' | 'audio'>('text');
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
  function update(value: Chapter) { saved.current = value; setCurrent(value); }
  async function save() {
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
  return <Sheet title={`${current.chapterNumber}. ${current.title}`} visible left={<Circle name="more" label="Thông tin chương" disabled={busy || !!pdf} onPress={() => setOptions('metadata')} />} close={() => { if (!busy && !pdf) { if (dirty || translationDirty) setOptions('discard'); else close(); } }}>
    <View style={styles.row}>{(['text', 'translation', 'audio'] as const).map(value => <Action key={value} primary={tab === value}
      disabled={busy || !!pdf || (value !== 'text' && (dirty || !current.contentRevision)) || (translationDirty && value !== 'translation')} style={{ flex: 1 }} onPress={() => setTab(value)}>
      {value === 'text' ? 'Nội dung' : value === 'translation' ? 'Bản dịch' : 'Âm thanh'}</Action>)}</View>
    <StoryError text={error} />
    <Animated.View style={{ gap: 18, opacity: fade }}>
    {tab === 'text' && <>
      <View style={styles.row}><Action icon="upload" disabled={busy || loading || !!pdf} onPress={() => void run(importFile)}>Nhập tệp</Action>
        <Action accessibilityLabel="Ngôn ngữ chương" disabled={busy || loading || !!pdf} onPress={() => setOptions('language')}>{languageNames[lang] ?? 'Chọn ngôn ngữ'}</Action></View>
      <StoryInput label={`Nội dung chương · ${text.length.toLocaleString('vi-VN')} ký tự`} multiline value={parts[index]}
        editable={!busy && !loading && !pdf} maxLength={STORY_CHUNK_CHARS} placeholder="Nhập hoặc dán nội dung…"
        onChangeText={value => { const next = [...parts]; next[index] = value; const content = next.join(''); if (content.length <= MAX_STORY_CHARS) setText(content); }} />
      {parts.length > 1 && <View style={styles.row}><Action disabled={index === 0} onPress={() => setPage(index - 1)}>Trước</Action>
        <Label muted>Phần {index + 1}/{parts.length}</Label><Action disabled={index + 1 === parts.length} onPress={() => setPage(index + 1)}>Sau</Action></View>}
      <Action primary disabled={busy || loading || !!pdf || !text.trim() || !title.trim()} onPress={() => void run(save)}>{busy ? 'Đang lưu…' : 'Lưu chương'}</Action>
      {!!stage && <Label muted size={13}>{stage}</Label>}
      {pdf && <><Label size={13} muted>Gemini · Trực tuyến. Kiểm tra chữ trước khi lưu.</Label>
        <Action onPress={() => { setPdf(null); setPendingScan(null); setStage(''); }}>Hủy nhập</Action></>}
    </>}
    {tab === 'translation' && <StoryTranslation key={`${current.chapterId}/${current.revision}`} chapter={current} targetLang={project.targetLang} onEditing={setTranslationDirty} />}
    {tab === 'audio' && <StoryAudio key={`${current.chapterId}/${current.revision}`} chapter={current} targetLang={project.targetLang} />}
    </Animated.View>
    <Sheet title="Thông tin chương" visible={options === 'metadata'} close={() => { if (!busy) setOptions(null); }}>
      <StoryError text={error} /><StoryInput label="Tên chương" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
      <StoryInput label="Số chương" value={chapterNumber} keyboardType="number-pad" onChangeText={setNumber} maxLength={6} editable={!busy} />
      <Action primary disabled={busy} onPress={() => setOptions(null)}>Xong</Action>
      {!!current.chapterId && <Action icon="trash" disabled={busy} onPress={() => setOptions('delete')}>Xóa chương</Action>}
    </Sheet>
    <Sheet title="Ngôn ngữ chương" visible={options === 'language'} close={() => setOptions(null)}>
      <StoryError text={error} /><Action disabled={busy || !text.trim()} onPress={() => void run(async () => {
        const result = await detectLanguage(text); setSuggestedLang(result.language);
        if (!result.language) setError('Chưa xác định rõ ngôn ngữ. Bạn chọn bên dưới.');
      })}>Nhận diện từ nội dung</Action>
      {availableLangs.map(code => <Action key={code} onPress={() => { setLang(code); setOptions(null); }}>
        {languageNames[code] ?? code}{code === suggestedLang ? ' · Đề xuất' : ''}</Action>)}
    </Sheet>
    <Sheet title="Xóa chương" visible={options === 'delete'} close={() => { if (!busy) setOptions('metadata'); }}>
      <StoryError text={error} /><Label>Xóa chương “{current.title}”?</Label>
      <Action disabled={busy} onPress={() => setOptions(null)}>Giữ lại</Action>
      <Action icon="trash" disabled={busy} onPress={() => void run(async () => { await storyApi.deleteChapter(current); close(); })}>Xóa chương</Action>
    </Sheet>
    <Sheet title="Chưa lưu thay đổi" visible={options === 'discard'} close={() => setOptions(null)}>
      <Label>Giữ lại để tiếp tục chỉnh sửa?</Label><Action primary onPress={() => setOptions(null)}>Tiếp tục chỉnh sửa</Action>
      <Action onPress={close}>Bỏ thay đổi</Action>
    </Sheet>
    <Sheet title="Đọc tài liệu" visible={options === 'scan'} close={() => { setOptions(null); setPendingScan(null); }}>
      <Label weight="600">Gemini · Trực tuyến</Label><Label muted size={14}>Trang cần nhận dạng sẽ được gửi tới Gemini. PDF có lớp chữ được đọc trên thiết bị.</Label>
      <Action primary onPress={() => { setPdf(pendingScan); setOptions(null); }}>Đọc chữ</Action>
      <Action onPress={() => { setOptions(null); setPendingScan(null); }}>Hủy</Action>
    </Sheet>
    {recognition && <DocumentReview text={recognition.text} warning={recognition.warning} name={pendingScan?.name ?? 'Nội dung chương'} maxChars={MAX_STORY_CHARS}
      close={() => { setRecognition(null); setPendingScan(null); }} onAccept={value => { setText(value); setPage(0); setRecognition(null); setPendingScan(null); }} />}
    {pdf && <PdfReader base64={pdf.base64} kind={pdf.kind} lang={lang === 'und' ? 'vi-VN' : lang} mode="gemini" maxChars={MAX_STORY_CHARS}
      onProgress={setStage} onResult={(value, reason, warning) => { setPdf(null); setStage('');
        if (reason) { setError(reason); return; }
        try { setRecognition({ text: checkedDocument(value ?? '', MAX_STORY_CHARS), warning: warning ?? '' }); }
        catch (reason) { setError((reason as Error).message); }
      }} />}
  </Sheet>;
}
