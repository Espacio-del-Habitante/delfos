import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label?: string;
  onClick: () => void;
}

export interface ToastPayload {
  message: string;
  type: ToastType;
  duration: number;
  action?: ToastAction | null;
}

export interface ToastState extends ToastPayload {
  visible: boolean;
  exiting: boolean;
}

const DEFAULT_DURATION = 2600;

export const toastState = writable<ToastState | null>(null);

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let exitTimer: ReturnType<typeof setTimeout> | null = null;
let swapPending: ToastPayload | null = null;
let hideAt = 0;
let remainingMs = 0;
let paused = false;

const TOAST_EXIT_MS = 180;

function clearTimers() {
  if (hideTimer) clearTimeout(hideTimer);
  if (exitTimer) clearTimeout(exitTimer);
  hideTimer = null;
  exitTimer = null;
}

function scheduleHide(duration: number) {
  clearTimers();
  remainingMs = duration;
  hideAt = performance.now() + duration;
  hideTimer = setTimeout(() => dismissToast(false), duration);
}

function presentToast(payload: ToastPayload) {
  toastState.set({ ...payload, visible: true, exiting: false });
  scheduleHide(payload.duration);
}

export function showToast(
  message: string,
  options?: { type?: ToastType; duration?: number; action?: ToastAction | null },
): void {
  const payload: ToastPayload = {
    message: String(message ?? ''),
    type: options?.type && ['success', 'error', 'info'].includes(options.type) ? options.type : 'info',
    duration: typeof options?.duration === 'number' && options.duration > 0 ? options.duration : DEFAULT_DURATION,
    action: options?.action ?? null,
  };

  let current: ToastState | null = null;
  toastState.subscribe((v) => { current = v; })();

  if (current?.visible || current?.exiting) {
    swapPending = payload;
    if (current?.visible) dismissToast(false);
    return;
  }

  presentToast(payload);
}

export function dismissToast(fromUser = false): void {
  let current: ToastState | null = null;
  toastState.subscribe((v) => { current = v; })();
  if (!current?.visible && !current?.exiting) return;
  if (current?.exiting) return;

  paused = false;
  clearTimers();
  toastState.update((s) => (s ? { ...s, visible: false, exiting: true } : s));

  exitTimer = setTimeout(() => {
    toastState.set(null);
    if (swapPending) {
      const next = swapPending;
      swapPending = null;
      presentToast(next);
    }
  }, TOAST_EXIT_MS);

  void fromUser;
}

export function pauseToastTimer(): void {
  let current: ToastState | null = null;
  toastState.subscribe((v) => { current = v; })();
  if (!current?.visible || paused) return;
  remainingMs = Math.max(0, hideAt - performance.now());
  paused = true;
  clearTimers();
}

export function resumeToastTimer(): void {
  if (!paused) return;
  paused = false;
  scheduleHide(remainingMs);
}
