import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, message: "Stub de envio. Configure WhatsApp Cloud API." });
}
