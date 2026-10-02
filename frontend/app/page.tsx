"use client";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  api,
  ApiError,
  Holding,
  money,
  num,
  percent,
  Portfolio,
  PortfolioSummary,
  User,
} from "../lib/api";
import { PerformanceChart } from "../components/chart";
import { Brand, Icon } from "../components/icons";
import { Auth } from "../components/auth";
type Tab = "overview" | "holdings" | "analysis" | "settings";
type Modal = "portfolio" | "holding" | "import" | null;
const colors = [
  "#41634d",
  "#94a785",
  "#c8b68b",
  "#8196a1",
  "#baa4b1",
  "#acbcac",
];
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Resumen", icon: "grid" },
  { id: "holdings", label: "Mis posiciones", icon: "wallet" },
  { id: "analysis", label: "Análisis de riesgo", icon: "chart" },
  { id: "settings", label: "Configuración", icon: "settings" },
];
const dateLabel = (d: string | null | undefined) =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Sin fecha";
function ModalFrame({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={close}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Cerrar ventana"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Metric({
  label,
  value,
  note,
  dark = false,
  negative = false,
}: {
  label: string;
  value: string;
  note: string;
  dark?: boolean;
  negative?: boolean;
}) {
  return (
    <article className={"metric " + (dark ? "metric-dark" : "")}>
      <span>{label}</span>
      <strong className={negative ? "negative" : ""}>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
export default function Page() {
  const [user, setUser] = useState<User | null>(null),
    [booting, setBooting] = useState(true),
    [bootError, setBootError] = useState("");
  const [list, setList] = useState<PortfolioSummary[]>([]),
    [selected, setSelected] = useState(""),
    [p, setP] = useState<Portfolio | null>(null);
  const [tab, setTab] = useState<Tab>("overview"),
    [period, setPeriod] = useState("ALL"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<Modal>(null),
    [editing, setEditing] = useState<Holding | null>(null);
  const [csvText, setCsvText] = useState(""),
    [query, setQuery] = useState(""),
    [provider, setProvider] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401))
          setBootError(
            "No se pudo conectar con el servidor. Recarga para volver a intentar.",
          );
      })
      .finally(() => setBooting(false));
  }, []);
  const loadList = useCallback(async (preferred?: string) => {
    const rows = await api<PortfolioSummary[]>("/portfolios");
    setList(rows);
    setSelected(
      (old) =>
        preferred || (rows.some((r) => r.id === old) ? old : rows[0]?.id || ""),
    );
  }, []);
  useEffect(() => {
    if (!user) return;
    loadList().catch((e) => setError(e.message));
    api<{ configured: boolean }>("/market/status")
      .then((s) => setProvider(s.configured))
      .catch((e) => setError(e.message));
  }, [user, loadList]);
  useEffect(() => {
    const version = ++generation.current;
    if (!user || !selected) {
      setP(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api<Portfolio>(`/portfolios/${selected}?period=${period}`)
      .then((v) => {
        if (version === generation.current) setP(v);
      })
      .catch((e) => {
        if (version === generation.current) {
          setP(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (version === generation.current) setLoading(false);
      });
  }, [user, selected, period]);
  async function action(fn: () => Promise<void>, success = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (success) setNotice(success);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la solicitud.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (selected)
      setP(await api<Portfolio>(`/portfolios/${selected}?period=${period}`));
  }
  async function createDemo() {
    await action(async () => {
      const data = await api<Portfolio>("/portfolios/demo", "POST");
      setPeriod("ALL");
      setP(data);
      await loadList(data.id);
    }, "Cartera de ejemplo creada. Todos sus precios son sintéticos.");
  }
  function holdingModal(h: Holding | null) {
    setEditing(h);
    setModal("holding");
    setError("");
  }
  async function saveHolding(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      await api(
        `/portfolios/${selected}/holdings${editing ? "/" + editing.id : ""}`,
        editing ? "PUT" : "POST",
        {
          symbol: f.get("symbol"),
          name: f.get("name"),
          quantity: Number(f.get("quantity")),
          average_cost: Number(f.get("average_cost")),
          market_price: f.get("market_price")
            ? Number(f.get("market_price"))
            : null,
          price_date: f.get("price_date") || null,
        },
      );
      await reload();
      setModal(null);
    }, "Posición guardada.");
  }
  async function savePortfolio(e: FormEvent<HTMLFormElement>, edit = false) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      const data = await api<Portfolio>(
        "/portfolios" + (edit ? "/" + selected : ""),
        edit ? "PUT" : "POST",
        {
          name: f.get("name"),
          description: f.get("description"),
          benchmark: f.get("benchmark") || "SPY",
          annual_rf: Number(f.get("annual_rf") || 0) / 100,
          currency: "USD",
        },
      );
      setP(data);
      setPeriod("ALL");
      await loadList(data.id);
      setModal(null);
    }, "Portafolio guardado.");
  }
  async function removeHolding(h: Holding) {
    if (
      !confirm(
        `¿Eliminar ${h.symbol} del portafolio? El histórico importado tendrá que actualizarse.`,
      )
    )
      return;
    await action(async () => {
      await api(`/portfolios/${selected}/holdings/${h.id}`, "DELETE");
      await reload();
    }, "Posición eliminada.");
  }
  const a = p?.analysis;
  const priceStale =
    p?.valuation.oldest_price_date &&
    Date.now() -
      new Date(p.valuation.oldest_price_date + "T00:00:00Z").getTime() >
      7 * 86400000;
  if (booting)
    return (
      <div className="boot">
        <Brand />
        <p>Preparando tu espacio…</p>
      </div>
    );
  if (bootError)
    return (
      <div className="boot">
        <Brand />
        <p role="alert">{bootError}</p>
        <button className="primary" onClick={() => location.reload()}>
          Volver a intentar
        </button>
      </div>
    );
  if (!user) return <Auth done={setUser} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" aria-label="EA Inversión, inicio">
          <Brand />
        </a>
        <div className="workspace-label">MI ESPACIO</div>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "nav-item active" : "nav-item"}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} />
              {t.label}
              {tab === t.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="leaf" size={26} />
          <h3>Invierte en perspectiva.</h3>
          <p>
            El rendimiento cuenta una parte. El riesgo completa la historia.
          </p>
          <a href="/lab">
            Abrir laboratorio <Icon name="arrow" size={15} />
          </a>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <b>{user.name}</b>
            <small>Espacio personal</small>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar sesión"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await api("/auth/logout", "POST");
                setUser(null);
                setP(null);
                setSelected("");
                setList([]);
                setNotice("");
              })
            }
          >
            <Icon name="exit" size={18} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Mi espacio <span>/</span>
            <b>{tabs.find((t) => t.id === tab)?.label}</b>
          </div>
          <div className="topbar-right">
            <span className="currency-label">
              USD <span>·</span> Dólar estadounidense
            </span>
            <span className="avatar small">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <button
              className="icon-button mobile-logout"
              aria-label="Cerrar sesión"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api("/auth/logout", "POST");
                  setUser(null);
                  setP(null);
                  setSelected("");
                  setList([]);
                  setNotice("");
                })
              }
            >
              <Icon name="exit" size={18} />
            </button>
          </div>
        </header>
        <main className="dashboard">
          <section className="page-heading">
            <div>
              <div className="eyebrow">TU CAPITAL, CON PERSPECTIVA</div>
              <h1>
                {tab === "overview"
                  ? "Tu portafolio, en contexto."
                  : tab === "holdings"
                    ? "Cada posición cuenta."
                    : tab === "analysis"
                      ? "Entiende tu exposición."
                      : "A tu manera."}
              </h1>
              <p>
                {tab === "overview"
                  ? `Hola, ${user.name.split(" ")[0]}. Aquí empieza una mirada más clara a tus inversiones.`
                  : tab === "holdings"
                    ? "Organiza tus activos, cantidades y costos de adquisición."
                    : tab === "analysis"
                      ? "Observa cómo se comportan tus posiciones en una simulación histórica."
                      : "Ajusta la cartera y consulta el estado de tus datos."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setModal("portfolio");
                setError("");
              }}
              disabled={busy}
            >
              <Icon name="plus" size={17} />
              Nuevo portafolio
            </button>
          </section>
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Cerrar error"
                onClick={() => setError("")}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice banner" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Cerrar aviso"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          )}
          {!list.length ? (
            <section className="onboarding panel">
              <span className="onboarding-icon">
                <Icon name="leaf" size={38} />
              </span>
              <div className="eyebrow">EL PRIMER PASO</div>
              <h2>Un lugar para ver todo tu capital.</h2>
              <p>
                Crea una cartera, registra tus posiciones y descubre lo que sus
                números pueden contarte.
              </p>
              <div className="onboarding-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => setModal("portfolio")}
                >
                  <Icon name="plus" size={17} />
                  Crear mi primera cartera
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={createDemo}
                >
                  Explorar con datos de ejemplo
                </button>
              </div>
              <small>
                El ejemplo utiliza datos sintéticos claramente identificados.
              </small>
            </section>
          ) : (
            <>
              <div className="portfolio-toolbar">
                <div className="portfolio-select">
                  <label htmlFor="portfolio-select">PORTAFOLIO</label>
                  <select
                    id="portfolio-select"
                    value={selected}
                    disabled={busy || loading}
                    onChange={(e) => {
                      setP(null);
                      setSelected(e.target.value);
                      setPeriod("ALL");
                      setError("");
                    }}
                  >
                    {list.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="toolbar-actions">
                  <button
                    className="secondary"
                    disabled={busy || loading || !p?.holdings.length}
                    onClick={() => {
                      setCsvText("");
                      setModal("import");
                      setError("");
                    }}
                  >
                    <Icon name="upload" size={16} />
                    Importar histórico
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || loading || !p?.holdings.length}
                    onClick={() =>
                      action(async () => {
                        await api(`/portfolios/${selected}/refresh`, "POST", {
                          days: 365,
                        });
                        await reload();
                      }, "Precios e histórico actualizados.")
                    }
                  >
                    <Icon name="refresh" size={15} />
                    {busy ? "Procesando…" : "Actualizar precios"}
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="panel loading" role="status">
                  Cargando tu portafolio…
                </div>
              ) : (
                p && (
                  <>
                    <div
                      className={
                        "source-line " +
                        (p.data?.kind === "demo" ? "source-demo" : "")
                      }
                    >
                      <span className="status-dot" />
                      <span>{p.data?.source || "Sin histórico importado"}</span>
                      <span className="source-detail">
                        {p.data?.kind === "demo"
                          ? "Precios y rendimientos ficticios para explorar la app"
                          : a
                            ? `${dateLabel(a.start_date)} — ${dateLabel(a.end_date)}`
                            : "Agrega precios diarios para analizar tu cartera"}
                      </span>
                    </div>
                    {tab === "overview" && (
                      <>
                        <div className="metrics-grid">
                          <Metric
                            dark
                            label="Valor de las posiciones"
                            value={money(p.valuation.value)}
                            note={
                              p.valuation.complete
                                ? `USD · precios desde ${dateLabel(p.valuation.oldest_price_date)}`
                                : "Agrega precio y fecha a cada posición"
                            }
                          />
                          <Metric
                            label="Ganancia no realizada"
                            value={money(p.valuation.unrealized_pnl)}
                            note={`${percent(p.valuation.unrealized_return)} sobre el costo registrado`}
                            negative={(p.valuation.unrealized_pnl || 0) < 0}
                          />
                          <Metric
                            label="Rendimiento simulado"
                            value={a ? percent(a.total_return) : "—"}
                            note={
                              a
                                ? `Cartera actual · ${a.observations} retornos diarios`
                                : "Importa el histórico para calcularlo"
                            }
                          />
                          <Metric
                            label="Volatilidad anualizada"
                            value={
                              a
                                ? percent(a.annualized_volatility).replace(
                                    "+",
                                    "",
                                  )
                                : "—"
                            }
                            note="Variabilidad de los retornos históricos"
                          />
                        </div>
                        <div className="overview-grid">
                          <section className="panel chart-panel">
                            <div className="panel-heading">
                              <div>
                                <h2>Evolución del portafolio</h2>
                                <p>Simulación histórica · base 100</p>
                              </div>
                              <div
                                className="periods"
                                aria-label="Periodo de análisis"
                              >
                                {["1M", "3M", "6M", "1Y", "ALL"].map((t) => (
                                  <button
                                    key={t}
                                    disabled={busy}
                                    onClick={() => setPeriod(t)}
                                    className={period === t ? "selected" : ""}
                                  >
                                    {t === "ALL"
                                      ? "Todo"
                                      : t === "1Y"
                                        ? "1A"
                                        : t}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {a ? (
                              <>
                                <div className="chart-legend">
                                  <span>
                                    <i style={{ background: "#466744" }} />
                                    Tu cartera
                                  </span>
                                  {a.benchmark_return !== null && (
                                    <span>
                                      <i style={{ background: "#a6ae9e" }} />
                                      {p.benchmark}
                                    </span>
                                  )}
                                </div>
                                <PerformanceChart
                                  analysis={a}
                                  benchmark={p.benchmark}
                                />
                              </>
                            ) : (
                              <div className="chart-empty">
                                <Icon name="chart" size={36} />
                                <h3>La historia necesita datos.</h3>
                                <p>
                                  Agrega posiciones e importa precios ajustados
                                  para ver la evolución de tu cartera.
                                </p>
                              </div>
                            )}
                          </section>
                          <section className="panel allocation-panel">
                            <div className="panel-heading">
                              <div>
                                <h2>Distribución actual</h2>
                                <p>Peso por valor de mercado</p>
                              </div>
                              <Icon name="wallet" size={18} />
                            </div>
                            {p.valuation.complete ? (
                              <>
                                <div
                                  className="donut"
                                  style={{
                                    background: `conic-gradient(${p.holdings
                                      .map((h, i) => {
                                        const start =
                                          p.holdings
                                            .slice(0, i)
                                            .reduce(
                                              (s, r) => s + (r.weight || 0),
                                              0,
                                            ) * 100;
                                        return `${colors[i % colors.length]} ${start}% ${start + (h.weight || 0) * 100}%`;
                                      })
                                      .join(",")})`,
                                  }}
                                  role="img"
                                  aria-label={p.holdings
                                    .map(
                                      (h) =>
                                        `${h.symbol}: ${percent(h.weight)}`,
                                    )
                                    .join(", ")}
                                >
                                  <div>
                                    <strong>{p.holdings.length}</strong>
                                    <span>activos</span>
                                  </div>
                                </div>
                                <div className="allocation-legend">
                                  {p.holdings.map((h, i) => (
                                    <div key={h.id}>
                                      <span>
                                        <i
                                          style={{
                                            background:
                                              colors[i % colors.length],
                                          }}
                                        />
                                        {h.symbol}
                                      </span>
                                      <b>
                                        {percent(h.weight).replace("+", "")}
                                      </b>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div className="chart-empty small-empty">
                                <p>
                                  La distribución aparece cuando todas las
                                  posiciones tienen precio.
                                </p>
                              </div>
                            )}
                          </section>
                        </div>
                        <section className="insight-strip">
                          <span className="insight-icon">
                            <Icon name="leaf" />
                          </span>
                          <div>
                            <h3>Una lectura de tu cartera</h3>
                            <p>
                              {a?.insights[0] ||
                                (a
                                  ? "Compara rendimiento y riesgo a lo largo de distintos periodos antes de sacar conclusiones."
                                  : "El siguiente paso es añadir precios históricos para calcular las métricas de riesgo.")}
                            </p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() => setTab("analysis")}
                          >
                            Ver análisis <Icon name="arrow" size={17} />
                          </button>
                        </section>
                      </>
                    )}
                    {(tab === "overview" || tab === "holdings") && (
                      <section className="panel positions-panel">
                        <div className="panel-heading">
                          <div>
                            <h2>
                              Mis posiciones{" "}
                              <span className="count">{p.holdings.length}</span>
                            </h2>
                            <p>
                              {priceStale
                                ? "Hay precios con más de 7 días de antigüedad. Revisa las fechas."
                                : "Valoración según los precios y costos registrados."}
                            </p>
                          </div>
                          <div className="toolbar-actions">
                            {tab === "holdings" && (
                              <a
                                className="secondary"
                                href={`/api/portfolios/${p.id}/export`}
                                download="posiciones.csv"
                              >
                                <Icon name="down" size={15} />
                                Exportar
                              </a>
                            )}
                            <button
                              className="secondary compact"
                              disabled={busy}
                              onClick={() => holdingModal(null)}
                            >
                              <Icon name="plus" size={16} />
                              Agregar activo
                            </button>
                          </div>
                        </div>
                        {tab === "holdings" && (
                          <label className="search-label">
                            Buscar activo
                            <input
                              placeholder="Símbolo o nombre…"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </label>
                        )}
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Activo</th>
                                <th>Cantidad</th>
                                <th>Costo promedio</th>
                                <th>Precio registrado</th>
                                <th>Valor</th>
                                <th>Ganancia / pérdida</th>
                                <th>Peso</th>
                                <th>
                                  <span className="sr-only">Acciones</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.holdings
                                .filter((h) =>
                                  (h.symbol + h.name)
                                    .toLowerCase()
                                    .includes(query.toLowerCase()),
                                )
                                .map((h, i) => (
                                  <tr key={h.id}>
                                    <td>
                                      <div className="asset-name">
                                        <span
                                          className="asset-icon"
                                          style={{
                                            background:
                                              colors[i % colors.length] + "20",
                                            color: colors[i % colors.length],
                                          }}
                                        >
                                          {h.symbol.slice(0, 2)}
                                        </span>
                                        <div>
                                          <b>{h.symbol}</b>
                                          <small>{h.name}</small>
                                        </div>
                                      </div>
                                    </td>
                                    <td>{num(h.quantity)}</td>
                                    <td>{money(h.average_cost)}</td>
                                    <td>
                                      {money(h.market_price)}
                                      <small className="price-date">
                                        {h.price_date
                                          ? `${dateLabel(h.price_date)} · ${h.price_source}`
                                          : "Sin precio"}
                                      </small>
                                    </td>
                                    <td className="table-strong">
                                      {money(h.market_value)}
                                    </td>
                                    <td
                                      className={
                                        (h.unrealized_pnl || 0) < 0
                                          ? "negative"
                                          : "positive"
                                      }
                                    >
                                      {money(h.unrealized_pnl)}
                                    </td>
                                    <td>
                                      {percent(h.weight).replace("+", "")}
                                    </td>
                                    <td>
                                      <div className="row-actions">
                                        <button
                                          className="icon-button"
                                          disabled={busy}
                                          aria-label={`Editar ${h.symbol}`}
                                          onClick={() => holdingModal(h)}
                                        >
                                          <Icon name="edit" size={16} />
                                        </button>
                                        <button
                                          className="icon-button delete"
                                          disabled={busy}
                                          aria-label={`Eliminar ${h.symbol}`}
                                          onClick={() => removeHolding(h)}
                                        >
                                          <Icon name="trash" size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {!p.holdings.length && (
                          <div className="table-empty">
                            <h3>Agrega tu primera posición.</h3>
                            <p>
                              Registra el símbolo, la cantidad y el costo
                              promedio de adquisición.
                            </p>
                            <button
                              className="text-button"
                              onClick={() => holdingModal(null)}
                            >
                              Agregar un activo <Icon name="plus" size={15} />
                            </button>
                          </div>
                        )}
                        {p.holdings.length > 0 && !p.valuation.complete && (
                          <p className="table-footnote">
                            Faltan precios: el total y los pesos permanecerán
                            vacíos hasta completar la valoración.
                          </p>
                        )}
                      </section>
                    )}
                    {tab === "analysis" && (
                      <>
                        <div className="metrics-grid">
                          <Metric
                            label="Sharpe anualizado"
                            value={a ? num(a.sharpe) : "—"}
                            note={`Tasa libre de riesgo: ${percent(p.annual_rf).replace("+", "")}`}
                          />
                          <Metric
                            label={`Beta frente a ${p.benchmark}`}
                            value={a ? num(a.beta) : "—"}
                            note="Sensibilidad al benchmark"
                          />
                          <Metric
                            label="Máxima caída"
                            value={a ? percent(a.max_drawdown) : "—"}
                            note="Desde un máximo hasta el mínimo posterior"
                            negative
                          />
                          <Metric
                            label="Rendimiento del benchmark"
                            value={a ? percent(a.benchmark_return) : "—"}
                            note={`${p.benchmark} · mismo intervalo que la cartera`}
                          />
                        </div>
                        <section className="panel">
                          <div className="panel-heading">
                            <div>
                              <h2>Las caídas también cuentan.</h2>
                              <p>
                                Drawdown histórico · porcentaje desde el máximo
                              </p>
                            </div>
                          </div>
                          {a ? (
                            <PerformanceChart
                              analysis={a}
                              benchmark={p.benchmark}
                              drawdown
                            />
                          ) : (
                            <div className="chart-empty">
                              <h3>Aún no hay datos suficientes.</h3>
                              <p>
                                Importa un histórico o actualiza los precios
                                desde el proveedor.
                              </p>
                            </div>
                          )}
                        </section>
                        <div className="analysis-grid">
                          <section className="panel">
                            <h2>Observaciones</h2>
                            {a ? (
                              (a.insights.length
                                ? a.insights
                                : [
                                    "No se activaron alertas de concentración inicial o muestra corta.",
                                  ]
                              ).map((insight, i) => (
                                <div className="observation" key={insight}>
                                  <span>{String(i + 1).padStart(2, "0")}</span>
                                  <p>{insight}</p>
                                </div>
                              ))
                            ) : (
                              <p className="muted">
                                Las observaciones aparecerán con el análisis.
                              </p>
                            )}
                          </section>
                          <section className="panel methodology">
                            <h2>Qué significan estos números</h2>
                            <p>
                              {a?.methodology ||
                                "El análisis usa precios diarios ajustados, una sola moneda y las posiciones actuales."}
                            </p>
                            <p>
                              El resultado histórico es una simulación. No mide
                              el rendimiento de compras, ventas o aportaciones
                              realizadas en otras fechas. La valoración y la
                              ganancia no realizada usan tus precios y costos
                              registrados.
                            </p>
                            <p>
                              Un guion indica una métrica no disponible o no
                              definida. Las ventanas usan aproximadamente 21
                              sesiones por mes.
                            </p>
                          </section>
                        </div>
                      </>
                    )}
                    {tab === "settings" && (
                      <div className="settings-grid">
                        <section className="panel">
                          <h2>Datos del portafolio</h2>
                          <form
                            key={p.id + p.name + p.annual_rf}
                            onSubmit={(e) => savePortfolio(e, true)}
                          >
                            <fieldset disabled={busy}>
                              <label>
                                Nombre
                                <input
                                  name="name"
                                  defaultValue={p.name}
                                  required
                                  maxLength={80}
                                />
                              </label>
                              <label>
                                Descripción
                                <textarea
                                  name="description"
                                  defaultValue={p.description}
                                  maxLength={400}
                                  rows={3}
                                />
                              </label>
                              <div className="form-grid">
                                <label>
                                  Benchmark
                                  <input
                                    name="benchmark"
                                    defaultValue={p.benchmark}
                                    required
                                    maxLength={16}
                                  />
                                </label>
                                <label>
                                  Tasa libre de riesgo anual (%)
                                  <input
                                    name="annual_rf"
                                    type="number"
                                    defaultValue={p.annual_rf * 100}
                                    step="any"
                                    min="-99.99"
                                    max="100"
                                    required
                                  />
                                </label>
                              </div>
                              <p className="hint">
                                Cambiar el benchmark elimina el histórico
                                guardado para evitar comparaciones incorrectas.
                                La moneda de esta versión es USD.
                              </p>
                              <button className="primary" type="submit">
                                Guardar configuración
                              </button>
                            </fieldset>
                          </form>
                        </section>
                        <div className="settings-aside">
                          <section className="panel">
                            <div className="eyebrow">DATOS DE MERCADO</div>
                            <h2>Twelve Data</h2>
                            <span
                              className={
                                "pill " + (provider ? "connected" : "")
                              }
                            >
                              {provider
                                ? "Proveedor configurado"
                                : "Conexión pendiente"}
                            </span>
                            <p className="muted">
                              {provider
                                ? "Actualiza la cartera para descargar cierres diarios. El acceso depende de los símbolos y límites de tu plan."
                                : "La conexión necesita una clave del proveedor. Mientras tanto, puedes usar precios manuales e importar históricos CSV."}
                            </p>
                            <p className="hint">
                              Se muestran la fuente y la fecha de cada precio.
                              Las descargas se reutilizan durante 6 horas.
                            </p>
                          </section>
                          <section className="panel">
                            <h2>Explorar y exportar</h2>
                            <p className="muted">
                              Prueba las funciones con una cartera independiente
                              de ejemplo.
                            </p>
                            <button
                              className="secondary full"
                              disabled={busy}
                              onClick={createDemo}
                            >
                              Crear cartera de demostración
                            </button>
                            <a
                              className="text-button export-link"
                              href={`/api/portfolios/${p.id}/export`}
                              download="posiciones.csv"
                            >
                              Exportar posiciones CSV{" "}
                              <Icon name="down" size={16} />
                            </a>
                          </section>
                          <section className="panel danger-zone">
                            <h2>Eliminar portafolio</h2>
                            <p>
                              Elimina esta cartera, sus posiciones y su
                              histórico guardado.
                            </p>
                            <button
                              className="danger-button"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    `¿Eliminar permanentemente «${p.name}»?`,
                                  )
                                )
                                  action(async () => {
                                    await api(`/portfolios/${p.id}`, "DELETE");
                                    setP(null);
                                    setSelected("");
                                    await loadList();
                                  }, "Portafolio eliminado.");
                              }}
                            >
                              Eliminar portafolio
                            </button>
                          </section>
                        </div>
                      </div>
                    )}
                  </>
                )
              )}
            </>
          )}
          <footer className="dashboard-footer">
            <span>
              EA Inversión <span>·</span> Tu capital, con perspectiva.
            </span>
            <span>Resultados históricos · Sin ejecución de operaciones</span>
          </footer>
        </main>
      </div>
      {modal === "portfolio" && (
        <ModalFrame
          title="Nuevo portafolio"
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <p className="muted">
            Dale un nombre a la cartera que quieres analizar.
          </p>
          <form onSubmit={(e) => savePortfolio(e)}>
            <fieldset disabled={busy}>
              <label>
                Nombre
                <input
                  name="name"
                  placeholder="Mi cartera de largo plazo"
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <label>
                Descripción
                <textarea
                  name="description"
                  maxLength={400}
                  rows={3}
                  placeholder="¿Qué objetivo tiene esta cartera?"
                />
              </label>
              <div className="form-grid">
                <label>
                  Benchmark
                  <input
                    name="benchmark"
                    defaultValue="SPY"
                    required
                    maxLength={16}
                  />
                </label>
                <label>
                  Tasa libre de riesgo (%)
                  <input
                    name="annual_rf"
                    type="number"
                    defaultValue="0"
                    step="any"
                    min="-99.99"
                    max="100"
                    required
                  />
                </label>
              </div>
              <p className="hint">
                Activos y precios en USD. Máximo 20 activos por cartera.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary full" type="submit">
                {busy ? "Guardando…" : "Crear portafolio"}
              </button>
            </fieldset>
          </form>
        </ModalFrame>
      )}
      {modal === "holding" && (
        <ModalFrame
          title={editing ? `Editar ${editing.symbol}` : "Agregar una posición"}
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <form onSubmit={saveHolding}>
            <fieldset disabled={busy}>
              <div className="form-grid">
                <label>
                  Símbolo
                  <input
                    name="symbol"
                    placeholder="AAPL"
                    defaultValue={editing?.symbol}
                    required
                    maxLength={16}
                    autoFocus
                  />
                </label>
                <label>
                  Nombre del activo
                  <input
                    name="name"
                    placeholder="Apple"
                    defaultValue={editing?.name}
                    maxLength={80}
                  />
                </label>
                <label>
                  Cantidad
                  <input
                    name="quantity"
                    type="number"
                    step="any"
                    min="0.00000001"
                    max="1000000000"
                    defaultValue={editing?.quantity}
                    required
                  />
                </label>
                <label>
                  Costo promedio (USD)
                  <input
                    name="average_cost"
                    type="number"
                    step="any"
                    min="0"
                    max="1000000000"
                    defaultValue={editing?.average_cost}
                    required
                  />
                </label>
              </div>
              <hr />
              <p className="muted">
                Precio de valoración opcional. Usa el precio sin ajustar y su
                fecha; podrás actualizarlo desde el proveedor.
              </p>
              <div className="form-grid">
                <label>
                  Precio registrado (USD)
                  <input
                    name="market_price"
                    type="number"
                    step="any"
                    min="0.00000001"
                    max="1000000000"
                    defaultValue={editing?.market_price ?? ""}
                  />
                </label>
                <label>
                  Fecha del precio
                  <input
                    name="price_date"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    defaultValue={editing?.price_date ?? ""}
                  />
                </label>
              </div>
              <p className="hint">
                Agregar o cambiar un símbolo requiere volver a importar o
                descargar el histórico.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary full" type="submit">
                {busy ? "Guardando…" : "Guardar posición"}
              </button>
            </fieldset>
          </form>
        </ModalFrame>
      )}
      {modal === "import" && (
        <ModalFrame
          title="Importar precios históricos"
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          <p className="muted">
            CSV con precios diarios ajustados en USD. No reemplaza los precios
            de valoración. La columna benchmark es opcional y debe corresponder
            a {p?.benchmark}.
          </p>
          <code className="csv-header">
            date,{p?.holdings.map((h) => h.symbol).join(",")},benchmark
          </code>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api(`/portfolios/${selected}/history`, "POST", {
                  csv: csvText,
                });
                await reload();
                setModal(null);
              }, "Histórico importado y guardado.");
            }}
          >
            <fieldset disabled={busy}>
              <label className="upload-input">
                Seleccionar CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 1_000_000) {
                      setError("El archivo debe pesar menos de 1 MB.");
                      return;
                    }
                    try {
                      setCsvText(await f.text());
                      setError("");
                    } catch {
                      setError("No se pudo leer el archivo.");
                    }
                  }}
                />
              </label>
              <label>
                Contenido del archivo
                <textarea
                  className="csv-editor"
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  required
                  placeholder="date,AAPL,benchmark&#10;2026-01-05,100,100&#10;2026-01-06,102,101&#10;2026-01-07,101,102"
                />
              </label>
              <p className="hint">
                Fechas AAAA-MM-DD, únicas y crecientes; al menos tres filas. Sin
                vacíos ni mezclas de moneda.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary full" type="submit">
                {busy ? "Importando…" : "Importar y analizar"}
              </button>
            </fieldset>
          </form>
        </ModalFrame>
      )}
    </div>
  );
}
