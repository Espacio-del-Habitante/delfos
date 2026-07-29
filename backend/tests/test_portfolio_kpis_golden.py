"""Golden portfolio KPIs con quotes mock.

Ledger redondo:
  - buy 10 AAPL @100 → cost 1000; price 120 → unrealized 200
  - buy 5 MSFT @200 → cost 1000; price 180 → unrealized −100
  - sell 2 AAPL @130 → realized 60; quedan 8 @ cost 800
  - dividend AAPL 15
→ strongest = AAPL (mayor market value); P&L total = unrealized + realized + div
"""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services import finance_store, portfolio_service, quote_service


def _snap(symbol: str, price: float) -> quote_service.QuoteSnapshot:
    return quote_service.QuoteSnapshot(
        symbol=symbol,
        price=price,
        currency="USD",
        timestamp="2026-07-01T00:00:00+00:00",
        provider="mock",
        confidence="ok",
        asset_type="stock",
    )


class PortfolioKpisGoldenTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.original_path = finance_store.DATA_PATH
        finance_store.DATA_PATH = Path(self.tmp.name) / "delfos_data.json"
        investments = [
            {
                "id": "inv_001",
                "operation_type": "buy",
                "action": "buy",
                "date": "2026-01-10",
                "asset": "AAPL",
                "quantity": 10.0,
                "amount": 1000.0,
                "amount_usd": 1000.0,
                "unit_price": 100.0,
                "currency": "USD",
                "created_at": "2026-01-10T00:00:00",
            },
            {
                "id": "inv_002",
                "operation_type": "buy",
                "action": "buy",
                "date": "2026-01-15",
                "asset": "MSFT",
                "quantity": 5.0,
                "amount": 1000.0,
                "amount_usd": 1000.0,
                "unit_price": 200.0,
                "currency": "USD",
                "created_at": "2026-01-15T00:00:00",
            },
            {
                "id": "inv_003",
                "operation_type": "sell",
                "action": "sell",
                "date": "2026-03-01",
                "asset": "AAPL",
                "quantity": 2.0,
                "amount": 260.0,
                "amount_usd": 260.0,
                "unit_price": 130.0,
                "currency": "USD",
                "created_at": "2026-03-01T00:00:00",
            },
            {
                "id": "inv_004",
                "operation_type": "dividend",
                "action": "dividend",
                "date": "2026-04-01",
                "asset": "AAPL",
                "quantity": 0,
                "amount": 15.0,
                "amount_usd": 15.0,
                "unit_price": None,
                "currency": "USD",
                "created_at": "2026-04-01T00:00:00",
            },
        ]
        finance_store.save_data(
            {
                "settings": {"currency": "COP"},
                "categories": [],
                "accounts": [],
                "expenses": [],
                "incomes": [],
                "investments": investments,
                "notes": [],
                "transfers": [],
                "financial_profile": dict(finance_store.DEFAULT_FINANCIAL_PROFILE),
                "goals": [],
            }
        )
        self.investments = investments

    def tearDown(self):
        finance_store.DATA_PATH = self.original_path
        self.tmp.cleanup()

    def test_golden_pnl_and_strongest(self):
        # AAPL: 8 @100 cost=800, price 120 → MV 960, unrealized 160
        # MSFT: 5 @200 cost=1000, price 180 → MV 900, unrealized −100
        # sell 2 AAPL @130 vs cost 200 → realized 60
        # dividend 15
        # total unrealized = 160 − 100 = 60; total_pnl = 60 + 60 + 15 = 135
        mocks = {"AAPL": _snap("AAPL", 120.0), "MSFT": _snap("MSFT", 180.0)}

        def fake_snapshots(items, imported=None):
            out = {it["symbol"]: mocks[it["symbol"]] for it in items if it["symbol"] in mocks}
            return out, []

        with patch.object(quote_service, "get_quote_snapshots", side_effect=fake_snapshots):
            insights = portfolio_service.get_portfolio_insights(self.investments)

        self.assertEqual(insights["total_unrealized_pnl_usd"], 60.0)
        self.assertEqual(insights["total_realized_pnl_usd"], 60.0)
        self.assertEqual(insights["total_dividends_usd"], 15.0)
        self.assertEqual(insights["total_pnl_usd"], 135.0)
        self.assertEqual(insights["strongest_asset"]["asset"], "AAPL")
        # AAPL MV 960 / (960+900) ≈ 51.6%
        self.assertEqual(insights["strongest_asset"]["portfolio_percent"], 51.6)

        aapl = next(p for p in insights["positions"] if p["asset"] == "AAPL")
        self.assertEqual(aapl["quantity"], 8.0)
        self.assertEqual(aapl["cost_basis_usd"], 800.0)
        self.assertEqual(aapl["unrealized_pnl_usd"], 160.0)


if __name__ == "__main__":
    unittest.main()
