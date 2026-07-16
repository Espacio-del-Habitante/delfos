"""Normalización de símbolos por tipo de activo antes de consultar APIs."""

from __future__ import annotations

import re

_CASH_ASSETS = frozenset({"USD", "CASH", "USDT", "USDC"})
_CRYPTO_BASES = frozenset(
    {
        "BTC",
        "ETH",
        "SOL",
        "ADA",
        "XRP",
        "DOGE",
        "DOT",
        "AVAX",
        "MATIC",
        "LINK",
        "UNI",
        "LTC",
        "BCH",
        "BNB",
    }
)


def _clean_asset_type(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in ("cash", "efectivo"):
        return "cash"
    if value in ("crypto", "cripto", "cryptocurrency"):
        return "crypto"
    if value in ("etf",):
        return "etf"
    if value in ("stock", "accion", "acción", "equity"):
        return "stock"
    return ""


def _looks_like_crypto_symbol(symbol: str) -> bool:
    sym = symbol.strip().upper()
    if sym.endswith("-USD") or sym.endswith("/USD"):
        return True
    if sym.endswith("USD") and len(sym) > 3:
        base = sym[:-3]
        return base in _CRYPTO_BASES or bool(re.match(r"^[A-Z]{2,10}$", base))
    return False


def infer_asset_type(symbol: str, asset_type: str | None = None) -> str:
    """Tipo canónico: cash | crypto | etf | stock."""
    sym = symbol.strip().upper()
    if sym in _CASH_ASSETS:
        return "cash"
    # ponytail: el símbolo manda sobre asset_type importado mal (p.ej. BTCUSD como ETF)
    if _looks_like_crypto_symbol(sym):
        return "crypto"
    resolved = _clean_asset_type(asset_type)
    if resolved:
        return resolved
    return "stock"


def normalize_crypto(symbol: str) -> tuple[str | None, str | None, str | None]:
    """Devuelve (ticker_unificado, twelve_data_symbol, alpha_vantage_symbol)."""
    sym = symbol.strip().upper().replace("-", "").replace("/", "")
    if sym in _CASH_ASSETS:
        return None, None, None

    base: str | None = None
    if sym.endswith("USD") and len(sym) > 3:
        base = sym[:-3]
    elif sym.endswith("USDT") and len(sym) > 4:
        base = sym[:-4]

    if not base or base not in _CRYPTO_BASES and not re.match(r"^[A-Z]{2,10}$", base):
        return None, None, None

    unified = f"{base}USD"
    return unified, f"{base}/USD", base


def normalize_symbol(symbol: str, asset_type: str | None = None) -> dict:
    """Normaliza símbolo y metadatos para el motor de cotizaciones."""
    raw = (symbol or "").strip()
    if not raw:
        return {
            "ok": False,
            "symbol": raw,
            "asset_type": "stock",
            "query_symbol": None,
            "twelve_data_symbol": None,
            "alpha_vantage_symbol": None,
            "fixed_price": None,
            "errors": ["Símbolo vacío"],
        }

    resolved_type = infer_asset_type(raw, asset_type)
    upper = raw.upper()

    if resolved_type == "cash" or upper in _CASH_ASSETS:
        return {
            "ok": True,
            "symbol": upper,
            "asset_type": "cash",
            "query_symbol": upper,
            "twelve_data_symbol": None,
            "alpha_vantage_symbol": None,
            "fixed_price": 1.0,
            "errors": [],
        }

    if resolved_type == "crypto":
        unified, td_sym, av_sym = normalize_crypto(raw)
        if not unified:
            return {
                "ok": False,
                "symbol": upper,
                "asset_type": "crypto",
                "query_symbol": None,
                "twelve_data_symbol": None,
                "alpha_vantage_symbol": None,
                "fixed_price": None,
                "errors": [f"No se pudo normalizar el símbolo cripto '{raw}'"],
            }
        return {
            "ok": True,
            "symbol": unified,
            "asset_type": "crypto",
            "query_symbol": unified,
            "twelve_data_symbol": td_sym,
            "alpha_vantage_symbol": av_sym,
            "fixed_price": None,
            "errors": [],
        }

    ticker = upper.replace(".", "-")
    return {
        "ok": True,
        "symbol": ticker,
        "asset_type": resolved_type or "stock",
        "query_symbol": ticker,
        "twelve_data_symbol": ticker,
        "alpha_vantage_symbol": ticker,
        "fixed_price": None,
        "errors": [],
    }
