"use client";
import { useState } from "react";

type Result = {
  total_return: number;
  annualized_volatility: number;
  sharpe: number | null;
  beta: number | null;
  max_drawdown: number;
  observations: number;
  curve: { date: string; value: number }[];
  insights: string[];
  methodology: string;
};
const demo =
  "date,ACTIVO_A,ACTIVO_B,benchmark\n2026-01-05,100,100,100\n2026-01-06,102,99,101\n2026-01-07,101,101,100\n2026-01-08,105,102,103\n2026-01-09,103,101,102\n2026-01-12,107,103,104\n2026-01-13,106,104,103\n2026-01-14,110,103,106";
function parse(csv: string) {
  const rows = csv
    .trim()
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((r) => r.split(",").map((c) => c.trim()));
  const headers = rows.shift() || [];
  if (
    headers[0] !== "date" ||
    headers.length < 2 ||
    new Set(headers).size !== headers.length ||
    headers.some((h) => !h)
  )
    throw Error(
      "Usa date, símbolos únicos y, opcionalmente, benchmark como encabezados.",
    );
  const symbols = headers.slice(1).filter((h) => h !== "benchmark");
  if (!symbols.length) throw Error("Incluye al menos un activo.");
  if (
    rows.length < 3 ||
    rows.some((r) => r.length !== headers.length || r.some((c) => c === ""))
  )
    throw Error("Incluye al menos tres filas completas.");
  const prices = Object.fromEntries(
    symbols.map((s) => [s, rows.map((r) => Number(r[headers.indexOf(s)]))]),
  );
  const benchmark = headers.includes("benchmark")
    ? rows.map((r) => Number(r[headers.indexOf("benchmark")]))
    : undefined;
  if (
    Object.values(prices)
      .flat()
      .concat(benchmark || [])
      .some((p) => !Number.isFinite(p) || p <= 0)
  )
    throw Error("Los precios deben ser números positivos; usa punto decimal.");
  return { dates: rows.map((r) => r[0]), prices, benchmark, symbols };
}
export default function Page() {
  const [csv, setCsv] = useState(demo),
    [weights, setWeights] = useState("50,50"),
    [rf, setRf] = useState("0");
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [source, setSource] = useState(
    "Ejemplo sintético · no son cotizaciones reales",
  );
  function clear() {
    setResult(null);
    setError("");
  }
  async function calculate() {
    setBusy(true);
    clear();
    try {
      const p = parse(csv),
        w = weights.split(",").map((s) => (s.trim() === "" ? NaN : Number(s)));
      if (
        w.length !== p.symbols.length ||
        w.some((n) => !Number.isFinite(n) || n < 0) ||
        Math.abs(w.reduce((a, b) => a + b, 0) - 100) > 1e-6
      )
        throw Error(
          "Indica un peso por activo, en el mismo orden del CSV, sumando 100%.",
        );
      if (rf.trim() === "" || !Number.isFinite(Number(rf)))
        throw Error("Introduce una tasa libre de riesgo válida.");
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates: p.dates,
          prices: p.prices,
          benchmark: p.benchmark,
          weights: Object.fromEntries(p.symbols.map((s, i) => [s, w[i] / 100])),
          annual_rf: Number(rf) / 100,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(
          typeof data.detail === "string"
            ? data.detail
            : "Datos inválidos: verifica fechas ISO y tasa libre de riesgo (mayor que -100% y hasta 100%).",
        );
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo analizar el portafolio.",
      );
    } finally {
      setBusy(false);
    }
  }
  const metrics: [string, number | null, boolean][] = result
    ? [
        ["Rendimiento del periodo", result.total_return, true],
        ["Volatilidad anualizada", result.annualized_volatility, true],
        ["Sharpe anualizado", result.sharpe, false],
        ["Beta vs. benchmark", result.beta, false],
        ["Máximo drawdown", result.max_drawdown, true],
      ]
    : [];
  const values = result?.curve.map((p) => p.value) || [],
    low = Math.min(...values),
    high = Math.max(...values);
  return (
    <main className="lab-page">
      <header>
        <a href="/" className="brand">
          ◈ Portfolio Copilot
        </a>
        <span className="badge">Laboratorio · v0.1</span>
      </header>
      <section className="intro">
        <p className="eyebrow">TU CAPITAL, CON PERSPECTIVA</p>
        <h1>
          Entiende el riesgo.
          <br />
          <span>Decide con contexto.</span>
        </h1>
        <p>
          Explora cómo se habría comportado una cartera con pesos iniciales
          fijos. Importa precios diarios ajustados y analiza su historia.
        </p>
      </section>
      <div className="workspace">
        <section className="panel">
          <h2>Configura tu análisis</h2>
          <p className="muted">{source}</p>
          <fieldset disabled={busy}>
            <label className="upload">
              Importar CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  clear();
                  try {
                    if (f.size > 1_000_000)
                      throw Error("El CSV debe pesar menos de 1 MB.");
                    const text = await f.text();
                    const p = parse(text);
                    setCsv(text);
                    setWeights(
                      p.symbols
                        .map(() => String(100 / p.symbols.length))
                        .join(","),
                    );
                    setSource(`Archivo importado: ${f.name}`);
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Archivo inválido.",
                    );
                  }
                }}
              />
            </label>
            <label htmlFor="csv">Precios diarios</label>
            <textarea
              id="csv"
              spellCheck={false}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setSource("Datos editados manualmente");
                clear();
              }}
            />
            <p className="hint">
              Primera columna: date (AAAA-MM-DD). Activos después; benchmark
              opcional. Misma moneda, fechas alineadas, sin vacíos.
            </p>
            <label htmlFor="weights">
              Pesos iniciales (%) · orden de los activos del CSV
            </label>
            <input
              id="weights"
              value={weights}
              onChange={(e) => {
                setWeights(e.target.value);
                clear();
              }}
            />
            <label htmlFor="rf">Tasa libre de riesgo anual (%)</label>
            <input
              id="rf"
              type="number"
              step="any"
              value={rf}
              onChange={(e) => {
                setRf(e.target.value);
                clear();
              }}
            />
            <button onClick={calculate}>
              {busy ? "Calculando…" : "Analizar portafolio →"}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        <section aria-live="polite" className="results">
          {!result ? (
            <div className="empty">
              <span>↗</span>
              <h2>La historia de tu portafolio</h2>
              <p>
                Calcula el ejemplo o importa tus datos para ver la evolución, el
                riesgo y las observaciones.
              </p>
              <small>No se conectan cuentas ni se ejecutan operaciones.</small>
            </div>
          ) : (
            <>
              <div className="metrics">
                {metrics.map(([label, value, percent]) => (
                  <article key={label}>
                    <p>{label}</p>
                    <strong>
                      {value === null
                        ? "N/D"
                        : `${(value * (percent ? 100 : 1)).toFixed(2)}${percent ? "%" : ""}`}
                    </strong>
                  </article>
                ))}
              </div>
              <div className="panel">
                <div className="chart-heading">
                  <h2>Evolución · base 100</h2>
                  <span>{result.observations} retornos diarios</span>
                </div>
                <svg
                  viewBox="0 0 600 220"
                  role="img"
                  aria-label={`Evolución desde 100 hasta ${values[values.length - 1].toFixed(2)}`}
                >
                  <line x1="0" y1="195" x2="600" y2="195" stroke="#dde5e1" />
                  <polyline
                    fill="none"
                    stroke="#137a5b"
                    strokeWidth="3"
                    points={values
                      .map(
                        (v, i) =>
                          `${10 + (i / (values.length - 1)) * 580},${190 - ((v - low) / (high - low || 1)) * 160}`,
                      )
                      .join(" ")}
                  />
                </svg>
                <div className="chart-heading muted">
                  <span>{result.curve[0].date}</span>
                  <span>{result.curve[result.curve.length - 1].date}</span>
                </div>
              </div>
              <div className="panel">
                <h2>Lectura del portafolio</h2>
                {result.insights.length ? (
                  result.insights.map((i) => <p key={i}>• {i}</p>)
                ) : (
                  <p>
                    No se activaron las reglas de observación de esta versión.
                  </p>
                )}
                <details>
                  <summary>Cómo se calcula</summary>
                  <p>{result.methodology}</p>
                  <p>
                    Sharpe utiliza retornos aritméticos diarios menos la tasa
                    diaria equivalente. Beta requiere benchmark con varianza
                    distinta de cero. N/D significa no disponible o no definido.
                  </p>
                </details>
              </div>
            </>
          )}
        </section>
      </div>
      <footer>
        Resultados históricos, sin predicciones. Esta versión no guarda datos al
        cerrar la página.
      </footer>
    </main>
  );
}
