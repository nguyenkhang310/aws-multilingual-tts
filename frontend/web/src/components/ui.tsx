import { Slider as LiquidSlider, type SliderProps as LiquidSliderProps } from "glisse";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import PreferenceSwitch from "./PreferenceSwitch";
import Arrow2Circlepath from "framework7-icons/react/esm/Arrow2Circlepath.js";
import ArrowCounterclockwise from "framework7-icons/react/esm/ArrowCounterclockwise.js";
import ArrowDownToLine from "framework7-icons/react/esm/ArrowDownToLine.js";
import ArrowRight from "framework7-icons/react/esm/ArrowRight.js";
import BackwardEndFill from "framework7-icons/react/esm/BackwardEndFill.js";
import BookFill from "framework7-icons/react/esm/BookFill.js";
import Camera from "framework7-icons/react/esm/Camera.js";
import Checkmark from "framework7-icons/react/esm/Checkmark.js";
import ChevronDown from "framework7-icons/react/esm/ChevronDown.js";
import Clock from "framework7-icons/react/esm/Clock.js";
import DocText from "framework7-icons/react/esm/DocText.js";
import DocOnDoc from "framework7-icons/react/esm/DocOnDoc.js";
import ExclamationmarkTriangleFill from "framework7-icons/react/esm/ExclamationmarkTriangleFill.js";
import ForwardEndFill from "framework7-icons/react/esm/ForwardEndFill.js";
import GearAltFill from "framework7-icons/react/esm/GearAltFill.js";
import Headphones from "framework7-icons/react/esm/Headphones.js";
import LayersAltFill from "framework7-icons/react/esm/LayersAltFill.js";
import LineHorizontal3 from "framework7-icons/react/esm/LineHorizontal3.js";
import MicFill from "framework7-icons/react/esm/MicFill.js";
import MusicNoteList from "framework7-icons/react/esm/MusicNoteList.js";
import PauseFill from "framework7-icons/react/esm/PauseFill.js";
import PlayFill from "framework7-icons/react/esm/PlayFill.js";
import Plus from "framework7-icons/react/esm/Plus.js";
import QuestionCircle from "framework7-icons/react/esm/QuestionCircle.js";
import Repeat from "framework7-icons/react/esm/Repeat.js";
import Search from "framework7-icons/react/esm/Search.js";
import Speaker2Fill from "framework7-icons/react/esm/Speaker2Fill.js";
import SpeakerSlashFill from "framework7-icons/react/esm/SpeakerSlashFill.js";
import SquareArrowUp from "framework7-icons/react/esm/SquareArrowUp.js";
import SquareGrid2x2Fill from "framework7-icons/react/esm/SquareGrid2x2Fill.js";
import TextBubbleFill from "framework7-icons/react/esm/TextBubbleFill.js";
import Trash from "framework7-icons/react/esm/Trash.js";
import Waveform from "framework7-icons/react/esm/Waveform.js";
import Xmark from "framework7-icons/react/esm/Xmark.js";
import CloudFill from "framework7-icons/react/esm/CloudFill.js";

const icons: Record<string, typeof Waveform> = {
  dashboard: SquareGrid2x2Fill,
  translate: TextBubbleFill,
  book: BookFill,
  camera: Camera,
  wave: Waveform,
  arrow: ArrowRight,
  check: Checkmark,
  chevron: ChevronDown,
  help: QuestionCircle,
  clock: Clock,
  download: ArrowDownToLine,
  file: DocText,
  copy: DocOnDoc,
  headphones: Headphones,
  layers: LayersAltFill,
  menu: LineHorizontal3,
  mic: MicFill,
  pause: PauseFill,
  play: PlayFill,
  plus: Plus,
  reset: ArrowCounterclockwise,
  previous: BackwardEndFill,
  next: ForwardEndFill,
  repeat: Repeat,
  queue: MusicNoteList,
  search: Search,
  settings: GearAltFill,
  trash: Trash,
  alert: ExclamationmarkTriangleFill,
  upload: SquareArrowUp,
  volume: Speaker2Fill,
  muted: SpeakerSlashFill,
  close: Xmark,
  loading: Arrow2Circlepath,
  cloud: CloudFill,
};

// Mặc định không gửi form; hình thức nút được quản lý bằng CSS.
export function Button({ type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props} />;
}

type SliderProps = LiquidSliderProps & {
  onValueCommit?: (value: number) => void;
  onGestureCancel?: () => void;
};
const StableSlider = memo(LiquidSlider);
export function Slider({ onValueChange, onValueCommit, onGestureCancel, step = 1, min = 0, max = 100, ...props }: SliderProps) {
  const pointer = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ onValueChange, onValueCommit, onGestureCancel, step, min, max });
  latest.current = { onValueChange, onValueCommit, onGestureCancel, step, min, max };
  const update = useCallback((value: number) => {
    const next = Number(value.toFixed(6));
    latest.current.onValueChange?.(next);
    if (pointer.current === null) latest.current.onValueCommit?.(next);
  }, []);
  const cancel = useCallback(() => {
    if (pointer.current === null) return;
    pointer.current = null; setDragging(false); latest.current.onGestureCancel?.();
  }, []);
  const start = useCallback((event: ReactPointerEvent<HTMLInputElement>) => {
    if (event.currentTarget.disabled || event.button !== 0) return;
    pointer.current = event.pointerId; setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);
  const finish = useCallback((event: ReactPointerEvent<HTMLInputElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null; setDragging(false);
    latest.current.onValueCommit?.(event.currentTarget.valueAsNumber);
  }, []);
  const key = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const { min, max, step } = latest.current;
    const move: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    if (!(event.key in move) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    update(event.key === 'Home' ? min : event.key === 'End' ? max :
      Math.max(min, Math.min(max, event.currentTarget.valueAsNumber + move[event.key] * step)));
  }, [update]);
  return <StableSlider {...props} min={min} max={max} step={Math.min(step, .001)} onValueChange={update}
    data-dragging={dragging || undefined} onPointerDown={start} onPointerUp={finish}
    onLostPointerCapture={cancel} onPointerCancel={cancel} onBlur={cancel} onKeyDown={key} />;
}

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = icons[name] || Waveform;
  return (
    <Component
      width={size}
      height={size}
      focusable="false"
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
    />
  );
}
export function Spinner() {
  return <Icon name="loading" size={17} className="spinner" />;
}
export function Brand() {
  return <span className="brand-logo"><img src="/brand/aws.webp" alt="AWS" />
    <span className="brand-word" aria-hidden="true"><img src="/brand/aws.webp" alt="" /></span></span>;
}
export function ToolArt() {
  const artRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    let visible = true;
    const update = () => {
      art.dataset.moving = String(visible && !document.hidden);
    };
    document.addEventListener("visibilitychange", update);
    if (typeof IntersectionObserver === 'undefined') { update(); return () => document.removeEventListener('visibilitychange', update); }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { threshold: 0 },
    );
    // Observe the cover footprint, not the oversized, scaled 3D drawing inside it.
    observer.observe(art.closest('.track-cover') ?? art);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div ref={artRef} className="tool-art art-studio" data-moving="false" aria-hidden="true">
      <div className="art-object">
        <div className="glass-wave">
          {[28, 49, 73, 94, 77, 53, 32].map((height, index) => (
            <i key={index} style={{ "--bar-height": `${height}%`, "--bar-index": index } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}
export function VoiceAvatar({ id, large = false }: { id: string; large?: boolean }) {
  return (
    <span className={`voice-avatar ${large ? "large" : ""}`} aria-hidden="true">
      {id.trim().charAt(0).toLocaleUpperCase() || "V"}
    </span>
  );
}
export function EmptyState({
  icon = "headphones",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={25} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  className = "",
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const modal = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal?.showModal();
    return () => {
      modal?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }}
      onClick={(e) => {
        if (!dismissible || e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <Button className="icon-button" aria-label="Đóng cửa sổ" disabled={!dismissible} onClick={onClose}>
          <Icon name="close" size={19} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <div className="preference-row">
      <span>
        <strong>{label}</strong>
        {description && <small id={descriptionId}>{description}</small>}
      </span>
      <PreferenceSwitch label={label} descriptionId={description ? descriptionId : undefined} checked={checked} onChange={onChange} />
    </div>
  );
}
