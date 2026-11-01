import { z } from "zod";
import { todayManila } from "@/lib/dates";
import { normalizeMoney, validateAmount } from "@/lib/money";

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "e_wallet", label: "E-wallet (GCash, Maya)" },
  { value: "other", label: "Other" },
] as const;

/** Amount entered as text; validated and normalized to an exact decimal string. */
export const amountSchema = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    const problem = validateAmount(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((v) => normalizeMoney(v.replace(/[₱,\s]/g, "")));

const dateSchema = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Select the ${label}.`)
    .refine((v) => v <= todayManila(), `The ${label} cannot be in the future.`);

export const transactionSchema = z.object({
  kind: z.enum(["income", "expense"]),
  fund_id: z.uuid("Select a fund."),
  category_id: z.uuid("Select a category."),
  amount: amountSchema,
  txn_date: dateSchema("transaction date"),
  description: z.string().trim().min(1, "Enter a description.").max(500),
  reference_no: z.string().trim().max(80),
  payer_payee: z.string().trim().max(200),
  member_id: z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Invalid member."),
  payment_method: z.enum(["cash", "check", "bank_transfer", "e_wallet", "other"]),
});

export type TransactionInput = z.input<typeof transactionSchema>;

export const transferSchema = z
  .object({
    from_fund_id: z.uuid("Select the source fund."),
    to_fund_id: z.uuid("Select the destination fund."),
    amount: amountSchema,
    transfer_date: dateSchema("transfer date"),
    reason: z.string().trim().min(3, "Give the reason for the allocation.").max(500),
  })
  .refine((v) => v.from_fund_id !== v.to_fund_id, { message: "Choose two different funds.", path: ["to_fund_id"] });

export type TransferInput = z.input<typeof transferSchema>;

export const fundSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,15}$/, "Use 2–16 capital letters, numbers or underscores."),
  name: z.string().trim().min(1, "Enter the fund name.").max(120),
  description: z.string().trim().max(500),
  is_restricted: z.boolean(),
  opening_balance: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (v === "" || v === "0" || v === "0.00") return;
      const problem = validateAmount(v);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    })
    .transform((v) => (v === "" ? "0.00" : normalizeMoney(v.replace(/[₱,\s]/g, "")))),
  opening_balance_date: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date."),
  is_active: z.boolean(),
});

export type FundInput = z.input<typeof fundSchema>;
