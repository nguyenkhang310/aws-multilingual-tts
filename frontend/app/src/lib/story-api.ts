import { ApiError, request } from './api';
import { checkedStoryCoverType, storyCoverStorageError, type StoryCover, type StoryProject } from '../../../shared/story';
import { createStoryClient } from '../../../shared/story-client';
export { checkedBackup, safeStoryCast, serializeStoryBackup, storyChunks } from '../../../shared/story';
const key = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const coverPath = (projectId: string) => `/audiobooks/${projectId}/cover`;
type CoverAsset = { uri: string; file?: Blob; fileName?: string | null; fileSize?: number; mimeType?: string | null };
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
  async uploadCover(project: StoryProject, asset: CoverAsset): Promise<StoryProject> {
    const name = asset.fileName || 'cover.jpg';
    const type = asset.mimeType || (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg');
    const sizeBytes = asset.fileSize ?? 0;
    const contentType = checkedStoryCoverType(type, sizeBytes);
    const path = coverPath(project.projectId);
    const ticket = await coverRequest<{ uploadId: string; url: string; fields: Record<string, string>; version: number }>(
      `${path}-upload`, { method: 'POST', body: JSON.stringify({ contentType, sizeBytes, version: project.version }) });
    if (!/^[a-f0-9]{32}$/.test(ticket.uploadId) || !ticket.fields || typeof ticket.url !== 'string' ||
        !['http:', 'https:'].includes(new URL(ticket.url).protocol))
      throw new Error('Máy chủ trả về thông tin tải ảnh không hợp lệ.');
    const form = new FormData();
    Object.entries(ticket.fields).forEach(([field, value]) => form.append(field, value));
    if (asset.file) form.append('file', asset.file, name);
    else form.append('file', { uri: asset.uri, name, type: contentType } as unknown as Blob);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let uploaded: Response;
    try { uploaded = await fetch(ticket.url, { method: 'POST', body: form, signal: controller.signal }); }
    catch { throw new Error('Không tải được ảnh lên kho lưu trữ. Hãy thử lại.'); }
    finally { clearTimeout(timer); }
    if (!uploaded.ok) throw new Error(storyCoverStorageError(uploaded.status, await uploaded.text()));
    const result = await coverRequest<{ project: StoryProject }>(path,
      { method: 'POST', body: JSON.stringify({ uploadId: ticket.uploadId, version: ticket.version }) });
    return result.project;
  },
  async refreshCover(projectId: string): Promise<StoryCover> {
    return (await coverRequest<{ cover: StoryCover }>(coverPath(projectId))).cover;
  },
  async deleteCover(project: StoryProject): Promise<StoryProject> {
    return (await coverRequest<{ project: StoryProject }>(coverPath(project.projectId),
      { method: 'DELETE', body: JSON.stringify({ version: project.version }) })).project;
  },
};
