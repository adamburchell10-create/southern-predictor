import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";
import type { PlayerRow } from "./types";

export const PLAYER_COOKIE = "player_token";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Looks up the player tied to this browser's cookie, if any. */
export async function getCurrentPlayer(): Promise<PlayerRow | null> {
  const token = cookies().get(PLAYER_COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as PlayerRow;
}

/** Adopts an existing token (from a recovery link) as this browser's identity. */
export async function adoptToken(token: string): Promise<PlayerRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("players")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;
  setPlayerCookie(token);
  return data as PlayerRow;
}

export function setPlayerCookie(token: string) {
  cookies().set(PLAYER_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
}

/** Creates a new player with a given display name. Returns null if the name is taken. */
export async function createPlayer(name: string): Promise<PlayerRow | null> {
  const token = randomUUID();
  const { data, error } = await supabaseAdmin()
    .from("players")
    .insert({ name: name.trim(), token })
    .select("*")
    .single();

  if (error) {
    // unique_violation on the case-insensitive name index
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }

  setPlayerCookie(token);
  return data as PlayerRow;
}
