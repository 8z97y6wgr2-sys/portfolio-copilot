import unittest
from app.engine import analyze

D = ["2026-01-05", "2026-01-06", "2026-01-07"]


class EngineTests(unittest.TestCase):
    def test_buy_hold_and_drawdown(self):
        r = analyze(D, {"A": [100, 200, 100], "B": [100, 100, 100]}, {"A": .5, "B": .5})
        self.assertEqual([p["value"] for p in r["curve"]], [100, 150, 100])
        self.assertAlmostEqual(r["max_drawdown"], -1/3)
        self.assertEqual(r["total_return"], 0)

    def test_beta_identical_benchmark(self):
        r = analyze(D, {"A": [100, 105, 103]}, {"A": 1}, [100, 105, 103])
        self.assertAlmostEqual(r["beta"], 1)

    def test_flat_is_undefined(self):
        r = analyze(D, {"A": [100]*3}, {"A": 1}, [100]*3)
        self.assertIsNone(r["sharpe"])
        self.assertIsNone(r["beta"])
        self.assertEqual(r["max_drawdown"], 0)

    def test_reject_invalid_inputs(self):
        cases = [(["2026-01-05"]*3, {"A": [1,2,3]}, {"A": 1}),
                 (D, {"A": [1,0,3]}, {"A": 1}),
                 (D, {"A": [1,2]}, {"A": 1}),
                 (D, {"A": [1,2,3]}, {"A": .8}),
                 (D, {"A": [1,float('nan'),3]}, {"A": 1})]
        for args in cases:
            with self.subTest(args=args), self.assertRaises(ValueError):
                analyze(*args)

    def test_hand_computed_volatility(self):
        r = analyze(D, {"A": [100,110,99]}, {"A": 1})
        self.assertAlmostEqual(r["annualized_volatility"], (.02*252)**.5)
        self.assertAlmostEqual(r["sharpe"], 0)


if __name__ == "__main__":
    unittest.main()
