import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Supabase client bound to the signed-in user's session cookies. Every query
 * made with it runs under the user's identity, so Row Level Security applies.
 */
export async function createClient() {
  const env = publicEnv();
  // Defer to request time: auth-js reads Date.now() to check session expiry,
  // which Cache Components rejects after only cookies() has been awaited.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session cookie on the next request.
        }
      },
    },
  });
}
