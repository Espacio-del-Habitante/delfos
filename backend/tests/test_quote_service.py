"""Tests del motor de cotizaciones en capas (sin APIs reales)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services import quote_service, quote_settings
from services.quote_providers.alpha_vantage import ProviderQuote as AvQuote
from services.quote_providers.twelve_data import ProviderQuote as TdQuote
from services.quote_providers.yfinance import ProviderQuote as YfQuote
from services.quote_symbol import normalize_symbol


class QuoteServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.settings_path = Path(self.tmp.name) / "quote_settings.json"
        self.original_path = quote_settings.SETTINGS_PATH
        quote_settings.SETTINGS_PATH = self.settings_path
        quote_service.clear_cache()

    def tearDown(self):
        quote_settings.SETTINGS_PATH = self.original_path
        quote_service.clear_cache()
        self.tmp.cleanup()

    def _items(self, symbol: str, asset_type: str = "stock") -> list[dict[str, str]]:
        return [{"symbol": symbol, "asset_type": asset_type}]

    def test_cash_fixed_price(self):
        snaps, alerts = quote_service.get_quote_snapshots(
            self._items("USD", "cash"), {}
        )
        snap = snaps["USD"]
        self.assertEqual(snap.price, 1.0)
        self.assertEqual(snap.confidence, "ok")
        self.assertEqual(snap.asset_type, "cash")

    def test_no_keys_uses_yfinance_ok(self):
        with patch(
            "services.quote_providers.yfinance.fetch_quote",
            return_value=YfQuote(price=512.0, currency="USD", timestamp="2026-07-13T12:00:00+00:00"),
        ):
            snaps, alerts = quote_service.get_quote_snapshots(self._items("VOO"), {})
        snap = snaps["VOO"]
        self.assertEqual(snap.provider, "yfinance")
        self.assertEqual(snap.confidence, "ok")
        self.assertTrue(any("yfinance" in a for a in alerts))

    def test_twelve_data_wins_when_configured(self):
        quote_settings.save_config({"twelve_data_api_key": "test-key"})
        with patch(
            "services.quote_providers.twelve_data.fetch_quote",
            return_value=TdQuote(price=510.0, currency="USD", timestamp="2026-07-13T12:00:00+00:00"),
        ), patch("services.quote_providers.yfinance.fetch_quote", return_value=None):
            snaps, _ = quote_service.get_quote_snapshots(self._items("VOO"), {})
        self.assertEqual(snaps["VOO"].provider, "twelve_data")
        self.assertEqual(snaps["VOO"].confidence, "ok")

    def test_twelve_fail_alpha_fallback(self):
        quote_settings.save_config(
            {"twelve_data_api_key": "td", "alpha_vantage_api_key": "av"}
        )
        with patch("services.quote_providers.twelve_data.fetch_quote", return_value=None), patch(
            "services.quote_providers.alpha_vantage.fetch_quote",
            return_value=AvQuote(price=505.0, currency="USD", timestamp="2026-07-13T12:00:00+00:00"),
        ), patch("services.quote_providers.yfinance.fetch_quote", return_value=None):
            snaps, _ = quote_service.get_quote_snapshots(self._items("VOO"), {})
        self.assertEqual(snaps["VOO"].provider, "alpha_vantage")
        self.assertEqual(snaps["VOO"].confidence, "fallback")

    def test_premium_fail_yfinance_fallback(self):
        quote_settings.save_config({"twelve_data_api_key": "td"})
        with patch("services.quote_providers.twelve_data.fetch_quote", return_value=None), patch(
            "services.quote_providers.yfinance.fetch_quote",
            return_value=YfQuote(price=500.0, currency="USD", timestamp="2026-07-13T12:00:00+00:00"),
        ):
            snaps, _ = quote_service.get_quote_snapshots(self._items("VOO"), {})
        self.assertEqual(snaps["VOO"].provider, "yfinance")
        self.assertEqual(snaps["VOO"].confidence, "fallback")

    def test_api_fail_imported_fallback(self):
        with patch("services.quote_providers.yfinance.fetch_quote", return_value=None):
            snaps, _ = quote_service.get_quote_snapshots(
                self._items("XYZ"), {"XYZ": 99.5}
            )
        self.assertEqual(snaps["XYZ"].provider, "last_imported_unit_price")
        self.assertEqual(snaps["XYZ"].confidence, "fallback")
        self.assertAlmostEqual(snaps["XYZ"].price, 99.5)

    def test_all_fail_missing(self):
        with patch("services.quote_providers.yfinance.fetch_quote", return_value=None):
            snaps, _ = quote_service.get_quote_snapshots(self._items("XYZ"), {})
        self.assertEqual(snaps["XYZ"].confidence, "missing")
        self.assertIsNone(snaps["XYZ"].price)

    def test_divergence_warning(self):
        quote_settings.save_config(
            {"twelve_data_api_key": "td", "alpha_vantage_api_key": "av"}
        )
        with patch(
            "services.quote_providers.twelve_data.fetch_quote",
            return_value=TdQuote(price=100.0, currency="USD", timestamp="2026-07-13T12:00:00+00:00"),
        ), patch(
            "services.quote_providers.alpha_vantage.fetch_quote",
            return_value=AvQuote(price=90.0, currency="USD", timestamp="2026-07-13T12:00:00+00:00"),
        ):
            snaps, _ = quote_service.get_quote_snapshots(self._items("VOO"), {})
        self.assertEqual(snaps["VOO"].confidence, "warning")
        self.assertTrue(len(snaps["VOO"].candidates) >= 2)

    def test_invalid_crypto_missing(self):
        snaps, _ = quote_service.get_quote_snapshots(
            self._items("NOTACOIN", "crypto"), {}
        )
        self.assertEqual(snaps["NOTACOIN"].confidence, "missing")

    def test_normalize_crypto(self):
        norm = normalize_symbol("BTC-USD", "crypto")
        self.assertTrue(norm["ok"])
        self.assertEqual(norm["symbol"], "BTCUSD")
        self.assertEqual(norm["twelve_data_symbol"], "BTC/USD")

    def test_infer_crypto_overrides_wrong_etf(self):
        from services.quote_symbol import infer_asset_type

        self.assertEqual(infer_asset_type("BTCUSD", "ETF"), "crypto")
        self.assertEqual(infer_asset_type("ETHUSD", "etf"), "crypto")
        self.assertEqual(infer_asset_type("VOO", "ETF"), "etf")


if __name__ == "__main__":
    unittest.main()
