import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useStudio } from '../state/Studio';
import { Glass, Label } from './ui';

export function StoryCard({ children }: PropsWithChildren) {
  return <Glass style={storyStyles.card}>{children}</Glass>;
}
export function StoryInput({ label, multiline, style, ...props }: TextInputProps & { label: string }) {
  const { colors, isDark } = useStudio();
  return <View style={{ gap: 8, minWidth: 0 }}><Label size={14} weight="600">{label}</Label>
    <TextInput {...props} accessibilityLabel={label} multiline={multiline} keyboardAppearance={isDark ? 'dark' : 'light'}
      placeholderTextColor={colors.faint} underlineColorAndroid="transparent" textAlignVertical={multiline ? 'top' : 'center'}
      style={[storyStyles.input, { color: colors.text, backgroundColor: colors.raised, borderColor: colors.line },
        multiline && { minHeight: 180, maxHeight: 360 }, style]} />
  </View>;
}
export function StoryError({ text }: { text: string }) {
  const { colors } = useStudio();
  return text ? <View accessibilityRole="alert"><Label style={{ color: colors.danger }}>{text}</Label></View> : null;
}
export function useStoryAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Chưa hoàn tất thao tác.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }, []);
  const background = useCallback(async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    try { await action(); } finally { locked.current = false; }
  }, []);
  return { busy, error, setError, run, background };
}
/** A paused/background screen never dispatches a new request; resume also refreshes stale URLs. */
export function useStoryPolling(enabled: boolean, action: (signal: AbortSignal) => Promise<void>, onError: (message: string) => void) {
  const focused = useIsFocused();
  const latest = useRef({ action, onError });
  useEffect(() => { latest.current = { action, onError }; }, [action, onError]);
  useEffect(() => {
    if (!enabled || !focused) return;
    let live = true, inFlight = false, delay = 4000;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const foreground = () => AppState.currentState === null || AppState.currentState === 'active';
    const tick = async () => {
      if (!live || !foreground() || inFlight) return;
      inFlight = true; controller = new AbortController();
      try { await latest.current.action(controller.signal); delay = 4000; }
      catch (error) { if (live && !controller.signal.aborted) latest.current.onError(error instanceof Error ? error.message : 'Chưa làm mới được.'); delay = Math.min(delay * 2, 30000); }
      finally { inFlight = false; if (live && foreground()) timer = setTimeout(tick, delay); }
    };
    timer = setTimeout(tick, delay);
    const subscription = AppState.addEventListener('change', () => { clearTimeout(timer); if (foreground()) void tick(); else controller?.abort(); });
    return () => { live = false; clearTimeout(timer); controller?.abort(); subscription.remove(); };
  }, [enabled, focused]);
}
export const storyStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 26, padding: 18, gap: 16, minWidth: 0 },
  input: { borderWidth: 1, borderRadius: 16, minHeight: 48, padding: 13, fontSize: 16, lineHeight: 24 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
});
