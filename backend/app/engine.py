"""Historical buy-and-hold analysis. No forecasts or implicit rebalancing."""
from math import isfinite, sqrt
from statistics import mean, stdev, variance, covariance
from datetime import date


def analyze(dates, prices, weights, benchmark=None, annual_rf=0.0):
    if len(dates) < 3:
        raise ValueError("Se necesitan al menos tres fechas de precios diarios.")
    parsed = [date.fromisoformat(d) for d in dates]
    if any(d != parsed_date.isoformat() for d, parsed_date in zip(dates, parsed)):
        raise ValueError("Las fechas deben usar el formato AAAA-MM-DD.")
    if parsed != sorted(set(parsed)):
        raise ValueError("Las fechas deben ser únicas y estar ordenadas.")
    if not prices or set(prices) != set(weights):
        raise ValueError("Los activos y los pesos deben coincidir.")
    if any(not isfinite(w) or w < 0 for w in weights.values()):
        raise ValueError("Los pesos deben ser finitos y no negativos.")
    if abs(sum(weights.values()) - 1) > 1e-8:
        raise ValueError("Los pesos deben sumar 1.")
    if not isfinite(annual_rf) or annual_rf <= -1:
        raise ValueError("La tasa libre de riesgo debe ser mayor que -100%.")
    series = list(prices.values()) + ([] if benchmark is None else [benchmark])
    if any(len(s) != len(dates) or any(not isfinite(p) or not 1e-8 <= p <= 1e12 for p in s) for s in series):
        raise ValueError("Los precios deben ser finitos, entre 0.00000001 y 1 billón, y tener una observación por fecha.")
    equity = [sum(weights[t] * prices[t][i] / prices[t][0] for t in prices) for i in range(len(dates))]
    returns = [b / a - 1 for a, b in zip(equity, equity[1:])]
    sigma = stdev(returns)
    daily_rf = (1 + annual_rf) ** (1 / 252) - 1
    peak = equity[0]
    drawdowns = []
    for value in equity:
        peak = max(peak, value)
        drawdowns.append(value / peak - 1)
    beta = None
    if benchmark is not None:
        br = [b / a - 1 for a, b in zip(benchmark, benchmark[1:])]
        if variance(br) > 1e-24:
            beta = covariance(returns, br) / variance(br)
    insights = []
    if max(weights.values()) > 0.4:
        insights.append("Más del 40% del capital inicial está concentrado en un activo.")
    if len(returns) < 252:
        insights.append("La muestra contiene menos de 252 retornos diarios; las métricas anualizadas son sensibles al periodo elegido.")
    if sigma < 1e-12:
        insights.append("Sharpe no está definido: la volatilidad de la muestra es prácticamente cero.")
    return {
        "total_return": equity[-1] - 1,
        "annualized_volatility": sigma * sqrt(252),
        "sharpe": (mean(returns) - daily_rf) / sigma * sqrt(252) if sigma >= 1e-12 else None,
        "beta": beta,
        "max_drawdown": min(drawdowns),
        "observations": len(returns),
        "curve": [{"date": d, "value": e * 100, "drawdown": dd} for d, e, dd in zip(dates, equity, drawdowns)],
        "insights": insights,
        "methodology": "Buy-and-hold, pesos iniciales, base 100, 252 sesiones/año, desviación muestral. Sin comisiones, flujos ni rebalanceos. Precios diarios ajustados en una sola moneda.",
    }
