import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPeso, sumMoney } from "@/lib/money";

export type FundBalanceRow = {
  fund_id: string;
  name: string;
  code: string;
  is_restricted: boolean;
  is_active: boolean;
  opening_balance: string;
  cash_received: string;
  cash_disbursed: string;
  transfers_in: string;
  transfers_out: string;
  available_balance: string;
};

/** Fund balances: cash received and disbursed are kept separate from allocations between funds. */
export function BalancesTable({ rows }: { rows: FundBalanceRow[] }) {
  const total = (key: keyof FundBalanceRow) => sumMoney(rows.map((r) => String(r[key])));
  const money = (v: string) => <span className={v.startsWith("-") ? "text-destructive" : ""}>{formatPeso(v)}</span>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fund</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Opening</TableHead>
          <TableHead className="text-right">Cash received</TableHead>
          <TableHead className="text-right">Cash disbursed</TableHead>
          <TableHead className="hidden text-right md:table-cell">Allocations in</TableHead>
          <TableHead className="hidden text-right md:table-cell">Allocations out</TableHead>
          <TableHead className="text-right">Available balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.fund_id} className={r.is_active ? "" : "text-muted-foreground"}>
            <TableCell>
              <span className="font-medium">{r.name}</span>
              <span className="block text-xs text-muted-foreground">
                {r.code}
                {r.is_restricted ? " · designated" : ""}
                {!r.is_active ? " · inactive" : ""}
              </span>
            </TableCell>
            <TableCell className="hidden text-right tabular-nums lg:table-cell">{money(r.opening_balance)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(r.cash_received)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(r.cash_disbursed)}</TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{money(r.transfers_in)}</TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{money(r.transfers_out)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{money(r.available_balance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold">All funds</TableCell>
          <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatPeso(total("opening_balance"))}</TableCell>
          <TableCell className="text-right tabular-nums">{formatPeso(total("cash_received"))}</TableCell>
          <TableCell className="text-right tabular-nums">{formatPeso(total("cash_disbursed"))}</TableCell>
          <TableCell className="hidden text-right tabular-nums md:table-cell">{formatPeso(total("transfers_in"))}</TableCell>
          <TableCell className="hidden text-right tabular-nums md:table-cell">{formatPeso(total("transfers_out"))}</TableCell>
          <TableCell className="text-right font-semibold tabular-nums">{formatPeso(total("available_balance"))}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
