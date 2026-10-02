"use client";
import { useState } from "react";
import { Analysis, num } from "../lib/api";

export function PerformanceChart({
  analysis,
  benchmark,
  drawdown = false,
}: {
  analysis: Analysis;
  benchmark: string;
  drawdown?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const curve = analysis.curve;
  const all = curve.flatMap((p) =>
    drawdown
      ? [p.drawdown * 100, 0]
      : [p.value, ...(p.benchmark === null ? [] : [p.benchmark])],
  );
  const min = Math.min(...all),
    max = Math.max(...all),
    range = max - min || 1;
  const x = (i: number) => 48 + (i / (curve.length - 1)) * 740;
  const y = (v: number) => 225 - ((v - min) / range) * 185;
  const path = (values: number[]) =>
    values
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
      .join(" ");
  const vals = curve.map((p) => (drawdown ? p.drawdown * 100 : p.value));
  const point = hover === null ? null : curve[hover];
  return (
    <div className="chart-wrap">
      <div className="chart-tooltip" aria-live="off">
        {point ? (
          <>
            <b>{point.date}</b>
            <span>
              Cartera {num(drawdown ? point.drawdown * 100 : point.value)}
              {drawdown ? "%" : ""}
            </span>
            {!drawdown && point.benchmark !== null && (
              <span>
                {benchmark} {num(point.benchmark)}
              </span>
            )}
          </>
        ) : (
          <span>Recorre la gráfica para explorar cada fecha</span>
        )}
      </div>
      <svg
        viewBox="0 0 810 280"
        role="img"
        aria-label={
          drawdown
            ? "Caída desde el máximo histórico"
            : `Cartera y ${benchmark}, normalizados a 100`
        }
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(
            ((((e.clientX - r.left) / r.width) * 810 - 48) / 740) *
              (curve.length - 1),
          );
          setHover(Math.min(curve.length - 1, Math.max(0, i)));
        }}
      >
        <defs>
          <linearGradient
            id={drawdown ? "dd-fill" : "chart-fill"}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor={drawdown ? "#bd7961" : "#527c51"}
              stopOpacity=".19"
            />
            <stop offset="100%" stopColor="#527c51" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = min + (range * i) / 4;
          return (
            <g key={i}>
              <line
                x1="48"
                x2="788"
                y1={y(v)}
                y2={y(v)}
                stroke="#e9ede7"
                strokeDasharray="3 5"
              />
              <text x="0" y={y(v) + 4} className="axis-text">
                {v.toFixed(0)}
                {drawdown ? "%" : ""}
              </text>
            </g>
          );
        })}
        <path
          d={`${path(vals)} L788,225 L48,225 Z`}
          fill={`url(#${drawdown ? "dd-fill" : "chart-fill"})`}
        />
        {!drawdown && curve[0].benchmark !== null && (
          <path
            d={path(curve.map((p) => p.benchmark!))}
            fill="none"
            stroke="#a6ae9e"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
        )}
        <path
          d={path(vals)}
          fill="none"
          stroke={drawdown ? "#a76350" : "#466744"}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1="32"
              y2="228"
              stroke="#bac5b4"
            />
            <circle
              cx={x(hover)}
              cy={y(vals[hover])}
              r="4.5"
              fill="#294b3b"
              stroke="white"
              strokeWidth="2"
            />
          </g>
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const i = Math.round(t * (curve.length - 1));
          return (
            <text
              key={t}
              x={x(i)}
              y="261"
              textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
              className="axis-text"
            >
              {new Date(curve[i].date + "T12:00:00").toLocaleDateString(
                "es-MX",
                { month: "short", year: "2-digit" },
              )}
            </text>
          );
        })}
      </svg>
      <div className="sr-only">
        Del {analysis.start_date} al {analysis.end_date}. Valor inicial 100;
        final {num(curve.at(-1)?.value ?? null)}. Drawdown máximo{" "}
        {num(analysis.max_drawdown * 100)}%.
      </div>
    </div>
  );
}
