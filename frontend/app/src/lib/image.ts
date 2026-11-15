import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Giữ chi tiết dấu tiếng Việt nhưng chặn kích thước ảnh truyền sang WebView. */
export async function shrinkImage(uri: string) {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const ratio = Math.min(1, 2400 / Math.max(original.width, original.height), Math.sqrt(4_000_000 / (original.width * original.height)));
  let image = original;
  try {
    if (ratio < 1) image = await ImageManipulator.manipulate(original).resize({ width: Math.round(original.width * ratio), height: Math.round(original.height * ratio) }).renderAsync();
    const { base64 } = await image.saveAsync({ base64: true, compress: 0.95, format: SaveFormat.JPEG });
    if (!base64) throw new Error('Không đọc được ảnh. Hãy thử lại.');
    return base64;
  } finally {
    if (image !== original) image.release();
    original.release();
  }
}
