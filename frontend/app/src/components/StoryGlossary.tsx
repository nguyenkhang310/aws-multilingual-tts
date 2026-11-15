import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Action, Circle, Label } from './ui';
import Sheet from './Sheet';
import { StoryError, StoryInput, storyStyles as styles, useStoryAction } from './StoryControls';
import { storyTranslationApi as api } from '../lib/story-api';
import type { StoryGlossary as Glossary } from '../../../shared/story-translation';

export default function StoryGlossary({ projectId, close }: { projectId: string; close: () => void }) {
  const [data, setData] = useState<Glossary>({ revision: 0, entries: [] }), [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState(''), [target, setTarget] = useState('');
  const { busy, error, setError, run } = useStoryAction();
  useEffect(() => {
    let live = true;
    void api.glossary(projectId).then(value => { if (live) { setData(value); setLoaded(true); } }).catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [projectId, setError]);
  return <Sheet title="Tên riêng và thuật ngữ" visible close={() => { if (!busy) close(); }}>
    <StoryError text={error} /><StoryInput label="Từ gốc" value={source} onChangeText={setSource} maxLength={80} editable={!busy} />
    <StoryInput label="Cách dịch" value={target} onChangeText={setTarget} maxLength={120} editable={!busy} />
    <Action disabled={busy || !loaded || !source.trim() || !target.trim() || data.entries.length >= 200} onPress={() => {
      setData(current => ({ ...current, entries: [...current.entries.filter(item => item.source !== source.trim()), { source: source.trim(), target: target.trim() }] })); setSource(''); setTarget('');
    }}>Thêm thuật ngữ</Action>
    {data.entries.map((item, index) => <View key={`${item.source}/${index}`} style={styles.row}><Label style={{ flex: 1 }}>{item.source} → {item.target}</Label>
      <Circle name="trash" label={`Xóa thuật ngữ ${item.source}`} disabled={busy} onPress={() => setData(current => ({ ...current, entries: current.entries.filter((_, i) => i !== index) }))} /></View>)}
    <Action primary disabled={busy || !loaded} onPress={() => void run(async () => { setData(await api.saveGlossary(projectId, data)); close(); })}>Lưu thuật ngữ</Action>
  </Sheet>;
}
