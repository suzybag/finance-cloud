"use client";

import { ResponsiveContainer, LineChart, Line, Tooltip } from "recharts";
import { formatPercent } from "@/lib/money";

type MiniChartProps = {
  prices: number[];
};

export function MiniChart({ prices }: MiniChartProps) {
  const recent = prices.slice(-7);
  const series = recent.map((value, index) => ({
    day: index + 1,
    price: value,
  }));

  const first = series[0]?.price ?? 0;
  const last = series[series.length - 1]?.price ?? 0;
  const trendPct = first > 0 ? ((last - first) / first) * 100 : 0;
  const positive = trendPct >= 0;
  const lineColor = positive ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-xl border border-violet-300/15 bg-[#0b1020]/75 px-3 py-2">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Ultimos 7 dias</span>
        <span className={positive ? "text-emerald-300" : "text-rose-300"}>
          {formatPercent(trendPct)}
        </span>
      </div>
      <div className="mt-2 h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <Tooltip
              cursor={{ stroke: "rgba(148,163,184,0.2)" }}
              contentStyle={{
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(124,58,237,0.35)",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: "11px",
              }}
              formatter={(value: number | string | undefined) => [`R$ ${Number(value || 0).toFixed(2)}`, "Preco"]}
              labelFormatter={(label) => `Dia ${label}`}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
