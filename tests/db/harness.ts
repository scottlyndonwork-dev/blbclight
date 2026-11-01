import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = import.meta.dirname;
const root = path.resolve(here, "../..");
const migrationsDir = path.join(root, "supabase", "migrations");

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Creates an in-memory Postgres with the Supabase shim and all migrations applied. */
export async function createTestDb() {
  const db = await PGlite.create({ extensions: { citext, pg_trgm, pgcrypto } });
  await db.exec(readFileSync(path.join(here, "supabase-shim.sql"), "utf8"));

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  /** Creates an auth user (and, via trigger, a profile) with the given roles. */
  async function createUser(email: string, roleKeys: string[] = []): Promise<string> {
    await asSuperuser();
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, { full_name: email.split("@")[0] }],
    );
    const id = rows[0].id;
    for (const key of roleKeys) {
      await db.query(
        "insert into public.user_roles (user_id, role_id) select $1, id from public.roles where key = $2",
        [id, key],
      );
    }
    return id;
  }

  /** Runs subsequent statements as an authenticated API user. */
  async function asUser(userId: string) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await db.exec("set role authenticated");
  }

  async function asAnon() {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec("set role anon");
  }

  async function asSuperuser() {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }

  return { db, createUser, asUser, asAnon, asSuperuser };
}
