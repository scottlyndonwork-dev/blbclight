"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { todayManila } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import type { Json } from "@/types/database";
import { authorizeAction } from "@/server/auth/session";
import { createClient } from "@/server/supabase/server";
import {
  fundSchema,
  transactionSchema,
  transferSchema,
  type FundInput,
  type TransactionInput,
  type TransferInput,
} from "./schemas";

const idSchema = z.uuid();

function revalidateFinance(transactionId?: string) {
  revalidatePath("/finance");
  revalidatePath("/finance/transactions");
  revalidatePath("/finance/funds");
  revalidatePath("/dashboard");
  if (transactionId) revalidatePath(`/finance/transactions/${transactionId}`);
}

function payload(v: z.output<typeof transactionSchema>): Json {
  return {
    ...v,
    reference_no: v.reference_no || null,
    payer_payee: v.payer_payee || null,
    member_id: v.member_id || null,
  };
}

export async function createTransactionAction(input: TransactionInput, post: boolean): Promise<ActionResult<{ id: string; txnNo: string | null }>> {
  const { user, denied } = await authorizeAction(["finance.write"]);
  if (denied) return denied;
  if (post && !user.permissions.has("finance.post")) return fail("You can save drafts, but posting requires the post permission.");
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_transaction", { p_data: payload(parsed.data), p_post: post });
  const row = data?.[0];
  if (error || !row) return fail(friendlyDbError(error, "The transaction could not be saved."));
  revalidateFinance(row.id);
  return ok({ id: row.id, txnNo: row.txn_no }, post ? `Posted as ${row.txn_no}.` : "Saved as draft. It will not affect balances until posted.");
}

export async function updateDraftAction(id: string, input: TransactionInput): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["finance.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return fail("Invalid transaction.");
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_draft_transaction", { p_id: id, p_data: payload(parsed.data) });
  if (error) return fail(friendlyDbError(error, "The draft could not be updated."));
  revalidateFinance(id);
  return ok(null, "Draft updated.");
}

export async function postTransactionAction(id: string): Promise<ActionResult<{ txnNo: string }>> {
  const { denied } = await authorizeAction(["finance.post"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return fail("Invalid transaction.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_transaction", { p_id: id });
  if (error || !data) return fail(friendlyDbError(error, "The transaction could not be posted."));
  revalidateFinance(id);
  return ok({ txnNo: data }, `Posted as ${data}.`);
}

export async function deleteDraftAction(id: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["finance.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return fail("Invalid transaction.");
  const supabase = await createClient();
  const { data: files } = await supabase.from("financial_attachments").select("storage_path").eq("transaction_id", id);
  const { error } = await supabase.rpc("delete_draft_transaction", { p_id: id });
  if (error) return fail(friendlyDbError(error, "The draft could not be deleted."));
  if (files?.length) await supabase.storage.from("finance-attachments").remove(files.map((f) => f.storage_path));
  revalidateFinance();
  return ok(null, "Draft deleted.");
}

export async function reverseTransactionAction(id: string, reason: string, reversalDate: string): Promise<ActionResult<{ id: string; txnNo: string }>> {
  const { denied } = await authorizeAction(["finance.reverse"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return fail("Invalid transaction.");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(reversalDate) ? reversalDate : todayManila();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_transaction", { p_id: id, p_reason: reason.slice(0, 500), p_reversal_date: date });
  const row = data?.[0];
  if (error || !row) return fail(friendlyDbError(error, "The transaction could not be reversed."));
  revalidateFinance(id);
  return ok({ id: row.id, txnNo: row.txn_no }, `Reversed. Offsetting entry ${row.txn_no} recorded.`);
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

const ATTACHMENT_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "application/pdf": { ext: "pdf", magic: (b) => String.fromCharCode(...b.slice(0, 5)) === "%PDF-" },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/webp": {
    ext: "webp",
    magic: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
};

export async function uploadAttachmentAction(transactionId: string, formData: FormData): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["finance.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(transactionId).success) return fail("Invalid transaction.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to attach.");
  const type = ATTACHMENT_TYPES[file.type];
  if (!type) return fail("Attach a PDF, JPG, PNG or WebP file.");
  if (file.size > 10 * 1024 * 1024) return fail("Attachments must be 10 MB or smaller.");
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!type.magic(head)) return fail("The file content does not match its type.");

  const supabase = await createClient();
  const path = `${transactionId}/${crypto.randomUUID()}.${type.ext}`;
  const { error: uploadError } = await supabase.storage.from("finance-attachments").upload(path, file, { contentType: file.type });
  if (uploadError) return fail("The file could not be uploaded.");
  const { error } = await supabase.from("financial_attachments").insert({
    transaction_id: transactionId,
    storage_path: path,
    file_name: file.name.slice(0, 200) || `attachment.${type.ext}`,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("finance-attachments").remove([path]);
    return fail(friendlyDbError(error, "The attachment could not be saved."));
  }
  revalidateFinance(transactionId);
  return ok(null, "Supporting document attached.");
}

export async function deleteAttachmentAction(transactionId: string, attachmentId: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["finance.write"]);
  if (denied) return denied;
  if (!idSchema.safeParse(attachmentId).success) return fail("Invalid attachment.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("transaction_id", transactionId)
    .select("storage_path");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("Attachments can only be removed from draft transactions.");
  await supabase.storage.from("finance-attachments").remove(data.map((d) => d.storage_path));
  revalidateFinance(transactionId);
  return ok(null, "Attachment removed.");
}

export async function getAttachmentUrlAction(path: string): Promise<ActionResult<string>> {
  const { denied } = await authorizeAction(["finance.read"]);
  if (denied) return denied;
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(path)) return fail("Invalid attachment.");
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("finance-attachments").createSignedUrl(path, 120);
  if (error || !data) return fail("The file could not be opened.");
  return ok(data.signedUrl);
}

// ---------------------------------------------------------------------------
// Funds, transfers and categories
// ---------------------------------------------------------------------------

export async function createTransferAction(input: TransferInput): Promise<ActionResult<{ transferNo: string }>> {
  const { denied } = await authorizeAction(["finance.manage_funds"]);
  if (denied) return denied;
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_fund_transfer", {
    p_from_fund_id: parsed.data.from_fund_id,
    p_to_fund_id: parsed.data.to_fund_id,
    // numeric argument: sent as an exact decimal string, never a float
    p_amount: parsed.data.amount as unknown as number,
    p_transfer_date: parsed.data.transfer_date,
    p_reason: parsed.data.reason,
  });
  const row = data?.[0];
  if (error || !row) return fail(friendlyDbError(error, "The transfer could not be recorded."));
  revalidateFinance();
  return ok({ transferNo: row.transfer_no }, `Allocation ${row.transfer_no} recorded.`);
}

export async function reverseTransferAction(id: string, reason: string): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["finance.manage_funds"]);
  if (denied) return denied;
  if (!idSchema.safeParse(id).success) return fail("Invalid transfer.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_fund_transfer", { p_id: id, p_reason: reason.slice(0, 500) });
  if (error) return fail(friendlyDbError(error, "The transfer could not be reversed."));
  revalidateFinance();
  return ok(null, "Transfer reversed.");
}

export async function saveFundAction(id: string | null, input: FundInput): Promise<ActionResult<null>> {
  const { denied } = await authorizeAction(["finance.manage_funds"]);
  if (denied) return denied;
  const parsed = fundSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  const row = {
    ...parsed.data,
    // numeric column: exact decimal string
    opening_balance: parsed.data.opening_balance as unknown as number,
    opening_balance_date: parsed.data.opening_balance_date || null,
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("funds").update(row).eq("id", id) : await supabase.from("funds").insert(row);
  if (error) return fail(friendlyDbError(error, "The fund could not be saved."));
  revalidateFinance();
  return ok(null, "Fund saved.");
}
