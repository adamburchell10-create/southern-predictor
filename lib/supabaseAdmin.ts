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
    // supabase-js makes its requests with fetch() under the hood, and
    // Next.js patches the global fetch to cache GET requests by default -
    // even inside a route handler marked `force-dynamic`. Without this, the
    // leaderboard/fixtures/predictions endpoints can keep serving a stale
    // snapshot from the moment the serverless function first warmed up.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  return cached;
}
