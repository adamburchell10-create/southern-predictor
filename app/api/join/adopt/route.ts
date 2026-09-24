import { NextRequest, NextResponse } from "next/server";
import { adoptToken } from "@/lib/player";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const player = await adoptToken(token);
  if (!player) {
    return NextResponse.json({ error: "That link isn't valid." }, { status: 404 });
  }

  return NextResponse.json({ player: { id: player.id, name: player.name, token: player.token } });
}
