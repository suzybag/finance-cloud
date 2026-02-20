import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isCronAuthorized, logSecurityEvent } from "@/lib/apiAuth";

const DAYS_SECURITY_EVENTS = Number(process.env.TRIM_SECURITY_EVENTS_DAYS || "14");
const DAYS_OTP = Number(process.env.TRIM_OTP_DAYS || "2");
const DAYS_LOGIN_ATTEMPTS = Number(process.env.TRIM_LOGIN_ATTEMPTS_DAYS || "30");
const DAYS_INSIGHTS = Number(process.env.TRIM_INSIGHTS_DAYS || "120");
const DAYS_WHATSAPP = Number(process.env.TRIM_WHATSAPP_DAYS || "60");
const DAYS_BACKUPS = Number(process.env.BACKUP_RETENTION_DAYS || "30");

const toCutoffIso = (days: number) =>
  new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();

const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const runTrim = async (req: NextRequest) => {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }

  const securityCutoff = toCutoffIso(DAYS_SECURITY_EVENTS);
  const otpCutoff = toCutoffIso(DAYS_OTP);
  const loginAttemptCutoff = toCutoffIso(DAYS_LOGIN_ATTEMPTS);
  const insightsCutoff = toCutoffIso(DAYS_INSIGHTS);
  const whatsappCutoff = toCutoffIso(DAYS_WHATSAPP);
  const backupCutoff = toCutoffIso(DAYS_BACKUPS);

  await Promise.allSettled([
    admin.from("security_events").delete().lt("created_at", securityCutoff),
    admin.from("auth_otp_challenges").delete().lt("created_at", otpCutoff),
    admin.from("auth_login_attempts").delete().lt("last_attempt_at", loginAttemptCutoff),
    admin.from("insights").delete().lt("created_at", insightsCutoff),
    admin.from("whatsapp_messages").delete().lt("created_at", whatsappCutoff),
  ]);

  const staleRunsRes = await admin
    .from("backup_runs")
    .select("id, storage_path")
    .lt("completed_at", backupCutoff)
    .limit(1000);

  const staleRuns = (staleRunsRes.data || []) as Array<{ id: string; storage_path: string | null }>;
  const stalePaths = staleRuns
    .map((row) => row.storage_path)
    .filter((path): path is string => !!path);

  if (stalePaths.length) {
    const batches = chunk(stalePaths, 100);
    for (const batch of batches) {
      await admin.storage.from("backups").remove(batch);
    }
  }

  if (staleRuns.length) {
    const ids = staleRuns.map((row) => row.id);
    const idBatches = chunk(ids, 200);
    for (const idBatch of idBatches) {
      await admin.from("backup_runs").delete().in("id", idBatch);
    }
  }

  await logSecurityEvent({
    req,
    eventType: "supabase_limit_trim_executed",
    severity: "info",
    message: "Rotina de limpeza para controle de limite do Supabase executada.",
    metadata: {
      security_cutoff: securityCutoff,
      otp_cutoff: otpCutoff,
      login_attempt_cutoff: loginAttemptCutoff,
      insights_cutoff: insightsCutoff,
      whatsapp_cutoff: whatsappCutoff,
      backup_cutoff: backupCutoff,
      stale_backup_runs: staleRuns.length,
    },
  });

  return NextResponse.json({
    ok: true,
    stale_backup_runs_removed: staleRuns.length,
    stale_backup_files_removed: stalePaths.length,
  });
};

export const GET = runTrim;
export const POST = runTrim;
