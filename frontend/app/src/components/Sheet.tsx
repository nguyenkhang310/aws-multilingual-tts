import type { PropsWithChildren, ReactNode } from 'react';
import { Modal } from 'react-native';
import { Circle } from './ui';
import { Header, KeyboardArea, PageScroll, ScreenFrame } from './layout';
import { useKeyboardState } from '../hooks/useKeyboard';
import { useStudio } from '../state/Studio';
import { BlurScene } from './BlurScene';

export default function Sheet({ title, visible, close, children, left }: PropsWithChildren<{ title: string; visible: boolean; close: () => void; left?: ReactNode }>) {
  const { reducedMotion } = useStudio();
  const keyboard = useKeyboardState();
  return <Modal visible={visible} presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={close}>
    <BlurScene><ScreenFrame bottom={!keyboard.visible}><KeyboardArea>
      <Header title={title} left={left} right={<Circle name="close" label={`Đóng ${title.toLowerCase()}`} onPress={close} />} />
      <PageScroll key={title} blurTarget>{children}</PageScroll>
    </KeyboardArea></ScreenFrame></BlurScene>
  </Modal>;
}
