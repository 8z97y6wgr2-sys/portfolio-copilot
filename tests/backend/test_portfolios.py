"""End-to-end API invariants: identity, ownership, persistence and financial data."""
import tempfile
import time
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.auth import COOKIE, digest
from app.config import Settings
from app.db import Holding, LoginSession, Portfolio, User
from app.main import create_app
from app.market import MarketError

ORIGIN = 'http://testserver'
PASSWORD = 'Test-only-passphrase-2026'
CSV = 'date,AAPL,benchmark\n2026-01-05,100,100\n2026-01-06,110,105\n2026-01-07,99,103'


class FakeProvider:
    def __init__(self, fail=None, misalign=False):
        self.calls = []
        self.fail, self.misalign = fail, misalign

    def series(self, symbol, start, end):
        self.calls.append(symbol)
        if symbol == self.fail:
            raise MarketError('Provider quota reached')
        dates = ['2026-01-05', '2026-01-06', '2026-01-07']
        if self.misalign and symbol == 'SPY':
            dates[-1] = '2026-01-08'
        return {'dates': dates, 'prices': [100, 110, 99], 'raw_price': 123, 'raw_date': dates[-1],
                'source': 'Twelve Data', 'currency': 'USD'}


class PortfolioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(database_url='sqlite:///' + str(Path(self.temp.name) / 'test.db'), app_origin=ORIGIN)
        self.provider = FakeProvider()
        self.app = create_app(self.settings, self.provider)
        self.client = TestClient(self.app, headers={'Origin': ORIGIN})
        self.user = self.register()

    def tearDown(self):
        self.client.close()
        self.app.state.engine.dispose()
        self.temp.cleanup()

    def register(self, client=None, email='owner@example.test', password=PASSWORD):
        c = client or self.client
        response = c.post('/api/auth/register', json={'name': 'Usuario prueba', 'email': email, 'password': password})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def portfolio(self):
        return self.client.post('/api/portfolios', json={'name': 'Largo plazo'}).json()['id']

    def holding(self, pid, **overrides):
        body = {'symbol': 'AAPL', 'quantity': 2, 'average_cost': 90, 'market_price': 100, 'price_date': '2026-01-07'}
        body.update(overrides)
        response = self.client.post(f'/api/portfolios/{pid}/holdings', json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()['holdings'][-1]

    def test_auth_requires_cookie_and_session_is_hashed(self):
        token = self.client.cookies.get(COOKIE)
        with self.app.state.db() as db:
            user = db.get(User, self.user['id'])
            self.assertNotIn(PASSWORD, user.password_hash)
            self.assertTrue(user.password_hash.startswith('$argon2id$'))
            self.assertIsNotNone(db.get(LoginSession, digest(token)))
            self.assertIsNone(db.get(LoginSession, token))
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/api/portfolios').status_code, 401)

    def test_http_only_cookie_and_rotation_and_revocation(self):
        old = self.client.cookies.get(COOKIE)
        response = self.client.post('/api/auth/login', json={'email': 'owner@example.test', 'password': PASSWORD})
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertIn('SameSite=lax', response.headers['set-cookie'])
        new = self.client.cookies.get(COOKIE)
        self.assertNotEqual(old, new)
        with self.app.state.db() as db:
            self.assertIsNone(db.get(LoginSession, digest(old)))
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 204)
        self.client.cookies.set(COOKIE, new)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_expired_session_rejected(self):
        with self.app.state.db() as db:
            s = db.get(LoginSession, digest(self.client.cookies.get(COOKIE)))
            s.expires_at = int(time.time()) - 1
            db.commit()
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_password_spaces_preserved(self):
        self.register(email='spaces@example.test', password='  exact password with spaces  ')
        response = self.client.post('/api/auth/login', json={'email': 'spaces@example.test', 'password': 'exact password with spaces'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.post('/api/auth/login', json={'email': 'spaces@example.test', 'password': '  exact password with spaces  '}).status_code, 200)

    def test_email_canonicalization_and_bad_password(self):
        response = self.client.post('/api/auth/register', json={'name': 'Other', 'email': 'OWNER@example.test', 'password': PASSWORD})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.post('/api/auth/login', json={'email': 'owner@example.test', 'password': 'a-wrong-password'}).status_code, 401)
        response = self.client.post('/api/auth/register', json={'name': 'Short', 'email': 'x@example.test', 'password': 'tiny'})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('tiny', response.text)

    def test_throttling_survives_new_client(self):
        for _ in range(10):
            self.client.post('/api/auth/login', json={'email': 'unknown@example.test', 'password': PASSWORD})
        with TestClient(self.app, headers={'Origin': ORIGIN}) as c:
            self.assertEqual(c.post('/api/auth/login', json={'email': 'unknown@example.test', 'password': PASSWORD}).status_code, 429)

    def test_cross_origin_and_oversized_requests_rejected(self):
        self.assertEqual(self.client.post('/api/portfolios', json={'name': 'X'}, headers={'Origin': 'https://evil.example'}).status_code, 403)
        self.assertEqual(self.client.post('/api/portfolios', json={'name': 'X'}, headers={'Origin': ''}).status_code, 403)
        response = self.client.post('/api/portfolios', content='x' * 2_000_001, headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.client.post('/api/portfolios', content='name=x').status_code, 415)

    def test_persistence_across_application_restart(self):
        pid = self.portfolio()
        self.holding(pid)
        cookie = self.client.cookies.get(COOKIE)
        second = create_app(self.settings)
        with TestClient(second, headers={'Origin': ORIGIN}) as c:
            c.cookies.set(COOKIE, cookie)
            self.assertEqual(c.get('/api/portfolios').json()[0]['id'], pid)
            self.assertEqual(c.get(f'/api/portfolios/{pid}').json()['valuation']['value'], 200)
        second.state.engine.dispose()

    def test_another_user_cannot_read_write_or_export(self):
        pid = self.portfolio()
        h = self.holding(pid)
        with TestClient(self.app, headers={'Origin': ORIGIN}) as other:
            self.register(other, 'other@example.test')
            self.assertEqual(other.get('/api/portfolios').json(), [])
            cases = [('GET', '', None), ('GET', '/export', None), ('DELETE', '', None),
                     ('PUT', '', {'name': 'stolen'}), ('POST', '/refresh', {'days': 365}),
                     ('POST', '/history', {'csv': CSV}),
                     ('POST', '/holdings', {'symbol': 'MSFT', 'quantity': 2, 'average_cost': 1}),
                     ('PUT', '/holdings/' + h['id'], {'symbol': 'AAPL', 'quantity': 2, 'average_cost': 1}),
                     ('DELETE', '/holdings/' + h['id'], None)]
            for method, suffix, body in cases:
                with self.subTest(method=method, suffix=suffix):
                    self.assertEqual(other.request(method, f'/api/portfolios/{pid}' + suffix, json=body).status_code, 404)
        self.assertEqual(self.client.get(f'/api/portfolios/{pid}').json()['name'], 'Largo plazo')

    def test_valuation_not_fabricated_when_prices_missing(self):
        pid = self.portfolio()
        self.holding(pid)
        h = self.holding(pid, symbol='MSFT', market_price=None, price_date=None)
        view = self.client.get(f'/api/portfolios/{pid}').json()
        self.assertIsNone(view['valuation']['value'])
        self.assertIsNone(view['valuation']['unrealized_pnl'])
        self.assertEqual(view['valuation']['cost_basis'], 360)
        self.assertTrue(all(x['weight'] is None for x in view['holdings']))
        self.assertEqual(self.client.delete(f'/api/portfolios/{pid}/holdings/{h["id"]}').status_code, 204)
        view = self.client.get(f'/api/portfolios/{pid}').json()
        self.assertEqual(view['valuation']['value'], 200)
        self.assertEqual(view['valuation']['unrealized_pnl'], 20)
        self.assertAlmostEqual(view['holdings'][0]['weight'], 1)

    def test_reject_negative_duplicate_and_future_holdings(self):
        pid = self.portfolio()
        self.holding(pid)
        base = {'symbol': 'MSFT', 'quantity': 1, 'average_cost': 100}
        bad = [{'quantity': -1}, {'quantity': 0}, {'quantity': 1e-200}, {'average_cost': -1}, {'market_price': 100},
               {'market_price': 100, 'price_date': '2999-01-01'}, {'symbol': '../x'}, {'market_price': 'NaN', 'price_date': '2026-01-01'}]
        for extra in bad:
            with self.subTest(extra=extra):
                self.assertEqual(self.client.post(f'/api/portfolios/{pid}/holdings', json={**base, **extra}).status_code, 422)
        self.assertEqual(self.client.post(f'/api/portfolios/{pid}/holdings', json={**base, 'symbol': 'aapl'}).status_code, 409)

    def test_import_preserves_raw_valuation_and_computes_known_return(self):
        pid = self.portfolio()
        self.holding(pid)
        response = self.client.post(f'/api/portfolios/{pid}/history', json={'csv': CSV})
        self.assertEqual(response.status_code, 200, response.text)
        view = response.json()
        self.assertAlmostEqual(view['analysis']['total_return'], -.01)
        self.assertEqual(view['analysis']['curve'][0]['benchmark'], 100)
        self.assertEqual(view['analysis']['curve'][-1]['benchmark'], 103)
        self.assertEqual(view['valuation']['value'], 200)
        self.assertEqual(view['data']['kind'], 'imported')
        self.assertIsNone(self.client.get(f'/api/portfolios/{pid}').json()['holdings'][0].get('password_hash'))

    def test_bad_import_does_not_destroy_good_history(self):
        pid = self.portfolio()
        self.holding(pid)
        self.client.post(f'/api/portfolios/{pid}/history', json={'csv': CSV})
        for bad in [CSV.replace('110', ''), CSV.replace('110', 'nan'), CSV.replace('110', '1e309'),
                    CSV.replace('110', '1e-308'), CSV.replace('AAPL', 'MSFT'),
                    CSV.replace('2026-01-06', '2026-01-05'), CSV.replace('2026-01-07', '2999-01-01')]:
            with self.subTest(csv=bad):
                self.assertEqual(self.client.post(f'/api/portfolios/{pid}/history', json={'csv': bad}).status_code, 422)
                self.assertAlmostEqual(self.client.get(f'/api/portfolios/{pid}').json()['analysis']['total_return'], -.01)

    def test_symbols_and_benchmark_changes_invalidate_history(self):
        pid = self.portfolio()
        self.holding(pid)
        self.client.post(f'/api/portfolios/{pid}/history', json={'csv': CSV})
        self.holding(pid, symbol='MSFT')
        self.assertIsNone(self.client.get(f'/api/portfolios/{pid}').json()['analysis'])
        pid = self.portfolio()
        self.holding(pid)
        self.client.post(f'/api/portfolios/{pid}/history', json={'csv': CSV})
        self.client.put(f'/api/portfolios/{pid}', json={'name': 'Changed', 'benchmark': 'QQQ'})
        self.assertIsNone(self.client.get(f'/api/portfolios/{pid}').json()['analysis'])

    def test_market_refresh_uses_raw_price_and_cache(self):
        pid = self.portfolio()
        self.holding(pid)
        response = self.client.post(f'/api/portfolios/{pid}/refresh', json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['valuation']['value'], 246)
        self.assertAlmostEqual(response.json()['analysis']['total_return'], -.01)
        self.client.post(f'/api/portfolios/{pid}/refresh', json={})
        self.assertEqual(self.provider.calls, ['AAPL', 'SPY'])

    def test_market_partial_failure_keeps_existing_data(self):
        pid = self.portfolio()
        self.holding(pid)
        self.client.post(f'/api/portfolios/{pid}/history', json={'csv': CSV})
        self.provider.fail = 'SPY'
        response = self.client.post(f'/api/portfolios/{pid}/refresh', json={})
        self.assertEqual(response.status_code, 503)
        view = self.client.get(f'/api/portfolios/{pid}').json()
        self.assertEqual(view['data']['kind'], 'imported')
        self.assertEqual(view['valuation']['value'], 200)
        self.provider.fail = None
        self.client.post(f'/api/portfolios/{pid}/refresh', json={})
        self.assertEqual(self.provider.calls.count('AAPL'), 2)  # Failed cache batch rolled back too.

    def test_market_misalignment_does_not_fill_prices(self):
        pid = self.portfolio()
        self.holding(pid)
        self.provider.misalign = True
        self.assertEqual(self.client.post(f'/api/portfolios/{pid}/refresh', json={}).status_code, 503)
        self.assertIsNone(self.client.get(f'/api/portfolios/{pid}').json()['analysis'])

    def test_demo_is_labeled_and_period_rebases_both_curves(self):
        p = self.client.post('/api/portfolios/demo').json()
        self.assertEqual(p['data']['kind'], 'demo')
        self.assertTrue(all(h['price_source'] == 'Demostración sintética' for h in p['holdings']))
        short = self.client.get(f'/api/portfolios/{p["id"]}?period=1M').json()
        self.assertEqual(short['analysis']['observations'], 21)
        self.assertAlmostEqual(short['analysis']['curve'][0]['value'], 100)
        self.assertAlmostEqual(short['analysis']['curve'][0]['benchmark'], 100)

    def test_deletion_cascades_holdings_and_export_has_no_private_data(self):
        pid = self.portfolio()
        self.holding(pid)
        export = self.client.get(f'/api/portfolios/{pid}/export')
        self.assertIn('AAPL,2.0,90.0,100.0,2026-01-07,USD', export.text)
        self.assertNotIn(self.user['email'], export.text)
        self.client.delete(f'/api/portfolios/{pid}')
        with self.app.state.db() as db:
            self.assertIsNone(db.get(Portfolio, pid))
            self.assertEqual(list(db.scalars(select(Holding).where(Holding.portfolio_id == pid))), [])


if __name__ == '__main__':
    unittest.main()
