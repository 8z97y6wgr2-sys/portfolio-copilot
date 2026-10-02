import unittest
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(Settings(database_url='sqlite:///:memory:', app_origin='http://testserver'))
        self.client = TestClient(self.app, headers={'Origin': 'http://testserver'})
        self.payload = {"dates": ["2026-01-05", "2026-01-06", "2026-01-07"], "prices": {"A": [100, 110, 99]}, "weights": {"A": 1}}

    def test_success(self):
        self.assertEqual(self.client.get('/health').json(), {"status": "ok"})
        response = self.client.post('/api/analyze', json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(response.json()['total_return'], -.01)

    def test_invalid_weights(self):
        self.payload['weights'] = {'A': .4}
        self.assertEqual(self.client.post('/api/analyze', json=self.payload).status_code, 422)

    def test_invalid_date(self):
        self.payload['dates'][0] = 'invalid'
        self.assertEqual(self.client.post('/api/analyze', json=self.payload).status_code, 422)
