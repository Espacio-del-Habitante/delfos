<script lang="ts">
  import { onMount } from 'svelte';
  import HeaderIsland from './island/HeaderIsland.svelte';
  import SummaryCards from './SummaryCards.svelte';
  import AccountsPanel from './AccountsPanel.svelte';
  import QuickEntry from './QuickEntry.svelte';
  import VoiceEntry from './VoiceEntry.svelte';
  import AiPreview from './AiPreview.svelte';
  import MovementsList from './MovementsList.svelte';
  import ManualForms from './ManualForms.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import EditModal from './EditModal.svelte';
  import {
    deleteAccount,
    deleteExpense,
    deleteInvestment,
    deleteNote,
  } from '@/lib/api';
  import { applyFinancePayload, finance, refreshFinanceData } from '@/stores/finance';
  import { showToast } from '@/lib/toast';
  import type {
    Account,
    AnalysisPreview,
    EditRecordType,
    ExpenseRecord,
    InvestmentRecord,
    NoteRecord,
  } from '@/lib/types';

  let draftText = '';
  let analysisPreview: AnalysisPreview | null = null;
  let settingsOpen = false;

  let editOpen = false;
  let editType: EditRecordType | null = null;
  let editRecord: Account | ExpenseRecord | InvestmentRecord | NoteRecord | null = null;

  onMount(() => {
    refreshFinanceData().catch(() => showToast('No se pudo cargar los datos', { type: 'error' }));

    const items = document.querySelectorAll<HTMLAnchorElement>('.bottom-nav__item');
    const sections = ['inicio', 'registrar', 'movimientos', 'ia-preview'];

    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(item.getAttribute('href') || '');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        items.forEach((i) => i.classList.remove('is-active'));
        item.classList.add('is-active');
      });
    });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const id = entry.target.id;
            items.forEach((item) => {
              const nav = item.getAttribute('data-nav');
              const match =
                (nav === 'inicio' && id === 'inicio') ||
                (nav === 'registrar' && id === 'registrar') ||
                (nav === 'movimientos' && id === 'movimientos') ||
                (nav === 'ia' && id === 'ia-preview');
              item.classList.toggle('is-active', match);
            });
          });
        },
        { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
      );
      sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    }
  });

  function handleAnalyzed(e: CustomEvent<AnalysisPreview>) {
    analysisPreview = e.detail;
  }

  function clearPreview() {
    analysisPreview = null;
  }

  function onPreviewConfirmed() {
    analysisPreview = null;
    draftText = '';
    refreshFinanceData();
  }

  function findRecord(type: string, id: string) {
    const data = $finance;
    if (!data) return null;
    if (type === 'account') return data.accounts.find((a) => a.id === id) ?? null;
    if (type === 'expense') return data.expenses.find((r) => r.id === id) || null;
    if (type === 'investment') return data.investments.find((r) => r.id === id) || null;
    if (type === 'note') return data.notes.find((r) => r.id === id) || null;
    return null;
  }

  function openEdit(type: string, id: string) {
    const record = findRecord(type, id);
    if (!record) {
      showToast('Registro no encontrado');
      return;
    }
    editType = type as EditRecordType;
    editRecord = record as Account | ExpenseRecord | InvestmentRecord | NoteRecord;
    editOpen = true;
  }

  async function handleDelete(type: string, id: string) {
    const messages: Record<string, string> = {
      account: '¿Eliminar esta cuenta? Los movimientos asociados quedarán sin cuenta.',
      expense: '¿Eliminar este gasto?',
      investment: '¿Eliminar esta inversión?',
      note: '¿Eliminar esta nota?',
    };
    if (!confirm(messages[type] || '¿Eliminar este registro?')) return;
    try {
      let data;
      if (type === 'account') data = await deleteAccount(id);
      else if (type === 'expense') data = await deleteExpense(id);
      else if (type === 'investment') data = await deleteInvestment(id);
      else data = await deleteNote(id);
      applyFinancePayload(data);
      showToast('Eliminado', { type: 'success' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al eliminar', { type: 'error' });
    }
  }

  function closeEdit() {
    editOpen = false;
    editType = null;
    editRecord = null;
  }
</script>

<div class="app-shell">
  <HeaderIsland summary={$finance?.summary ?? null} on:openSettings={() => (settingsOpen = true)} />

  <div class="dashboard-grid">
    <div class="dashboard-col-left">
      <SummaryCards summary={$finance?.summary ?? null} />
      <AccountsPanel
        accounts={$finance?.accounts ?? []}
        on:edit={(e) => openEdit(e.detail.type, e.detail.id)}
        on:delete={(e) => handleDelete(e.detail.type, e.detail.id)}
        on:refresh={refreshFinanceData}
      />
    </div>

    <div class="dashboard-col-right">
      <QuickEntry
        bind:text={draftText}
        on:analyzed={handleAnalyzed}
        on:clearPreview={clearPreview}
      />
      <VoiceEntry bind:text={draftText} on:transcript={(e) => (draftText = e.detail)} />
      <AiPreview
        preview={analysisPreview}
        accounts={$finance?.accounts ?? analysisPreview?.accounts ?? []}
        categories={$finance?.categories ?? []}
        on:confirmed={onPreviewConfirmed}
        on:cancelled={clearPreview}
      />
    </div>

    <MovementsList
      movements={$finance?.movements ?? []}
      on:edit={(e) => openEdit(e.detail.type, e.detail.id)}
      on:delete={(e) => handleDelete(e.detail.type, e.detail.id)}
    />

    <ManualForms accounts={$finance?.accounts ?? []} categories={$finance?.categories ?? []} />
  </div>

  <nav class="bottom-nav" aria-label="Navegación principal">
    <a href="#inicio" class="bottom-nav__item is-active" data-nav="inicio">
      <span class="bottom-nav__icon" aria-hidden="true">⌂</span>
      Inicio
    </a>
    <a href="#registrar" class="bottom-nav__item" data-nav="registrar">
      <span class="bottom-nav__icon" aria-hidden="true">+</span>
      Registrar
    </a>
    <a href="#movimientos" class="bottom-nav__item" data-nav="movimientos">
      <span class="bottom-nav__icon" aria-hidden="true">≡</span>
      Movimientos
    </a>
    <a href="#ia-preview" class="bottom-nav__item" data-nav="ia">
      <span class="bottom-nav__icon" aria-hidden="true">✦</span>
      IA
    </a>
  </nav>
</div>

<SettingsPanel bind:open={settingsOpen} categories={$finance?.categories ?? []} />

<EditModal
  bind:open={editOpen}
  recordType={editType}
  record={editRecord}
  accounts={$finance?.accounts ?? []}
  categories={$finance?.categories ?? []}
  on:close={closeEdit}
  on:saved={closeEdit}
  on:deleted={closeEdit}
/>
