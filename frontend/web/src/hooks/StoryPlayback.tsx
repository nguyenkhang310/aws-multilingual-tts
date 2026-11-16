import { createContext, useContext } from 'react';
import type { HistoryItem } from '../lib/types';

export const StoryPlaybackContext = createContext<{
  currentId: string | null; playing: boolean; play: (queue: HistoryItem[]) => Promise<void>;
} | null>(null);
export function useStoryPlayback() {
  const value = useContext(StoryPlaybackContext);
  if (!value) throw new Error('Thiếu trình phát truyện.');
  return value;
}
