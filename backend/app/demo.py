"""Fixed, reproducible demonstration. These are NOT market observations."""
import math
import random
from datetime import date, timedelta
from .db import Holding, Portfolio
from .portfolios import now_iso


def seed_demo(db, user_id):
    rng = random.Random(42)
    days = []
    current = date(2025, 9, 1)
    while current <= date(2026, 8, 31):
        if current.weekday() < 5:
            days.append(current.isoformat())
        current += timedelta(days=1)
    prices = {}
    market_returns = [rng.gauss(.00045, .007) for _ in days[1:]]
    for symbol, first, exposure in [("VTI", 270, .95), ("MSFT", 410, 1.15), ("AAPL", 210, 1.2), ("BND", 72, .1), ("SPY", 590, 1.0)]:
        seq = [first]
        for i, market in enumerate(market_returns):
            r = exposure * market + rng.gauss(.0001, .004 if symbol != "BND" else .002)
            r -= .018 * math.exp(-((i - 130) / 6) ** 2) if symbol != "BND" else 0
            seq.append(round(seq[-1] * (1 + r), 4))
        prices[symbol] = seq
    benchmark = prices.pop("SPY")
    p = Portfolio(user_id=user_id, name="Mi portafolio de ejemplo", description="Una cartera para explorar EA Inversión con datos sintéticos.",
                  currency="USD", benchmark="SPY", annual_rf=0, created_at=now_iso(),
                  dataset={"dates": days, "prices": prices, "benchmark": benchmark, "source": "Demostración sintética", "kind": "demo",
                           "updated_at": now_iso(), "currency": "USD", "note": "Valores generados, sin cotizaciones ni rendimientos reales."})
    db.add(p)
    db.flush()
    for symbol, name, quantity in [("VTI", "Vanguard Total Stock Market", 45), ("MSFT", "Microsoft", 22), ("AAPL", "Apple", 30), ("BND", "Vanguard Total Bond Market", 85)]:
        db.add(Holding(portfolio_id=p.id, symbol=symbol, name=name, quantity=quantity, average_cost=prices[symbol][0],
                       market_price=prices[symbol][-1], price_date=days[-1], price_source="Demostración sintética"))
    db.flush()
    return p
