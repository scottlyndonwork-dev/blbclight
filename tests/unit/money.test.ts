import { describe, expect, it } from "vitest";
import {
  compareMoney,
  formatPeso,
  normalizeMoney,
  parseMoney,
  subtractMoney,
  sumMoney,
  toDecimalString,
  validateAmount,
} from "@/lib/money";

describe("money", () => {
  it("parses user input into exact centavos", () => {
    expect(parseMoney("1,234.5")).toBe(123450n);
    expect(parseMoney("₱ 1,234.50")).toBe(123450n);
    expect(parseMoney("0.01")).toBe(1n);
    expect(parseMoney("-20")).toBe(-2000n);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });

  it("sums without floating point error", () => {
    // 0.1 + 0.2 !== 0.3 in floating point
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumMoney(Array.from({ length: 1000 }, () => "0.01"))).toBe("10.00");
    expect(sumMoney(["99999999999.99", "0.01"])).toBe("100000000000.00");
  });

  it("subtracts and compares", () => {
    expect(subtractMoney("1000.30", "250.15")).toBe("750.15");
    expect(subtractMoney("10", "20.50")).toBe("-10.50");
    expect(compareMoney("10.00", "9.99")).toBe(1);
    expect(compareMoney("10", "10.00")).toBe(0);
  });

  it("normalizes and formats pesos", () => {
    expect(normalizeMoney("12.5")).toBe("12.50");
    expect(toDecimalString(-5n)).toBe("-0.05");
    expect(formatPeso("1234567.8")).toBe("₱1,234,567.80");
    expect(formatPeso("-250.15")).toBe("-₱250.15");
    expect(formatPeso("5", { sign: true })).toBe("+₱5.00");
    expect(formatPeso(null)).toBe("₱0.00");
  });

  it("validates form amounts", () => {
    expect(validateAmount("1500")).toBeNull();
    expect(validateAmount("0")).toMatch(/greater than zero/);
    expect(validateAmount("1.234")).toMatch(/valid amount/);
    expect(validateAmount("1000000000000.00")).toMatch(/too large/);
  });
});
