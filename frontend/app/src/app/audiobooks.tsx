import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Page } from '../components/layout';
import { Action, Icon, Label } from '../components/ui';
import Sheet from '../components/Sheet';
import { useStudio } from '../state/Studio';
import { storyApi } from '../lib/story-api';
import { storyBatchApi } from '../lib/story-batch-api';
import { storyTranslationApi } from '../lib/story-translation-api';
import type { ApprovedTranslation, TranslationChunk, TranslationPlan, TranslationProgress } from '../../../shared/story-translation';
import { checkedStoryCoverType, type StoryChapter, type StoryPlan, type StoryProgress, type StoryProject } from '../../../shared/story';
import { languageNames } from '../../../shared/languages';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Chưa hoàn tất thao tác.';
const isForeground = () => AppState.currentState === 'active' || AppState.currentState === null;
const storyLanguages = ['vi-VN', 'en-US', 'ja-JP', 'ko-KR', 'cmn-CN'];
const languageLabel = (code: string) => code === 'und' ? 'Tự nhận diện khi nhập chương' : languageNames[code] ?? code;

export default function Audiobooks() {
  const { colors, allLanguages } = useStudio();
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [project, setProject] = useState<StoryProject | null>(null);
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [selected, setSelected] = useState<StoryChapter | null>(null);
  const [plans, setPlans] = useState<StoryPlan[]>([]);
  const [plan, setPlan] = useState<StoryPlan | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [translationPlan, setTranslationPlan] = useState<TranslationPlan | null>(null);
  const [translationProgress, setTranslationProgress] = useState<TranslationProgress | null>(null);
  const [approvedTranslation, setApprovedTranslation] = useState<ApprovedTranslation | null>(null);
  const [translationChunk, setTranslationChunk] = useState<TranslationChunk | null>(null);
  const [translationIndex, setTranslationIndex] = useState(0);
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [approvedVoice, setApprovedVoice] = useState('');
  const [title, setTitle] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterNumber, setChapterNumber] = useState('1');
  const [sourceLang, setSourceLang] = useState('vi-VN');
  const [targetLang, setTargetLang] = useState('vi-VN');
  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [languageSheet, setLanguageSheet] = useState<'source' | 'target' | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const refreshedCovers = useRef(new Set<string>());
  const coverRefreshes = useRef(new Map<string, Promise<void>>());
  const [unavailableCovers, setUnavailableCovers] = useState(new Set<string>());
  const [error, setError] = useState('');

  useEffect(() => { void storyApi.projects().then(setProjects).catch(err => setError(errorText(err))); }, []);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(errorText(err)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function open(item: StoryProject) {
    setCoverAsset(null);
    setProject(item);
    setSelected(null); setPlan(null); setProgress(null);
    setChapters(await storyApi.chapters(item.projectId));
  }
  async function chooseCover() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true,
      aspect: [2, 3], quality: 0.9 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const info = asset.fileSize ? null : await FileSystem.getInfoAsync(asset.uri);
    const fileSize = asset.fileSize ?? (info && 'size' in info ? info.size : 0);
    const type = asset.mimeType || (/\.png$/i.test(asset.fileName || '') ? 'image/png' : 'image/jpeg');
    try { checkedStoryCoverType(type, fileSize); setCoverAsset({ ...asset, mimeType: type, fileSize }); setError(''); }
    catch (error) { setError(errorText(error)); }
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
  function saveCover(item: StoryProject, asset: ImagePicker.ImagePickerAsset) {
    void run(async () => {
      const updated = await storyApi.uploadCover(item, asset);
      setProject(updated); setCoverAsset(null); setProjects(await storyApi.projects());
    });
  }
  async function openChapter(item: StoryChapter) {
    setSelected(item);
    const [list, translated, approved] = await Promise.all([storyBatchApi.plans(item),
      storyTranslationApi.plans(item), storyTranslationApi.approvedOrNull(item)]);
    setPlans(list.items);
    const latest = list.items[0] ?? null;
    setPlan(latest);
    setProgress(latest ? await storyBatchApi.progress(item, latest.planId) : null);
    const latestTranslation = translated.items[0] ?? null;
    setTranslationIndex(0);
    setTranslationPlan(latestTranslation); setApprovedTranslation(approved);
    setTranslationProgress(latestTranslation ? await storyTranslationApi.progress(item, latestTranslation.planId) : null);
    setTranslationChunk(latestTranslation ? await storyTranslationApi.chunk(item, latestTranslation.planId, 0) : null);
  }
  const vietnameseVoices = allLanguages.filter(item => item.lang === (approvedTranslation?.targetLang ?? 'vi-VN') &&
    ['azure', 'gemini'].includes(item.provider) && item.available !== false);
  const selectedVoice = vietnameseVoices.flatMap(item => item.voices.map(voice =>
    ({ id: voice.id, label: voice.name || voice.id, provider: item.provider as 'azure' | 'gemini' })))
    .find(item => item.id === approvedVoice);
  useEffect(() => {
    if (!selected || !translationPlan || translationProgress?.status !== 'RUNNING') return;
    let live = true;
    const timer = setTimeout(async () => {
      if (!live || !isForeground() || locked.current) return;
      try {
        const value = await storyTranslationApi.action(selected, translationPlan.planId, 'tick');
        if (live) { setTranslationProgress(value);
          setTranslationChunk(await storyTranslationApi.chunk(selected, translationPlan.planId, translationIndex)); }
      } catch (err) { if (live) setError(errorText(err)); }
    }, 900);
    return () => { live = false; clearTimeout(timer); };
  }, [selected, translationPlan, translationProgress, translationIndex]);
  useEffect(() => {
    if (!selected || !plan || !progress || !['RUNNING', 'PAUSING'].includes(progress.status)) return;
    let live = true; let inFlight = false; let activeStatus = progress.status;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    let schedule = (_delay: number) => {};
    const refresh = async () => {
      if (!live || inFlight || !isForeground()) return;
      inFlight = true;
      try {
        let value = await storyBatchApi.progress(selected, plan.planId);
        if (value.status === 'RUNNING' && value.queued > 0 &&
            value.claimed + value.submitted + value.processing === 0 && live && isForeground())
          value = await storyBatchApi.tick(selected, plan.planId);
        if (!live) return;
        setProgress(value);
        activeStatus = value.status;
        delay = 5000;
      } catch (err) {
        if (live) setError(errorText(err));
        delay = Math.min(delay * 2, 30000);
      } finally {
        inFlight = false;
        if (['RUNNING', 'PAUSING'].includes(activeStatus)) schedule(delay);
      }
    };
    schedule = (milliseconds: number) => {
      clearTimeout(timer);
      if (live && isForeground()) timer = setTimeout(refresh, milliseconds);
    };
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
      else clearTimeout(timer);
    });
    schedule(5000);
    return () => { live = false; clearTimeout(timer); subscription.remove(); };
  }, [selected, plan, progress]);
  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.line, backgroundColor: colors.surface }];

  return <><Page title="Audio Truyện" close>
    {!!error && <Label size={14} style={{ color: '#C62828' }}>{error}</Label>}
    {!project ? <>
      <Label weight="600">Tạo dự án</Label>
      <TextInput accessibilityLabel="Tên truyện" placeholder="Tên truyện" placeholderTextColor={colors.secondary}
        value={title} onChangeText={setTitle} maxLength={120} style={inputStyle} />
      <View style={styles.row}>
        <View style={styles.half}><Label size={12} muted>Ngôn ngữ gốc</Label>
          <Action onPress={() => setLanguageSheet('source')}>{languageLabel(sourceLang)}</Action></View>
        <View style={styles.half}><Label size={12} muted>Ngôn ngữ đích</Label>
          <Action onPress={() => setLanguageSheet('target')}>{languageLabel(targetLang)}</Action></View>
      </View>
      <View style={styles.coverChoice}>
        {coverAsset && <Image source={{ uri: coverAsset.uri }} style={styles.coverPreview} />}
        <Action icon="book" onPress={() => void chooseCover()}>{coverAsset ? 'Chọn ảnh khác' : 'Chọn ảnh bìa (không bắt buộc)'}</Action>
        <Label size={12} muted>JPEG hoặc PNG · tối đa 5 MiB</Label>
      </View>
      <Action primary disabled={busy || !title.trim()} onPress={() => void run(async () => {
        const selectedCover = coverAsset;
        const item = await storyApi.createProject(title, sourceLang, targetLang);
        setTitle(''); setCoverAsset(null); setProjects(await storyApi.projects()); await open(item);
        if (selectedCover) {
          try { setProject(await storyApi.uploadCover(item, selectedCover)); setProjects(await storyApi.projects()); }
          catch (err) { setError(`Dự án đã tạo nhưng chưa lưu được ảnh bìa: ${errorText(err)}`); }
        }
      })}>Tạo dự án</Action>
      <Label weight="600">Dự án đã lưu</Label>
      {projects.map(item => <Pressable key={item.projectId} accessibilityRole="button" onPress={() => void run(() => open(item))}
        style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <View style={styles.projectRow}><View style={[styles.coverThumb, { backgroundColor: colors.raised, borderColor: colors.line }]}>
          {item.cover && !unavailableCovers.has(`${item.projectId}:${item.cover.updatedAt}`)
            ? <Image source={{ uri: item.cover.url }} onError={() => void refreshCover(item)} style={styles.coverImage} />
            : <Icon name="book" size={22} color={colors.blue} />}
        </View><View style={styles.projectInfo}><Label weight="600" size={17}>{item.title}</Label>
          <Label muted>{languageLabel(item.sourceLang)} → {languageLabel(item.targetLang)} · {item.chapterCount} chương</Label>
        </View></View>
      </Pressable>)}
    </> : <>
      <Action onPress={() => { setProject(null); setCoverAsset(null); setChapters([]); setSelected(null); }}>← Danh sách dự án</Action>
      <View style={styles.coverSection}>
        <View style={[styles.coverLarge, { backgroundColor: colors.raised, borderColor: colors.line }]}>
          {coverAsset ? <Image source={{ uri: coverAsset.uri }} style={styles.coverImage} />
            : project.cover && !unavailableCovers.has(`${project.projectId}:${project.cover.updatedAt}`)
            ? <Image source={{ uri: project.cover.url }} onError={() => void refreshCover(project)} style={styles.coverImage} />
            : <Icon name="book" size={30} color={colors.blue} />}
        </View><View style={styles.coverActions}><Label weight="600">Ảnh bìa</Label>
          <Label size={12} muted>JPEG hoặc PNG · tối đa 5 MiB</Label>
          <Action disabled={busy} icon="upload" onPress={() => void chooseCover()}>{project.cover ? 'Thay ảnh bìa' : 'Thêm ảnh bìa'}</Action>
          {coverAsset && <Action primary disabled={busy} onPress={() => saveCover(project, coverAsset)}>Tải ảnh đã chọn lên</Action>}
          {project.cover && <Action disabled={busy} icon="trash" onPress={() => Alert.alert('Xóa ảnh bìa', 'Bạn có muốn xóa ảnh bìa của dự án này?', [
            { text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void run(async () => {
              const updated = await storyApi.deleteCover(project); setProject(updated); setCoverAsset(null); setProjects(await storyApi.projects());
            }) },
          ])}>Xóa ảnh bìa</Action>}
        </View>
      </View>
      <Label size={23} weight="700">{project.title}</Label>
      <Label muted>{languageLabel(project.sourceLang)} → {languageLabel(project.targetLang)}</Label>
      {project.sourceLang === 'und' && <Label muted>Nhập chương đầu trên web để nhận diện và xác nhận ngôn ngữ.</Label>}
      <Label weight="600">Thêm chương</Label>
      <View style={styles.row}>
        <TextInput accessibilityLabel="Số chương" keyboardType="number-pad" value={chapterNumber} onChangeText={setChapterNumber}
          style={[inputStyle, { width: 86 }]} />
        <TextInput accessibilityLabel="Tên chương" placeholder="Tên chương" placeholderTextColor={colors.secondary}
          value={chapterTitle} onChangeText={setChapterTitle} maxLength={120} style={[inputStyle, styles.half]} />
      </View>
      <Action primary disabled={busy || project.sourceLang === 'und' || !chapterTitle.trim() || !Number.isInteger(Number(chapterNumber)) || Number(chapterNumber) < 1}
        onPress={() => void run(async () => {
          await storyApi.createChapter(project.projectId, Number(chapterNumber), chapterTitle);
          setChapterTitle(''); setChapterNumber(String(Number(chapterNumber) + 1));
          await open(project); setProjects(await storyApi.projects());
        })}>Thêm chương</Action>
      <Label weight="600">Chương đã lưu</Label>
      {chapters.map(item => <View key={item.chapterId} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <Label weight="600">{item.chapterNumber}. {item.title}</Label>
        <Label muted>{item.textLength} ký tự · {item.segmentCount} đoạn · {item.status}</Label>
        <Action disabled={busy} onPress={() => void run(() => openChapter(item))}>Xem kế hoạch audio</Action>
      </View>)}
      {selected && <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        {selected.sourceLang !== project.targetLang && <>
          <Label weight="600">Bản dịch · {languageLabel(project.targetLang)}</Label>
          {!translationPlan && <Action disabled={busy || !selected.contentRevision} onPress={() => void run(async () => {
            const created = await storyTranslationApi.create(selected, project.targetLang);
            setTranslationPlan(created); setTranslationProgress(await storyTranslationApi.progress(selected, created.planId));
          })}>Dịch chương</Action>}
          {translationPlan && translationProgress && <>
            <Label muted>{translationProgress.status} · xong {(translationProgress.counts.DONE || 0) +
              (translationProgress.counts.EDITED || 0)}/{translationProgress.total} phần</Label>
            {translationProgress.status === 'DRAFT' && <Action disabled={busy} onPress={() => void run(async () =>
              setTranslationProgress(await storyTranslationApi.action(selected, translationPlan.planId, 'start')))}>Bắt đầu dịch</Action>}
            {translationProgress.status === 'RUNNING' && <Action disabled={busy} onPress={() => void run(async () =>
              setTranslationProgress(await storyTranslationApi.action(selected, translationPlan.planId, 'pause')))}>Tạm dừng dịch</Action>}
            {translationProgress.status === 'RUNNING' && <Action disabled={busy} onPress={() => void run(async () =>
              setTranslationProgress(await storyTranslationApi.action(selected, translationPlan.planId, 'tick')))}>Kiểm tra và tiếp tục</Action>}
            {['PAUSED', 'NEEDS_ATTENTION', 'BLOCKED_QUOTA'].includes(translationProgress.status) &&
              <Action disabled={busy} onPress={() => void run(async () =>
                setTranslationProgress(await storyTranslationApi.action(selected, translationPlan.planId, 'resume')))}>Tiếp tục dịch</Action>}
            {translationChunk && <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.raised }]}>
              <Label muted>Phần {translationIndex + 1}/{translationPlan.total}</Label>
              <Label weight="600">Bản gốc</Label><Label>{translationChunk.sourceText}</Label>
              <Label weight="600">Bản dịch</Label><Label>{translationChunk.translatedText || 'Chưa dịch'}</Label>
              <View style={styles.row}><Action disabled={busy || translationIndex === 0} onPress={() => void run(async () => {
                const index = translationIndex - 1; setTranslationChunk(await storyTranslationApi.chunk(selected, translationPlan.planId, index)); setTranslationIndex(index);
              })}>Phần trước</Action><Action disabled={busy || translationIndex + 1 >= translationPlan.total} onPress={() => void run(async () => {
                const index = translationIndex + 1; setTranslationChunk(await storyTranslationApi.chunk(selected, translationPlan.planId, index)); setTranslationIndex(index);
              })}>Phần sau</Action></View>
              {translationChunk.status === 'FAILED' && <Action disabled={busy} onPress={() => void run(async () =>
                setTranslationProgress(await storyTranslationApi.retry(selected, translationPlan.planId, translationIndex)))}>Thử lại phần lỗi</Action>}
            </View>}
            {(translationProgress.counts.DONE || 0) + (translationProgress.counts.EDITED || 0) === translationProgress.total &&
              <Action disabled={busy} onPress={() => void run(async () => {
                const value = await storyTranslationApi.approve(selected, translationPlan.planId, approvedTranslation?.version ?? 0);
                setApprovedTranslation(value);
              })}>Duyệt bản dịch</Action>}
          </>}
          {approvedTranslation && <>
            <Label muted>Đã duyệt bản dịch · {approvedTranslation.textLength} ký tự</Label>
            <Action disabled={busy} onPress={() => setVoiceSheet(true)}>
              {selectedVoice ? `${selectedVoice.provider} · ${selectedVoice.label}` : 'Chọn giọng bản dịch'}</Action>
            <Action primary disabled={busy || !selectedVoice} onPress={() => void run(async () => {
              const created = await storyBatchApi.createApproved(selected, selectedVoice!.provider, selectedVoice!.id);
              setPlans(await storyBatchApi.plans(selected).then(value => value.items));
              setPlan(created); setProgress(await storyBatchApi.start(selected, created.planId));
            })}>Tạo audio từ bản dịch đã duyệt</Action>
          </>}
        </>}
        <Label weight="600">Audio chương {selected.chapterNumber}</Label>
        {!plans.length && <Label muted>Chưa có kế hoạch. Lập kế hoạch và chọn giọng trên web.</Label>}
        {plans.map(item => <Action key={item.planId} disabled={busy} onPress={() => void run(async () => {
          setPlan(item); setProgress(await storyBatchApi.progress(selected, item.planId));
        })}>{item.provider} · {item.voice} · {item.total} đoạn</Action>)}
        {plan && <>
          <Label muted>{plan.total} đoạn · {plan.totalChars} ký tự · {plan.style} / {plan.styleIntensity}</Label>
          {progress?.status === 'DRAFT' && <Action primary disabled={busy} onPress={() => Alert.alert(
            'Tạo audio chương', `Xác nhận ${plan.total} bản thu bằng ${plan.provider}?`,
            [{ text: 'Hủy', style: 'cancel' }, { text: 'Tạo audio', onPress: () => void run(async () => {
              setProgress(await storyBatchApi.start(selected, plan.planId));
            }) }])}>Tạo audio chương</Action>}
          {progress && <Label muted>{({ COMPLETED: 'Đã hoàn tất', PAUSING: 'Đang dừng cấp đoạn mới',
            PAUSED: 'Đã tạm dừng', NEEDS_ATTENTION: 'Cần kiểm tra', BLOCKED_QUOTA: 'Đã chạm giới hạn',
            RUNNING: 'Đang chạy' } as Record<string, string>)[progress.status] || progress.status} · xong {progress.done}/{progress.total} · đang xử lý {progress.processing}
            {' '}· chờ {progress.queued} · lỗi {progress.failed} · quota {progress.blockedQuota} · chưa rõ {progress.uncertain}</Label>}
          {progress?.status === 'RUNNING' && <Action disabled={busy} onPress={() => void run(async () => {
            setProgress(await storyBatchApi.pause(selected, plan.planId));
          })}>Tạm dừng</Action>}
          {progress?.status === 'PAUSING' && <Label muted>Đoạn đã được cấp có thể hoàn tất; chưa hủy job đang chạy.</Label>}
          {progress && ['PAUSED', 'BLOCKED_QUOTA', 'NEEDS_ATTENTION'].includes(progress.status) && progress.uncertain === 0 &&
            (progress.queued + progress.blockedQuota + progress.submitted + progress.processing + progress.claimed > 0) &&
            <Action disabled={busy} onPress={() => void run(async () => {
              setProgress(await storyBatchApi.resume(selected, plan.planId));
            })}>Tiếp tục</Action>}
          {progress?.uncertain ? <Label muted>Có đoạn chưa rõ trạng thái. Cần đối soát trước khi gửi lại.</Label> : null}
          {progress?.recoveryReason ? <Label muted>{({ PLAN_STALE: 'Chương đã đổi. Hãy tạo kế hoạch mới.',
            WORKER_EVENT_FAILED: 'Kết quả worker chưa xác định; hệ thống không tự gửi lại để tránh phát sinh phí trùng.',
            WORKER_REDRIVE_UNCERTAIN: 'Chưa xác nhận được lượt worker; cần kiểm tra trước khi tiếp tục.',
            HEADLESS_DISABLED: 'Điều phối tự động đang tắt trong cấu hình máy chủ.' } as Record<string, string>)[progress.recoveryReason]
            || progress.recoveryReason}</Label> : null}
          {progress?.items.map(item => <View key={item.segmentId} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.raised }]}>
            <Label muted>Đoạn {item.index + 1} · {item.status} · lần thử {item.attemptCount || 0}/{progress.maxAttempts || 3}</Label>
            {item.errorCode && <Label muted>{item.errorCode}</Label>}
            {item.status === 'FAILED' && item.retryable && <>
              {item.nextRetryAt && <Label muted>Thời điểm thử lại: {new Date(item.nextRetryAt * 1000).toLocaleTimeString()}</Label>}
              <Action disabled={busy || (item.attemptCount || 0) >= (progress.maxAttempts || 3)} onPress={() => void run(async () => {
                setProgress(await storyBatchApi.retry(selected, plan.planId, item.segmentId));
              })}>Thử lại đoạn này</Action>
            </>}
          </View>)}
          {progress && !['RUNNING', 'PAUSING'].includes(progress.status) && <Action disabled={busy} onPress={() => void run(async () => {
            setProgress(await storyBatchApi.progress(selected, plan.planId));
          })}>Làm mới tiến độ</Action>}
        </>}
      </View>}
    </>}
  </Page><Sheet title={languageSheet === 'source' ? 'Ngôn ngữ gốc' : 'Ngôn ngữ đích'} visible={languageSheet !== null} close={() => setLanguageSheet(null)}>
    {languageSheet === 'source' && <Action onPress={() => { setSourceLang('und'); setLanguageSheet(null); }}>Tự nhận diện khi nhập chương</Action>}
    {storyLanguages.map(code => <Action key={code} onPress={() => {
      if (languageSheet === 'source') setSourceLang(code); else setTargetLang(code);
      setLanguageSheet(null);
    }}>{languageLabel(code)}</Action>)}
  </Sheet><Sheet title="Giọng bản dịch" visible={voiceSheet} close={() => setVoiceSheet(false)}>
    {vietnameseVoices.flatMap(item => item.voices.map(voice => <Action key={`${item.provider}:${voice.id}`}
      onPress={() => { setApprovedVoice(voice.id); setVoiceSheet(false); }}>{item.provider} · {voice.name || voice.id}</Action>))}
  </Sheet></>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 6 },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  projectInfo: { flex: 1, minWidth: 0, gap: 4 },
  coverChoice: { alignItems: 'flex-start', gap: 8 },
  coverPreview: { width: 72, height: 108, borderRadius: 10 },
  coverThumb: { width: 60, height: 90, borderWidth: 1, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverLarge: { width: 100, height: 150, borderWidth: 1, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  coverSection: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  coverActions: { flex: 1, alignItems: 'flex-start', gap: 8 },
});
