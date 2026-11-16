import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, DEMO } from '../lib/api';
import { bytesToBase64, inspectReferenceWav, type VoiceProfile } from '../../../shared/voice-clone';

export default function VoiceCloneManager({ disabled = false, onChanged }: { disabled?: boolean; onChanged: () => Promise<unknown> }) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [name, setName] = useState('');
  const [sample, setSample] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => { try { setProfiles(await api.voiceProfiles()); } catch (reason) { setError((reason as Error).message); } }, []);
  useEffect(() => { if (!DEMO) void refresh(); }, [refresh]);

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSample(file); setError('');
    if (file && (!/\.wav$/i.test(file.name) || file.size > 2 * 1024 * 1024)) setError('Chọn tệp WAV tối đa 2 MiB.');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!sample || !consent || !name.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const bytes = new Uint8Array(await sample.arrayBuffer());
      const seconds = inspectReferenceWav(bytes);
      await api.createVoiceProfile(name.trim(), bytesToBase64(bytes), consent);
      setName(''); setSample(null); setConsent(false);
      await Promise.all([refresh(), onChanged()]);
      setError(`Đã lưu mẫu ${seconds.toFixed(1)} giây. Hãy chọn hồ sơ rồi tạo một câu nghe thử.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async (profile: VoiceProfile) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await api.removeVoiceProfile(profile.voiceProfileId); await Promise.all([refresh(), onChanged()]); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  return <section className="voice-clone-panel" aria-label="Hồ sơ nhại giọng VieNeu">
    <div><h3>Hồ sơ nhại giọng</h3><p>Tải WAV 3–8 giây, ít nhiễu và chỉ có một người nói. Nghe thử rồi chỉnh cài đặt trước lần tạo tiếp theo.</p></div>
    <form onSubmit={save}>
      <label>Tên hồ sơ<input value={name} maxLength={40} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Giọng kể của tôi" disabled={disabled || busy} /></label>
      <label>Mẫu giọng WAV<input type="file" accept="audio/wav,.wav" onChange={selectFile} disabled={disabled || busy} /></label>
      <label className="clone-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={disabled || busy} />Mẫu là giọng của tôi hoặc tôi có quyền sử dụng.</label>
      <button className="primary-button" disabled={disabled || busy || !sample || !consent || !name.trim()}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ giọng'}</button>
    </form>
    <small className="clone-privacy">Hồ sơ lưu trong vùng dùng chung của mã demo; người khác dùng cùng mã có thể thấy hoặc xóa hồ sơ.</small>
    {error && <p className="clone-message" role="status">{error}</p>}
    {profiles.length > 0 && <ul>{profiles.map(profile => <li key={profile.voiceProfileId}><span>{profile.name}</span>
      <button className="text-button" disabled={busy} onClick={() => void remove(profile)}>Xóa</button></li>)}</ul>}
  </section>;
}
