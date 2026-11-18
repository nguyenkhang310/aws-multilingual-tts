import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, DEMO } from '../lib/api';
import { bytesToBase64, type VoiceProfile } from '../../../shared/voice-clone';
import { prepareVoiceSample } from '../lib/voice-audio';
import FilePickerButton from './FilePickerButton';

export default function VoiceCloneManager({ disabled = false, onChanged }: { disabled?: boolean; onChanged: () => Promise<unknown> }) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [name, setName] = useState('');
  const [sample, setSample] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'idle' | 'reading' | 'saving' | 'refreshing'>('idle');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setProfiles(await api.voiceProfiles()); return true; }
    catch (reason) { setError((reason as Error).message); return false; }
  }, []);
  useEffect(() => { if (!DEMO) void refresh(); }, [refresh]);

  const selectFile = (file: File | null) => {
    setError('');
    if (file && (!/\.(wav|mp3)$/i.test(file.name) || file.size > 10 * 1024 * 1024)) {
      setSample(null); setError('Chọn MP3 hoặc WAV tối đa 10 MiB.'); return;
    }
    setSample(file);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || busy) return;
    if (!name.trim()) { setError('Nhập tên giọng.'); return; }
    if (!sample) { setError('Chọn tệp MP3 hoặc WAV.'); return; }
    if (!consent) { setError('Xác nhận bạn có quyền sử dụng giọng này.'); return; }
    const form = event.currentTarget;
    setBusy(true); setError('');
    try {
      setStage('reading');
      const bytes = await prepareVoiceSample(sample);
      setStage('saving');
      await api.createVoiceProfile(name.trim(), bytesToBase64(bytes), consent);
      form.reset();
      setName(''); setSample(null); setConsent(false);
      setStage('refreshing');
      const [profilesReady, voicesReady] = await Promise.all([refresh(), onChanged()]);
      if (!profilesReady || voicesReady === false) throw new Error('Đã lưu mẫu, nhưng chưa cập nhật danh sách giọng. Hãy thử tải lại.');
      setError('Đã thêm giọng. Chọn thẻ bên dưới để sử dụng.');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); setStage('idle'); }
  };
  const remove = async (profile: VoiceProfile) => {
    if (disabled || busy || !window.confirm(`Xóa hồ sơ “${profile.name}” và mẫu giọng?`)) return;
    setBusy(true); setError('');
    try { await api.removeVoiceProfile(profile.voiceProfileId); await Promise.all([refresh(), onChanged()]); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  return <section className="voice-clone-panel" aria-label="Hồ sơ nhại giọng VieNeu">
    <div><h3>Tạo giọng nhại</h3><p>MP3 hoặc WAV · 3–60 giây · Tối đa 10 MiB</p></div>
    <form onSubmit={save}>
      <label>Tên giọng<input value={name} maxLength={40} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Giọng kể của tôi" disabled={disabled || busy} /></label>
      <FilePickerButton label={sample?.name ?? 'Chọn tệp âm thanh'}
        accept="audio/mpeg,audio/wav,.mp3,.wav" inputLabel="Mẫu giọng" disabled={disabled || busy} onFiles={files => selectFile(files[0] ?? null)} />
      {sample && <small className="clone-file-status" role="status">Đã chọn: {sample.name}</small>}
      <label className="clone-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={disabled || busy} />Tôi có quyền sử dụng giọng này.</label>
      <button type="submit" className="primary-button" disabled={disabled || busy}>
        {busy && <span className="clone-spinner" aria-hidden="true" />}
        {stage === 'reading' ? 'Đang xử lý tệp…' : stage === 'saving' ? 'Đang tải mẫu lên…' : stage === 'refreshing' ? 'Đang hoàn tất…' : 'Tạo giọng'}
      </button>
    </form>
    {error && <p className={`clone-message ${error.startsWith('Đã thêm giọng.') ? 'success' : 'error'}`} role="status">{error}</p>}
    {profiles.length > 0 && <ul>{profiles.map(profile => <li key={profile.voiceProfileId}><span>{profile.name}</span>
      <button type="button" className="text-button" disabled={disabled || busy} onClick={() => void remove(profile)}>Xóa</button></li>)}</ul>}
  </section>;
}
