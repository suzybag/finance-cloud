import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = supabaseUrl && serviceRole ? createClient(supabaseUrl, serviceRole) : null;

const parseWhatsappText = (text: string) => {
  const lower = text.toLowerCase();
  if (lower.startsWith("transferir")) {
    return { intent: "transfer", raw: text };
  }
  if (lower.includes("receita") || lower.includes("salario")) {
    return { intent: "income", raw: text };
  }
  return { intent: "expense", raw: text };
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ message: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const entries = body.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      const messages = value?.messages || [];
      for (const message of messages) {
        const text = message.text?.body || "";
        const parsed = parseWhatsappText(text);

        if (supabaseAdmin) {
          await supabaseAdmin.from("whatsapp_messages").insert({
            message_id: message.id,
            from_number: message.from,
            body: text,
            parsed,
            status: "pending",
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
