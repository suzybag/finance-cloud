import { NextResponse } from "next/server";
import { getVapidPublicKey, hasPushConfig } from "@/lib/pushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const configured = hasPushConfig();
  return NextResponse.json({
    ok: true,
    configured,
    publicKey: configured ? getVapidPublicKey() : null,
  });
}
