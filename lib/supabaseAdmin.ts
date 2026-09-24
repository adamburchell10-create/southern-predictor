import { createClient } from "@supabase/supabase-js";

// This client uses the SERVICE ROLE key and must only ever be imported from
// server-side code (API routes / server components) - never from anything
// that ships to the browser. That's what lets us keep every friend's
// predictions hidden from each other until kickoff: the browser never talks
// to Supabase directly, it only talks to our own API routes, which decide
// what's safe to reveal.
// No generated Database type is used here (this is a small hand-rolled
// schema, see supabase/schema.sql) - typing the client as `any` keeps every
// .from(table).insert/upsert/select call flexible instead of TypeScript
// inferring `never` for row shapes it has no schema knowledge of.
let cached: ReturnType<typeof createClient<any>> | null = null;

export function supabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  cached = createClient<any>(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}
