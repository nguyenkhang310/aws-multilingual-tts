import { ApiError, request } from './api';
import { checkedStoryCoverType, storyCoverStorageError, type StoryCover, type StoryProject } from '../../../shared/story';
import { createStoryClient } from '../../../shared/story-client';
export { checkedBackup, safeStoryCast, serializeStoryBackup, storyChunks } from '../../../shared/story';
const key = () => globalThis.crypto.randomUUID().replaceAll('-', '');
const coverPath = (projectId: string) => `/audiobooks/${projectId}/cover`;
const json = (value: unknown) => JSON.stringify(value);
const coverNotFound = (error: unknown): never => {
  if (error instanceof ApiError && error.code === 'NOT_FOUND')
    throw new Error('Không tìm thấy tài nguyên ảnh bìa. Nếu dự án vẫn còn, hãy khởi động lại API local hoặc cập nhật backend M1/M5 trên AWS.');
  throw error;
};

async function coverRequest<T>(path: string, options?: Parameters<typeof request>[1]): Promise<T> {
  try { return await request<T>(path, options); }
  catch (error) { return coverNotFound(error); }
}

const client = createStoryClient(request, key, error => error instanceof ApiError && error.code === 'TRANSLATION_NOT_APPROVED');
export const { storyBatchApi, storyTranslationApi } = client;
export const storyApi = { ...client.storyApi,
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
};
