import Slider from '@react-native-community/slider';
import { Pressable, View } from 'react-native';
import { Icon, Label } from './ui';
import { useStudio } from '../state/Studio';
import { stabilityFromTemperature, temperatureFromStability, type VoiceCloneSettings } from '../../../shared/voice-clone';

export default function VoiceCloneControls({ value, onChange }: { value: VoiceCloneSettings; onChange: (next: VoiceCloneSettings) => void }) {
  const { colors } = useStudio();
  const toggle = (key: 'denoise' | 'useRefCodes', label: string, note: string) => <Pressable key={key} accessibilityRole="switch"
    accessibilityLabel={label} accessibilityState={{ checked: value[key] }} onPress={() => onChange({ ...value, [key]: !value[key] })}
    style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <Icon name={value[key] ? 'check' : 'close'} size={17} color={value[key] ? colors.blue : colors.secondary} />
    <View style={{ flex: 1 }}><Label size={14} weight="500">{label}</Label><Label size={12} muted>{note}</Label></View>
    <Label size={12} style={{ color: colors.blue }}>{value[key] ? 'Bật' : 'Tắt'}</Label>
  </Pressable>;
  const stability = stabilityFromTemperature(value.temperature);
  return <View style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderColor: colors.line }}>
    <Label size={17} weight="600">Tinh chỉnh giọng nhại</Label>
    {toggle('useRefCodes', 'Bám cách nói mẫu', 'Dùng đặc trưng ngữ điệu trong WAV tham chiếu.')}
    {toggle('denoise', 'Lọc nhiễu mẫu', 'Giảm tiếng nền trong đoạn mẫu.')}
    <View style={{ gap: 4, paddingVertical: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Label size={14} weight="500">Độ ổn định</Label><Label size={13} style={{ color: colors.blue }}>{stability}%</Label></View>
      <Slider minimumValue={0} maximumValue={100} step={5} value={stability} minimumTrackTintColor={colors.blue} maximumTrackTintColor={colors.line}
        thumbTintColor={colors.blue} onValueChange={next => onChange({ ...value, temperature: temperatureFromStability(next) })} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label size={11} muted>Biến thiên hơn</Label><Label size={11} muted>Ổn định hơn</Label></View>
      <Label size={12} muted>Nghe một câu ngắn, đổi từng cài đặt rồi tạo lại để so sánh trong Bản thu. Không có mức nào bảo đảm giống hơn.</Label>
    </View>
  </View>;
}
