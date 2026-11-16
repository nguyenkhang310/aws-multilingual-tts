import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Glass, Icon, Label } from './ui';
import { usePlayback } from '../state/Playback';
import { useStudio } from '../state/Studio';
import { time } from '../lib/model';

export default function PlaybackBar() {
  const { colors } = useStudio();
  const playback = usePlayback();
  if (!playback.current) return null;
  return <Glass style={{ borderRadius: 30, overflow: 'hidden', padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Mở trình phát bản thu" onPress={() => router.push('/recording')}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 10, alignItems: 'center', padding: 4 }}>
      <View style={{ width: 40, height: 40, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={playback.current.storyChapterId ? 'book' : 'wave'} size={21} color={colors.blue} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Label size={14} weight="600" lines={1}>{playback.current.title || playback.current.text}</Label>
        <Label size={12} muted>{time(playback.position)}{playback.total > 0 ? ` / ${time(playback.total)}` : ''}</Label>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={playback.playing ? 'Tạm dừng âm thanh' : 'Phát âm thanh'}
      disabled={playback.loading} onPress={() => void playback.toggle()} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}>
      {playback.loading ? <ActivityIndicator color={colors.blue} /> : <Icon name={playback.playing ? 'pause' : 'play'} size={23} />}
    </Pressable>
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 25, right: 25, height: 2, backgroundColor: colors.line }}>
      <View style={{ height: 2, width: `${playback.total ? Math.min(100, playback.position / playback.total * 100) : 0}%`, backgroundColor: colors.blue }} />
    </View>
  </Glass>;
}
