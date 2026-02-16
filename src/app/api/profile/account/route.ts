import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getUserFromRequest } from "@/lib/apiAuth";

export async function DELETE(req: NextRequest) {
  const { user, error } = await getUserFromRequest(req);
  if (!user || error) {
    return NextResponse.json({ ok: false, message: error }, { status: 401 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { ok: false, message: "Exclusao de conta indisponivel: service role nao configurada." },
      { status: 503 },
    );
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ ok: false, message: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
