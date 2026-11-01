import { z } from "zod";
import { todayManila } from "@/lib/dates";

/*
 * Form schemas shared by the client (instant validation) and the server
 * actions (authoritative validation). Inputs are strings; empty strings are
 * converted to null before they reach the database.
 */

const today = todayManila;

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

const dateString = /^\d{4}-\d{2}-\d{2}$/;

const optionalDate = (label: string, { allowFuture = false } = {}) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || dateString.test(v), `${label} is not a valid date.`)
    .refine((v) => allowFuture || v === "" || v <= today(), `${label} cannot be in the future.`);

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;

export const CIVIL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "widowed", label: "Widowed" },
  { value: "separated", label: "Separated" },
  { value: "annulled", label: "Annulled" },
] as const;

export const HOUSEHOLD_RELATIONSHIPS = [
  { value: "head", label: "Head of family" },
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "relative", label: "Relative" },
  { value: "other", label: "Other" },
] as const;

const memberFields = {
  first_name: z.string().trim().min(1, "First name is required.").max(100),
  middle_name: optionalText(100, "Middle name"),
  last_name: z.string().trim().min(1, "Last name is required.").max(100),
  suffix: optionalText(20, "Suffix"),
  gender: z.enum(["", "male", "female"]),
  civil_status: z.enum(["", "single", "married", "widowed", "separated", "annulled"]),
  birthdate: optionalDate("Birthdate").refine((v) => v === "" || v >= "1900-01-01", "Birthdate is not valid."),
  contact_number: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+()\- ]{7,20}$/.test(v), "Enter a valid contact number, for example 0917 123 4567."),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address."),
  address_line: optionalText(200, "Street address"),
  barangay: optionalText(100, "Barangay"),
  city: optionalText(100, "City / municipality"),
  province: optionalText(100, "Province"),
  postal_code: z.string().trim().refine((v) => v === "" || /^\d{4}$/.test(v), "Postal code must be 4 digits."),
  date_registered: z
    .string()
    .trim()
    .regex(dateString, "Date registered is required.")
    .refine((v) => v <= today(), "Date registered cannot be in the future."),
  membership_date: optionalDate("Membership date"),
  category_id: z.string().trim(),
  previous_church: optionalText(200, "Previous church"),
  notes: optionalText(4000, "Notes"),
};

export const memberUpdateSchema = z
  .object(memberFields)
  .refine((v) => !v.membership_date || !v.birthdate || v.membership_date >= v.birthdate, {
    message: "Membership date cannot be before the birthdate.",
    path: ["membership_date"],
  });

export const baptismSchema = z.object({
  baptism_date: optionalDate("Baptism date"),
  location: optionalText(200, "Location"),
  officiant: optionalText(200, "Officiant"),
  church_name: optionalText(200, "Church"),
  notes: optionalText(2000, "Notes"),
});

export const memberCreateSchema = z
  .object({
    ...memberFields,
    status_id: z.uuid("Select a membership status."),
    is_baptized: z.boolean(),
    baptism: baptismSchema,
  })
  .refine((v) => !v.membership_date || !v.birthdate || v.membership_date >= v.birthdate, {
    message: "Membership date cannot be before the birthdate.",
    path: ["membership_date"],
  });

export type MemberCreateInput = z.input<typeof memberCreateSchema>;
export type MemberUpdateInput = z.input<typeof memberUpdateSchema>;
export type BaptismInput = z.input<typeof baptismSchema>;

export const statusChangeSchema = z.object({
  member_id: z.uuid(),
  status_id: z.uuid("Select the new status."),
  effective_date: z
    .string()
    .regex(dateString, "Select the effective date.")
    .refine((v) => v <= today(), "The effective date cannot be in the future."),
  reason: z.string().trim().min(3, "Please give a reason (at least 3 characters).").max(1000),
});

export type StatusChangeInput = z.input<typeof statusChangeSchema>;

/** Converts empty strings to null for database writes. */
export function emptyToNull<T extends Record<string, unknown>>(values: T): { [K in keyof T]: T[K] | null } {
  const out = {} as { [K in keyof T]: T[K] | null };
  for (const key of Object.keys(values) as Array<keyof T>) {
    const v = values[key];
    out[key] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out;
}

export function emptyMemberForm(defaultStatusId: string, todayDate: string): MemberCreateInput {
  return {
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    gender: "",
    civil_status: "",
    birthdate: "",
    contact_number: "",
    email: "",
    address_line: "",
    barangay: "",
    city: "",
    province: "",
    postal_code: "",
    date_registered: todayDate,
    membership_date: "",
    category_id: "",
    previous_church: "",
    notes: "",
    status_id: defaultStatusId,
    is_baptized: false,
    baptism: { baptism_date: "", location: "", officiant: "", church_name: "", notes: "" },
  };
}
