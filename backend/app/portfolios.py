import csv
import io
from datetime import date, datetime, timezone
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import select
from .db import Holding, Portfolio
from .engine import analyze


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def owned(db, user_id, portfolio_id):
    p = db.scalar(select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user_id))
    if not p:
        raise HTTPException(404, "Portafolio no encontrado.")
    return p


def positions(db, portfolio_id):
    return list(db.scalars(select(Holding).where(Holding.portfolio_id == portfolio_id).order_by(Holding.symbol)))


def parse_csv(text, symbols):
    rows = list(csv.reader(io.StringIO(text.lstrip("\ufeff"))))
    if not rows:
        raise ValueError("El archivo está vacío.")
    headers = [cell.strip() for cell in rows.pop(0)]
    if not headers or headers[0] != "date" or len(set(headers)) != len(headers):
        raise ValueError("Primera columna: date. Los encabezados deben ser únicos.")
    data_symbols = [s for s in headers[1:] if s != "benchmark"]
    if set(data_symbols) != set(symbols):
        raise ValueError("El CSV debe contener exactamente tus activos; agrega benchmark como columna opcional.")
    if not 3 <= len(rows) <= 10000 or any(len(row) != len(headers) or any(not c.strip() for c in row) for row in rows):
        raise ValueError("Incluye entre 3 y 10,000 filas completas, sin celdas vacías.")
    dates = [row[0].strip() for row in rows]
    if any(date.fromisoformat(d) > date.today() for d in dates):
        raise ValueError("No se admiten precios futuros.")
    prices = {s: [float(row[headers.index(s)]) for row in rows] for s in data_symbols}
    benchmark = [float(row[headers.index("benchmark")]) for row in rows] if "benchmark" in headers else None
    analyze(dates, prices, {s: 1 / len(prices) for s in prices}, benchmark)
    return {"dates": dates, "prices": prices, "benchmark": benchmark, "source": "CSV importado",
            "kind": "imported", "updated_at": now_iso(), "currency": "USD",
            "note": "Precios ajustados declarados por el usuario; sin verificación del proveedor."}


def historical_analysis(portfolio, holdings, period="ALL"):
    data = portfolio.dataset
    if not data or not holdings or set(data["prices"]) != {h.symbol for h in holdings}:
        return None
    count = {"1M": 22, "3M": 64, "6M": 127, "1Y": 253}.get(period, len(data["dates"]))
    dates = data["dates"][-count:]
    prices = {s: ps[-count:] for s, ps in data["prices"].items()}
    benchmark = data["benchmark"][-count:] if data.get("benchmark") is not None else None
    capital = sum(h.quantity * prices[h.symbol][0] for h in holdings)
    weights = {h.symbol: h.quantity * prices[h.symbol][0] / capital for h in holdings}
    result = analyze(dates, prices, weights, benchmark, portfolio.annual_rf)
    result["benchmark_return"] = benchmark[-1] / benchmark[0] - 1 if benchmark else None
    for i, point in enumerate(result["curve"]):
        point["benchmark"] = benchmark[i] / benchmark[0] * 100 if benchmark else None
    result["start_date"], result["end_date"] = dates[0], dates[-1]
    result["methodology"] += " Simulación de las posiciones actuales desde el inicio del intervalo; no reconstruye las compras reales."
    return result


def money_product(a, b):
    return float(Decimal(str(a)) * Decimal(str(b)))


def portfolio_view(db, portfolio, period="ALL"):
    holdings = positions(db, portfolio.id)
    cost = sum(money_product(h.quantity, h.average_cost) for h in holdings)
    complete = bool(holdings) and all(h.market_price is not None for h in holdings)
    value = sum(money_product(h.quantity, h.market_price) for h in holdings) if complete else None
    holding_views = []
    for h in holdings:
        h_value = money_product(h.quantity, h.market_price) if h.market_price is not None else None
        h_cost = money_product(h.quantity, h.average_cost)
        holding_views.append({"id": h.id, "symbol": h.symbol, "name": h.name, "quantity": h.quantity,
                              "average_cost": h.average_cost, "market_price": h.market_price,
                              "price_date": h.price_date, "price_source": h.price_source,
                              "cost_basis": h_cost, "market_value": h_value,
                              "unrealized_pnl": h_value - h_cost if h_value is not None else None,
                              "weight": h_value / value if value and h_value is not None else None})
    dataset = portfolio.dataset
    return {"id": portfolio.id, "name": portfolio.name, "description": portfolio.description,
            "currency": portfolio.currency, "benchmark": portfolio.benchmark, "annual_rf": portfolio.annual_rf,
            "created_at": portfolio.created_at, "holdings": holding_views,
            "valuation": {"value": value, "cost_basis": cost,
                          "unrealized_pnl": value - cost if value is not None else None,
                          "unrealized_return": (value / cost - 1) if value is not None and cost else None,
                          "complete": complete,
                          "oldest_price_date": min((h.price_date for h in holdings if h.price_date), default=None)},
            "data": {k: v for k, v in dataset.items() if k not in ("dates", "prices", "benchmark")} if dataset else None,
            "analysis": historical_analysis(portfolio, holdings, period)}
