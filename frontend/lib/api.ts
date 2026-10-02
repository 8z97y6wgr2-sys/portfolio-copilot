export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) {
    const errors = data.errors
      ?.map(
        (e: { field: string; message: string }) => `${e.field}: ${e.message}`,
      )
      .join(" · ");
    throw new ApiError(
      errors || data.detail || "No se pudo completar la solicitud.",
      response.status,
    );
  }
  return data;
}
export type User = { id: string; name: string; email: string };
export type Holding = {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  average_cost: number;
  market_price: number | null;
  price_date: string | null;
  price_source: string | null;
  cost_basis: number;
  market_value: number | null;
  unrealized_pnl: number | null;
  weight: number | null;
};
export type Analysis = {
  total_return: number;
  annualized_volatility: number;
  sharpe: number | null;
  beta: number | null;
  max_drawdown: number;
  benchmark_return: number | null;
  observations: number;
  start_date: string;
  end_date: string;
  insights: string[];
  methodology: string;
  curve: {
    date: string;
    value: number;
    benchmark: number | null;
    drawdown: number;
  }[];
};
export type PortfolioSummary = {
  id: string;
  name: string;
  description: string;
  currency: string;
};
export type Portfolio = PortfolioSummary & {
  benchmark: string;
  annual_rf: number;
  holdings: Holding[];
  data: {
    source: string;
    kind: string;
    note: string;
    updated_at: string;
  } | null;
  analysis: Analysis | null;
  valuation: {
    value: number | null;
    cost_basis: number;
    unrealized_pnl: number | null;
    unrealized_return: number | null;
    complete: boolean;
    oldest_price_date: string | null;
  };
};
export const money = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v);
export const percent = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-MX", {
        style: "percent",
        maximumFractionDigits: 2,
        signDisplay: "exceptZero",
      }).format(v);
export const num = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(v);
