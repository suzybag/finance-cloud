"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { brl } from "@/lib/money";

type ReceitasDespesasDonutProps = {
  receitas: number;
  despesas: number;
};

const COLORS = {
  Receitas: "#22c55e",
  Despesas: "#3b82f6",
  Base: "rgba(148, 163, 184, 0.18)",
};

const tooltipStyle = {
  background: "rgba(10, 14, 29, 0.88)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 12,
  color: "#e2e8f0",
};

export function ReceitasDespesasDonut({ receitas, despesas }: ReceitasDespesasDonutProps) {
  const data = [
    { name: "Receitas", value: receitas },
    { name: "Despesas", value: despesas },
  ];
  const total = receitas + despesas;
  const hasData = total > 0;

  return (
    <div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[{ name: "Base", value: 1 }]}
              dataKey="value"
              innerRadius={75}
              outerRadius={95}
              fill={COLORS.Base}
              stroke="rgba(148, 163, 184, 0.14)"
              isAnimationActive={false}
            />
            {hasData ? (
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={75}
                outerRadius={95}
                paddingAngle={2}
                stroke="rgba(255,255,255,0.08)"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} />
                ))}
              </Pie>
            ) : null}
            <Tooltip
              formatter={(value: number | string | undefined, name: string | undefined) => [brl(Number(value) || 0), name || ""]}
              contentStyle={tooltipStyle}
              cursor={{ fill: "transparent" }}
            />

            <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="20">
              {brl(total)}
            </text>
            <text
              x="50%"
              y="58%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(226, 232, 240, 0.68)"
              fontSize="12"
            >
              Receitas x Despesas
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[entry.name as keyof typeof COLORS] }} />
              <span className="text-slate-300">{entry.name}</span>
            </div>
            <span className="font-bold text-slate-100">{brl(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
