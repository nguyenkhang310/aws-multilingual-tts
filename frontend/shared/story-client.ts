import { checkedBackup, safeStoryCast, storyChunks, type StoryBackup, type StoryChapter, type StoryChapterAudio, type StoryPage, type StoryProject, type StorySegment, type StoryPlan, type StoryProgress } from './story';
import type { ApprovedTranslation, StoryGlossary, TranslationChunk, TranslationPlan, TranslationProgress } from './story-translation';
export type StoryRequest = <T>(path: string, options?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<T>;
export type PlanInput = { provider: 'azure' | 'gemini'; voice: string; speed: number;
  style: string; styleIntensity: number; translateTo?: string | null;
  textSource?: 'original' | 'approved_translation' };


export function createStoryClient(request: StoryRequest, id: () => string, isMissingTranslation: (error: unknown) => boolean) {
  const root = '/audiobooks';
  const chapterPath = (projectId: string, chapterId: string) => `${root}/${projectId}/chapters/${chapterId}`;
  const json = (value: unknown) => JSON.stringify(value);
  const translationRoot = (chapter: StoryChapter) => `/audiobooks/${chapter.projectId}/chapters/${chapter.chapterId}`;
  const plan = (chapter: StoryChapter, planId: string) => `${translationRoot(chapter)}/translation-plans/${planId}`;

  const storyTranslationApi = {
    glossary: (projectId: string) => request<StoryGlossary>(`/audiobooks/${projectId}/glossary`),
    saveGlossary: (projectId: string, data: StoryGlossary) => request<StoryGlossary>(
      `/audiobooks/${projectId}/glossary`, { method: 'PUT', body: JSON.stringify(data) }),
    restoreGlossary: (projectId: string, data: StoryGlossary) => request<StoryGlossary>(
      `/audiobooks/${projectId}/glossary`, { method: 'POST', body: json(data) }),
    plans: (chapter: StoryChapter, cursor?: string) => request<StoryPage<TranslationPlan>>(
      `${translationRoot(chapter)}/translation-plans?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
    create: (chapter: StoryChapter, targetLang: string) => request<TranslationPlan>(
      `${translationRoot(chapter)}/translation-plans`, { method: 'POST',
        body: JSON.stringify({ chapterRevision: chapter.revision, targetLang }) }),
    progress: (chapter: StoryChapter, planId: string, signal?: AbortSignal) => request<TranslationProgress>(`${plan(chapter, planId)}/progress`, { signal }),
    action: (chapter: StoryChapter, planId: string, action: 'start' | 'tick' | 'pause' | 'resume', signal?: AbortSignal) =>
      request<TranslationProgress>(`${plan(chapter, planId)}/${action}`, { method: 'POST', body: '{}', signal }),
    chunk: (chapter: StoryChapter, planId: string, index: number) =>
      request<TranslationChunk>(`${plan(chapter, planId)}/chunks/${index}`),
    edit: (chapter: StoryChapter, planId: string, index: number, translatedText: string, version: number) =>
      request<TranslationChunk>(`${plan(chapter, planId)}/chunks/${index}`, { method: 'PUT',
        body: JSON.stringify({ translatedText, version }) }),
    restoreDraft: async (chapter: StoryChapter, draft: { targetLang: string; sourceRevision: number;
      contentRevision: string; glossaryRevision: number;
      chunks: { sourceText: string; translatedText: string | null; translated: boolean; reviewState: string }[] }) => {
      const uploadId = id();
      const base = `${translationRoot(chapter)}/translation-drafts/import/${uploadId}`;
      for (const [index, chunk] of draft.chunks.entries())
        await request(`${base}/${index}`, { method: 'PUT', body: json(chunk) });
      return request(`${base}/commit`, { method: 'POST', body: json({ count: draft.chunks.length,
        targetLang: draft.targetLang, sourceReference: { sourceRevision: draft.sourceRevision,
          contentRevision: draft.contentRevision, glossaryRevision: draft.glossaryRevision } }) });
    },
    retry: (chapter: StoryChapter, planId: string, index: number) =>
      request<TranslationProgress>(`${plan(chapter, planId)}/chunks/${index}/retry`, { method: 'POST', body: '{}' }),
    approved: (chapter: StoryChapter) => request<ApprovedTranslation>(`${translationRoot(chapter)}/approved-translation`),
    async approvedOrNull(chapter: StoryChapter) {
      try { return await this.approved(chapter); }
      catch (error) {
        if (isMissingTranslation(error)) return null;
        throw error;
      }
    },
    approve: (chapter: StoryChapter, planId: string, version: number) =>
      request<ApprovedTranslation>(`${plan(chapter, planId)}/approve`, { method: 'POST', body: JSON.stringify({ version }) }),
    approvedSegment: (chapter: StoryChapter, index: number) =>
      request<{ index: number; text: string }>(`${translationRoot(chapter)}/approved-translation/${index}`),
  };
  const path = (item: Pick<StoryChapter, 'projectId' | 'chapterId'>) => `/audiobooks/${item.projectId}/chapters/${item.chapterId}`;
  const planPath = (item: Pick<StoryChapter, 'projectId' | 'chapterId'>, planId: string) => `${path(item)}/audio-plans/${planId}`;
  const storyBatchApi = {
    plans: (chapter: StoryChapter) => request<StoryPage<StoryPlan> & { quotaRemainingEstimate: number }>(
      `${path(chapter)}/audio-plans?limit=50`),
    create: (chapter: StoryChapter, input: PlanInput) => request<StoryPlan>(
      `${path(chapter)}/audio-plans`, { method: 'POST',
        body: JSON.stringify({ ...input, chapterRevision: chapter.revision }) }),
    start: (chapter: StoryChapter, planId: string) => request<StoryProgress>(
      `${planPath(chapter, planId)}/start`, { method: 'POST', body: '{}' }),
    tick: (chapter: StoryChapter, planId: string, signal?: AbortSignal) => request<StoryProgress>(
      `${planPath(chapter, planId)}/tick`, { method: 'POST', body: '{}', signal }),
    pause: (chapter: StoryChapter, planId: string) => request<StoryProgress>(
      `${planPath(chapter, planId)}/pause`, { method: 'POST', body: '{}' }),
    resume: (chapter: StoryChapter, planId: string) => request<StoryProgress>(
      `${planPath(chapter, planId)}/resume`, { method: 'POST', body: '{}' }),
    retry: (chapter: StoryChapter, planId: string, segmentId: string) => request<StoryProgress>(
      `${planPath(chapter, planId)}/segments/${segmentId}/retry`, { method: 'POST', body: '{}' }),
    progress: (chapter: StoryChapter, planId: string, cursor?: string, signal?: AbortSignal) => request<StoryProgress>(
      `${path(chapter)}/audio-progress?planId=${planId}&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }),
    chapterAudio: (chapter: Pick<StoryChapter, 'projectId' | 'chapterId'>, planId: string) => request<StoryChapterAudio>(`${planPath(chapter, planId)}/chapter-audio`),
    advanceChapterAudio: (chapter: StoryChapter, planId: string) => request<StoryChapterAudio>(
      `${planPath(chapter, planId)}/chapter-audio`, { method: 'POST', body: '{}' }),
  };
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

  const storyApi = {
    projects: () => all<StoryProject>(root),
    project: (projectId: string) => request<StoryProject>(`${root}/${projectId}`),
    createProject: (title: string, sourceLang: string, targetLang: string, description = '', cast?: unknown) =>
      request<StoryProject>(root, { method: 'POST', body: json({ title, sourceLang, targetLang, description, ...(cast ? { cast } : {}) }),
        headers: { 'Idempotency-Key': id() } }),
    renameProject: (item: StoryProject, title: string) => request<StoryProject>(`${root}/${item.projectId}`,
      { method: 'PATCH', body: json({ version: item.version, title }) }),
    updateProjectLanguage: (item: StoryProject, sourceLang: string) => request<StoryProject>(`${root}/${item.projectId}`,
      { method: 'PATCH', body: json({ version: item.version, sourceLang }) }),
    deleteProject: (item: StoryProject) => request(`${root}/${item.projectId}`,
      { method: 'DELETE', body: json({ version: item.version, confirm: true }) }),
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
        const plans = [];
        let planCursor: string | null = null;
        for (let page = 0; page < 50; page++) {
          const result = await storyTranslationApi.plans(metadata, planCursor ?? undefined);
          plans.push(...result.items); planCursor = result.nextCursor;
          if (!planCursor) break;
          if (page === 49) throw new Error('Có quá nhiều bản dịch để xuất an toàn trong một lần.');
        }
        const translationDrafts = [];
        for (const plan of plans) {
          const chunks = [];
          for (let index = 0; index < plan.total; index++) {
            const chunk = await storyTranslationApi.chunk(metadata, plan.planId, index);
            const translated = typeof chunk.translatedText === 'string';
            chunks.push({ sourceText: chunk.sourceText, translated, reviewState: chunk.status,
              translatedText: translated ? chunk.translatedText : null });
          }
          translationDrafts.push({ targetLang: plan.targetLang, sourceRevision: plan.sourceRevision,
            contentRevision: plan.contentRevision, glossaryRevision: plan.glossaryRevision, chunks });
        }
        entries.push({ metadata, sourceText, segments: segments.map(segment => ({ ...segment,
          status: 'DRAFT', jobId: null, audioKey: null })),
          ...(approved ? { approvedTranslation: { targetLang: approved.targetLang, segments: approvedSegments } } : {}),
          ...(translationDrafts.length ? { translationDrafts } : {}) });
      }
      const { cover: _cover, ...backupProject } = project;
      if (backupProject.cast !== undefined) backupProject.cast = safeStoryCast(backupProject.cast);
      const glossary = await storyTranslationApi.glossary(project.projectId);
      return { format: 'voxa-story-v1', project: { ...backupProject, chapterCount: entries.length },
        glossary, chapters: entries };
    },
    async importProject(value: unknown): Promise<StoryProject> {
      const backup = checkedBackup(value);
      const source = backup.project;
      const created = await this.createProject(source.title, source.sourceLang, source.targetLang, source.description,
        safeStoryCast(source.cast ?? backup.cast));
      if (backup.glossary) await storyTranslationApi.restoreGlossary(created.projectId, backup.glossary);
      for (const entry of backup.chapters) {
        const chapter = await this.createChapter(created.projectId, entry.metadata.chapterNumber,
          entry.metadata.title, entry.metadata.sourceLang);
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
        for (const draft of entry.translationDrafts ?? []) await storyTranslationApi.restoreDraft(saved, draft);
      }
      return created;
    },
  };

  return { storyApi, storyBatchApi, storyTranslationApi };
}
