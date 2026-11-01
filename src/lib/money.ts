/**
 * Exact money handling for Philippine Peso amounts.
 *
 * Amounts are represented as decimal strings ("1234.50") at the boundaries
 * and as bigint centavos for arithmetic. JavaScript floating point numbers
 * are never used for money.
 */

const MONEY_PATTERN = /^-?\d+(\.\d{1,2})?$/;
export const MAX_AMOUNT_CENTAVOS = 99_999_999_999_999n; // numeric(14,2)

/** Parses user input such as "1,234.5" or "₱ 1,234.50" into centavos. */
export function parseMoney(input: string | number | null | undefined): bigint | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).replace(/[₱,\s]/g, "").replace(/^PHP/i, "");
  if (!MONEY_PATTERN.test(raw)) return null;
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace("-", "").split(".");
  const centavos = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -centavos : centavos;
}

/** Converts centavos to the canonical decimal string used by the database. */
export function toDecimalString(centavos: bigint): string {
  const negative = centavos < 0n;
  const abs = negative ? -centavos : centavos;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Normalizes a decimal string from the database (e.g. "12.5" -> "12.50"). */
export function normalizeMoney(value: string | null | undefined): string {
  return toDecimalString(parseMoney(value ?? "0") ?? 0n);
}

export function sumMoney(values: Array<string | null | undefined>): string {
  return toDecimalString(values.reduce<bigint>((acc, v) => acc + (parseMoney(v ?? "0") ?? 0n), 0n));
}

export function subtractMoney(a: string, b: string): string {
  return toDecimalString((parseMoney(a) ?? 0n) - (parseMoney(b) ?? 0n));
}

export function compareMoney(a: string, b: string): number {
  const diff = (parseMoney(a) ?? 0n) - (parseMoney(b) ?? 0n);
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

/** Formats a decimal string as Philippine Peso, e.g. "₱1,234.50". */
export function formatPeso(value: string | null | undefined, options: { sign?: boolean } = {}): string {
  const centavos = parseMoney(value ?? "0") ?? 0n;
  const negative = centavos < 0n;
  const [whole, fraction] = toDecimalString(negative ? -centavos : centavos).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const prefix = negative ? "-" : options.sign && centavos > 0n ? "+" : "";
  return `${prefix}₱${grouped}.${fraction}`;
}

/** Validates a positive amount entered in a form. Returns an error message or null. */
export function validateAmount(input: string): string | null {
  const centavos = parseMoney(input);
  if (centavos === null) return "Enter a valid amount, for example 1500 or 1500.50.";
  if (centavos <= 0n) return "The amount must be greater than zero.";
  if (centavos > MAX_AMOUNT_CENTAVOS) return "The amount is too large.";
  return null;
}

/**
 * Converts a decimal string into a Number for chart rendering only.
 * Never use the result for further money arithmetic.
 */
export function moneyToChartNumber(value: string | null | undefined): number {
  return Number(normalizeMoney(value));
}
