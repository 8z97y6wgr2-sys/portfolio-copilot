import unittest
import httpx
from app.market import MarketError, TwelveData


class MarketAdapterTests(unittest.TestCase):
    def payload(self, raw=False):
        return {'meta': {'currency': 'USD', 'symbol': 'AAPL'}, 'values':
                [{'datetime': '2026-01-07', 'close': '205'}] if raw else
                [{'datetime': '2026-01-07', 'close': '103'}, {'datetime': '2026-01-06', 'close': '101'}, {'datetime': '2026-01-05', 'close': '100'}]}

    def test_adjustments_and_no_credentials_in_result(self):
        calls = []
        def handler(request):
            calls.append(dict(request.url.params))
            return httpx.Response(200, json=self.payload(request.url.params['adjust'] == 'none'))
        result = TwelveData('test-secret', httpx.MockTransport(handler)).series('AAPL', '2026-01-05', '2026-01-07')
        self.assertEqual(result['prices'], [100, 101, 103])
        self.assertEqual(result['raw_price'], 205)
        self.assertEqual([x['adjust'] for x in calls], ['all', 'none'])
        self.assertNotIn('test-secret', str(result))

    def test_missing_key_fails_without_network(self):
        with self.assertRaises(MarketError):
            TwelveData('').series('AAPL', '2026-01-05', '2026-01-07')

    def test_provider_error_does_not_leak_secrets(self):
        provider = TwelveData('test-secret', httpx.MockTransport(lambda _: httpx.Response(429, json={'error': 'test-secret'})))
        with self.assertRaises(MarketError) as ctx:
            provider.series('AAPL', '2026-01-05', '2026-01-07')
        self.assertNotIn('test-secret', str(ctx.exception))

    def test_invalid_currency_symbol_dates_or_price_rejected(self):
        cases = [lambda b: b['meta'].update(currency='MXN'), lambda b: b['meta'].update(symbol='MSFT'),
                 lambda b: b['values'][0].update(close='nan'), lambda b: b['values'][0].update(close='0'),
                 lambda b: b['values'][0].update(datetime='2026-01-01'),
                 lambda b: b['values'][0].update(datetime='2026-01-06')]
        for mutate in cases:
            body = self.payload()
            mutate(body)
            provider = TwelveData('test', httpx.MockTransport(lambda _, body=body: httpx.Response(200, json=body)))
            with self.subTest(body=body), self.assertRaises(MarketError):
                provider.series('AAPL', '2026-01-05', '2026-01-07')
