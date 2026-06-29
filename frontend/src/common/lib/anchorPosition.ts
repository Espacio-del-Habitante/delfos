export interface AnchorOptions {
  /** Desired panel width in px. */
  width: number;
  /** Gap between the trigger and the panel. */
  gap?: number;
  /** Minimum distance to keep from the viewport edges. */
  edgePad?: number;
  /** Fallback height used before the panel has been measured. */
  estimatedHeight?: number;
  /** Minimum height the panel is allowed to shrink to. */
  minHeight?: number;
  /** Measured panel height (e.g. panelEl.offsetHeight) once rendered. */
  contentHeight?: number;
  /**
   * Where the transform-origin should point horizontally:
   * - 'left' anchors the origin to the trigger's left edge
   * - 'center' anchors the origin to the trigger's center
   */
  originAlign?: 'left' | 'center';
}

export interface AnchorResult {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  flipUp: boolean;
  /** transform-origin X, relative to the panel's left edge. */
  originX: number;
  /** transform-origin Y, relative to the panel's top edge. */
  originY: number;
}

/**
 * Computes viewport-relative coordinates (for position: fixed) of a popover
 * anchored to a trigger element. The panel is placed below the trigger and
 * flips above when it would be clipped, and is clamped to the viewport.
 */
export function computeAnchorPosition(rect: DOMRect, opts: AnchorOptions): AnchorResult {
  const gap = opts.gap ?? 8;
  const edgePad = opts.edgePad ?? 16;
  const estimatedHeight = opts.estimatedHeight ?? 320;
  const minHeight = opts.minHeight ?? 160;
  const width = opts.width;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = rect.left;
  if (left + width > viewportW - edgePad) {
    left = viewportW - edgePad - width;
  }
  if (left < edgePad) left = edgePad;

  const spaceBelow = viewportH - rect.bottom - gap - edgePad;
  const spaceAbove = rect.top - gap - edgePad;
  const contentHeight = opts.contentHeight || estimatedHeight;

  const flipUp = contentHeight > spaceBelow && spaceAbove > spaceBelow;

  let maxHeight: number;
  let top: number;

  if (flipUp) {
    maxHeight = Math.max(minHeight, spaceAbove);
    const visibleHeight = Math.min(contentHeight, maxHeight);
    top = rect.top - gap - visibleHeight;
    if (top < edgePad) {
      top = edgePad;
      maxHeight = Math.max(minHeight, rect.top - gap - edgePad);
    }
  } else {
    maxHeight = Math.max(minHeight, spaceBelow);
    top = rect.bottom + gap;
    const bottomLimit = top + Math.min(contentHeight, maxHeight);
    if (bottomLimit > viewportH - edgePad) {
      maxHeight = Math.max(minHeight, viewportH - edgePad - top);
    }
  }

  const originX =
    opts.originAlign === 'center' ? rect.left + rect.width / 2 - left : rect.left - left;
  const originY = flipUp ? rect.bottom - top : rect.top - top;

  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(width),
    maxHeight: Math.round(maxHeight),
    flipUp,
    originX: Math.round(originX),
    originY: Math.round(originY),
  };
}

/**
 * Svelte action that relocates a node to a target element (default
 * document.body). This lets floating panels escape ancestors that establish a
 * containing block (transform/filter/will-change) or clip via overflow, so
 * position: fixed resolves against the viewport and z-index is not trapped in a
 * nested stacking context.
 */
export function portal(node: HTMLElement, target: HTMLElement | string = document.body) {
  let targetEl: HTMLElement | null = null;

  function mount(t: HTMLElement | string) {
    targetEl = typeof t === 'string' ? document.querySelector<HTMLElement>(t) : t;
    if (targetEl) targetEl.appendChild(node);
  }

  mount(target);

  return {
    update(t: HTMLElement | string) {
      mount(t);
    },
    destroy() {
      if (node.parentNode) node.parentNode.removeChild(node);
    },
  };
}
