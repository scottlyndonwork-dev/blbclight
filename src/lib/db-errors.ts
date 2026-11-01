type PostgrestLikeError = { code?: string; message?: string; details?: string | null; hint?: string | null };

const CONSTRAINT_MESSAGES: Record<string, string> = {
  attendance_records_unique_member: "This member is already recorded for this session.",
  attendance_sessions_service_type_id_session_date_start_time_key:
    "A session for this service, date and time already exists.",
  member_ministries_member_id_ministry_id_key: "This member is already in that ministry.",
  household_members_member_id_key: "This member already belongs to a household.",
  household_members_one_head: "This household already has a head of family.",
  funds_code_key: "A fund with this code already exists.",
  funds_name_key: "A fund with this name already exists.",
  financial_categories_kind_name_key: "A category with this name already exists.",
  ministries_name_key: "A ministry with this name already exists.",
  service_types_name_key: "A service type with this name already exists.",
  service_types_code_key: "A service type with this code already exists.",
  membership_categories_name_key: "A category with this name already exists.",
  certificate_templates_type_id_name_key: "A template with this name already exists for this certificate type.",
  certificate_templates_one_default: "Another template is already the default for this certificate type.",
  profiles_email_key: "A user with this email already exists.",
};

/**
 * Converts a database error into a message suitable for church staff.
 * Business-rule messages raised by our SQL functions are passed through;
 * low-level errors are replaced with plain language.
 */
export function friendlyDbError(
  error: PostgrestLikeError | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!error) return fallback;
  const message = error.message ?? "";
  switch (error.code) {
    case "42501":
      return message.startsWith("You do not have permission") || / cannot /.test(message)
        ? stripPermissionKey(message)
        : "You do not have permission to perform this action.";
    case "28000":
      return "Your session has expired. Please sign in again.";
    case "23505": {
      const constraint = Object.keys(CONSTRAINT_MESSAGES).find(
        (c) => message.includes(c) || error.details?.includes(c),
      );
      return constraint ? CONSTRAINT_MESSAGES[constraint] : "This record already exists.";
    }
    case "23503":
      return "This record is linked to other records and cannot be changed this way.";
    case "23514":
      return message.includes("violates check constraint") ? "Some of the values entered are not valid." : message;
    case "22P02":
    case "22007":
    case "22008":
      return "Some of the values entered are not in the correct format.";
    case "22023":
    case "P0001":
    case "P0002":
      return message;
    case "PGRST116":
      return "The record was not found.";
    default: {
      const lower = message.toLowerCase();
      if (lower.includes("fetch failed") || lower.includes("network")) {
        return "Could not reach the server. Check your internet connection and try again.";
      }
      return fallback;
    }
  }
}

function stripPermissionKey(message: string): string {
  return message.replace(/\s*\([a-z_]+\.[a-z_]+\)\.?$/, ".").trim();
}
