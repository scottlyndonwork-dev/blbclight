"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPeso } from "@/lib/money";

/*
 * Chart colors come from --chart-1 / --chart-2, validated for colorblind
 * separation in light and dark mode. Series identity is never color-alone:
 * multi-series charts always show a legend and a tooltip.
 */

const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fill: "var(--muted-foreground)", fontSize: 13 },
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({
  active,
  label,
  payload,
  formatter,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }>;
  formatter: (value: number | string, name: string, row?: Record<string, unknown>) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block size-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-medium tabular-nums text-popover-foreground">
            {formatter(p.value ?? 0, p.name ?? "", p.payload)}
          </span>
        </p>
      ))}
    </div>
  );
}

export type AttendancePoint = { label: string; attended: number; sessions: number };

/** Single series: total attendance per period. No legend; the card title names it. */
export function AttendanceBarChart({ data, height = 220 }: { data: AttendancePoint[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Attendance per period">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltip
                formatter={(v, _n, row) => `${Number(v).toLocaleString()} (${String(row?.sessions ?? 0)} sessions)`}
              />
            }
          />
          <Bar dataKey="attended" name="Attendance" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type FinancePoint = { label: string; income: number; expense: number; incomeText: string; expenseText: string };

/** Income vs expenses per month. Values are chart-only numbers; tooltips show the exact text amounts. */
export function IncomeExpenseChart({ data, height = 240 }: { data: FinancePoint[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Income and expenses per month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis
            {...axisProps}
            width={64}
            tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `₱${Math.round(v / 1000).toLocaleString()}k` : `₱${v}`)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltip
                formatter={(_v, name, row) =>
                  formatPeso(String(name === "Income" ? (row?.incomeText ?? "0") : (row?.expenseText ?? "0")))
                }
              />
            }
          />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 14, color: "var(--muted-foreground)" }} />
          <Bar dataKey="income" name="Income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expense" name="Expenses" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
