import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Action, Icon, Label } from './ui';
import { useStudio } from '../state/Studio';
import { api, DEMO } from '../lib/api';
import { base64Bytes } from '../lib/document';
import { inspectReferenceWav, type VoiceProfile } from '../../../shared/voice-clone';

export default function VoiceCloneManager({ onChanged }: { onChanged: () => Promise<boolean> }) {
  const { colors } = useStudio();
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]), [name, setName] = useState('');
  const [sample, setSample] = useState<{ fileName: string; base64: string } | null>(null);
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async () => { try { setProfiles(await api.voiceProfiles()); } catch (reason) { setError((reason as Error).message); } }, []);
  useEffect(() => { if (!DEMO) void refresh(); }, [refresh]);
  const choose = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/wav', copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!/\.wav$/i.test(asset.name) || (asset.size ?? 0) > 2 * 1024 * 1024) throw new Error('Chọn tệp WAV tối đa 2 MiB.');
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const seconds = inspectReferenceWav(base64Bytes(base64));
      setSample({ fileName: asset.name, base64 }); setError(`Mẫu ${seconds.toFixed(1)} giây, sẵn sàng lưu.`);
    } catch (reason) { setError((reason as Error).message); }
  };
  const save = async () => {
    if (!sample || !consent || !name.trim() || busy) return;
    setBusy(true); setError('');
    try { await api.createVoiceProfile(name.trim(), sample.base64, consent); setName(''); setSample(null); setConsent(false); await Promise.all([refresh(), onChanged()]); setError('Đã lưu. Chọn hồ sơ rồi tạo một câu nghe thử.'); }
    catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  const remove = (profile: VoiceProfile) => Alert.alert('Xóa hồ sơ giọng?', `Xóa “${profile.name}” và mẫu WAV đã lưu?`, [
    { text: 'Hủy', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => { void (async () => {
      setBusy(true); setError(''); try { await api.removeVoiceProfile(profile.voiceProfileId); await Promise.all([refresh(), onChanged()]); }
      catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
    })(); } },
  ]);
  return <View style={{ gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
    <View><Label weight="600">Hồ sơ nhại giọng</Label><Label size={12} muted>WAV 3–8 giây, ít nhiễu và chỉ có một người nói.</Label></View>
    <TextInput accessibilityLabel="Tên hồ sơ giọng" value={name} onChangeText={setName} maxLength={40} placeholder="Ví dụ: Giọng kể của tôi"
      placeholderTextColor={colors.faint} editable={!busy} style={{ minHeight: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, color: colors.text }} />
    <Action icon="upload" disabled={busy} onPress={() => void choose()}>{sample?.fileName ?? 'Chọn tệp WAV'}</Action>
    <Pressable accessibilityRole="button" accessibilityState={{ checked: consent }} disabled={busy} onPress={() => setConsent(value => !value)}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Icon name={consent ? 'check' : 'close'} color={consent ? colors.blue : colors.secondary} size={17} />
      <Label size={12} muted>Mẫu là giọng của tôi hoặc tôi có quyền sử dụng.</Label></Pressable>
    <Action primary disabled={busy || !name.trim() || !sample || !consent} onPress={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ giọng'}</Action>
    <Label size={11} muted>Hồ sơ nằm trong vùng dùng chung của mã demo; người khác dùng cùng mã có thể thấy hoặc xóa.</Label>
    {!!error && <Label size={12} style={{ color: error.startsWith('Đã lưu') || error.startsWith('Mẫu ') ? colors.blue : colors.danger }}>{error}</Label>}
    {profiles.map(profile => <View key={profile.voiceProfileId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Label style={{ flex: 1 }}>{profile.name}</Label><Action disabled={busy} onPress={() => remove(profile)}>Xóa</Action></View>)}
  </View>;
}
