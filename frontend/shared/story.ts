export const MAX_STORY_CHARS = 1_000_000;
export const STORY_CHUNK_CHARS = 30_000;
export const MAX_STORY_BACKUP_BYTES = 20 * 1024 * 1024;
export type StoryPage<T> = { items: T[]; nextCursor: string | null };
export type StoryCover = { url: string; expiresAt: string; contentType: 'image/jpeg' | 'image/png';
  sizeBytes: number; width: number; height: number; updatedAt: string };
export type StoryProject = { schemaVersion: 1; projectId: string; title: string; description: string;
  sourceLang: string; targetLang: string; chapterCount: number; version: number; updatedAt: string; status: string;
  cover?: StoryCover | null; cast?: unknown };
export type StoryChapter = { schemaVersion: 1; chapterId: string; projectId: string; chapterNumber: number;
  title: string; order: number; sourceLang: string; textLength: number; segmentCount: number;
  status: string; revision: number; contentRevision: string | null; updatedAt: string };

/** Bỏ tiền tố chương trùng số đang hiển thị; giữ nguyên các tên khác. */
export function chapterDisplayTitle(number: number, title: string): string {
  let clean = title.trim();
  for (let count = 0; count < 2; count++) {
    const match = /^(?:chương|chuong|chapter)\s*(\d{1,5})(?=$|[\s.:_–—-])[\s.:_–—-]*/iu.exec(clean);
    if (!match || Number(match[1]) !== number) break;
    clean = clean.slice(match[0].length).trim();
  }
  return clean;
}

export function chapterNumberFromFilename(name: string, fallback: number): number {
  const marked = /(?:^|[\s._-])(?:chương|chuong|chapter)\s*[-_. ]*(\d{1,5})(?=$|[\s._–—-])/iu.exec(name);
  const leading = /^\s*(\d{1,5})(?=$|[\s._–—-])/u.exec(name);
  return Number(marked?.[1] ?? leading?.[1] ?? fallback);
}

export function chapterLabel(number: number, title: string): string {
  const name = chapterDisplayTitle(number, title);
  return `Chương ${String(number).padStart(2, '0')}${name ? ` · ${name}` : ''}`;
}
export type StorySegment = { segmentId: string; chapterId: string; order: number; sourceText: string;
  textLength: number; revision: number; status: string; jobId: string | null; audioKey: string | null };
export type StoryBackup = { format: 'voxa-story-v1'; project: Omit<StoryProject, 'cover'>;
  glossary?: { revision: number; entries: { source: string; target: string }[] };
  cast?: unknown;
  chapters: { metadata: StoryChapter; sourceText: string; segments: StorySegment[];
    approvedTranslation?: { targetLang: string; segments: string[] };
    translationDrafts?: { targetLang: string; sourceRevision: number; contentRevision: string;
      glossaryRevision: number; chunks: { sourceText: string; translatedText: string | null;
        translated: boolean; reviewState: string }[] }[] }[] };
export const MAX_STORY_COVER_BYTES = 5 * 1024 * 1024;
export function checkedStoryCoverType(type: string | null | undefined, size: number): 'image/jpeg' | 'image/png' {
  if (!Number.isInteger(size) || size < 1 || size > MAX_STORY_COVER_BYTES)
    throw new Error('Ảnh bìa tối đa 5 MiB.');
  if (type !== 'image/jpeg' && type !== 'image/png')
    throw new Error('Chỉ nhận ảnh JPEG hoặc PNG.');
  return type;
}
export function storyCoverStorageError(status: number, response: string): string {
  const code = /<Code>\s*([^<]+)\s*<\/Code>/i.exec(response)?.[1]?.trim();
  if (code === 'NoSuchBucket') return 'Không tìm thấy bucket lưu ảnh. Cần cập nhật hạ tầng M3 của stack đang dùng.';
  if (code === 'AccessDenied') return 'S3 từ chối quyền tải ảnh. Cần kiểm tra quyền ghi bucket Jobs trong LabRole.';
  if (code === 'SignatureDoesNotMatch' || code === 'ExpiredToken') return 'Phiên tải ảnh đã hết hạn hoặc cấu hình vùng S3 chưa khớp. Hãy chọn lại ảnh.';
  if (code === 'EntityTooLarge') return 'Ảnh vượt giới hạn 5 MiB.';
  if (status === 404) return 'S3 không tìm thấy đích tải ảnh. Kiểm tra lại bucket M3 và phiên triển khai.';
  return `S3 từ chối ảnh (HTTP ${status}). Hãy thử lại hoặc kiểm tra cấu hình bucket.`;
}
export type StoryPlan = { planId: string; projectId: string; chapterId: string; sourceChapterRevision: number;
  planRevision: number; contentRevision: string; provider: 'azure' | 'gemini'; voice: string;
  language: string; translateTo?: string | null; speed: number; style: string; resolvedStyle: string;
  styleIntensity: number; total: number;
  totalChars: number; providerCallsEstimate: number | null;
  createdAt: string; approvedAt: string | null; status: string;
  textSource?: 'original' | 'approved_translation'; translationRevision?: string | null };
export type StoryQueueItem = { index: number; segmentId: string; revision: number; order: number;
  charCount: number; status: string; jobId: string | null; audioUrl?: string | null;
  attemptCount?: number; retryable?: boolean; nextRetryAt?: number | null; errorCode?: string | null;
  recoveryReason?: string | null };
export type StoryProgress = { planId: string; status: string; desiredState?: 'RUNNING' | 'PAUSED'; total: number; totalChars: number;
  recoveryReason?: string | null; lastProgressAt?: string | null;
  quotaRemainingEstimate: number; providerCallsRemainingEstimate?: number | null;
  queued: number; claimed: number; submitted: number;
  processing: number; done: number; failed: number; blockedQuota: number; uncertain: number;
  maxAttempts?: number; percentComplete: number; items: StoryQueueItem[]; nextCursor: string | null };
export type StoryChapterAudio = { planId: string; status: 'NOT_STARTED' | 'STAGING' | 'ASSEMBLING' | 'DONE' | 'MISSING';
  total?: number; processed?: number; audioUrl?: string; downloadUrl?: string; error?: string };
export function storyChunks(text: string): string[] {
  if (!text.trim() || text.length > MAX_STORY_CHARS || text.includes('\0'))
    throw new Error('Chương cần có chữ và tối đa 1.000.000 ký tự.');
  const parts: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + STORY_CHUNK_CHARS, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}

export function serializeStoryBackup(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_STORY_BACKUP_BYTES)
    throw new Error('Backup vượt 20 MiB nên chưa được xuất. Hãy chia dự án thành các phần nhỏ hơn.');
  return serialized;
}

export function safeStoryCast(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeStoryCast);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/(api.?key|secret|credential|authorization|claim.?token|lease|dispatch|presigned.?url)/i.test(key))
    .map(([key, item]) => [key, typeof item === 'string' && /^https?:\/\//i.test(item) ? undefined : safeStoryCast(item)])
    .filter(([, item]) => item !== undefined));
}

export function checkedBackup(value: unknown): StoryBackup {
  const backup = value as StoryBackup;
  if (!backup || backup.format !== 'voxa-story-v1' || backup.project?.schemaVersion !== 1 ||
      typeof backup.project.title !== 'string' || !backup.project.title.trim() || backup.project.title.length > 120 ||
      typeof backup.project.description !== 'string' || backup.project.description.length > 1000 ||
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(backup.project.sourceLang) ||
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(backup.project.targetLang) ||
      !Array.isArray(backup.chapters) || backup.chapters.length > 500)
    throw new Error('File backup Audio Truyện không hợp lệ.');
  for (const chapter of backup.chapters) {
    const translation = chapter.approvedTranslation;
    if (translation && (typeof translation.targetLang !== 'string' ||
        !Array.isArray(translation.segments) || !translation.segments.length || translation.segments.length > 2000 ||
        translation.segments.some(text => typeof text !== 'string' || !text.trim() || text.length > 10000) ||
        translation.segments.reduce((count, text) => count + text.length, 0) > MAX_STORY_CHARS))
      throw new Error('Bản dịch trong backup không hợp lệ.');
    for (const draft of chapter.translationDrafts ?? [])
      if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(draft.targetLang) ||
          !Number.isInteger(draft.sourceRevision) || typeof draft.contentRevision !== 'string' ||
          !Number.isInteger(draft.glossaryRevision) || !Array.isArray(draft.chunks) ||
          !draft.chunks.length || draft.chunks.length > 2000 ||
          draft.chunks.some(chunk => typeof chunk.sourceText !== 'string' || !chunk.sourceText ||
            typeof chunk.translated !== 'boolean' ||
            !['DONE', 'EDITED', 'QUEUED', 'RUNNING', 'FAILED', 'UNCERTAIN', 'BLOCKED_QUOTA'].includes(chunk.reviewState) ||
            (chunk.translated && (typeof chunk.translatedText !== 'string' || !chunk.translatedText.trim())) ||
            (!chunk.translated && chunk.translatedText !== null)) ||
          draft.chunks.reduce((sum, chunk) => sum + (chunk.translatedText?.length ?? 0), 0) > MAX_STORY_CHARS)
        throw new Error('Bản nháp dịch trong backup không hợp lệ.');
    if (chapter.metadata?.schemaVersion !== 1 || typeof chapter.metadata.title !== 'string' ||
        !chapter.metadata.title.trim() || chapter.metadata.title.length > 120 ||
        !Number.isInteger(chapter.metadata.chapterNumber) || chapter.metadata.chapterNumber < 1 ||
        chapter.metadata.chapterNumber > 100000 || !Number.isInteger(chapter.metadata.order) ||
        chapter.metadata.order < 0 || chapter.metadata.order > 100000 ||
        !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(chapter.metadata.sourceLang) ||
        !Number.isInteger(chapter.metadata.revision) || chapter.metadata.revision < 1 ||
        typeof chapter.sourceText !== 'string' ||
        !Array.isArray(chapter.segments) || chapter.segments.length > 2000 ||
        chapter.segments.some((item, index) => item.order !== index || typeof item.sourceText !== 'string' ||
          item.textLength !== item.sourceText.length) ||
        chapter.metadata.segmentCount !== chapter.segments.length ||
        chapter.metadata.textLength !== chapter.sourceText.length ||
        chapter.segments.map(item => item.sourceText).join('') !== chapter.sourceText)
      throw new Error('Chương hoặc đoạn trong backup không khớp.');
    if (chapter.sourceText) storyChunks(chapter.sourceText);
  }
  if (backup.glossary && (!Array.isArray(backup.glossary.entries) || backup.glossary.entries.length > 200 ||
      backup.glossary.entries.some(item => typeof item.source !== 'string' || !item.source.trim() ||
        item.source.length > 80 || typeof item.target !== 'string' || !item.target.trim() || item.target.length > 120)))
    throw new Error('Thuật ngữ trong backup không hợp lệ.');
  return backup;
}
