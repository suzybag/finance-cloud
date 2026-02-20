import { gzipSync } from "zlib";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isCronAuthorized, logSecurityEvent } from "@/lib/apiAuth";
import { encryptJson, hasEncryptionKey } from "@/lib/security/encryption";

const BASE_TABLES_TO_BACKUP = [
  "profiles",
  "accounts",
  "cards",
  "transactions",
  "investments",
  "alerts",
  "automations",
  "banking_relationship_scores",
] as const;

const LOW_USAGE_MODE = (process.env.SUPABASE_LOW_USAGE_MODE || "true").trim().toLowerCase() !== "false";
const TABLES_TO_BACKUP = LOW_USAGE_MODE
  ? (["profiles", "accounts", "cards", "investments"] as const)
  : BASE_TABLES_TO_BACKUP;
const MAX_ROWS_PER_TABLE = Number(process.env.BACKUP_MAX_ROWS_PER_TABLE || (LOW_USAGE_MODE ? "2000" : "20000"));
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || "30");

type BackupTableSnapshot = {
  table: string;
  rows: unknown[];
  row_count: number;
  truncated: boolean;
};

const runBackup = async (req: NextRequest) => {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service role nao configurada." }, { status: 503 });
  }
  if (!hasEncryptionKey()) {
    return NextResponse.json({ ok: false, message: "APP_ENCRYPTION_KEY nao configurada." }, { status: 503 });
  }

  const startedAt = new Date();
  const snapshots: BackupTableSnapshot[] = [];

  for (const table of TABLES_TO_BACKUP) {
    const { data, error } = await admin.from(table).select("*").limit(MAX_ROWS_PER_TABLE);
    if (error) {
      const runId = crypto.randomUUID();
      await admin.from("backup_runs").insert({
        id: runId,
        status: "failed",
        storage_path: null,
        error_message: `[${table}] ${error.message}`.slice(0, 1000),
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
      });

      await logSecurityEvent({
        req,
        eventType: "backup_daily_failed",
        severity: "critical",
        message: `Falha no backup ao ler tabela ${table}: ${error.message}`,
        metadata: { table },
      });

      return NextResponse.json(
        { ok: false, message: `Falha ao ler tabela ${table} para backup.` },
        { status: 500 },
      );
    }

    const rows = data || [];
    snapshots.push({
      table,
      rows,
      row_count: rows.length,
      truncated: rows.length >= MAX_ROWS_PER_TABLE,
    });
  }

  const now = new Date();
  const storagePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    `backup-${now.toISOString().replace(/[:.]/g, "-")}.json.gz.enc`,
  ].join("/");

  const plainPayload = {
    generated_at: now.toISOString(),
    generated_by: "vercel-cron",
    project: "finance-cloud",
    tables: snapshots.map((entry) => ({
      table: entry.table,
      row_count: entry.row_count,
      truncated: entry.truncated,
    })),
    data: snapshots,
  };

  const encrypted = encryptJson(plainPayload);
  const compressed = gzipSync(Buffer.from(encrypted, "utf8"));

  const { error: uploadError } = await admin.storage
    .from("backups")
    .upload(storagePath, compressed, {
      upsert: false,
      contentType: "application/octet-stream",
    });

  if (uploadError) {
    const runId = crypto.randomUUID();
    await admin.from("backup_runs").insert({
      id: runId,
      status: "failed",
      storage_path: storagePath,
      error_message: uploadError.message.slice(0, 1000),
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    });

    await logSecurityEvent({
      req,
      eventType: "backup_daily_failed",
      severity: "critical",
      message: `Falha ao enviar backup para storage: ${uploadError.message}`,
      metadata: { storage_path: storagePath },
    });

    return NextResponse.json(
      { ok: false, message: "Falha ao salvar backup no storage." },
      { status: 500 },
    );
  }

  const runId = crypto.randomUUID();
  await admin.from("backup_runs").insert({
    id: runId,
    status: "success",
    storage_path: storagePath,
    error_message: null,
    started_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
  });

  if (Number.isFinite(RETENTION_DAYS) && RETENTION_DAYS > 0) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await admin
      .from("backup_runs")
      .delete()
      .lt("completed_at", cutoff);
  }

  await logSecurityEvent({
    req,
    eventType: "backup_daily_success",
    severity: "info",
    message: "Backup diario criptografado concluido com sucesso.",
    metadata: {
      storage_path: storagePath,
      tables: snapshots.map((entry) => ({
        table: entry.table,
        row_count: entry.row_count,
        truncated: entry.truncated,
      })),
    },
  });

  return NextResponse.json({
    ok: true,
    storage_path: storagePath,
    generated_at: now.toISOString(),
    table_count: snapshots.length,
  });
};

export const GET = runBackup;
export const POST = runBackup;
