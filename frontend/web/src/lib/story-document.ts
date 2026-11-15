import { MAX_FILE_BYTES } from '../../../shared/documents';
import { MAX_STORY_CHARS } from '../../../shared/story';
import { extractDocument } from './document';

export async function readStoryFile(file: File, lang = 'vi-VN'): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Tệp tối đa 50 MB.');
  if (!/\.(txt|md)$/i.test(file.name)) return extractDocument(file, { lang, maxChars: MAX_STORY_CHARS });
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const pieces: string[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = decoder.decode(value, { stream: true });
      pieces.push(piece);
      length += piece.length;
      if (length > MAX_STORY_CHARS) throw new Error('Chương vượt 1.000.000 ký tự.');
    }
    pieces.push(decoder.decode());
  } finally { reader.releaseLock(); }
  const text = pieces.join('').replace(/^\uFEFF/, '');
  if (!text.trim() || text.includes('\0')) throw new Error('Tệp không có văn bản hợp lệ.');
  return text;
}
