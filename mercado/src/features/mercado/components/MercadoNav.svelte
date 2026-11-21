<script lang="ts">
  export let active: 'trip' | 'history' | 'stats' | 'settings' = 'trip';
</script>

<nav class="bottom-nav mercado-bottom-nav" aria-label="Navegación Mercado">
  <a
    href="/"
    class="bottom-nav__item"
    class:is-active={active === 'trip'}
    aria-label="Mercado"
    aria-current={active === 'trip' ? 'page' : undefined}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  </a>
  <a
    href="/historial"
    class="bottom-nav__item"
    class:is-active={active === 'history'}
    aria-label="Historial"
    aria-current={active === 'history' ? 'page' : undefined}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  </a>
  <a
    href="/stats"
    class="bottom-nav__item"
    class:is-active={active === 'stats'}
    aria-label="Stats"
    aria-current={active === 'stats' ? 'page' : undefined}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  </a>
  <a
    href="/ajustes"
    class="bottom-nav__item"
    class:is-active={active === 'settings'}
    aria-label="Ajustes"
    aria-current={active === 'settings' ? 'page' : undefined}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  </a>
</nav>
