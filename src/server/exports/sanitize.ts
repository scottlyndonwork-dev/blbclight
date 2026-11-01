/**
 * Prevents spreadsheet formula injection: values starting with = + - @ (or
 * tab/CR) are prefixed with an apostrophe so spreadsheet apps treat them as text.
 */
export function sanitizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
