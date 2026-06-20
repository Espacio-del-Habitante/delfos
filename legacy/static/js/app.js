(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const quickText = $("#quick-text");
  const btnAnalyze = $("#btn-analyze");
  const btnSaveNote = $("#btn-save-note");
  const btnClear = $("#btn-clear");
  const btnVoice = $("#btn-voice");
  const voiceStatus = $("#voice-status");
  const previewCard = $("#ia-preview");
  const previewItems = $("#preview-items");
  const previewReflection = $("#preview-reflection");
  const aiUnavailable = $("#ai-unavailable");
  const btnConfirm = $("#btn-confirm");
  const btnCancelPreview = $("#btn-cancel-preview");
  const toastEl = $("#toast");
  const toastMessageEl = toastEl?.querySelector(".toast__message");
  const toastDismissEl = toastEl?.querySelector(".toast__dismiss");
  const toastProgressEl = toastEl?.querySelector(".toast__progress");

  const TOAST_EXIT_MS = 180;
  const TOAST_DEFAULT_DURATION = 2600;
  const TOAST_TYPES = new Set(["success", "error", "info"]);

  let toastHideTimer = null;
  let toastExitTimer = null;
  let toastVisible = false;
  let toastExiting = false;
  let toastSwapPending = null;
  let toastPaused = false;
  let toastHideAt = 0;
  let toastRemainingMs = 0;

  function clearToastTimers() {
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
      toastHideTimer = null;
    }
    if (toastExitTimer) {
      clearTimeout(toastExitTimer);
      toastExitTimer = null;
    }
  }

  function normalizeToastOptions(options) {
    if (options == null || typeof options !== "object") return {};
    return options;
  }

  function applyToastPayload(payload) {
    const { message, type, duration, action } = payload;
    toastMessageEl.textContent = message;
    toastEl.classList.remove("toast--success", "toast--error", "toast--info");
    const safeType = TOAST_TYPES.has(type) ? type : "info";
    toastEl.classList.add(`toast--${safeType}`);
    toastEl.style.setProperty("--toast-duration", `${duration}ms`);

    let actionBtn = toastEl.querySelector(".toast__action");
    if (action && typeof action.onClick === "function") {
      if (!actionBtn) {
        actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "toast__action";
        toastMessageEl.insertAdjacentElement("afterend", actionBtn);
      }
      actionBtn.textContent = action.label || "Ver";
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        action.onClick();
        dismissToast(true);
      };
    } else if (actionBtn) {
      actionBtn.remove();
    }

    if (toastProgressEl) {
      toastProgressEl.style.animation = "none";
      toastProgressEl.style.transform = "scaleX(1)";
      void toastProgressEl.offsetWidth;
      toastProgressEl.style.animation = "";
      toastProgressEl.style.transform = "";
      toastProgressEl.style.animationPlayState = "";
    }
  }

  function scheduleToastHide(duration) {
    clearToastTimers();
    toastRemainingMs = duration;
    toastHideAt = performance.now() + duration;
    toastHideTimer = setTimeout(() => dismissToast(false), duration);
  }

  function presentToast(payload) {
    applyToastPayload(payload);
    toastEl.hidden = false;
    toastExiting = false;
    toastPaused = false;
    toastEl.classList.remove("is-exiting");
    requestAnimationFrame(() => {
      toastEl.classList.add("is-visible");
    });
    toastVisible = true;
    scheduleToastHide(payload.duration);
  }

  function dismissToast(fromUser) {
    if (!toastEl || (!toastVisible && !toastExiting)) return;
    if (toastExiting) return;

    toastExiting = true;
    toastVisible = false;
    toastPaused = false;
    clearToastTimers();
    toastEl.classList.remove("is-visible");
    toastEl.classList.add("is-exiting");
    if (toastProgressEl) toastProgressEl.style.animationPlayState = "paused";

    toastExitTimer = setTimeout(() => {
      toastEl.classList.remove("is-exiting");
      toastEl.hidden = true;
      toastExiting = false;

      if (toastSwapPending) {
        const next = toastSwapPending;
        toastSwapPending = null;
        presentToast(next);
      }
    }, TOAST_EXIT_MS);
  }

  function pauseToastTimer() {
    if (!toastVisible || toastPaused) return;
    toastRemainingMs = Math.max(0, toastHideAt - performance.now());
    toastPaused = true;
    clearToastTimers();
    if (toastProgressEl) toastProgressEl.style.animationPlayState = "paused";
  }

  function resumeToastTimer() {
    if (!toastPaused) return;
    toastPaused = false;
    if (toastProgressEl) toastProgressEl.style.animationPlayState = "running";
    scheduleToastHide(toastRemainingMs);
  }

  function showToast(message, options) {
    if (!toastEl || !toastMessageEl) return;

    const opts = normalizeToastOptions(options);
    const payload = {
      message: String(message ?? ""),
      type: TOAST_TYPES.has(opts.type) ? opts.type : "info",
      duration:
        typeof opts.duration === "number" && opts.duration > 0
          ? opts.duration
          : TOAST_DEFAULT_DURATION,
      action: opts.action ?? null,
    };

    if (toastVisible || toastExiting) {
      toastSwapPending = payload;
      if (toastVisible) dismissToast(false);
      return;
    }

    presentToast(payload);
  }

  if (toastEl) {
    toastEl.addEventListener("mouseenter", pauseToastTimer);
    toastEl.addEventListener("mouseleave", resumeToastTimer);
    toastEl.addEventListener("click", (e) => {
      if (e.target.closest(".toast__action") || e.target.closest(".toast__dismiss")) return;
      dismissToast(true);
    });
    toastDismissEl?.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissToast(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pauseToastTimer();
      else resumeToastTimer();
    });
  }
  let accounts = [];
  let categories = [];
  let accountTypes = {};
  let records = { expenses: [], investments: [], notes: [] };
  let editState = { type: null, id: null };

  const FREQUENT_EMOJIS = [
    "🍽️", "☕", "🚌", "🛒", "🏥", "📚", "🎬", "💡",
    "🏠", "👕", "📈", "💰", "📝", "🏷️", "🎁", "✈️",
    "💊", "🐾", "🎮", "💳", "🍔", "🥗", "🍺", "💼",
  ];

  const KIND_LABELS = {
    expense: "Gasto",
    investment: "Inversión",
    note: "Nota",
    general: "General",
  };

  try {
    accounts = JSON.parse($("#initial-accounts")?.textContent || "[]");
  } catch {
    accounts = [];
  }
  try {
    accountTypes = JSON.parse($("#account-types")?.textContent || "{}");
  } catch {
    accountTypes = {};
  }

  let pendingPreview = null;
  let recognition = null;

  function escapeHtml(str) {
    if (str == null) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  let openCustomSelect = null;

  function createCustomSelect({ options, value, placeholder, onChange, renderOption, name, required, id }) {
    const root = document.createElement("div");
    root.className = "custom-select";

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    if (name) hidden.name = name;
    if (id) hidden.id = id;
    if (required) hidden.required = true;
    hidden.value = value ?? "";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const valueEl = document.createElement("span");
    valueEl.className = "custom-select__value";
    const chevron = document.createElement("span");
    chevron.className = "custom-select__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    trigger.appendChild(valueEl);
    trigger.appendChild(chevron);

    const panel = document.createElement("div");
    panel.className = "custom-select__panel";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");

    let focusIndex = -1;

    function findOption(val) {
      return options.find((o) => String(o.value) === String(val));
    }

    function renderValue() {
      const opt = findOption(hidden.value);
      if (renderOption && opt) {
        valueEl.innerHTML = renderOption(opt, false);
      } else if (opt) {
        valueEl.textContent = opt.label;
      } else {
        valueEl.textContent = placeholder || "Seleccionar";
        valueEl.classList.add("muted");
      }
      if (opt || hidden.value) valueEl.classList.remove("muted");
    }

    function buildPanel() {
      panel.innerHTML = "";
      options.forEach((opt, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "custom-select__option";
        btn.dataset.value = opt.value;
        btn.dataset.index = String(index);
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", String(opt.value) === String(hidden.value) ? "true" : "false");
        if (String(opt.value) === String(hidden.value)) btn.classList.add("is-selected");
        if (renderOption) btn.innerHTML = renderOption(opt, true);
        else btn.textContent = opt.label;
        btn.addEventListener("click", () => selectValue(opt.value));
        panel.appendChild(btn);
      });
    }

    function selectValue(val) {
      hidden.value = val;
      renderValue();
      buildPanel();
      closePanel();
      onChange?.(val, findOption(val));
    }

    function openPanel() {
      if (openCustomSelect && openCustomSelect !== api) openCustomSelect.closePanel();
      openCustomSelect = api;
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      root.classList.add("is-open");
      focusIndex = options.findIndex((o) => String(o.value) === String(hidden.value));
    }

    function closePanel() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
      if (openCustomSelect === api) openCustomSelect = null;
      focusIndex = -1;
      panel.querySelectorAll(".is-focused").forEach((el) => el.classList.remove("is-focused"));
    }

    function focusOption(index) {
      const buttons = panel.querySelectorAll(".custom-select__option");
      buttons.forEach((b) => b.classList.remove("is-focused"));
      if (index < 0 || index >= buttons.length) return;
      focusIndex = index;
      buttons[index].classList.add("is-focused");
      buttons[index].scrollIntoView({ block: "nearest" });
    }

    trigger.addEventListener("click", () => {
      if (root.classList.contains("is-open")) closePanel();
      else openPanel();
    });

    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (root.classList.contains("is-open") && focusIndex >= 0) {
          selectValue(options[focusIndex].value);
        } else {
          openPanel();
        }
      } else if (e.key === "Escape") {
        closePanel();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!root.classList.contains("is-open")) openPanel();
        focusOption(Math.min(focusIndex + 1, options.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!root.classList.contains("is-open")) openPanel();
        focusOption(Math.max(focusIndex - 1, 0));
      }
    });

    const onDocClick = (e) => {
      if (!root.contains(e.target)) closePanel();
    };
    document.addEventListener("click", onDocClick);

    const api = {
      root,
      hidden,
      setOptions(newOptions, newValue) {
        options = newOptions;
        if (newValue !== undefined) hidden.value = newValue;
        buildPanel();
        renderValue();
      },
      setValue(val) {
        selectValue(val);
      },
      getValue() {
        return hidden.value;
      },
      closePanel,
      destroy() {
        document.removeEventListener("click", onDocClick);
        root.remove();
      },
    };

    buildPanel();
    renderValue();
    root.appendChild(hidden);
    root.appendChild(trigger);
    root.appendChild(panel);
    return api;
  }

  function mountCustomSelects(container) {
    const scope = container || document;
    scope.querySelectorAll("select:not([data-native-select-hidden])").forEach((select) => {
      if (select.closest(".custom-select")) return;

      const options = Array.from(select.options).map((o) => ({
        value: o.value,
        label: o.textContent.trim(),
      }));

      const instance = createCustomSelect({
        options,
        value: select.value,
        name: select.name || undefined,
        required: select.required,
        id: select.id || undefined,
        placeholder: options.find((o) => o.value === "")?.label || "Seleccionar",
        onChange: (val) => {
          select.value = val;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        },
      });

      if (select.name) {
        instance.hidden.name = select.name;
        select.removeAttribute("name");
      }

      select.dataset.nativeSelectHidden = "true";
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");
      select._customSelectInstance = instance;
      select.parentNode.insertBefore(instance.root, select);
    });
  }

  function updateIslandStatus(summary, ollamaOk) {
    const dot = $("#island-status-dot");
    const text = $("#island-status");
    if (typeof ollamaOk === "boolean") {
      if (dot) {
        dot.classList.toggle("is-online", ollamaOk);
        dot.classList.toggle("is-offline", !ollamaOk);
      }
      if (text) {
        text.textContent = ollamaOk ? "Ollama conectado" : "Ollama desconectado";
      }
      return;
    }
    if (text && summary?.status) {
      text.textContent = summary.status;
    }
  }

  async function checkOllamaHealth() {
    try {
      const res = await fetch("/api/ollama/health");
      const data = await res.json();
      updateIslandStatus(null, !!data.ok);
    } catch {
      updateIslandStatus(null, false);
    }
  }

  function formatMap(map) {
    if (!map || typeof map !== "object") return "$0";
    return Object.entries(map)
      .map(([, val]) => val)
      .join(" · ") || "$0";
  }

  function accountTypeOptions(selected) {
    return Object.entries(accountTypes)
      .map(([key, label]) => `<option value="${escapeHtml(key)}"${key === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function categoriesForKind(kind) {
    return categories.filter((c) => c.kind === kind || c.kind === "general");
  }

  function buildEmojiPicker(container, value, onChange) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "emoji-picker";

    const grid = document.createElement("div");
    grid.className = "emoji-picker__grid";

    let current = value || "🏷️";

    const setEmoji = (emoji) => {
      current = emoji || "🏷️";
      grid.querySelectorAll(".emoji-picker__btn").forEach((btn) => {
        btn.classList.toggle("is-selected", btn.dataset.emoji === current);
      });
      manualInput.value = current;
      onChange?.(current);
    };

    FREQUENT_EMOJIS.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-picker__btn";
      btn.dataset.emoji = emoji;
      btn.textContent = emoji;
      btn.setAttribute("aria-label", emoji);
      if (emoji === current) btn.classList.add("is-selected");
      btn.addEventListener("click", () => setEmoji(emoji));
      grid.appendChild(btn);
    });

    const manualRow = document.createElement("div");
    manualRow.className = "emoji-picker__manual";
    const manualLabel = document.createElement("span");
    manualLabel.className = "emoji-picker__manual-label";
    manualLabel.textContent = "Otro:";
    const manualInput = document.createElement("input");
    manualInput.type = "text";
    manualInput.maxLength = 4;
    manualInput.value = current;
    manualInput.setAttribute("aria-label", "Emoji manual");
    manualInput.addEventListener("input", () => setEmoji(manualInput.value.trim() || "🏷️"));

    manualRow.appendChild(manualLabel);
    manualRow.appendChild(manualInput);
    container.appendChild(grid);
    container.appendChild(manualRow);
  }

  function buildCategorySelector(container, kind, selectedCategory, onChange) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "category-selector";

    const selectedName = typeof selectedCategory === "string"
      ? selectedCategory
      : selectedCategory?.name || "";

    const buildOptions = () => {
      const opts = [{ value: "", label: "Seleccionar categoría" }];
      categoriesForKind(kind).forEach((cat) => {
        opts.push({ value: cat.id, label: `${cat.emoji} ${cat.name}`, emoji: cat.emoji, name: cat.name });
      });
      opts.push({ value: "__new__", label: "+ Crear nueva categoría" });
      return opts;
    };

    let selectedValue = "";
    categoriesForKind(kind).forEach((cat) => {
      if (
        selectedCategory?.id === cat.id ||
        (selectedName && cat.name.toLowerCase() === selectedName.toLowerCase())
      ) {
        selectedValue = cat.id;
      }
    });

    const inlineForm = document.createElement("div");
    inlineForm.className = "category-selector__new";
    inlineForm.hidden = true;

    const newLabel = document.createElement("span");
    newLabel.className = "category-selector__new-label";
    newLabel.textContent = "Nueva categoría";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "form-control";
    nameInput.placeholder = "Nombre de categoría";
    nameInput.setAttribute("aria-label", "Nombre de nueva categoría");

    const emojiContainer = document.createElement("div");
    let newEmoji = "🏷️";

    let selectInstance = null;

    const notifyChange = () => {
      const val = selectInstance?.getValue() || "";
      if (val === "__new__") {
        const name = nameInput.value.trim();
        if (name) onChange?.({ name, emoji: newEmoji, isNew: true });
        return;
      }
      if (!val) {
        onChange?.({ name: "", emoji: "" });
        return;
      }
      const cat = categories.find((c) => c.id === val);
      if (cat) onChange?.({ id: cat.id, name: cat.name, emoji: cat.emoji });
    };

    buildEmojiPicker(emojiContainer, newEmoji, (emoji) => {
      newEmoji = emoji;
      notifyChange();
    });

    inlineForm.appendChild(newLabel);
    inlineForm.appendChild(nameInput);
    inlineForm.appendChild(emojiContainer);

    selectInstance = createCustomSelect({
      options: buildOptions(),
      value: selectedValue,
      placeholder: "Seleccionar categoría",
      renderOption: (opt) => escapeHtml(opt.label),
      onChange: (val) => {
        inlineForm.hidden = val !== "__new__";
        notifyChange();
      },
    });
    selectInstance.root.classList.add("category-selector__select");

    nameInput.addEventListener("input", notifyChange);
    container.appendChild(selectInstance.root);
    container.appendChild(inlineForm);

    if (selectedName && !selectedValue) {
      selectInstance.setValue("__new__");
      inlineForm.hidden = false;
      nameInput.value = selectedName;
      if (selectedCategory?.emoji) {
        newEmoji = selectedCategory.emoji;
        buildEmojiPicker(emojiContainer, newEmoji, (emoji) => {
          newEmoji = emoji;
          notifyChange();
        });
      }
    }

    notifyChange();
  }

  function bindCardActions(container) {
    container?.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const type = btn.dataset.type;
        const id = btn.dataset.id;
        if (btn.dataset.action === "edit") openEditModal(type, id);
        else if (btn.dataset.action === "delete") confirmDeleteRecord(type, id);
      });
    });
  }

  function findRecord(recordType, recordId) {
    if (recordType === "account") {
      return accounts.find((a) => a.id === recordId) || null;
    }
    const key = recordType === "expense" ? "expenses" : recordType === "investment" ? "investments" : "notes";
    return records[key]?.find((r) => r.id === recordId) || null;
  }

  function recordTitle(recordType) {
    const titles = { account: "Editar cuenta", expense: "Editar gasto", investment: "Editar inversión", note: "Editar nota" };
    return titles[recordType] || "Editar";
  }

  function buildEditForm(recordType, record) {
    if (recordType === "account") {
      return `
        <label class="edit-form__field">Nombre
          <input class="edit-form__input" name="name" value="${escapeHtml(record.name)}" required>
        </label>
        <label class="edit-form__field">Tipo
          <select class="edit-form__input" name="type">${accountTypeOptions(record.type)}</select>
        </label>
        <label class="edit-form__field">Moneda
          <select class="edit-form__input" name="currency">
            <option value="COP"${record.currency === "COP" ? " selected" : ""}>COP</option>
            <option value="USD"${record.currency === "USD" ? " selected" : ""}>USD</option>
          </select>
        </label>
        <label class="edit-form__field">Emoji
          <input class="edit-form__input" name="emoji" value="${escapeHtml(record.emoji || "💰")}" maxlength="4">
        </label>
        <label class="edit-form__field">Balance inicial
          <input class="edit-form__input" type="number" name="initial_balance" value="${record.initial_balance ?? 0}" step="0.01">
        </label>
        <label class="edit-form__field">Balance actual
          <input class="edit-form__input" type="number" name="current_balance" value="${record.current_balance ?? 0}" step="0.01">
        </label>`;
    }
    if (recordType === "expense") {
      return `
        <label class="edit-form__field">Fecha
          <input class="edit-form__input" type="date" name="date" value="${escapeHtml(record.date || "")}">
        </label>
        <label class="edit-form__field">Cuenta
          <select class="edit-form__input" name="account_id">${accountOptions(record.account_id)}</select>
        </label>
        <div class="edit-form__row">
          <label class="edit-form__field">Monto
            <input class="edit-form__input" type="number" name="amount" value="${record.amount ?? ""}" min="0" step="0.01" required>
          </label>
          <label class="edit-form__field">Moneda
            <select class="edit-form__input" name="currency">
              <option value="COP"${record.currency === "COP" ? " selected" : ""}>COP</option>
              <option value="USD"${record.currency === "USD" ? " selected" : ""}>USD</option>
            </select>
          </label>
        </div>
        <div class="edit-form__row">
          <label class="edit-form__field edit-form__field--full">Categoría
            <div id="edit-category-selector"></div>
            <input type="hidden" name="category" value="${escapeHtml(record.category || "")}">
            <input type="hidden" name="category_emoji" value="${escapeHtml(record.category_emoji || "")}">
          </label>
        </div>
        <label class="edit-form__field">Descripción
          <input class="edit-form__input" name="description" value="${escapeHtml(record.description || "")}">
        </label>
        <label class="edit-form__field">Método de pago
          <input class="edit-form__input" name="payment_method" value="${escapeHtml(record.payment_method || "")}">
        </label>`;
    }
    if (recordType === "investment") {
      return `
        <label class="edit-form__field">Fecha
          <input class="edit-form__input" type="date" name="date" value="${escapeHtml(record.date || "")}">
        </label>
        <label class="edit-form__field">Cuenta
          <select class="edit-form__input" name="account_id">${accountOptions(record.account_id)}</select>
        </label>
        <label class="edit-form__field">Activo
          <input class="edit-form__input" name="asset" value="${escapeHtml(record.asset || "")}" required>
        </label>
        <label class="edit-form__field">Tipo de activo
          <select class="edit-form__input" name="asset_type">
            ${["ETF", "Stock", "Crypto", "Fund", "Other"].map((t) =>
              `<option value="${t}"${record.asset_type === t ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
        <div class="edit-form__row">
          <label class="edit-form__field">Monto
            <input class="edit-form__input" type="number" name="amount" value="${record.amount ?? ""}" min="0" step="0.01" required>
          </label>
          <label class="edit-form__field">Moneda
            <select class="edit-form__input" name="currency">
              <option value="USD"${record.currency === "USD" ? " selected" : ""}>USD</option>
              <option value="COP"${record.currency === "COP" ? " selected" : ""}>COP</option>
            </select>
          </label>
        </div>
        <label class="edit-form__field">Acción
          <select class="edit-form__input" name="action">
            <option value="buy"${record.action === "buy" ? " selected" : ""}>Compra</option>
            <option value="sell"${record.action === "sell" ? " selected" : ""}>Venta</option>
          </select>
        </label>
        <label class="edit-form__field edit-form__field--full">Categoría
          <div id="edit-category-selector"></div>
          <input type="hidden" name="category" value="${escapeHtml(record.category || "")}">
          <input type="hidden" name="category_emoji" value="${escapeHtml(record.category_emoji || "")}">
        </label>
        <label class="edit-form__field">Notas
          <textarea class="edit-form__input" name="notes" rows="2">${escapeHtml(record.notes || "")}</textarea>
        </label>`;
    }
    if (recordType === "note") {
      const tags = (record.tags || []).join(", ");
      return `
        <label class="edit-form__field">Fecha
          <input class="edit-form__input" type="date" name="date" value="${escapeHtml(record.date || "")}">
        </label>
        <label class="edit-form__field">Cuenta
          <select class="edit-form__input" name="account_id">${accountOptions(record.account_id)}</select>
        </label>
        <label class="edit-form__field">Texto
          <textarea class="edit-form__input" name="text" rows="4" required>${escapeHtml(record.text || "")}</textarea>
        </label>
        <label class="edit-form__field">Etiquetas (separadas por coma)
          <input class="edit-form__input" name="tags" value="${escapeHtml(tags)}">
        </label>`;
    }
    return "";
  }

  function openModal(overlay) {
    if (!overlay) return;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal(overlay) {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-overlay:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
  }

  function mountEditCategorySelector(recordType, record) {
    const container = $("#edit-category-selector");
    if (!container) return;
    const kind = recordType === "investment" ? "investment" : "expense";
    buildCategorySelector(
      container,
      kind,
      { name: record.category, emoji: record.category_emoji },
      (cat) => {
        const form = $("#edit-form");
        if (!form) return;
        const nameInput = form.querySelector('[name="category"]');
        const emojiInput = form.querySelector('[name="category_emoji"]');
        if (nameInput) nameInput.value = cat.name || "";
        if (emojiInput) emojiInput.value = cat.emoji || "";
      }
    );
  }

  function openEditModal(recordType, recordId) {
    const record = findRecord(recordType, recordId);
    if (!record) {
      showToast("Registro no encontrado");
      return;
    }
    editState = { type: recordType, id: recordId };
    const title = $("#edit-modal-title");
    const form = $("#edit-form");
    if (title) title.textContent = recordTitle(recordType);
    if (form) form.innerHTML = buildEditForm(recordType, record);
    if (recordType === "expense" || recordType === "investment") {
      mountEditCategorySelector(recordType, record);
    }
    mountCustomSelects(form);
    openModal($("#edit-modal"));
  }

  function closeEditModal() {
    editState = { type: null, id: null };
    closeModal($("#edit-modal"));
    $("#edit-form")?.reset();
  }

  function collectEditPayload(recordType, form) {
    const fd = new FormData(form);
    const val = (name) => fd.get(name);
    const accountId = val("account_id");
    if (recordType === "account") {
      return {
        name: val("name"),
        type: val("type"),
        currency: val("currency"),
        emoji: val("emoji") || "💰",
        initial_balance: parseFloat(val("initial_balance")) || 0,
        current_balance: parseFloat(val("current_balance")) || 0,
      };
    }
    if (recordType === "expense") {
      return {
        date: val("date"),
        account_id: accountId || null,
        amount: parseFloat(val("amount")) || 0,
        currency: val("currency") || "COP",
        category: val("category") || "General",
        category_emoji: val("category_emoji") || "",
        description: val("description") || "",
        payment_method: val("payment_method") || "",
      };
    }
    if (recordType === "investment") {
      return {
        date: val("date"),
        account_id: accountId || null,
        asset: val("asset"),
        asset_type: val("asset_type") || "ETF",
        amount: parseFloat(val("amount")) || 0,
        currency: val("currency") || "USD",
        action: val("action") || "buy",
        category: val("category") || "Inversión",
        category_emoji: val("category_emoji") || "📈",
        notes: val("notes") || "",
      };
    }
    if (recordType === "note") {
      const tagsRaw = (val("tags") || "").trim();
      return {
        date: val("date"),
        account_id: accountId || null,
        text: val("text"),
        tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
      };
    }
    return {};
  }

  function apiPath(recordType, recordId) {
    const paths = {
      account: `/api/accounts/${recordId}`,
      expense: `/api/expenses/${recordId}`,
      investment: `/api/investments/${recordId}`,
      note: `/api/notes/${recordId}`,
    };
    return paths[recordType];
  }

  async function saveEditedRecord(e) {
    e?.preventDefault();
    const { type, id } = editState;
    if (!type || !id) return;
    const form = $("#edit-form");
    if (!form) return;
    try {
      const res = await fetch(apiPath(type, id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectEditPayload(type, form)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      applyFinanceData(data);
      closeEditModal();
      showToast("Cambios guardados", { type: "success" });
    } catch (err) {
      showToast(err.message || "Error al guardar", { type: "error" });
    }
  }

  function deleteConfirmMessage(recordType) {
    const messages = {
      account: "¿Eliminar esta cuenta? Los movimientos asociados quedarán sin cuenta.",
      expense: "¿Eliminar este gasto?",
      investment: "¿Eliminar esta inversión?",
      note: "¿Eliminar esta nota?",
    };
    return messages[recordType] || "¿Eliminar este registro?";
  }

  async function deleteRecord(recordType, recordId) {
    try {
      const res = await fetch(apiPath(recordType, recordId), { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar");
      applyFinanceData(data);
      closeEditModal();
      showToast("Eliminado", { type: "success" });
    } catch (err) {
      showToast(err.message || "Error al eliminar", { type: "error" });
    }
  }

  function confirmDeleteRecord(recordType, recordId) {
    if (window.confirm(deleteConfirmMessage(recordType))) {
      deleteRecord(recordType, recordId);
    }
  }

  async function resetDelfos() {
    try {
      const res = await fetch("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESTABLECER" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al restablecer");
      applyFinanceData(data);
      closeModal($("#reset-modal"));
      closeModal($("#settings-modal"));
      $("#reset-confirm-input").value = "";
      showToast("Delfos restablecido", { type: "success" });
    } catch (err) {
      showToast(err.message || "Error al restablecer", { type: "error" });
    }
  }

  function initSettings() {
    const settingsModal = $("#settings-modal");
    const resetModal = $("#reset-modal");
    const resetInput = $("#reset-confirm-input");
    const resetConfirmBtn = $("#reset-modal-confirm");

    $("#btn-settings")?.addEventListener("click", () => {
      renderCategoryAdmin();
      openModal(settingsModal);
    });
    $("#settings-modal-close")?.addEventListener("click", () => closeModal(settingsModal));
    settingsModal?.addEventListener("click", (e) => {
      if (e.target === settingsModal) closeModal(settingsModal);
    });

    $("#btn-open-reset")?.addEventListener("click", () => {
      resetInput.value = "";
      resetConfirmBtn.disabled = true;
      openModal(resetModal);
      resetInput.focus();
    });

    resetInput?.addEventListener("input", () => {
      resetConfirmBtn.disabled = resetInput.value.trim() !== "RESTABLECER";
    });

    $("#reset-modal-close")?.addEventListener("click", () => closeModal(resetModal));
    $("#reset-modal-cancel")?.addEventListener("click", () => closeModal(resetModal));
    resetModal?.addEventListener("click", (e) => {
      if (e.target === resetModal) closeModal(resetModal);
    });
    resetConfirmBtn?.addEventListener("click", resetDelfos);

    $("#category-admin-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      try {
        await createCategoryAdmin({
          name: fd.get("name"),
          emoji: fd.get("emoji") || "🏷️",
          kind: fd.get("kind") || "general",
        });
        form.reset();
        form.querySelector('[name="emoji"]').value = "🏷️";
        const emojiContainer = $("#category-admin-emoji");
        if (emojiContainer) {
          buildEmojiPicker(emojiContainer, "🏷️", (emoji) => {
            form.querySelector('[name="emoji"]').value = emoji;
          });
        }
        showToast("Categoría creada", { type: "success" });
      } catch (err) {
        showToast(err.message || "Error al crear categoría", { type: "error" });
      }
    });

    const adminEmoji = $("#category-admin-emoji");
    const adminForm = $("#category-admin-form");
    if (adminEmoji && adminForm) {
      buildEmojiPicker(adminEmoji, "🏷️", (emoji) => {
        adminForm.querySelector('[name="emoji"]').value = emoji;
      });
    }

    mountCustomSelects($("#category-admin-form"));

    $("#edit-modal-close")?.addEventListener("click", closeEditModal);
    $("#edit-modal-cancel")?.addEventListener("click", closeEditModal);
    $("#edit-modal")?.addEventListener("click", (e) => {
      if (e.target === $("#edit-modal")) closeEditModal();
    });
    $("#edit-form")?.addEventListener("submit", saveEditedRecord);
    $("#edit-modal-delete")?.addEventListener("click", () => {
      const { type, id } = editState;
      if (type && id && window.confirm(deleteConfirmMessage(type))) {
        deleteRecord(type, id);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#edit-modal")?.hidden) closeEditModal();
      else if (!resetModal?.hidden) closeModal(resetModal);
      else if (!settingsModal?.hidden) closeModal(settingsModal);
    });
  }

  function accountOptions(selectedId) {
    const opts = ['<option value="">Sin cuenta</option>'];
    accounts.forEach((a) => {
      const sel = a.id === selectedId ? " selected" : "";
      opts.push(`<option value="${escapeHtml(a.id)}"${sel}>${escapeHtml(a.emoji)} ${escapeHtml(a.name)}</option>`);
    });
    return opts.join("");
  }

  function updateSummary(summary) {
    if (!summary) return;
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };

    set("#hero-expenses", formatMap(summary.monthly_expenses));
    set("#hero-investments", formatMap(summary.investments_total));
    set("#hero-status", summary.status);
    set("#summary-expenses", formatMap(summary.monthly_expenses));
    set("#summary-investments", formatMap(summary.investments_total));
    set("#summary-movements", summary.total_movements);
    set("#summary-note", summary.last_note);
    set("#island-summary-movements", summary.total_movements);

    const balanceEl = $("#island-summary-balance");
    if (balanceEl) {
      if (summary.balances_by_currency && Object.keys(summary.balances_by_currency).length) {
        balanceEl.textContent = formatMap(summary.balances_by_currency);
      } else {
        balanceEl.textContent = "—";
      }
    }

    const countEl = $("#hero-accounts-count");
    if (countEl) {
      const n = summary.total_accounts || 0;
      countEl.textContent = `${n} cuenta${n !== 1 ? "s" : ""}`;
    }

    const heroBalances = $("#hero-balances");
    const heroCard = $(".hero-card");
    if (summary.balances_by_currency && Object.keys(summary.balances_by_currency).length) {
      if (heroCard) heroCard.classList.remove("hero-card--empty");
      if (heroBalances) {
        heroBalances.innerHTML = Object.entries(summary.balances_by_currency)
          .map(([cur, val]) => `
            <div class="balance-pill">
              <span class="balance-pill__label">${escapeHtml(cur)}</span>
              <span class="balance-pill__value amount">${escapeHtml(val)}</span>
            </div>`)
          .join("");
      }
    }
  }

  function renderAccounts(list) {
    accounts = list || [];
    const container = $("#accounts-container");
    if (!container) return;

    if (!accounts.length) {
      container.innerHTML = `
        <div class="empty-state" id="empty-accounts">
          <div class="empty-state__icon" aria-hidden="true">◎</div>
          <p class="empty-state__title">Aún no tienes cuentas</p>
          <p class="empty-state__text">Crea tu primera cuenta: efectivo, banco, tarjeta o broker.</p>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="accounts-grid" id="accounts-grid">
          ${accounts.map((a) => `
            <article class="account-card${a.is_negative ? " account-card--negative" : ""}" data-account-id="${escapeHtml(a.id)}">
              <div class="account-card__header">
                <div class="account-card__emoji" aria-hidden="true">${escapeHtml(a.emoji)}</div>
                <div class="account-card__actions">
                  <button type="button" class="card-action-btn" data-action="edit" data-type="account" data-id="${escapeHtml(a.id)}">Editar</button>
                  <button type="button" class="card-action-btn card-action-btn--danger" data-action="delete" data-type="account" data-id="${escapeHtml(a.id)}">Eliminar</button>
                </div>
              </div>
              <p class="account-card__name">${escapeHtml(a.name)}</p>
              <p class="account-card__meta">${escapeHtml(a.currency)} · ${escapeHtml(a.type_label || a.type)}</p>
              <div class="account-card__balance-row">
                <p class="account-card__balance amount${a.is_negative ? " account-card__balance--negative" : ""}">${escapeHtml(a.balance_display)}</p>
                ${a.is_negative ? `<span class="account-card__debt-badge">En deuda</span>` : ""}
              </div>
              ${a.movement_count ? `<p class="account-card__movements">${a.movement_count} movimiento${a.movement_count !== 1 ? "s" : ""}</p>` : ""}
            </article>`).join("")}
        </div>`;
      bindCardActions(container);
    }

    ["#expense-account-select", "#investment-account-select"].forEach((sel) => {
      const el = $(sel);
      if (el) {
        const current = el.value;
        el.innerHTML = accountOptions(current || null);
        if (el._customSelectInstance) {
          const options = Array.from(el.options).map((o) => ({
            value: o.value,
            label: o.textContent.trim(),
          }));
          el._customSelectInstance.setOptions(options, current || "");
        }
      }
    });

    const hasAccounts = accounts.length > 0;
    $("#expense-account-hint")?.toggleAttribute("hidden", hasAccounts);
    $("#investment-account-hint")?.toggleAttribute("hidden", hasAccounts);
  }

  function renderTimeline(movements) {
    const container = $("#movements-container");
    if (!container) return;

    if (!movements || !movements.length) {
      container.innerHTML = `
        <div class="empty-state" id="empty-movements">
          <div class="empty-state__icon" aria-hidden="true">◎</div>
          <p class="empty-state__title">Todavía no hay movimientos</p>
          <p class="empty-state__text">Escribe o dicta tu primer gasto, inversión o nota.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <ul class="timeline-list" id="timeline-list">
        ${movements.map((m) => `
          <li class="timeline-item" data-movement-type="${escapeHtml(m.type)}" data-movement-id="${escapeHtml(m.id)}">
            <div class="timeline-item__icon timeline-item__icon--${escapeHtml(m.icon || m.type)}" aria-hidden="true">
              ${m.category_emoji ? escapeHtml(m.category_emoji) : (m.type === "expense" ? "↓" : m.type === "investment" ? "↗" : "✎")}
            </div>
            <div class="timeline-item__body">
              <div class="timeline-item__top">
                <span class="timeline-item__type">${escapeHtml(m.type_label || m.type)}</span>
                <div class="timeline-item__top-right">
                  <span class="timeline-item__date">${escapeHtml(m.date)}</span>
                  <div class="timeline-item__actions">
                    <button type="button" class="timeline-action-btn" data-action="edit" data-type="${escapeHtml(m.type)}" data-id="${escapeHtml(m.id)}">Editar</button>
                    <button type="button" class="timeline-action-btn timeline-action-btn--danger" data-action="delete" data-type="${escapeHtml(m.type)}" data-id="${escapeHtml(m.id)}">Eliminar</button>
                  </div>
                </div>
              </div>
              <p class="timeline-item__desc">${escapeHtml(m.description)}</p>
              <div class="timeline-item__bottom">
                ${m.amount
                  ? `<span class="timeline-item__amount timeline-item__amount--${escapeHtml(m.type)}">${escapeHtml(m.amount)}</span>`
                  : `<span class="muted">—</span>`}
                ${m.category ? `<span class="category-chip">${m.category_emoji ? escapeHtml(m.category_emoji) + " " : ""}${escapeHtml(m.category)}</span>` : ""}
                ${m.account_name ? `<span class="category-chip">${escapeHtml(m.account_name)}</span>` : ""}
              </div>
            </div>
          </li>`).join("")}
      </ul>`;
    bindCardActions(container);
  }

  function applyFinanceData(data) {
    updateSummary(data.summary);
    updateIslandStatus(data.summary);
    categories = data.categories || categories;
    renderAccounts(data.accounts);
    renderTimeline(data.movements);
    records.expenses = data.expenses || [];
    records.investments = data.investments || [];
    records.notes = data.notes || [];
    renderCategoryAdmin();
    initManualCategorySelectors();
    if (window.DelfosCharts && data.charts) {
      window.DelfosCharts.renderCharts(data.charts);
    }
  }

  function initManualCategorySelectors() {
    const expenseSel = $("#expense-category-selector");
    if (expenseSel) {
      buildCategorySelector(expenseSel, "expense", null, (cat) => {
        const nameEl = $("#expense-category-name");
        const emojiEl = $("#expense-category-emoji");
        if (nameEl) nameEl.value = cat.name || "";
        if (emojiEl) emojiEl.value = cat.emoji || "";
      });
    }
    const invSel = $("#investment-category-selector");
    if (invSel) {
      buildCategorySelector(invSel, "investment", { name: "Inversión", emoji: "📈" }, (cat) => {
        const nameEl = $("#investment-category-name");
        const emojiEl = $("#investment-category-emoji");
        if (nameEl) nameEl.value = cat.name || "Inversión";
        if (emojiEl) emojiEl.value = cat.emoji || "📈";
      });
    }
  }

  function renderCategoryAdmin() {
    const list = $("#category-admin-list");
    if (!list) return;

    if (!categories.length) {
      list.innerHTML = `<p class="muted" style="font-size:0.85rem;margin:0;">Sin categorías. Agrega la primera abajo.</p>`;
      return;
    }

    list.innerHTML = categories.map((cat) => `
      <div class="category-admin-item" data-category-id="${escapeHtml(cat.id)}">
        <span class="category-admin-item__emoji">${escapeHtml(cat.emoji)}</span>
        <div class="category-admin-item__info">
          <p class="category-admin-item__name">${escapeHtml(cat.name)}</p>
          <p class="category-admin-item__kind">${escapeHtml(KIND_LABELS[cat.kind] || cat.kind)}</p>
        </div>
        <div class="category-admin-item__actions">
          <button type="button" class="card-action-btn" data-cat-action="edit" data-cat-id="${escapeHtml(cat.id)}">Editar</button>
          <button type="button" class="card-action-btn card-action-btn--danger" data-cat-action="delete" data-cat-id="${escapeHtml(cat.id)}">Eliminar</button>
        </div>
      </div>`).join("");

    list.querySelectorAll("[data-cat-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const catId = btn.dataset.catId;
        if (btn.dataset.catAction === "edit") editCategoryAdmin(catId);
        else if (btn.dataset.catAction === "delete") deleteCategoryAdmin(catId);
      });
    });
  }

  async function createCategoryAdmin(payload) {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al crear categoría");
    applyFinanceData(data);
    return data.category;
  }

  async function editCategoryAdmin(catId) {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    const newName = window.prompt("Nombre de categoría", cat.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      showToast("El nombre no puede estar vacío", { type: "error" });
      return;
    }
    const newEmoji = window.prompt("Emoji", cat.emoji);
    if (newEmoji === null) return;
    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, emoji: newEmoji.trim() || cat.emoji }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");
      applyFinanceData(data);
      showToast("Categoría actualizada", { type: "success" });
    } catch (err) {
      showToast(err.message || "Error al actualizar", { type: "error" });
    }
  }

  async function deleteCategoryAdmin(catId) {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return;
    if (!window.confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    try {
      const res = await fetch(`/api/categories/${catId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar");
      applyFinanceData(data);
      showToast("Categoría eliminada", { type: "success" });
    } catch (err) {
      showToast(err.message || "Error al eliminar", { type: "error" });
    }
  }

  function formatAmountPreview(amount, currency) {
    if (amount == null || amount === "") return "—";
    const n = Number(amount);
    if (currency === "USD") return `$${n.toLocaleString("en-US")} USD`;
    return `$${n.toLocaleString("es-CO")} COP`;
  }

  function previewItemFields(item, index) {
    const isExpense = item.kind === "expense";
    const isInvestment = item.kind === "investment";
    const isNote = item.kind === "note";
    const reviewBadge = item.needs_review
      ? `<span class="review-badge">${isInvestment ? "Revisar activo" : "Revisar monto"}</span>`
      : "";

    const categorySuggestion = item.suggested_new_category && item.suggested_new_category !== item.category
      ? `
        <div class="preview-category-suggested category-suggestion" data-suggestion-index="${index}">
          <div class="category-suggestion__header">
            <span class="category-suggestion__badge">Sugerencia IA</span>
            <span>Categoría actual: <strong>${escapeHtml(item.category || "—")}</strong></span>
            <span>→ <strong>${escapeHtml(item.suggested_new_category)}</strong></span>
          </div>
          <div class="category-suggestion__actions">
            <button type="button" class="category-suggestion__btn category-suggestion__btn--use btn-accept-category" data-index="${index}">Usar</button>
            <button type="button" class="category-suggestion__btn btn-ignore-category" data-index="${index}">Ignorar</button>
          </div>
        </div>`
      : "";

    const accountDetected = item.account_name_hint
      ? `<p class="account-detected">Cuenta detectada: ${escapeHtml(item.account_name_hint)}</p>`
      : "";

    return `
      <article class="preview-item preview-item--${item.kind}" data-index="${index}" data-kind="${item.kind}">
        <div class="preview-item__header">
          <span class="preview-item__emoji">${escapeHtml(item.category_emoji || (isNote ? "📝" : isInvestment ? "📈" : "💸"))}</span>
          <p class="preview-item__type">${escapeHtml(item.title)}${reviewBadge}</p>
        </div>
        <div class="preview-item__fields">
          <label>Cuenta
            <select class="preview-account" data-field="account_id">${accountOptions(item.account_id)}</select>
          </label>
          ${accountDetected}
          ${isExpense || isInvestment ? `
          <div class="preview-item__row">
            <label>Monto
              <input type="number" class="preview-amount" data-field="amount" value="${item.amount ?? ""}" min="0" step="0.01">
            </label>
            <label>Moneda
              <select class="preview-currency" data-field="currency">
                <option value="COP"${item.currency === "COP" ? " selected" : ""}>COP</option>
                <option value="USD"${item.currency === "USD" ? " selected" : ""}>USD</option>
              </select>
            </label>
          </div>
          <div class="preview-item__row preview-item__category-row">
            <label class="preview-item__category-label">Categoría
              <div class="preview-category-selector" data-preview-cat="${index}"></div>
              <input type="hidden" data-field="category" value="${escapeHtml(item.category || "")}">
              <input type="hidden" data-field="category_emoji" value="${escapeHtml(item.category_emoji || "")}">
            </label>
          </div>` : ""}
          ${isExpense ? `
          <label class="preview-payment">Método de pago
            <input type="text" data-field="payment_method" value="${escapeHtml(item.payment_method || "")}">
          </label>` : ""}
          ${isInvestment ? `
          <label>Activo
            <input type="text" class="preview-asset" data-field="asset" value="${escapeHtml(item.asset || "")}">
          </label>` : ""}
          <label>Descripción
            <textarea class="preview-desc" data-field="description" rows="2">${escapeHtml(item.description || item.text || "")}</textarea>
          </label>
          ${categorySuggestion}
        </div>
      </article>`;
  }

  function renderPreviewSummary(data) {
    const lines = [];
    (data.expenses || []).forEach((e) => {
      lines.push(`${e.category_emoji || "💸"} ${escapeHtml(e.description || e.category)} — ${formatAmountPreview(e.amount, e.currency)}`);
    });
    (data.investments || []).forEach((i) => {
      lines.push(`${i.category_emoji || "📈"} ${escapeHtml(i.asset || i.description)} — ${formatAmountPreview(i.amount, i.currency)}`);
    });
    if (!lines.length && !(data.notes || []).length) return "";
    const notesLine = (data.notes || []).length
      ? `<p class="preview-summary-line muted">${(data.notes || []).length} nota(s) detectada(s)</p>`
      : `<p class="preview-summary-line muted">Sin notas detectadas</p>`;
    return `
      <p class="preview-detected-title">Movimientos detectados (${data.counts?.total || data.items?.length || 0})</p>
      <div class="preview-summary-lines">
        ${lines.map((l) => `<p class="preview-summary-line">${l}</p>`).join("")}
        ${notesLine}
      </div>`;
  }

  function renderPreviewGroups(data) {
    const groups = [
      { key: "expenses", title: "Gastos", items: data.expenses || [] },
      { key: "investments", title: "Inversiones", items: data.investments || [] },
      { key: "notes", title: "Notas", items: data.notes || [] },
    ];

    let html = renderPreviewSummary(data);
    let globalIndex = 0;

    groups.forEach((group) => {
      if (!group.items.length) {
        if (group.key === "notes") {
          html += `<div class="preview-group"><h3 class="preview-group__title">${group.title}</h3><p class="muted" style="font-size:0.85rem;margin:0;">Sin notas detectadas</p></div>`;
        }
        return;
      }
      html += `<div class="preview-group"><h3 class="preview-group__title">${group.title} (${group.items.length})</h3>`;
      html += group.items.map((item) => {
        const card = previewItemFields(item, globalIndex);
        globalIndex += 1;
        return card;
      }).join("");
      html += `</div>`;
    });

    return html;
  }

  function bindPreviewCategorySelectors() {
    previewItems.querySelectorAll(".preview-category-selector").forEach((container) => {
      const index = parseInt(container.dataset.previewCat, 10);
      const item = pendingPreview?.items?.[index];
      const el = previewItems.querySelector(`[data-index="${index}"]`);
      if (!item || !el) return;
      const kind = item.kind === "investment" ? "investment" : "expense";
      buildCategorySelector(
        container,
        kind,
        { name: item.category, emoji: item.category_emoji },
        (cat) => {
          item.category = cat.name || item.category;
          item.category_emoji = cat.emoji || item.category_emoji;
          if (cat.isNew) {
            item.suggested_new_category = cat.name;
            item.accept_category_suggestion = true;
          }
          const catInput = el.querySelector('[data-field="category"]');
          const emojiInput = el.querySelector('[data-field="category_emoji"]');
          if (catInput) catInput.value = item.category || "";
          if (emojiInput) emojiInput.value = item.category_emoji || "";
          const emojiEl = el.querySelector(".preview-item__emoji");
          if (emojiEl && item.category_emoji) emojiEl.textContent = item.category_emoji;
        }
      );
    });
  }

  function bindCategorySuggestionButtons() {
    previewItems.querySelectorAll(".btn-accept-category").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index, 10);
        const item = pendingPreview?.items?.[index];
        const el = previewItems.querySelector(`[data-index="${index}"]`);
        if (!item || !el || !item.suggested_new_category) return;
        item.accept_category_suggestion = true;
        item.category = item.suggested_new_category;
        const catInput = el.querySelector('[data-field="category"]');
        const emojiInput = el.querySelector('[data-field="category_emoji"]');
        if (catInput) catInput.value = item.suggested_new_category;
        const container = el.querySelector(".preview-category-selector");
        if (container) {
          const kind = item.kind === "investment" ? "investment" : "expense";
          buildCategorySelector(
            container,
            kind,
            { name: item.category, emoji: item.category_emoji },
            (cat) => {
              item.category = cat.name || item.category;
              item.category_emoji = cat.emoji || item.category_emoji;
              if (catInput) catInput.value = item.category;
              if (emojiInput) emojiInput.value = item.category_emoji || "";
            }
          );
        }
        btn.classList.add("is-accepted");
        btn.textContent = "Usada";
        showToast(`Categoría "${item.suggested_new_category}" aplicada`, { type: "success" });
      });
    });
    previewItems.querySelectorAll(".btn-ignore-category").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index, 10);
        const item = pendingPreview?.items?.[index];
        if (item) {
          item.accept_category_suggestion = false;
          item.suggested_new_category = null;
        }
        btn.closest(".category-suggestion")?.remove();
      });
    });
  }

  function collectPreviewItems() {
    if (!pendingPreview?.items) return { expenses: [], investments: [], notes: [] };

    const result = { expenses: [], investments: [], notes: [] };

    pendingPreview.items.forEach((item, index) => {
      const el = previewItems.querySelector(`[data-index="${index}"]`);
      if (!el) return;

      const get = (field) => {
        const input = el.querySelector(`[data-field="${field}"]`);
        return input ? input.value : item[field];
      };

      const base = {
        kind: item.kind,
        account_id: get("account_id") || null,
        accept_category_suggestion: item.accept_category_suggestion || false,
        suggested_new_category: item.suggested_new_category || null,
      };

      if (item.kind === "expense") {
        result.expenses.push({
          ...base,
          amount: parseFloat(get("amount")) || 0,
          currency: get("currency") || "COP",
          category: get("category") || item.category,
          category_emoji: get("category_emoji") || "",
          description: get("description") || "",
          payment_method: get("payment_method") || "",
        });
      } else if (item.kind === "investment") {
        result.investments.push({
          ...base,
          amount: parseFloat(get("amount")) || 0,
          currency: get("currency") || "USD",
          asset: get("asset") || "",
          asset_type: item.asset_type || "ETF",
          action: item.action || "buy",
          category: get("category") || item.category,
          category_emoji: get("category_emoji") || "📈",
          notes: get("description") || "",
        });
      } else if (item.kind === "note") {
        result.notes.push({
          ...base,
          text: get("description") || item.text,
          tags: item.tags || [],
        });
      }
    });

    return result;
  }

  function showPreview(data) {
    pendingPreview = data;
    pendingPreview.items = [
      ...(data.expenses || []),
      ...(data.investments || []),
      ...(data.notes || []),
    ];

    if (data.error && !pendingPreview.items.length) {
      aiUnavailable.textContent = data.error + (data.hint ? ` ${data.hint}` : "");
      aiUnavailable.hidden = false;
    } else if (data.error) {
      aiUnavailable.textContent = data.error;
      aiUnavailable.hidden = false;
    } else {
      aiUnavailable.hidden = true;
    }

    if (data.accounts) accounts = data.accounts;

    previewItems.innerHTML = pendingPreview.items.length
      ? renderPreviewGroups(data)
      : "";

    bindCategorySuggestionButtons();
    bindPreviewCategorySelectors();
    mountCustomSelects(previewItems);

    if (data.reflection) {
      previewReflection.textContent = data.reflection;
      previewReflection.hidden = false;
    } else {
      previewReflection.hidden = true;
    }

    previewCard.classList.add("is-visible");
    previewCard.setAttribute("aria-hidden", "false");
    previewCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hidePreview() {
    pendingPreview = null;
    previewCard.classList.remove("is-visible");
    previewCard.setAttribute("aria-hidden", "true");
    previewItems.innerHTML = "";
    previewReflection.hidden = true;
    aiUnavailable.hidden = true;
  }

  async function analyzeText() {
    const text = quickText.value.trim();
    if (!text) {
      showToast("Escribe algo para analizar");
      quickText.focus();
      return;
    }

    btnAnalyze.disabled = true;
    const originalHtml = btnAnalyze.innerHTML;
    btnAnalyze.textContent = "Analizando…";

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (data.error && !data.items?.length && !data.can_save_as_note) {
        showToast(data.error, { type: "error" });
        if (data.ai_available === false) {
          aiUnavailable.textContent = data.error + (data.hint ? ` ${data.hint}` : "");
          aiUnavailable.hidden = false;
          previewCard.classList.add("is-visible");
          previewCard.setAttribute("aria-hidden", "false");
        }
        return;
      }

      if (data.can_save_as_note && data.notes?.length) {
        showPreview(data);
        showToast("Clasificación parcial — puedes guardar como nota o editar");
        return;
      }

      if (!data.items || data.items.length === 0) {
        showToast("No detecté movimientos claros. Intenta ser más específico o guarda como nota.");
        return;
      }

      showPreview(data);
    } catch {
      showToast("Delfos no pudo contactar el modelo local.", { type: "error" });
    } finally {
      btnAnalyze.disabled = false;
      btnAnalyze.innerHTML = originalHtml;
    }
  }

  async function saveNote() {
    const text = quickText.value.trim();
    if (!text) {
      showToast("Escribe una nota primero");
      return;
    }

    try {
      const res = await fetch("/api/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      quickText.value = "";
      applyFinanceData(data);
      showToast("Nota guardada", { type: "success" });
    } catch (err) {
      showToast(err.message || "Error al guardar", { type: "error" });
    }
  }

  async function confirmPreview() {
    if (!pendingPreview?.items?.length) return;

    const payload = collectPreviewItems();
    const total = (payload.expenses?.length || 0) + (payload.investments?.length || 0) + (payload.notes?.length || 0);
    if (!total) return;

    try {
      const res = await fetch("/api/confirm-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");

      quickText.value = "";
      hidePreview();
      applyFinanceData(data);
      const saved = data.saved || {};
      const count = (saved.expenses || 0) + (saved.investments || 0) + (saved.notes || 0);
      showToast(`${count} movimiento${count !== 1 ? "s" : ""} guardado${count !== 1 ? "s" : ""}`, { type: "success" });
    } catch (err) {
      showToast(err.message || "Error al guardar", { type: "error" });
    }
  }

  function initVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btnVoice.classList.add("is-unsupported");
      voiceStatus.textContent = "Tu navegador no soporta voz";
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "es-CO";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      btnVoice.classList.add("is-listening");
      btnVoice.setAttribute("aria-pressed", "true");
      voiceStatus.textContent = "Escuchando…";
      voiceStatus.classList.add("is-active");
    };

    recognition.onend = () => {
      btnVoice.classList.remove("is-listening");
      btnVoice.setAttribute("aria-pressed", "false");
      voiceStatus.classList.remove("is-active");
      if (voiceStatus.textContent === "Escuchando…") {
        voiceStatus.textContent = "Listo para escuchar";
      }
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      quickText.value = transcript.trim();
      voiceStatus.textContent = "Transcripción lista";
    };

    recognition.onerror = () => {
      voiceStatus.textContent = "No pude escuchar. Intenta de nuevo.";
    };

    btnVoice.addEventListener("click", () => {
      if (btnVoice.classList.contains("is-listening")) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
  }

  function initToggles() {
    [
      ["#toggle-expense", "#panel-expense"],
      ["#toggle-investment", "#panel-investment"],
      ["#toggle-account", "#panel-account"],
    ].forEach(([toggleSel, panelSel]) => {
      const toggle = $(toggleSel);
      const panel = $(panelSel);
      if (!toggle || !panel) return;
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        panel.classList.toggle("is-open", !open);
      });
    });
  }

  function initForms() {
    $("#form-account")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fd.get("name"),
            type: fd.get("type"),
            currency: fd.get("currency"),
            initial_balance: parseFloat(fd.get("initial_balance")) || 0,
            emoji: fd.get("emoji") || "💰",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        applyFinanceData(data);
        e.target.reset();
        e.target.querySelector('[name="emoji"]').value = "💵";
        $("#panel-account")?.classList.remove("is-open");
        $("#toggle-account")?.setAttribute("aria-expanded", "false");
        showToast("Cuenta creada", { type: "success" });
      } catch (err) {
        showToast(err.message || "Error al crear cuenta", { type: "error" });
      }
    });

    $("#form-expense")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const accountId = fd.get("account_id");
      const categoryName = fd.get("category") || "General";
      const categoryEmoji = fd.get("category_emoji") || "";
      try {
        if (!findCategoryByNameLocal(categoryName, "expense")) {
          await createCategoryAdmin({ name: categoryName, emoji: categoryEmoji, kind: "expense" });
        }
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId || null,
            amount: parseFloat(fd.get("amount")),
            currency: fd.get("currency"),
            category: categoryName,
            category_emoji: categoryEmoji,
            description: fd.get("description"),
            payment_method: fd.get("payment_method") || "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        applyFinanceData(data);
        e.target.reset();
        initManualCategorySelectors();
        showToast("Gasto guardado", { type: "success" });
      } catch {
        showToast("Error al guardar gasto", { type: "error" });
      }
    });

    $("#form-investment")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const accountId = fd.get("account_id");
      const categoryName = fd.get("category") || "Inversión";
      const categoryEmoji = fd.get("category_emoji") || "📈";
      try {
        if (!findCategoryByNameLocal(categoryName, "investment")) {
          await createCategoryAdmin({ name: categoryName, emoji: categoryEmoji, kind: "investment" });
        }
        const res = await fetch("/api/investments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId || null,
            asset: fd.get("asset"),
            asset_type: fd.get("asset_type"),
            amount: parseFloat(fd.get("amount")),
            currency: fd.get("currency"),
            action: fd.get("action"),
            category: categoryName,
            category_emoji: categoryEmoji,
            notes: fd.get("notes") || "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        applyFinanceData(data);
        e.target.reset();
        initManualCategorySelectors();
        showToast("Inversión guardada", { type: "success" });
      } catch {
        showToast("Error al guardar inversión", { type: "error" });
      }
    });
  }

  function findCategoryByNameLocal(name, kind) {
    if (!name) return null;
    const lower = name.toLowerCase();
    return categories.find(
      (c) => c.name.toLowerCase() === lower && (c.kind === kind || c.kind === "general")
    );
  }

  function initIsland() {
    const zone = $(".island-zone");
    const shell = $(".island-shell");
    const drawer = $("#island-drawer");
    if (!zone || !shell) return;

    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const PROXIMITY = 40;

    const setDrawerExpanded = (expanded) => {
      if (drawer) drawer.setAttribute("aria-hidden", expanded ? "false" : "true");
    };

    if (canHover) {
      let rafId = 0;
      document.addEventListener("mousemove", (e) => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          const rect = zone.getBoundingClientRect();
          const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
          const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
          const near = Math.hypot(dx, dy) <= PROXIMITY;
          zone.classList.toggle("is-near", near);
          if (near || zone.matches(":hover") || zone.matches(":focus-within")) {
            setDrawerExpanded(true);
          } else if (!zone.classList.contains("is-expanded")) {
            setDrawerExpanded(false);
          }
        });
      });

      zone.addEventListener("mouseenter", () => setDrawerExpanded(true));
      zone.addEventListener("mouseleave", () => {
        if (!zone.classList.contains("is-expanded") && !zone.matches(":focus-within")) {
          setDrawerExpanded(false);
        }
        zone.classList.remove("is-near");
      });
    } else {
      shell.addEventListener("click", (e) => {
        if (e.target.closest(".island-pill__settings")) return;
        if (e.target.closest(".island-nav__link")) return;
        zone.classList.toggle("is-expanded");
        setDrawerExpanded(zone.classList.contains("is-expanded"));
      });
    }

    zone.addEventListener("focusin", () => {
      zone.classList.add("is-expanded");
      setDrawerExpanded(true);
    });

    zone.addEventListener("focusout", (e) => {
      if (zone.contains(e.relatedTarget)) return;
      zone.classList.remove("is-expanded");
      if (!canHover || !zone.matches(":hover")) {
        setDrawerExpanded(false);
      }
    });

    $$(".island-nav__link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute("href"));
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (!canHover) {
          zone.classList.remove("is-expanded");
          setDrawerExpanded(false);
        }
      });
    });
  }

  function initBottomNav() {
    const items = $$(".bottom-nav__item");
    const sections = ["inicio", "registrar", "movimientos", "ia-preview"];

    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.querySelector(item.getAttribute("href"));
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        items.forEach((i) => i.classList.remove("is-active"));
        item.classList.add("is-active");
      });
    });

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          items.forEach((item) => {
            const nav = item.getAttribute("data-nav");
            const match =
              (nav === "inicio" && id === "inicio") ||
              (nav === "registrar" && id === "registrar") ||
              (nav === "movimientos" && id === "movimientos") ||
              (nav === "ia" && id === "ia-preview");
            item.classList.toggle("is-active", match);
          });
        });
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  btnAnalyze?.addEventListener("click", analyzeText);
  btnSaveNote?.addEventListener("click", saveNote);
  btnClear?.addEventListener("click", () => {
    quickText.value = "";
    hidePreview();
    quickText.focus();
  });
  btnConfirm?.addEventListener("click", confirmPreview);
  btnCancelPreview?.addEventListener("click", hidePreview);

  initVoice();
  initToggles();
  initForms();
  initSettings();
  initIsland();
  initBottomNav();
  mountCustomSelects(document);
  checkOllamaHealth();

  fetch("/api/finance")
    .then((r) => r.json())
    .then((data) => {
      applyFinanceData(data);
      checkOllamaHealth();
    })
    .catch(() => {});
})();
