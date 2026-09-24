import { NextRequest, NextResponse } from "next/server";
import { createPlayer, getCurrentPlayer } from "@/lib/player";

export const dynamic = "force-dynamic";

export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ player: null });
  }
  return NextResponse.json({ player: { id: player.id, name: player.name, token: player.token } });
}

export async function POST(req: NextRequest) {
  const existing = await getCurrentPlayer();
  if (existing) {
    return NextResponse.json({ player: { id: existing.id, name: existing.name, token: existing.token } });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length < 2 || name.length > 40) {
    return NextResponse.json(
      { error: "Enter a name between 2 and 40 characters." },
      { status: 400 }
    );
  }

  const player = await createPlayer(name);
  if (!player) {
    return NextResponse.json(
      { error: "That name is already taken. Ask your friend for their private link, or pick another name." },
      { status: 409 }
    );
  }

  return NextResponse.json({ player: { id: player.id, name: player.name, token: player.token } });
}
