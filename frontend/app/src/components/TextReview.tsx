import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useLayout } from '../hooks/useLayout';
import { useStudio } from '../state/Studio';
import Sheet from './Sheet';
import { Action, Label } from './ui';

export default function TextReview({ original, suggested, translation = false, limit, error, onChoose, close }: {
  original: string; suggested: string; translation?: boolean; limit: number; error: string;
  onChoose: (text: string) => void; close: () => void;
}) {
  const { colors, isDark } = useStudio();
  const { contentWidth, fontScale } = useLayout();
  const [edited, setEdited] = useState(suggested);
  return <Sheet title={translation ? 'Duyệt bản dịch Azure' : 'Kiểm tra nội dung'} visible close={close}>
    <View style={[styles.comparison, contentWidth < 600 || fontScale > 1.3 ? styles.stacked : undefined]}>
      {[{ title: 'Bản gốc', text: original }, { title: translation ? 'Bản dịch' : 'Bản đề xuất', text: suggested }].map(item =>
        <View key={item.title} style={styles.column}><Label weight="600">{item.title}</Label><Label style={styles.text}>{item.text}</Label></View>)}
    </View>
    <Label weight="600">Nội dung sẽ đọc</Label>
    <TextInput accessibilityLabel={translation ? 'Chỉnh bản dịch' : 'Tự chỉnh nội dung đọc'} multiline value={edited}
      onChangeText={setEdited} maxLength={limit} placeholder="Nhập nội dung sẽ đọc…" placeholderTextColor={colors.faint}
      keyboardAppearance={isDark ? 'dark' : 'light'} textAlignVertical="top" underlineColorAndroid="transparent" selectionColor={colors.blue}
      style={[styles.editor, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.line }]} />
    {!!error && <View accessibilityRole="alert"><Label size={14} style={{ color: colors.danger }}>{error}</Label></View>}
    <Action primary disabled={!edited.trim()} onPress={() => onChoose(edited)}>{translation ? 'Xác nhận và tiếp tục' : 'Dùng nội dung này'}</Action>
    {!translation && <><Action onPress={() => onChoose(suggested)}>Dùng bản đề xuất</Action>
      <Action onPress={() => onChoose(original)}>Giữ bản gốc</Action></>}
  </Sheet>;
}
const styles = StyleSheet.create({
  comparison: { flexDirection: 'row', gap: 20 }, stacked: { flexDirection: 'column' },
  column: { flex: 1, minWidth: 0, gap: 8 }, text: { lineHeight: 25 },
  editor: { minHeight: 160, maxHeight: 300, borderWidth: 1, borderRadius: 18, padding: 14, fontSize: 17, lineHeight: 25 },
});
