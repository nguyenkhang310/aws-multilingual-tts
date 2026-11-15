import { ApiError, request } from './api';
import { storyTranslationApi } from './story-translation-api';
import { checkedBackup, checkedStoryCoverType, storyChunks, storyCoverStorageError, type StoryBackup, type StoryChapter, type StoryPage,
  type StoryCover, type StoryProject, type StorySegment } from '../../../shared/story';
export { checkedBackup, storyChunks } from '../../../shared/story';

const root = '/audiobooks';
const chapterPath = (projectId: string, chapterId: string) => `${root}/${projectId}/chapters/${chapterId}`;
const json = (value: unknown) => JSON.stringify(value);
const id = () => crypto.randomUUID().replaceAll('-', '');
const coverPath = (projectId: string) => `${root}/${projectId}/cover`;
const coverNotFound = (error: unknown): never => {
  if (error instanceof ApiError && error.code === 'NOT_FOUND')
    throw new Error('Không tìm thấy tài nguyên ảnh bìa. Nếu dự án vẫn còn, hãy khởi động lại API local hoặc cập nhật backend M1/M5 trên AWS.');
  throw error;
};

async function coverRequest<T>(path: string, options?: Parameters<typeof request>[1]): Promise<T> {
  try { return await request<T>(path, options); }
  catch (error) { return coverNotFound(error); }
}

async function all<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const result: StoryPage<T> = await request(`${path}?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(result?.items)) throw new Error('Trang dữ liệu truyện không hợp lệ.');
    items.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) return items;
  }
  throw new Error('Danh sách quá lớn để tải hết trong một lần.');
}

export const storyApi = {
  projects: () => all<StoryProject>(root),
  project: (projectId: string) => request<StoryProject>(`${root}/${projectId}`),
  createProject: (title: string, sourceLang: string, targetLang: string, description = '') =>
    request<StoryProject>(root, { method: 'POST', body: json({ title, sourceLang, targetLang, description }),
      headers: { 'Idempotency-Key': id() } }),
  renameProject: (item: StoryProject, title: string) => request<StoryProject>(`${root}/${item.projectId}`,
    { method: 'PATCH', body: json({ version: item.version, title }) }),
  updateProjectLanguage: (item: StoryProject, sourceLang: string) => request<StoryProject>(`${root}/${item.projectId}`,
    { method: 'PATCH', body: json({ version: item.version, sourceLang }) }),
  deleteProject: (item: StoryProject) => request(`${root}/${item.projectId}`,
    { method: 'DELETE', body: json({ version: item.version, confirm: true }) }),
  async uploadCover(project: StoryProject, file: File): Promise<StoryProject> {
    const contentType = checkedStoryCoverType(file.type, file.size);
    const path = coverPath(project.projectId);
    const ticket = await coverRequest<{ uploadId: string; url: string; fields: Record<string, string>; version: number }>(
      `${path}-upload`, { method: 'POST', body: json({ contentType, sizeBytes: file.size, version: project.version }) });
    if (!/^[a-f0-9]{32}$/.test(ticket.uploadId) || !ticket.fields || typeof ticket.url !== 'string' ||
        !['http:', 'https:'].includes(new URL(ticket.url).protocol))
      throw new Error('Máy chủ trả về thông tin tải ảnh không hợp lệ.');
    const form = new FormData();
    Object.entries(ticket.fields).forEach(([key, value]) => form.append(key, value));
    form.append('file', file);
    let uploaded: Response;
    try { uploaded = await fetch(ticket.url, { method: 'POST', body: form }); }
    catch { throw new Error('Không tải được ảnh lên kho lưu trữ. Hãy thử lại.'); }
    if (!uploaded.ok) throw new Error(storyCoverStorageError(uploaded.status, await uploaded.text()));
    const result = await coverRequest<{ project: StoryProject }>(path,
      { method: 'POST', body: json({ uploadId: ticket.uploadId, version: ticket.version }) });
    return result.project;
  },
  async refreshCover(projectId: string): Promise<StoryCover> {
    const result = await coverRequest<{ cover: StoryCover }>(coverPath(projectId));
    return result.cover;
  },
  async deleteCover(project: StoryProject): Promise<StoryProject> {
    const result = await coverRequest<{ project: StoryProject }>(coverPath(project.projectId),
      { method: 'DELETE', body: json({ version: project.version }) });
    return result.project;
  },
  chapters: (projectId: string) => all<StoryChapter>(`${root}/${projectId}/chapters`),
  chapter: (projectId: string, chapterId: string) => request<StoryChapter>(chapterPath(projectId, chapterId)),
  createChapter: (projectId: string, chapterNumber: number, title: string, sourceLang?: string, key = id()) =>
    request<StoryChapter>(`${root}/${projectId}/chapters`, { method: 'POST',
      body: json({ chapterNumber, title, sourceLang }), headers: { 'Idempotency-Key': key } }),
  updateChapter: (item: StoryChapter, changes: Partial<Pick<StoryChapter, 'title' | 'chapterNumber' | 'order' | 'sourceLang'>>) =>
    request<StoryChapter>(chapterPath(item.projectId, item.chapterId),
      { method: 'PATCH', body: json({ revision: item.revision, ...changes }) }),
  deleteChapter: (item: StoryChapter) => request(chapterPath(item.projectId, item.chapterId),
    { method: 'DELETE', body: json({ revision: item.revision, confirm: true }) }),
  segmentPage: (item: StoryChapter, cursor?: string) =>
    request<StoryPage<StorySegment>>(`${chapterPath(item.projectId, item.chapterId)}/segments?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  segments: (item: StoryChapter) => all<StorySegment>(`${chapterPath(item.projectId, item.chapterId)}/segments`),
  async source(item: StoryChapter): Promise<string> {
    if (!item.contentRevision) return '';
    const parts: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 64; page++) {
      const result: { text: string; nextCursor: string | null; contentRevision: string } = await request(
        `${chapterPath(item.projectId, item.chapterId)}/source${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (typeof result.text !== 'string' || result.contentRevision !== item.contentRevision)
        throw new Error('Chương đã đổi trong lúc đọc. Hãy tải lại.');
      parts.push(result.text);
      cursor = result.nextCursor;
      if (!cursor) return parts.join('');
    }
    throw new Error('Chương có quá nhiều phần.');
  },
  async saveText(item: StoryChapter, text: string, segmentLengths?: number[]): Promise<StoryChapter> {
    const parts = storyChunks(text);
    const uploadId = id();
    const path = chapterPath(item.projectId, item.chapterId);
    for (let index = 0; index < parts.length; index++)
      await request(`${path}/uploads`, { method: 'PUT', body: json({ uploadId, index, text: parts[index] }) });
    return request<StoryChapter>(`${path}/commit`, { method: 'POST',
      body: json({ uploadId, count: parts.length, revision: item.revision, segmentLengths }) });
  },
  async exportProject(project: StoryProject): Promise<StoryBackup> {
    const chapters = await this.chapters(project.projectId);
    const entries = [];
    for (const metadata of chapters) {
      const sourceText = await this.source(metadata);
      const segments = await this.segments(metadata);
      if (segments.map(item => item.sourceText).join('') !== sourceText)
        throw new Error('Chương đã thay đổi trong lúc xuất. Hãy thử lại.');
      const approved = await storyTranslationApi.approvedOrNull(metadata);
      const approvedSegments = [];
      if (approved) for (let index = 0; index < approved.segmentCount; index++)
        approvedSegments.push((await storyTranslationApi.approvedSegment(metadata, index)).text);
      entries.push({ metadata, sourceText, segments,
        ...(approved ? { approvedTranslation: { targetLang: approved.targetLang, segments: approvedSegments } } : {}) });
    }
    const { cover: _cover, ...backupProject } = project;
    const glossary = await storyTranslationApi.glossary(project.projectId);
    return { format: 'voxa-story-v1', project: { ...backupProject, chapterCount: entries.length },
      glossary, chapters: entries };
  },
  async importProject(value: unknown): Promise<StoryProject> {
    const backup = checkedBackup(value);
    const source = backup.project;
    const created = await this.createProject(source.title, source.sourceLang, source.targetLang, source.description);
    if (backup.glossary?.entries.length)
      await storyTranslationApi.saveGlossary(created.projectId, { revision: 0, entries: backup.glossary.entries });
    const chapters = new Map<string, string>();
    for (const entry of backup.chapters) {
      const chapter = await this.createChapter(created.projectId, entry.metadata.chapterNumber,
        entry.metadata.title, entry.metadata.sourceLang);
      chapters.set(entry.metadata.chapterId, chapter.chapterId);
      let saved = chapter;
      if (entry.metadata.order !== chapter.order)
        saved = await this.updateChapter(saved, { order: entry.metadata.order });
      if (entry.sourceText) saved = await this.saveText(saved, entry.sourceText,
        entry.segments.map(segment => segment.textLength));
      if (entry.approvedTranslation) {
        const uploadId = id();
        const base = chapterPath(saved.projectId, saved.chapterId) + `/approved-translation/import/${uploadId}`;
        for (const [index, text] of entry.approvedTranslation.segments.entries())
          await request(`${base}/${index}`, { method: 'PUT', body: json({ text }) });
        await request(`${base}/commit`, { method: 'POST', body: json({ count: entry.approvedTranslation.segments.length,
          targetLang: entry.approvedTranslation.targetLang, version: 0 }) });
      }
    }
    return created;
  },
};
