"""Twelve Data adapter. No synthetic fallback; adjusted history and raw valuation
are deliberately separate. Each uncached symbol costs two time_series calls.
"""
from datetime import date
from math import isfinite
import time
import httpx
from .db import MarketCache


class MarketError(Exception):
    pass


class TwelveData:
    def __init__(self, api_key, transport=None):
        self.api_key = api_key
        self.transport = transport

    def series(self, symbol, start, end):
        if not self.api_key:
            raise MarketError("Falta configurar la clave de Twelve Data en el servidor. Puedes importar un CSV mientras tanto.")
        base = {"symbol": symbol, "interval": "1day", "start_date": start, "end_date": end,
                "apikey": self.api_key, "format": "JSON", "order": "ASC", "outputsize": 5000}
        try:
            with httpx.Client(timeout=15, transport=self.transport) as client:
                adjusted = self._request(client, {**base, "adjust": "all"})
                raw = self._request(client, {**base, "adjust": "none", "order": "DESC", "outputsize": 1})
            dates, prices = self._parse(adjusted, start, end, symbol)
            raw_dates, raw_prices = self._parse(raw, start, end, symbol)
            if len(dates) < 3 or raw_dates[-1] != dates[-1]:
                raise ValueError("Muestra insuficiente o cierre sin ajustar desalineado.")
            return {"dates": dates, "prices": prices, "currency": "USD", "raw_price": raw_prices[-1],
                    "raw_date": raw_dates[-1], "source": "Twelve Data", "fetched_at": int(time.time())}
        except MarketError:
            raise
        except (httpx.HTTPError, ValueError, TypeError, KeyError, OverflowError):
            raise MarketError(f"No se obtuvieron precios válidos de {symbol}. Revisa el símbolo, la conexión y tu plan de datos.") from None

    @staticmethod
    def _request(client, params):
        response = client.get("https://api.twelvedata.com/time_series", params=params)
        if response.status_code == 429:
            raise MarketError("Se alcanzó el límite del proveedor. Espera antes de actualizar.")
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict) or body.get("status") == "error":
            # Do not propagate upstream error bodies, URLs, or credentials.
            raise MarketError("Twelve Data rechazó la consulta. Revisa tu clave, cuota y símbolos disponibles.")
        return body

    @staticmethod
    def _parse(body, start, end, symbol):
        if body["meta"]["currency"] != "USD" or body["meta"]["symbol"].upper() != symbol:
            raise ValueError("Moneda o símbolo incorrecto.")
        values = body["values"]
        if not values:
            raise ValueError("Sin precios.")
        rows = sorted((date.fromisoformat(v["datetime"]).isoformat(), float(v["close"])) for v in values)
        dates, prices = map(list, zip(*rows))
        if len(set(dates)) != len(dates) or any(not start <= d <= end for d in dates):
            raise ValueError("Fechas duplicadas o fuera del intervalo.")
        if any(not isfinite(p) or not 1e-8 <= p <= 1e12 for p in prices):
            raise ValueError("Precio inválido.")
        return dates, prices


def cached_series(db, provider, symbol, start, end):
    key = f"twelve-v1:{symbol}:{start}:{end}"
    cached = db.get(MarketCache, key)
    if cached and cached.expires_at > int(time.time()):
        return cached.payload
    payload = provider.series(symbol, start, end)
    if cached:
        cached.payload, cached.expires_at = payload, int(time.time()) + 21600
    else:
        db.add(MarketCache(key=key, payload=payload, expires_at=int(time.time()) + 21600))
    db.flush()
    return payload
