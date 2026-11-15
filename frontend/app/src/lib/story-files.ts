import { strToU8 } from 'fflate';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { MAX_FILE_BYTES } from '../../../shared/documents';

export async function checkStoryAsset(asset: DocumentPickerAsset) {
  const size = asset.size ?? asset.file?.size ?? (Platform.OS === 'web' ? 0 : await FileSystem.getInfoAsync(asset.uri).then(info => info.exists ? info.size : 0));
  if (!size || size > MAX_FILE_BYTES) throw new Error('Tệp cần có nội dung và tối đa 50 MB.');
  return size;
}
export async function readStoryAsset(asset: DocumentPickerAsset) {
  await checkStoryAsset(asset);
  if (Platform.OS === 'web') {
    const file = asset.file || await fetch(asset.uri).then(response => response.blob());
    if (!file) throw new Error('Không đọc được tệp đã chọn.');
    return new Uint8Array(await file.arrayBuffer());
  }
  const { base64Bytes } = await import('./document');
  return base64Bytes(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
}
export async function shareStoryBackup(value: unknown, name: string) {
  const json = JSON.stringify(value, null, 2);
  if (strToU8(json).length > 20 * 1024 * 1024) throw new Error('Backup tối đa 20 MiB. Hãy chia nhỏ dự án.');
  const fileName = `${name.replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 70) || 'audio-truyen'}.json`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000); return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ chia sẻ tệp.');
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  try { await FileSystem.writeAsStringAsync(uri, json); await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Lưu backup truyện' }); }
  finally { await FileSystem.deleteAsync(uri, { idempotent: true }); }
}
