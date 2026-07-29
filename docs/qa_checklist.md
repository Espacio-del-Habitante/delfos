# Checklist QA — Delfos (fixture seed)

Seed (no pisa datos activos por defecto):

```bash
cd backend
uv run python scripts/seed_qa_fixture.py
# opcional: uv run python scripts/seed_qa_fixture.py --apply
```

Para usar el JSON seed sin `--apply`, copia `backend/data/qa_delfos_data.json` sobre tu `delfos_data.json` o apunta `DATA_DIR`.

## Esperados del seed

| Señal | Valor |
|-------|--------|
| Perfil | Ingreso 5M, fijos 1.5M, ahorro 20%, inversión 10%, colchón 10% |
| Ahorro del mes | **80%** (ingresos 5M − gastos 1M) |
| Emergencia | **2.0 meses** (saldo enlazado 3M / fijos 1.5M) |
| Portfolio (quotes mock en tests) | buy 10 AAPL@100, sell 2@130, buy 5 MSFT@200, div 15 |

## Smoke manual

1. Abrir dashboard → isla / KPIs: ahorro ~80%, emergencia ~2 meses.
2. Registrar ingreso **600k parcial** (`income_is_complete=false`) → propuesta fijos **180k**, sin warning de shortfall; note “Propuesta proporcional…”.
3. Registrar ingreso **5M completo** → fijos **1.5M** + resto según %.
4. Movimientos: filtros Desde/Hasta del mes → ~2–3 ítems del seed; histórico mayo → 20 gastos.
5. Paginador: con page_size 25, página 2 muestra el resto del ledger.
6. Transfers a emergencia no bajan el % de ahorro; gastos de allocation sí.

## Tests automáticos

```bash
cd backend
uv run python -m pytest tests/test_movements_pagination.py tests/test_allocation.py tests/test_kpis_golden.py tests/test_portfolio_kpis_golden.py -q
```
