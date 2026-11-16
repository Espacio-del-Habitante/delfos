<script lang="ts">
  /** Single bone for loading placeholders. Compose in screens / SkeletonLayout. */
  export let width: string | number = '100%';
  export let height: string | number = '1rem';
  export let radius = 'var(--radius-sm)';
  export let circle = false;
  /** `light` for dark surfaces (Dynamic Island). */
  export let tone: 'default' | 'light' = 'default';
  export let label = 'Cargando';

  $: style = [
    `width:${typeof width === 'number' ? `${width}px` : width}`,
    `height:${typeof height === 'number' ? `${height}px` : height}`,
    `border-radius:${circle ? '999px' : radius}`,
  ].join(';');
</script>

<span
  class="skeleton"
  class:is-circle={circle}
  class:is-light={tone === 'light'}
  style={style}
  role="presentation"
  aria-hidden="true"
></span>
<span class="sr-only">{label}</span>

<style>
  .skeleton {
    display: block;
    flex-shrink: 0;
    background: linear-gradient(
      90deg,
      rgba(15, 23, 42, 0.06) 0%,
      rgba(15, 23, 42, 0.11) 45%,
      rgba(15, 23, 42, 0.06) 90%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.35s var(--ease-out, ease) infinite;
  }

  .skeleton.is-light {
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.08) 0%,
      rgba(255, 255, 255, 0.18) 45%,
      rgba(255, 255, 255, 0.08) 90%
    );
    background-size: 200% 100%;
  }

  .skeleton.is-circle {
    aspect-ratio: 1;
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
      background: rgba(15, 23, 42, 0.08);
    }

    .skeleton.is-light {
      background: rgba(255, 255, 255, 0.12);
    }
  }
</style>
