import { tick } from 'svelte';

export const MODAL_EXIT_MS = 160;

export type ModalShellState = {
  rendered: boolean;
  visible: boolean;
  exiting: boolean;
};

export function createModalShellState(): ModalShellState {
  return { rendered: false, visible: false, exiting: false };
}

export async function showModalShell(state: ModalShellState): Promise<ModalShellState> {
  if (state.exiting) {
    return { ...state, exiting: false, visible: true };
  }
  if (state.visible) return state;

  await tick();
  return { ...state, rendered: true, visible: true, exiting: false };
}

export async function hideModalShell(state: ModalShellState): Promise<ModalShellState> {
  if (!state.rendered) return state;

  await new Promise((resolve) => setTimeout(resolve, MODAL_EXIT_MS));
  return { rendered: false, visible: false, exiting: false };
}
