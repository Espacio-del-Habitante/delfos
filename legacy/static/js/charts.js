(function (global) {
  "use strict";

  const CHART_COLORS = [
    "#4f46e5", "#8b5cf6", "#ef4444", "#10b981", "#f59e0b",
    "#06b6d4", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
  ];

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function escapeHtml(str) {
    if (str == null) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatCompact(amount, currency) {
    const n = Number(amount) || 0;
    if (currency === "USD") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
  }

  function emptyState(message) {
    return `
      <div class="chart-empty">
        <span class="chart-empty__icon" aria-hidden="true">◎</span>
        <p class="chart-empty__text">${escapeHtml(message)}</p>
      </div>`;
  }

  function animateBar(el, targetWidth, delay) {
    if (prefersReducedMotion()) {
      el.style.width = `${targetWidth}%`;
      return;
    }
    el.style.width = "0%";
    requestAnimationFrame(() => {
      setTimeout(() => {
        el.style.width = `${targetWidth}%`;
      }, delay);
    });
  }

  function renderCategoryChart(container, data) {
    if (!container) return;
    const items = data?.expenses_by_category || [];
    if (!items.length) {
      container.innerHTML = emptyState("Registra gastos este mes para ver el desglose por categoría.");
      return;
    }

    const max = Math.max(...items.map((i) => i.amount), 1);
    container.innerHTML = `
      <div class="chart-hbars" role="img" aria-label="Gastos del mes por categoría">
        ${items.slice(0, 8).map((item, i) => {
          const pct = Math.max((item.amount / max) * 100, 4);
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return `
            <div class="chart-hbar">
              <div class="chart-hbar__label">
                <span class="chart-hbar__emoji" aria-hidden="true">${escapeHtml(item.emoji)}</span>
                <span class="chart-hbar__name">${escapeHtml(item.category)}</span>
                <span class="chart-hbar__value">${formatCompact(item.amount, item.currency)}</span>
              </div>
              <div class="chart-hbar__track">
                <div class="chart-hbar__fill" style="--bar-color:${color}" data-width="${pct}"></div>
              </div>
            </div>`;
        }).join("")}
      </div>`;

    container.querySelectorAll(".chart-hbar__fill").forEach((bar, i) => {
      animateBar(bar, parseFloat(bar.dataset.width), i * 40);
    });
  }

  function renderEvolutionChart(container, data) {
    if (!container) return;
    const points = data?.spending_evolution || [];
    if (!points.length) {
      container.innerHTML = emptyState("Aún no hay suficientes gastos para mostrar evolución.");
      return;
    }

    const width = 320;
    const height = 140;
    const padX = 8;
    const padY = 16;
    const max = Math.max(...points.map((p) => p.amount), 1);
    const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;

    const coords = points.map((p, i) => {
      const x = padX + i * step;
      const y = height - padY - (p.amount / max) * (height - padY * 2);
      return { x, y, ...p };
    });

    const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height - padY} L ${coords[0].x.toFixed(1)} ${height - padY} Z`;

    const periodLabel =
      data.spending_period === "30d" ? "Últimos 30 días" :
      data.spending_period === "monthly" ? "Totales mensuales" :
      "Últimos 7 días";

    container.innerHTML = `
      <div class="chart-line-wrap">
        <p class="chart-line-wrap__period">${escapeHtml(periodLabel)}</p>
        <svg class="chart-line" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Evolución de gastos">
          <defs>
            <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(79,70,229,0.28)"/>
              <stop offset="100%" stop-color="rgba(79,70,229,0)"/>
            </linearGradient>
          </defs>
          <path class="chart-line__area" d="${areaPath}" fill="url(#chart-area-grad)"/>
          <path class="chart-line__stroke" d="${linePath}" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${coords.map((c) => `<circle class="chart-line__dot" cx="${c.x}" cy="${c.y}" r="3.5" fill="#4f46e5"/>`).join("")}
        </svg>
        <div class="chart-line__labels">
          ${coords.filter((_, i) => i === 0 || i === coords.length - 1 || coords.length <= 5).map((c) =>
            `<span>${escapeHtml(c.label)}</span>`).join("")}
        </div>
      </div>`;

    if (!prefersReducedMotion()) {
      const stroke = container.querySelector(".chart-line__stroke");
      const area = container.querySelector(".chart-line__area");
      if (stroke) {
        const len = stroke.getTotalLength?.() || 400;
        stroke.style.strokeDasharray = len;
        stroke.style.strokeDashoffset = len;
        requestAnimationFrame(() => {
          stroke.style.transition = "stroke-dashoffset 600ms cubic-bezier(0.23, 1, 0.32, 1)";
          stroke.style.strokeDashoffset = "0";
        });
      }
      if (area) {
        area.style.opacity = "0";
        requestAnimationFrame(() => {
          area.style.transition = "opacity 500ms cubic-bezier(0.23, 1, 0.32, 1)";
          area.style.opacity = "1";
        });
      }
    }
  }

  function renderAccountsChart(container, data) {
    if (!container) return;
    const accounts = data?.account_balances || [];
    if (!accounts.length) {
      container.innerHTML = emptyState("Crea cuentas para ver sus balances.");
      return;
    }

    const maxAbs = Math.max(...accounts.map((a) => Math.abs(a.balance)), 1);

    container.innerHTML = `
      <div class="chart-vbars" role="img" aria-label="Balance por cuenta">
        ${accounts.map((acc, i) => {
          const pct = Math.max((Math.abs(acc.balance) / maxAbs) * 100, 6);
          const color = acc.is_negative ? "#ef4444" : CHART_COLORS[i % CHART_COLORS.length];
          return `
            <div class="chart-vbar">
              <div class="chart-vbar__col">
                <div class="chart-vbar__fill${acc.is_negative ? " chart-vbar__fill--negative" : ""}"
                     style="--bar-color:${color};--bar-height:${pct}%"
                     data-height="${pct}"></div>
              </div>
              <span class="chart-vbar__emoji" aria-hidden="true">${escapeHtml(acc.emoji)}</span>
              <span class="chart-vbar__name">${escapeHtml(acc.name)}</span>
              <span class="chart-vbar__value${acc.is_negative ? " chart-vbar__value--negative" : ""}">${formatCompact(acc.balance, acc.currency)}</span>
            </div>`;
        }).join("")}
      </div>`;

    container.querySelectorAll(".chart-vbar__fill").forEach((bar, i) => {
      if (prefersReducedMotion()) {
        bar.style.height = bar.dataset.height + "%";
        return;
      }
      bar.style.height = "0%";
      requestAnimationFrame(() => {
        setTimeout(() => {
          bar.style.height = `${bar.dataset.height}%`;
        }, i * 50);
      });
    });
  }

  function renderCharts(chartData) {
    if (!chartData) return;
    renderCategoryChart(document.querySelector('[data-chart="category"]'), chartData);
    renderEvolutionChart(document.querySelector('[data-chart="evolution"]'), chartData);
    renderAccountsChart(document.querySelector('[data-chart="accounts"]'), chartData);
  }

  global.DelfosCharts = { renderCharts };
})(window);
