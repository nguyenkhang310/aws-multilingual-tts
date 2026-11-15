import { useRef } from 'react';
import { Button, Icon } from './ui';

export default function FilePickerButton({ label = 'Nhập tệp', accept, multiple = false, disabled = false,
  onFiles, title, inputLabel }: { label?: string; accept: string; multiple?: boolean; disabled?: boolean;
  onFiles: (files: File[]) => void; title?: string; inputLabel?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <Button className="text-button" disabled={disabled} title={title} onClick={() => input.current?.click()}>
      <Icon name="upload" size={15} />{label}
    </Button>
    <input ref={input} type="file" accept={accept} multiple={multiple} disabled={disabled} hidden tabIndex={-1}
      aria-label={inputLabel}
      onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (files.length) onFiles(files);
      }} />
  </>;
}
