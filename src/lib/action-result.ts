export type FieldErrors = Record<string, string[] | undefined>;

export type ActionFailure = { ok: false; error: string; fieldErrors?: FieldErrors };

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | ActionFailure;

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: FieldErrors): ActionFailure {
  return { ok: false, error, fieldErrors };
}
