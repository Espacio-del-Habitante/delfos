"""Unit tests for portfolio_accounting.aggregate_portfolio."""

import unittest

from services.portfolio_accounting import NEGATIVE_CASH_WARNING, aggregate_portfolio


def _unrealized(state: dict, price: float) -> float:
    return state["qty"] * price - state["cost"]


class PortfolioAccountingTestCase(unittest.TestCase):
    def test_simple_buy(self):
        agg = aggregate_portfolio(
            [
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "TEST",
                    "quantity": 10.0,
                    "amount_usd": 1000.0,
                    "unit_price": 100.0,
                }
            ]
        )
        state = agg["positions_state"]["TEST"]
        self.assertAlmostEqual(state["qty"], 10.0)
        self.assertAlmostEqual(state["cost"], 1000.0)
        self.assertAlmostEqual(state["realized_sales"], 0.0)
        self.assertAlmostEqual(_unrealized(state, 120.0), 200.0)

    def test_partial_sell(self):
        agg = aggregate_portfolio(
            [
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "TEST",
                    "quantity": 10.0,
                    "amount_usd": 1000.0,
                    "unit_price": 100.0,
                },
                {
                    "operation_type": "sell",
                    "date": "2024-02-01",
                    "asset": "TEST",
                    "quantity": 4.0,
                    "amount_usd": 480.0,
                    "unit_price": 120.0,
                },
            ]
        )
        state = agg["positions_state"]["TEST"]
        self.assertAlmostEqual(state["realized_sales"], 80.0)
        self.assertAlmostEqual(state["qty"], 6.0)
        self.assertAlmostEqual(state["cost"], 600.0)
        self.assertAlmostEqual(_unrealized(state, 130.0), 180.0)
        self.assertAlmostEqual(state["realized_sales"] + _unrealized(state, 130.0), 260.0)

    def test_dca_sell(self):
        agg = aggregate_portfolio(
            [
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "TEST",
                    "quantity": 1.0,
                    "amount_usd": 100.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-02-01",
                    "asset": "TEST",
                    "quantity": 1.0,
                    "amount_usd": 200.0,
                },
                {
                    "operation_type": "sell",
                    "date": "2024-03-01",
                    "asset": "TEST",
                    "quantity": 1.0,
                    "amount_usd": 180.0,
                },
            ]
        )
        state = agg["positions_state"]["TEST"]
        self.assertAlmostEqual(state["realized_sales"], 30.0)
        self.assertAlmostEqual(state["qty"], 1.0)
        self.assertAlmostEqual(state["cost"], 150.0)

    def test_dividend_unchanged_position(self):
        agg = aggregate_portfolio(
            [
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "NU",
                    "quantity": 1.0,
                    "amount_usd": 10.0,
                },
                {
                    "operation_type": "dividend",
                    "date": "2024-06-01",
                    "asset": "NU",
                    "total": 1.82,
                },
            ]
        )
        state = agg["positions_state"]["NU"]
        self.assertAlmostEqual(state["dividends"], 1.82)
        self.assertAlmostEqual(state["qty"], 1.0)
        self.assertAlmostEqual(state["cost"], 10.0)
        self.assertAlmostEqual(agg["total_dividends"], 1.82)
        self.assertAlmostEqual(agg["total_realized_sales"], 0.0)

    def test_deposit_no_usd_position(self):
        agg = aggregate_portfolio(
            [
                {
                    "operation_type": "deposit",
                    "date": "2024-01-01",
                    "amount_usd": 100.0,
                    "total": 100.0,
                }
            ]
        )
        self.assertEqual(agg["positions_state"], {})
        self.assertAlmostEqual(agg["cash"], 100.0)
        self.assertAlmostEqual(agg["total_deposits"], 100.0)
        self.assertAlmostEqual(agg["total_realized_sales"], 0.0)

    def test_deposit_then_buy_cash(self):
        agg = aggregate_portfolio(
            [
                {
                    "operation_type": "deposit",
                    "date": "2024-01-01",
                    "total": 100.0,
                },
                {
                    "operation_type": "buy",
                    "date": "2024-01-02",
                    "asset": "VOO",
                    "quantity": 1.0,
                    "total": 60.15,
                },
            ]
        )
        self.assertAlmostEqual(agg["cash"], 39.85)

    def test_buy_without_deposit_negative_cash_warning(self):
        agg = aggregate_portfolio(
            [
                {
                    "operation_type": "buy",
                    "date": "2024-01-01",
                    "asset": "GLD",
                    "quantity": 1.0,
                    "amount_usd": 100.0,
                }
            ]
        )
        self.assertAlmostEqual(agg["cash"], -100.0)
        self.assertIn(NEGATIVE_CASH_WARNING, agg["warnings"])

    def test_hapi_signed_buy_total(self):
        """Hapi exports negative Total on buys; cost and cash must use positive magnitude."""
        agg = aggregate_portfolio(
            [
                {"operation_type": "deposit", "date": "2024-01-01", "total": 200.0},
                {
                    "operation_type": "buy",
                    "date": "2024-01-02",
                    "asset": "ACWI",
                    "quantity": 1.0,
                    "total": -60.15,
                },
            ]
        )
        self.assertAlmostEqual(agg["cash"], 139.85)
        self.assertAlmostEqual(agg["positions_state"]["ACWI"]["cost"], 60.15)


if __name__ == "__main__":
    unittest.main()
