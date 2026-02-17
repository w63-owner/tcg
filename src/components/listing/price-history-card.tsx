"use client";

import { useMemo, useState } from "react";

type PriceObservation = {
  date: string;
  price: number;
};

type PriceHistoryCardProps = {
  observations: PriceObservation[];
};

const PERIODS = [
  { key: "1m", label: "1 M", days: 30 },
  { key: "3m", label: "3 M", days: 90 },
  { key: "6m", label: "6 M", days: 180 },
  { key: "cumul", label: "Cumul", days: 3650 },
  { key: "1y", label: "1 AN", days: 365 },
  { key: "all", label: "Tout", days: null as number | null },
] as const;

function toEuro(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatRangeLabel(days: number) {
  if (days === 365) return "Ces 12 derniers mois";
  if (days === 90) return "Ces 3 derniers mois";
  return `Ces ${Math.round(days / 30)} derniers mois`;
}

export function PriceHistoryCard({ observations }: PriceHistoryCardProps) {
  const [periodKey, setPeriodKey] = useState<(typeof PERIODS)[number]["key"]>("all");
  const nowMs = Date.now();

  const sorted = useMemo(
    () =>
      [...observations]
        .filter((row) => Number.isFinite(row.price) && row.price > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [observations],
  );

  const selectedPeriod = PERIODS.find((period) => period.key === periodKey) ?? PERIODS[5];
  const filtered = useMemo(() => {
    if (selectedPeriod.days == null) return sorted;
    const cutoff = nowMs - selectedPeriod.days * 24 * 60 * 60 * 1000;
    return sorted.filter((point) => new Date(point.date).getTime() >= cutoff);
  }, [nowMs, selectedPeriod.days, sorted]);

  const chartPoints = filtered.length > 0 ? filtered : sorted;
  const prices = chartPoints.map((point) => point.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;
  const yMin = 0;
  const yMax = Math.max(maxPrice * 1.1, 10);
  const yRange = Math.max(1, yMax - yMin);
  const yTicks = [yMax, yMax * 0.66, yMax * 0.33, yMin];

  const coordinates = chartPoints.map((point, index) => {
    const x =
      chartPoints.length <= 1 ? 0 : (index / (chartPoints.length - 1)) * 100;
    const y = 100 - ((point.price - yMin) / yRange) * 100;
    return `${x},${Math.max(0, Math.min(100, y))}`;
  });

  const xTickIndexes = Array.from(
    new Set(
      chartPoints.length <= 1
        ? [0]
        : [0, Math.floor((chartPoints.length - 1) / 2), chartPoints.length - 1],
    ),
  );
  const xTicks = xTickIndexes.map((index) => chartPoints[index]).filter(Boolean);

  const observations12m = sorted.filter(
    (point) => new Date(point.date).getTime() >= nowMs - 365 * 24 * 60 * 60 * 1000,
  );
  const observations3m = sorted.filter(
    (point) => new Date(point.date).getTime() >= nowMs - 90 * 24 * 60 * 60 * 1000,
  );

  const range12mMin = observations12m.length > 0 ? Math.min(...observations12m.map((p) => p.price)) : null;
  const range12mMax = observations12m.length > 0 ? Math.max(...observations12m.map((p) => p.price)) : null;
  const range3mMin = observations3m.length > 0 ? Math.min(...observations3m.map((p) => p.price)) : null;
  const range3mMax = observations3m.length > 0 ? Math.max(...observations3m.map((p) => p.price)) : null;

  const volatility = (() => {
    if (observations12m.length < 2) return null;
    const values = observations12m.map((item) => item.price);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (mean <= 0) return null;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.round((Math.sqrt(variance) / mean) * 100);
  })();

  return (
    <section className="space-y-4 border-t pt-4">
      <h3 className="text-base font-semibold">Historique des prix</h3>

      <div className="bg-muted flex overflow-x-auto rounded-full p-1">
        {PERIODS.map((period) => (
          <button
            key={period.key}
            type="button"
            onClick={() => setPeriodKey(period.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              periodKey === period.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {period.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[56px_1fr] gap-2">
          <div className="text-muted-foreground flex h-44 flex-col justify-between text-right text-xs">
            {yTicks.map((tick, index) => (
              <span key={`y-${index}`}>{toEuro(tick)}</span>
            ))}
          </div>
          <div className="bg-muted/20 relative h-44 rounded-md border p-2">
            {coordinates.length > 1 ? (
              <svg viewBox="0 0 100 100" className="h-full w-full">
                <defs>
                  <linearGradient id="priceHistoryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[0, 33, 66, 100].map((y) => (
                  <line
                    key={`grid-${y}`}
                    x1="0"
                    x2="100"
                    y1={y}
                    y2={y}
                    className="text-border"
                    stroke="currentColor"
                    strokeOpacity="0.5"
                    strokeWidth="0.4"
                  />
                ))}
                <polyline
                  fill="url(#priceHistoryFill)"
                  stroke="none"
                  points={`${coordinates.join(" ")} 100,100 0,100`}
                  className="text-emerald-300"
                />
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  points={coordinates.join(" ")}
                  className="text-emerald-300"
                />
              </svg>
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                Pas assez de donnees historiques.
              </div>
            )}
          </div>
        </div>
        <div className="text-muted-foreground ml-[56px] space-y-1 text-xs">
          <div className="flex justify-between">
            {xTicks.map((point, index) => (
              <span key={`${point.date}-${index}`}>
                {formatShortDate(new Date(point.date))}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Donnees historiques
        </h4>
        <div className="space-y-3 rounded-md border p-3 text-sm">
          <div className="flex items-start justify-between gap-3 border-b pb-2">
            <div>
              <p>Fourchette de prix</p>
              <p className="text-muted-foreground text-xs">{formatRangeLabel(365)}</p>
            </div>
            <p className="font-medium">
              {range12mMin !== null && range12mMax !== null
                ? `${toEuro(range12mMin)} - ${toEuro(range12mMax)}`
                : "-"}
            </p>
          </div>
          <div className="flex items-start justify-between gap-3 border-b pb-2">
            <div>
              <p>Fourchette de prix</p>
              <p className="text-muted-foreground text-xs">{formatRangeLabel(90)}</p>
            </div>
            <p className="font-medium">
              {range3mMin !== null && range3mMax !== null
                ? `${toEuro(range3mMin)} - ${toEuro(range3mMax)}`
                : "-"}
            </p>
          </div>
          <div className="flex items-start justify-between gap-3 border-b pb-2">
            <p>Volatilite</p>
            <p className="font-medium">{volatility !== null ? `${volatility}%` : "-"}</p>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p>Nombre d&apos;observations</p>
              <p className="text-muted-foreground text-xs">{formatRangeLabel(90)}</p>
            </div>
            <p className="font-medium">{observations3m.length}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

