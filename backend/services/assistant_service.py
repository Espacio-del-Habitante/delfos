"""Context pack, KPIs y chat conversacional del copiloto (Fases 2–3)."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone

import config
from integrations import registry
from integrations.base import IntegrationError
from services import ai_service, finance_store, portfolio_service
from services.portfolio_accounting import aggregate_portfolio

logger = logging.getLogger(__name__)

# Cuentas que cuentan como liquidez para el colchón / emergencia.
_LIQUID_TYPES = frozenset({"cash", "bank", "wallet", "savings", "debit_card"})
# ponytail: UTC−5 fijo (America/Bogota sin DST). Upgrade: zoneinfo("America/Bogota") si hay tzdata.
_BOGOTA = timezone(timedelta(hours=-5))
_THREAD_TAIL = 12
# Compactar historial: deja cola reciente + memory_summary (evita contexto eterno).
_SUMMARIZE_RE = re.compile(
    r"^/(?:sumari[zs]e|summarize|resumir)(?:\s.*)?$",
    re.IGNORECASE,
)
_BUSCAR_RE = re.compile(r"^/(?:buscar|search)\s+(.+)$", re.IGNORECASE)
_SUMMARIZE_KEEP_RECENT = 6
_SUMMARIZE_MIN_MESSAGES = 10
_SUMMARIZE_MAX_CHARS = 400
_KIND_ES = {
    "expense": "Gasto",
    "income": "Ingreso",
    "investment": "Inversión",
    "note": "Nota",
}


def _assistant_trace(event: str, **payload) -> None:
    """Log activable: DELFOS_ASSISTANT_DEBUG=true. Va a stderr (visible en `uv run python app.py`)."""
    if not config.ASSISTANT_DEBUG:
        return
    try:
        body = json.dumps(payload, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        body = str(payload)
    if len(body) > 2400:
        body = body[:2400] + "…"
    line = f"[assistant] {event} {body}"
    logger.info(line)
    # Flask/werkzeug a veces no muestra loggers de services; print garantiza visibilidad.
    print(line, flush=True)


def _month_prefix():
    """Mes de negocio en America/Bogota (UTC−5). KPIs usan `date` del movimiento."""
    return datetime.now(timezone.utc).astimezone(_BOGOTA).strftime("%Y-%m")


def _sum_month(rows, currency="COP"):
    """Suma del mes por fecha de negocio (`date`, fallback `created_at`).

    Definición canónica del KPI de ahorro:
    savings_actual_percent = (income_month − expense_month) / income_month
    Transfers internos no entran (no son expenses). Gastos de allocation sí.
    """
    prefix = _month_prefix()
    total = 0.0
    for row in rows:
        day = str(row.get("date") or row.get("created_at") or "")[:10]
        if not day.startswith(prefix):
            continue
        if (row.get("currency") or currency) != currency:
            continue
        total += float(row.get("amount") or 0)
    return total


def _liquid_balance_cop(accounts):
    total = 0.0
    for acc in accounts:
        if (acc.get("currency") or "COP") != "COP":
            continue
        if (acc.get("type") or "") not in _LIQUID_TYPES:
            continue
        total += float(acc.get("current_balance") or 0)
    return total


def _emergency_balance_cop(accounts, goals):
    """Suma COP de cuentas enlazadas a metas type=emergency_fund. 0 si no hay enlace."""
    emergency_ids = {
        g.get("id")
        for g in (goals or [])
        if g.get("type") == "emergency_fund" and g.get("id")
    }
    if not emergency_ids:
        return 0.0
    total = 0.0
    linked = False
    for acc in accounts or []:
        if acc.get("goal_id") not in emergency_ids:
            continue
        linked = True
        if (acc.get("currency") or "COP") != "COP":
            continue
        total += float(acc.get("current_balance") or 0)
    return total if linked else 0.0


def _portfolio_concentration(investments):
    """Concentración por costo base + cash (sin quotes: rápido y determinista)."""
    agg = aggregate_portfolio(investments or [])
    cash = round(float(agg.get("cash") or 0), 2)
    open_pos = [
        (asset, state)
        for asset, state in agg["positions_state"].items()
        if state["qty"] > 1e-12
    ]
    total_cost = sum(float(state["cost"] or 0) for _, state in open_pos)
    if total_cost <= 0:
        return {
            "top_asset": None,
            "top_weight_percent": None,
            "position_count": 0,
            "basis": "cost",
            "cash_available_usd": cash,
        }
    top_asset, top_state = max(open_pos, key=lambda item: float(item[1]["cost"] or 0))
    weight = round(100.0 * float(top_state["cost"] or 0) / total_cost, 1)
    return {
        "top_asset": top_asset,
        "top_weight_percent": weight,
        "position_count": len(open_pos),
        "basis": "cost",
        "cash_available_usd": cash,
    }


def build_kpis():
    data = finance_store.load_data()
    profile = finance_store.get_financial_profile()
    currency = (data.get("settings") or {}).get("currency") or "COP"

    income_month = _sum_month(data.get("incomes") or [], currency)
    expense_month = _sum_month(data.get("expenses") or [], currency)
    # KPI honesto: solo ingresos del ledger del mes (perfil = plantilla, no inventa %).
    income_base = float(income_month)

    savings_actual = None
    if income_base > 0:
        savings_actual = round(100.0 * (income_base - expense_month) / income_base, 1)

    target = profile.get("savings_target_percent")
    savings_delta = None
    if savings_actual is not None and target is not None:
        savings_delta = round(savings_actual - float(target), 1)

    liquid = _liquid_balance_cop(data.get("accounts") or [])
    fixed = float(profile.get("monthly_fixed_expenses") or 0)
    # Emergencia: solo saldos de cuentas enlazadas a metas emergency_fund.
    monthly_ref = fixed if fixed > 0 else (expense_month if expense_month > 0 else income_base)
    emergency_balance = _emergency_balance_cop(data.get("accounts") or [], data.get("goals") or [])
    emergency_months = 0.0
    if emergency_balance > 0 and monthly_ref > 0:
        emergency_months = round(emergency_balance / monthly_ref, 1)

    emergency_target = profile.get("emergency_fund_target_months")
    emergency_delta = None
    if emergency_target is not None:
        emergency_delta = round(emergency_months - float(emergency_target), 1)

    concentration = _portfolio_concentration(data.get("investments") or [])

    alloc = {
        "savings_target_percent": profile.get("savings_target_percent"),
        "investment_target_percent": profile.get("investment_target_percent"),
        "cushion_percent": profile.get("cushion_percent"),
    }
    alloc_sum = sum(float(v) for v in alloc.values() if v is not None)

    return {
        "currency": currency,
        "month_summary": {
            "income": round(income_month, 2),
            "expense": round(expense_month, 2),
            "fixed_expenses": round(fixed, 2) if fixed else None,
            "income_base": round(income_base, 2),
            "liquid_balance": round(liquid, 2),
            "emergency_balance": round(emergency_balance, 2),
        },
        "savings_actual_percent": savings_actual,
        "savings_target_percent": target,
        "savings_vs_target_delta": savings_delta,
        "emergency_months_approx": emergency_months,
        "emergency_fund_target_months": emergency_target,
        "emergency_vs_target_delta": emergency_delta,
        "cushion_percent": profile.get("cushion_percent"),
        "allocation_sum_percent": round(alloc_sum, 1) if alloc_sum else None,
        "portfolio": concentration,
        "active_goals_count": len(
            [g for g in finance_store.get_goals(data) if g.get("status") == "active"]
        ),
    }


def build_context_pack(thread_id=None):
    """Pack para chat y UI. Incluye cola del thread si se indica."""
    pack = {
        "profile": finance_store.get_financial_profile(),
        "kpis": build_kpis(),
        "goals": [
            g for g in finance_store.get_goals() if g.get("status") in (None, "active", "paused")
        ],
        "alerts_open": [],
        "memory_summary": finance_store.get_memory_summary(),
        "memory_facts": finance_store.list_memory_facts(10),
        "thread_tail": [],
    }
    if thread_id:
        pack["thread_tail"] = [
            {"role": m["role"], "content": m["content"]}
            for m in finance_store.list_chat_messages(thread_id, limit=_THREAD_TAIL)
        ]
    return pack


def get_assistant_snapshot():
    return {
        "profile": finance_store.get_financial_profile(),
        "goals": finance_store.get_goals(),
        "kpis": build_kpis(),
    }


def _extract_json(raw: str) -> dict:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in model response")
    return json.loads(raw[start : end + 1])


def _accounts_for_prompt():
    return [
        {
            "name": a.get("name"),
            "type": a.get("type"),
            "currency": a.get("currency"),
        }
        for a in finance_store.get_accounts()[:24]
    ]


def _movement_draft_from_parsed(parsed: dict) -> dict | None:
    """Normaliza movement_draft del chat con el mismo preview que /api/analyze."""
    raw = parsed.get("movement_draft")
    if not isinstance(raw, dict):
        return None
    clarification = raw.get("needs_clarification")
    clarification = (
        str(clarification).strip() if clarification not in (None, "") else None
    )
    preview = ai_service.analysis_to_preview(
        {
            "expenses": raw.get("expenses") or [],
            "incomes": raw.get("incomes") or [],
            "investments": raw.get("investments") or [],
            "notes": raw.get("notes") or [],
            "reflection": "",
        }
    )
    if not preview.get("items") and not clarification:
        return None
    preview["needs_clarification"] = clarification
    return preview


def _account_draft_from_parsed(parsed: dict) -> dict | None:
    raw = parsed.get("account_draft")
    if not isinstance(raw, dict) or not raw:
        return None
    try:
        clean = finance_store.sanitize_account_draft(raw)
    except ValueError:
        return None
    return clean or None


def _lookup_from_parsed(parsed: dict) -> dict | None:
    raw = parsed.get("lookup")
    if not isinstance(raw, dict):
        return None
    q = str(raw.get("q") or raw.get("query") or "").strip()
    if not q:
        return None
    kind = raw.get("kind")
    if kind not in ("expense", "income", "investment", "note", None, ""):
        kind = None
    if kind == "":
        kind = None
    period = raw.get("period") or "month"
    if period not in ("month", "year", "all"):
        period = "month"
    try:
        return finance_store.search_movements(q, kind=kind, period=period, limit=12)
    except ValueError:
        return None


def format_lookup_reply(result: dict) -> str:
    q = result.get("query") or ""
    period = result.get("period") or "month"
    period_label = {"month": "este mes", "year": "este año", "all": "en total"}.get(
        period, period
    )
    count = int(result.get("count") or 0)
    if count == 0:
        return f'No encontré movimientos sobre "{q}" {period_label}.'
    lines = [f'Encontré {count} movimiento(s) sobre "{q}" {period_label}:']
    for hit in result.get("hits") or []:
        kind = _KIND_ES.get(hit.get("kind"), hit.get("kind"))
        amount = hit.get("amount")
        if amount is None:
            lines.append(f"- {kind}: {hit.get('label')} ({hit.get('date') or '—'})")
        else:
            lines.append(
                f"- {kind}: {hit.get('label')} · {amount} {hit.get('currency') or ''} "
                f"({hit.get('date') or '—'})".rstrip()
            )
    totals = result.get("totals") or {}
    if totals:
        tot = ", ".join(f"{v} {k}" for k, v in totals.items())
        lines.append(f"Total aproximado: {tot}.")
    shown = int(result.get("shown") or 0)
    if count > shown:
        lines.append(f"(Muestro {shown} de {count}; afina con /buscar {q})")
    return "\n".join(lines)


_PORTFOLIO_METRICS = frozenset(
    {"summary", "largest_position", "highest_gain", "highest_return", "asset_detail"}
)
_SLIM_POS_KEYS = (
    "asset",
    "quantity",
    "cost_basis_usd",
    "market_price_usd",
    "market_value_usd",
    "unrealized_pnl_usd",
    "total_pnl_usd",
    "total_return_percent",
    "quote_confidence",
)


def _slim_position(pos: dict) -> dict:
    return {k: pos.get(k) for k in _SLIM_POS_KEYS}


def _position_market_or_cost(pos: dict) -> float:
    mv = pos.get("market_value_usd")
    if mv is not None:
        return float(mv)
    return float(pos.get("cost_basis_usd") or 0)


def resolve_finance_query(
    domain: str, metric: str, asset: str | None = None
) -> dict | None:
    """Resuelve una consulta financiera bajo demanda (MVP: solo portfolio)."""
    if (domain or "").strip().lower() != "portfolio":
        return None
    metric = (metric or "").strip().lower()
    if metric not in _PORTFOLIO_METRICS:
        return None

    payload = portfolio_service.get_portfolio_payload()
    positions = payload.get("positions") or []
    base = {
        "domain": "portfolio",
        "metric": metric,
        "quotes_partial": bool(payload.get("quotes_partial")),
        "quotes_as_of": payload.get("quotes_as_of"),
    }

    if metric == "summary":
        return {
            **base,
            "cash_available_usd": payload.get("cash_available_usd"),
            "total_assets_value_usd": payload.get("total_assets_value_usd"),
            "total_portfolio_value_usd": payload.get("total_portfolio_value_usd"),
            "total_pnl_usd": payload.get("total_pnl_usd"),
            "total_unrealized_pnl_usd": payload.get("total_unrealized_pnl_usd"),
            "total_realized_pnl_usd": payload.get("total_realized_pnl_usd"),
            "total_return_percent": payload.get("total_return_percent"),
            "net_contributions_usd": payload.get("net_contributions_usd"),
            "has_positions": bool(payload.get("has_positions")),
            "position_count": len(positions),
        }

    if metric == "asset_detail":
        ticker = (asset or "").strip().upper()
        if not ticker:
            return None
        match = next(
            (p for p in positions if str(p.get("asset") or "").upper() == ticker),
            None,
        )
        if not match:
            return {**base, "asset": ticker, "found": False, "position": None}
        return {
            **base,
            "asset": ticker,
            "found": True,
            "position": _slim_position(match),
        }

    if not positions:
        return {**base, "position": None, "empty": True}

    if metric == "largest_position":
        best = max(positions, key=_position_market_or_cost)
    elif metric == "highest_gain":
        best = max(positions, key=lambda p: float(p.get("total_pnl_usd") or 0))
    else:  # highest_return
        best = max(
            positions,
            key=lambda p: (
                p.get("total_return_percent") is not None,
                float(p.get("total_return_percent") or float("-inf")),
            ),
        )
    return {**base, "position": _slim_position(best)}


def _finance_query_from_parsed(parsed: dict) -> dict | None:
    raw = parsed.get("finance_query")
    if not isinstance(raw, dict):
        return None
    domain = str(raw.get("domain") or "").strip()
    metric = str(raw.get("metric") or "").strip()
    if not domain or not metric:
        return None
    asset = raw.get("asset")
    asset_s = str(asset).strip() if asset not in (None, "") else None
    return resolve_finance_query(domain, metric, asset_s)


def format_finance_query_reply(result: dict) -> str:
    metric = result.get("metric")
    partial = " (cotizaciones parciales)" if result.get("quotes_partial") else ""

    if metric == "summary":
        lines = [
            f"Resumen del portafolio{partial}:",
            f"- Valor total: {result.get('total_portfolio_value_usd')} USD "
            f"(activos {result.get('total_assets_value_usd')} + "
            f"cash {result.get('cash_available_usd')})",
            f"- P&L total: {result.get('total_pnl_usd')} USD",
        ]
        ret = result.get("total_return_percent")
        if ret is not None:
            lines.append(f"- Rendimiento: {ret}%")
        lines.append(f"- Posiciones abiertas: {result.get('position_count') or 0}")
        return "\n".join(lines)

    if result.get("empty"):
        return "No tienes posiciones abiertas en el portafolio."

    if metric == "asset_detail" and not result.get("found"):
        return f'No encontré una posición abierta en "{result.get("asset")}".'

    pos = result.get("position") or {}
    asset = pos.get("asset") or result.get("asset") or "?"
    labels = {
        "largest_position": "Posición más grande",
        "highest_gain": "Mayor ganancia ($)",
        "highest_return": "Mejor rendimiento (%)",
        "asset_detail": f"Detalle de {asset}",
    }
    title = labels.get(metric, f"Portafolio · {asset}")
    lines = [f"{title}{partial}:"]
    lines.append(
        f"- {asset}: qty {pos.get('quantity')} · "
        f"valor {pos.get('market_value_usd')} USD "
        f"(costo {pos.get('cost_basis_usd')})"
    )
    pnl = pos.get("total_pnl_usd")
    ret = pos.get("total_return_percent")
    if pnl is not None or ret is not None:
        bits = []
        if pnl is not None:
            bits.append(f"P&L {pnl} USD")
        if ret is not None:
            bits.append(f"retorno {ret}%")
        lines.append(f"- {' · '.join(bits)}")
    conf = pos.get("quote_confidence")
    if conf:
        lines.append(f"- Confianza de cotización: {conf}")
    return "\n".join(lines)


def build_chat_prompt(user_message: str, pack: dict) -> str:
    profile = pack.get("profile") or {}
    kpis = pack.get("kpis") or {}
    goals = pack.get("goals") or []
    facts = pack.get("memory_facts") or []
    tail = pack.get("thread_tail") or []

    context = {
        "profile": {
            "fiscal_country": profile.get("fiscal_country"),
            "monthly_income_fixed": profile.get("monthly_income_fixed"),
            "monthly_income_variable_avg": profile.get("monthly_income_variable_avg"),
            "monthly_fixed_expenses": profile.get("monthly_fixed_expenses"),
            "fixed_expenses": profile.get("fixed_expenses") or [],
            "savings_target_percent": profile.get("savings_target_percent"),
            "investment_target_percent": profile.get("investment_target_percent"),
            "cushion_percent": profile.get("cushion_percent"),
            "emergency_fund_target_months": profile.get("emergency_fund_target_months"),
            "risk_profile": profile.get("risk_profile"),
            "investment_horizon": profile.get("investment_horizon"),
            "priorities": profile.get("priorities"),
            "onboarding_completed": profile.get("onboarding_completed"),
        },
        "kpis": kpis,
        "accounts": _accounts_for_prompt(),
        "goals": [
            {
                "title": g.get("title"),
                "type": g.get("type"),
                "target_amount": g.get("target_amount"),
                "status": g.get("status"),
            }
            for g in goals[:8]
        ],
        "memory_summary": pack.get("memory_summary"),
        "memory_facts": [f.get("fact") for f in facts[:8]],
    }

    return f"""
Eres Delfos, copiloto financiero personal local-first. Hablas en español colombiano,
cercano y claro — como un asesor de confianza en un chat, NO como un cuestionario.

ALCANCE OBLIGATORIO (no negociable):
- Solo hablas de finanzas personales del usuario: gastos, ingresos, ahorro, colchón,
  metas, deudas, inversiones, liquidez, hábitos de dinero y preparación tributaria básica.
- Si el usuario pide algo fuera de ese alcance (código, chistes, política, tareas escolares,
  etc.), rechaza con amabilidad en 1–2 frases y redirige a su situación financiera.
  Marca "off_topic": true. No respondas el tema fuera de alcance.
- No eres un asistente general. Eres el copiloto financiero de Delfos.

Estilo:
- Conversacional y fluido. Respuestas cortas o medias; nada de listas de examen.
- Usa SOLO los números del CONTEXT PACK. Si falta un dato, dilo y pregunta con naturalidad.
- No inventes saldos, KPIs ni transacciones.
- No des asesoría fiscal definitiva ni garantías de inversión. Puedes orientar y explicar.
- No pidas completar un formulario; si necesitas un dato, una pregunta suave basta.
- Puedes proponer 0–3 follow_ups (frases cortas que el usuario podría tocar como sugerencia).

Registro de movimientos (gastos / ingresos / inversiones / notas):
- Si el usuario reporta un movimiento real ("gasté 25 mil en Uber", "me pagaron 2M",
  "compré 1 acción AAPL"), relléna "movement_draft" con los objetos detectados.
- Si hay VARIOS en el mismo mensaje ("café 12 mil, almuerzo 45 mil y Uber 18 mil"),
  crea UN objeto por cada uno (varios en expenses/incomes/investments). No los mezcles.
- Ingresos van en "incomes". Inversiones (ticker/activo + monto + buy/sell) en "investments".
- NO digas que ya quedó guardado: el usuario confirma en la app y ahí pasa a movimientos.
- Si falta un dato clave (monto, qué compró, si es gasto o inversión), pregunta en "reply",
  pon ese faltante en movement_draft.needs_clarification y deja vacíos o solo lo claro.
- "mil" en Colombia = ×1000. No inventes montos ni activos.
- Usa account_name_hint con el nombre de una cuenta del CONTEXT PACK si encaja.

Crear cuenta:
- Si pide crear/agregar una cuenta ("crea Nequi", "nueva cuenta Brokers USD"),
  llena "account_draft" {{name, type, currency, initial_balance, emoji}}.
- type: cash|bank|credit_card|debit_card|wallet|broker|crypto|savings|other.
- NO digas que ya existe: el usuario confirma en la app.
- Si falta el nombre, pregunta y deja account_draft vacío.

Buscar / consultar registros:
- Si pregunta por historial ("¿cuánto en Uber este mes?", "busca AAPL", "gastos de Nequi"),
  llena "lookup" {{q, kind, period}} y NO inventes montos en reply.
- kind: expense|income|investment|note o null. period: month|year|all.
- El backend completa los números reales; reply puede ser corto ("Revisé tus movimientos").

Consultas de portafolio (P&L, rankings, detalle de ticker):
- Si pregunta por el portafolio ("¿activo más grande?", "mayor ganancia", "cómo va VOO?",
  "rendimiento del portafolio", "mejor retorno"), llena "finance_query" y NO inventes P&L.
- domain: solo "portfolio" por ahora.
- metric: summary | largest_position | highest_gain | highest_return | asset_detail.
- asset: ticker obligatorio solo para asset_detail (ej. "VOO"); null en el resto.
- El backend calcula con cotizaciones; reply puede ser corto ("Revisé tu portafolio").
- kpis.portfolio del CONTEXT PACK es un snapshot barato (cash/concentración por costo);
  para números de mercado usa finance_query.

Contexto evolutivo:
- Si el usuario revela datos estables (quiero ahorrar 30%, mis fijos son arriendo X e
  internet Y, ingreso Z), propón un "profile_patch" con los campos a actualizar.
- NO digas que ya quedó guardado en el perfil: el usuario debe confirmar en la app.
- Si menciona gastos fijos sueltos, usa fixed_expenses=[{{"label","amount"}}] y
  monthly_fixed_expenses=suma cuando puedas.
- Ojo: un arriendo como gasto fijo de perfil (profile_patch) NO es lo mismo que registrar
  el pago de este mes (movement_draft). Si paga "hoy", usa movement_draft.

CONTEXT PACK (fuente de verdad; no lo contradigas):
{json.dumps(context, ensure_ascii=False)}

Últimos mensajes del hilo:
{json.dumps(tail, ensure_ascii=False)}

Mensaje del usuario:
{user_message}

Devuelve SOLO JSON válido (sin markdown fuera del JSON):
{{
  "reply": "tu respuesta conversacional",
  "off_topic": false,
  "follow_ups": ["sugerencia corta opcional"],
  "memory_updates": [{{"fact": "hecho estable", "category": "preference|goal|habit|constraint|general"}}],
  "memory_summary": null,
  "profile_patch": {{
    "savings_target_percent": null,
    "monthly_fixed_expenses": null,
    "fixed_expenses": [{{"label": "Arriendo", "amount": 0}}],
    "monthly_income_fixed": null,
    "cushion_percent": null,
    "emergency_fund_target_months": null,
    "investment_target_percent": null,
    "risk_profile": null,
    "investment_horizon": null,
    "priorities": null
  }},
  "movement_draft": {{
    "needs_clarification": null,
    "expenses": [
      {{
        "amount": 0,
        "currency": "COP",
        "category": "",
        "category_emoji": "",
        "description": "",
        "payment_method": "",
        "account_name_hint": "",
        "suggested_new_category": null
      }}
    ],
    "incomes": [
      {{
        "amount": 0,
        "currency": "COP",
        "category": "",
        "category_emoji": "",
        "description": "",
        "income_source": "",
        "account_name_hint": "",
        "suggested_new_category": null
      }}
    ],
    "investments": [
      {{
        "asset": "",
        "asset_type": "",
        "amount": 0,
        "currency": "USD",
        "action": "buy",
        "category": "Inversión",
        "category_emoji": "📈",
        "notes": "",
        "account_name_hint": "",
        "suggested_new_category": null
      }}
    ],
    "notes": []
  }},
  "account_draft": {{
    "name": null,
    "type": "wallet",
    "currency": "COP",
    "initial_balance": 0,
    "emoji": "💰"
  }},
  "lookup": {{
    "q": null,
    "kind": null,
    "period": "month"
  }},
  "finance_query": {{
    "domain": null,
    "metric": null,
    "asset": null
  }}
}}

Reglas del JSON:
- reply es obligatorio y en lenguaje natural.
- off_topic: true solo si el mensaje no es financiero; reply redirige.
- follow_ups: máximo 3, o [].
- memory_updates: hechos estables nuevos; si no, [].
- memory_summary: null salvo condensar preferencias.
- profile_patch: objeto solo con campos que el usuario acaba de revelar o corregir;
  omite claves que no cambian (o null). Si no hay nada que persistir en perfil, {{}}.
- Campos válidos de profile_patch: monthly_income_fixed, monthly_income_variable_avg,
  monthly_fixed_expenses, fixed_expenses, savings_target_percent, investment_target_percent,
  cushion_percent, emergency_fund_target_months, pay_frequency, income_payday_day,
  income_payday_weekday, risk_profile, investment_horizon, fiscal_country, priorities.
- movement_draft: {{}} si el mensaje NO es un registro de movimiento. Si sí lo es,
  llena expenses/incomes/investments/notes (uno por ítem). needs_clarification solo si falta dato.
- account_draft: {{}} si no pide crear cuenta; si sí, name obligatorio.
- lookup: {{}} si no busca historial; si sí, q obligatorio. No inventes cifras de lookup.
- finance_query: {{}} si no consulta portafolio; si sí, domain+metric obligatorios.
  No inventes P&L ni precios: el backend completa el bloque factual.
- No mezcles intenciones: o registras, o buscas/consultas, o creas cuenta (prioridad:
  registro > finance_query/lookup > cuenta si el mensaje es ambiguo pero claro en una).
""".strip()


def _resolve_thread(thread_id: str | None):
    thread = None
    if thread_id:
        thread = next((t for t in finance_store.list_chat_threads() if t["id"] == thread_id), None)
    if not thread:
        thread = finance_store.get_or_create_main_thread()
    return thread


def summarize_thread(thread_id: str | None = None) -> dict:
    """
    /sumarize — condensa historial viejo en memory_summary y archiva esos mensajes.
    Deja una cola corta viva para que el chat no se ponga lento.
    """
    thread = _resolve_thread(thread_id)
    tid = thread["id"]
    user_msg = finance_store.append_chat_message(
        tid, "user", "/sumarize", meta={"command": "summarize"}
    )

    active = [
        m
        for m in finance_store.list_chat_messages(tid, limit=None)
        if (m.get("meta") or {}).get("command") != "summarize"
    ]
    if len(active) < _SUMMARIZE_MIN_MESSAGES:
        reply = (
            f"Aún hay poco historial para compactar ({len(active)} mensajes visibles). "
            f"Cuando pasemos de {_SUMMARIZE_MIN_MESSAGES}, usa /sumarize de nuevo."
        )
        assistant_msg = finance_store.append_chat_message(
            tid,
            "assistant",
            reply,
            meta={"command": "summarize", "compacted_count": 0},
        )
        return {
            "thread": next(t for t in finance_store.list_chat_threads() if t["id"] == tid),
            "assistant_message": assistant_msg,
            "follow_ups": ["¿Cómo voy de ahorro este mes?"],
            "off_topic": False,
            "profile_suggestion": {},
            "messages": finance_store.list_chat_messages(tid, limit=40),
            "ai_available": True,
            "summarized": False,
            "compacted_count": 0,
        }

    keep = active[-_SUMMARIZE_KEEP_RECENT:]
    to_compact = active[:-_SUMMARIZE_KEEP_RECENT]
    keep_ids = {m["id"] for m in keep}
    payload = [
        {
            "role": m.get("role"),
            "content": str(m.get("content") or "")[:_SUMMARIZE_MAX_CHARS],
        }
        for m in to_compact[-60:]
    ]
    prev = finance_store.get_memory_summary() or ""
    prompt = f"""
Eres Delfos. Condensa SOLO el historial financiero en un resumen estable y corto.
No inventes números. Conserva decisiones, metas, fijos, preferencias y acuerdos.
Si hay resumen previo, intégralo sin repetir de más.

Resumen previo:
{prev or "(vacío)"}

Mensajes a condensar:
{json.dumps(payload, ensure_ascii=False)}

Devuelve SOLO JSON:
{{
  "summary": "párrafo denso, max ~900 chars",
  "memory_updates": [{{"fact": "hecho estable", "category": "preference|goal|habit|constraint|general"}}],
  "reply": "1–2 frases al usuario confirmando la compactación"
}}
""".strip()

    try:
        integration = registry.get_active_integration()
        raw = integration.complete_json(prompt)
        parsed = _extract_json(raw)
    except IntegrationError as exc:
        assistant_msg = finance_store.append_chat_message(
            tid,
            "assistant",
            "No pude compactar ahora: la IA no está disponible. "
            f"{exc}"
            + (f" ({exc.hint})" if getattr(exc, "hint", None) else ""),
            meta={"command": "summarize", "error": True},
        )
        return {
            "thread": thread,
            "user_message": user_msg,
            "assistant_message": assistant_msg,
            "follow_ups": [],
            "ai_available": False,
            "error": str(exc),
            "summarized": False,
            "compacted_count": 0,
            "messages": finance_store.list_chat_messages(tid, limit=40),
        }
    except (ValueError, json.JSONDecodeError, TypeError):
        assistant_msg = finance_store.append_chat_message(
            tid,
            "assistant",
            "Intenté compactar, pero no pude leer bien la respuesta del modelo. ¿Lo reintentamos?",
            meta={"command": "summarize", "parse_error": True},
        )
        return {
            "thread": thread,
            "assistant_message": assistant_msg,
            "follow_ups": ["/sumarize"],
            "ai_available": True,
            "error": "parse_error",
            "summarized": False,
            "compacted_count": 0,
            "messages": finance_store.list_chat_messages(tid, limit=40),
        }

    summary = (parsed.get("summary") or "").strip()
    if not summary:
        summary = prev or "Conversación financiera previa condensada."
    finance_store.touch_memory_summary(summary, max_len=1200)

    memory_updates = parsed.get("memory_updates") or []
    if isinstance(memory_updates, list) and memory_updates:
        finance_store.upsert_memory_facts(memory_updates)

    compacted_ids = [m["id"] for m in to_compact if m.get("id") not in keep_ids]
    compacted_count = finance_store.mark_chat_messages_compacted(tid, compacted_ids)

    reply = (parsed.get("reply") or "").strip() or (
        f"Listo: condensé {compacted_count} mensajes antiguos en el resumen de memoria "
        f"y dejé los {_SUMMARIZE_KEEP_RECENT} más recientes activos."
    )
    assistant_msg = finance_store.append_chat_message(
        tid,
        "assistant",
        reply,
        meta={
            "command": "summarize",
            "compacted_count": compacted_count,
            "follow_ups": ["¿Cómo voy de ahorro este mes?", "¿Cómo está mi emergencia?"],
        },
    )
    return {
        "thread": next(t for t in finance_store.list_chat_threads() if t["id"] == tid),
        "assistant_message": assistant_msg,
        "follow_ups": ["¿Cómo voy de ahorro este mes?", "¿Cómo está mi emergencia?"],
        "off_topic": False,
        "profile_suggestion": {},
        "messages": finance_store.list_chat_messages(tid, limit=40),
        "ai_available": True,
        "summarized": True,
        "compacted_count": compacted_count,
        "memory_summary": finance_store.get_memory_summary(),
        "profile": finance_store.get_financial_profile(),
    }


def lookup_command(query: str, thread_id: str | None = None) -> dict:
    """ /buscar <texto> — búsqueda directa sin LLM."""
    thread = _resolve_thread(thread_id)
    tid = thread["id"]
    q = (query or "").strip()
    finance_store.append_chat_message(
        tid, "user", f"/buscar {q}", meta={"command": "lookup"}
    )
    try:
        result = finance_store.search_movements(q, period="month", limit=12)
    except ValueError as exc:
        assistant_msg = finance_store.append_chat_message(
            tid, "assistant", str(exc), meta={"command": "lookup", "error": True}
        )
        return {
            "thread": thread,
            "assistant_message": assistant_msg,
            "follow_ups": [],
            "lookup": None,
            "messages": finance_store.list_chat_messages(tid, limit=40),
            "ai_available": True,
        }
    reply = format_lookup_reply(result)
    assistant_msg = finance_store.append_chat_message(
        tid,
        "assistant",
        reply,
        meta={"command": "lookup", "lookup": result},
    )
    return {
        "thread": next(t for t in finance_store.list_chat_threads() if t["id"] == tid),
        "assistant_message": assistant_msg,
        "follow_ups": [f"/buscar {q}"] if result.get("count") else ["Gasté 25 mil en Uber"],
        "lookup": result,
        "messages": finance_store.list_chat_messages(tid, limit=40),
        "ai_available": True,
        "profile": finance_store.get_financial_profile(),
    }


def chat(message: str, thread_id: str | None = None) -> dict:
    """Mensaje usuario → context pack → LLM → persiste turno."""
    text = (message or "").strip()
    if not text:
        raise ValueError("Mensaje vacío")

    if _SUMMARIZE_RE.match(text):
        return summarize_thread(thread_id)

    buscar = _BUSCAR_RE.match(text)
    if buscar:
        return lookup_command(buscar.group(1), thread_id)

    thread = _resolve_thread(thread_id)
    tid = thread["id"]
    debug: dict = {"enabled": bool(config.ASSISTANT_DEBUG), "thread_id": tid, "message": text}

    finance_store.append_chat_message(tid, "user", text)
    pack = build_context_pack(tid)
    prompt = build_chat_prompt(text, pack)
    if config.ASSISTANT_DEBUG:
        kpis = pack.get("kpis") or {}
        debug["portfolio_kpi"] = kpis.get("portfolio")
        debug["prompt_chars"] = len(prompt)
        _assistant_trace(
            "chat.start",
            message=text,
            thread_id=tid,
            portfolio_kpi=kpis.get("portfolio"),
            prompt_chars=len(prompt),
        )

    try:
        integration = registry.get_active_integration()
        provider = getattr(integration, "provider", None) or type(integration).__name__
        debug["provider"] = str(provider)
        raw = integration.complete_json(prompt)
        parsed = _extract_json(raw)
    except IntegrationError as exc:
        debug["error"] = "integration"
        debug["error_detail"] = str(exc)
        _assistant_trace("chat.integration_error", error=str(exc), hint=getattr(exc, "hint", None))
        fallback = (
            "Ahora mismo no puedo hablar con el modelo de IA. "
            f"{exc}"
            + (f" ({exc.hint})" if getattr(exc, "hint", None) else "")
            + " Revisa Configuración → Inteligencia artificial."
        )
        assistant_msg = finance_store.append_chat_message(
            tid, "assistant", fallback, meta={"error": True}
        )
        out = {
            "thread": thread,
            "user_message": {"role": "user", "content": text},
            "assistant_message": assistant_msg,
            "follow_ups": [],
            "ai_available": False,
            "error": str(exc),
        }
        if config.ASSISTANT_DEBUG:
            out["debug"] = debug
        return out
    except (ValueError, json.JSONDecodeError, TypeError) as exc:
        debug["error"] = "parse_error"
        debug["error_detail"] = str(exc)
        _assistant_trace("chat.parse_error", error=str(exc))
        fallback = (
            "Te escuché, pero no pude interpretar bien la respuesta del modelo. "
            "¿Lo intentamos de nuevo con otras palabras?"
        )
        assistant_msg = finance_store.append_chat_message(
            tid, "assistant", fallback, meta={"parse_error": True}
        )
        out = {
            "thread": finance_store.get_or_create_main_thread(),
            "assistant_message": assistant_msg,
            "follow_ups": ["¿Cómo voy de ahorro este mes?", "¿Cómo está mi emergencia?"],
            "ai_available": True,
            "error": "parse_error",
        }
        if config.ASSISTANT_DEBUG:
            out["debug"] = debug
        return out

    raw_fq = parsed.get("finance_query") if isinstance(parsed.get("finance_query"), dict) else None
    raw_lookup = parsed.get("lookup") if isinstance(parsed.get("lookup"), dict) else None
    debug["llm"] = {
        "reply_preview": str(parsed.get("reply") or "")[:180],
        "off_topic": bool(parsed.get("off_topic")),
        "follow_ups": parsed.get("follow_ups") or [],
        "finance_query_raw": raw_fq,
        "lookup_raw": raw_lookup,
        "has_movement_draft": bool(parsed.get("movement_draft")),
        "has_account_draft": bool(parsed.get("account_draft")),
        "has_profile_patch": bool(parsed.get("profile_patch")),
    }
    _assistant_trace("chat.llm", **debug["llm"], provider=debug.get("provider"))

    reply = (parsed.get("reply") or "").strip() or "¿Me cuentas un poco más?"
    off_topic = bool(parsed.get("off_topic"))
    follow_ups = parsed.get("follow_ups") or []
    if not isinstance(follow_ups, list):
        follow_ups = []
    follow_ups = [str(x).strip() for x in follow_ups if str(x).strip()][:3]
    if off_topic:
        follow_ups = follow_ups or [
            "¿Cómo voy de ahorro este mes?",
            "¿Cómo está mi fondo de emergencia?",
        ]

    memory_updates = parsed.get("memory_updates") or []
    if isinstance(memory_updates, list) and memory_updates and not off_topic:
        finance_store.upsert_memory_facts(memory_updates)
    summary = parsed.get("memory_summary")
    if isinstance(summary, str) and summary.strip() and not off_topic:
        finance_store.touch_memory_summary(summary)

    profile_suggestion = {}
    movement_draft = None
    account_draft = None
    lookup = None
    finance_query = None
    if not off_topic:
        try:
            profile_suggestion = finance_store.sanitize_profile_patch(
                parsed.get("profile_patch") or {}
            )
        except (TypeError, ValueError):
            profile_suggestion = {}
        try:
            movement_draft = _movement_draft_from_parsed(parsed)
        except (TypeError, ValueError):
            movement_draft = None
        account_draft = _account_draft_from_parsed(parsed)
        # Registro gana sobre búsqueda/consulta si hay draft con ítems
        has_mov_items = bool(movement_draft and movement_draft.get("items"))
        if not has_mov_items:
            finance_query = _finance_query_from_parsed(parsed)
            if finance_query:
                factual = format_finance_query_reply(finance_query)
                reply = f"{reply}\n\n{factual}" if reply else factual
            lookup = _lookup_from_parsed(parsed)
            if lookup:
                factual = format_lookup_reply(lookup)
                reply = f"{reply}\n\n{factual}" if reply else factual
        debug["resolved"] = {
            "has_mov_items": has_mov_items,
            "finance_query": finance_query,
            "lookup_count": (lookup or {}).get("count") if lookup else None,
            "skipped_query_because_movement": has_mov_items,
        }
        _assistant_trace("chat.resolved", **debug["resolved"])
    else:
        debug["resolved"] = {"skipped": "off_topic"}

    assistant_msg = finance_store.append_chat_message(
        tid,
        "assistant",
        reply,
        meta={
            "follow_ups": follow_ups,
            "off_topic": off_topic,
            "profile_suggestion": profile_suggestion,
            "movement_draft": movement_draft,
            "account_draft": account_draft,
            "lookup": lookup,
            "finance_query": finance_query,
        },
    )

    out = {
        "thread": next(t for t in finance_store.list_chat_threads() if t["id"] == tid),
        "assistant_message": assistant_msg,
        "follow_ups": follow_ups,
        "off_topic": off_topic,
        "profile_suggestion": profile_suggestion,
        "movement_draft": movement_draft,
        "account_draft": account_draft,
        "lookup": lookup,
        "finance_query": finance_query,
        "messages": finance_store.list_chat_messages(tid, limit=40),
        "ai_available": True,
        "profile": finance_store.get_financial_profile(),
    }
    if config.ASSISTANT_DEBUG:
        debug["final_reply_preview"] = reply[:240]
        _assistant_trace("chat.done", reply_preview=debug["final_reply_preview"])
        out["debug"] = debug
    return out


def apply_profile_suggestion(patch: dict) -> dict:
    """Persiste un profile_patch confirmado por el usuario (preview → confirm)."""
    clean = finance_store.sanitize_profile_patch(patch or {})
    if not clean:
        raise ValueError("Nada que aplicar al perfil")
    profile = finance_store.update_financial_profile(clean)
    # Hecho de auditoría breve
    labels = ", ".join(sorted(clean.keys()))
    finance_store.upsert_memory_facts(
        [{"fact": f"Perfil actualizado desde el chat: {labels}", "category": "profile"}]
    )
    return {"profile": profile, "applied": clean}


def apply_account_suggestion(draft: dict) -> dict:
    """Crea una cuenta propuesta por el chat (preview → confirm)."""
    clean = finance_store.sanitize_account_draft(draft or {})
    if not clean:
        raise ValueError("Nada que crear: falta el nombre de la cuenta")
    account = finance_store.add_account(clean)
    finance_store.upsert_memory_facts(
        [{"fact": f'Cuenta creada desde el chat: {account["name"]}', "category": "profile"}]
    )
    return {"account": account, "applied": clean}
