<script lang="ts">
  // Icon-only mobile tab bar. Shared by every screen so the bar stays identical.
  // In-page sections (Registrar/Movimientos/IA) live in the HeaderIsland quick
  // links, not here — this bar is just the three top-level destinations.
  export let active: 'inicio' | 'inversiones' | 'ajustes' = 'inicio';
</script>

<nav class="bottom-nav" aria-label="Navegación principal">
  <a
    href="/"
    class="bottom-nav__item"
    class:is-active={active === 'inicio'}
    aria-label="Inicio"
    aria-current={active === 'inicio' ? 'page' : undefined}
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  </a>
  <a
    href="/inversiones"
    class="bottom-nav__item"
    class:is-active={active === 'inversiones'}
    aria-label="Inversiones"
    aria-current={active === 'inversiones' ? 'page' : undefined}
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  </a>
  <a
    href="/configuracion"
    class="bottom-nav__item"
    class:is-active={active === 'ajustes'}
    aria-label="Ajustes"
    aria-current={active === 'ajustes' ? 'page' : undefined}
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  </a>
</nav>
