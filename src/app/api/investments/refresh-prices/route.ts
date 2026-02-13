import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchCoinGeckoHistory,
  fetchCoinGeckoSimplePrices,
  resolveCoinGeckoId,
} from "@/lib/coinGecko";

type InvestmentRow = {
  id: string;
  type_id: string | null;
  asset_id: string | null;
  investment_type: string | null;
};

type InvestmentTypeRow = {
  id: string;
  name: string;
  category: string;
  symbol: string | null;
};

type AssetRow = {
  id: string;
  name: string;
  category: string | null;
  symbol: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const isAuthorized = (req: NextRequest) => {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return true;

  const authHeader = req.headers.get("authorization") || "";
  return authHeader.trim() === `Bearer ${secret}`;
};

const roundPrice = (value: number) => Math.round(value * 1000000) / 1000000;

const getAdminClient = () => {
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole);
};

const resolveRowCoinId = (
  row: InvestmentRow,
  typesById: Map<string, InvestmentTypeRow>,
  assetsById: Map<string, AssetRow>,
) => {
  const type = row.type_id ? typesById.get(row.type_id) : undefined;
  const asset = row.asset_id ? assetsById.get(row.asset_id) : undefined;
  return resolveCoinGeckoId({
    symbol: asset?.symbol || type?.symbol,
    name: asset?.name || type?.name || row.investment_type,
    category: asset?.category || type?.category,
  });
};

async function runRefresh(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const [investmentsRes, typesRes, assetsRes] = await Promise.all([
    admin
      .from("investments")
      .select("id, type_id, asset_id, investment_type"),
    admin
      .from("investment_types")
      .select("id, name, category, symbol"),
    admin
      .from("assets")
      .select("id, name, category, symbol"),
  ]);

  if (investmentsRes.error || typesRes.error || assetsRes.error) {
    const message = investmentsRes.error?.message || typesRes.error?.message || assetsRes.error?.message || "Falha ao carregar dados.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }

  const investments = (investmentsRes.data || []) as InvestmentRow[];
  const typesById = new Map<string, InvestmentTypeRow>(
    (((typesRes.data || []) as InvestmentTypeRow[]).map((item) => [item.id, item])),
  );
  const assetsById = new Map<string, AssetRow>(
    (((assetsRes.data || []) as AssetRow[]).map((item) => [item.id, item])),
  );

  const rowCoinPairs = investments
    .map((row) => ({
      row,
      coinId: resolveRowCoinId(row, typesById, assetsById),
    }))
    .filter((entry): entry is { row: InvestmentRow; coinId: string } => !!entry.coinId);

  if (!rowCoinPairs.length) {
    return NextResponse.json({
      ok: true,
      updated: 0,
      message: "Nenhum investimento cripto para atualizar.",
    });
  }

  const coinIds = Array.from(new Set(rowCoinPairs.map((entry) => entry.coinId)));

  let simplePrices: Record<string, { brl?: number }> = {};
  try {
    simplePrices = await fetchCoinGeckoSimplePrices(coinIds);
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha na CoinGecko API." },
      { status: 502 },
    );
  }

  const historyEntries = await Promise.all(
    coinIds.map(async (coinId) => {
      try {
        const history = await fetchCoinGeckoHistory(coinId, 7);
        return [coinId, history] as const;
      } catch {
        return [coinId, [] as number[]] as const;
      }
    }),
  );

  const historyByCoin = new Map<string, number[]>(historyEntries);

  let updatedCount = 0;
  const updateJobs = rowCoinPairs.map(async ({ row, coinId }) => {
    const newPrice = Number(simplePrices[coinId]?.brl ?? 0);
    if (!Number.isFinite(newPrice) || newPrice <= 0) return;

    const history = historyByCoin.get(coinId) || [];
    const payload = {
      current_price: roundPrice(newPrice),
      price_history: history.length ? history : [roundPrice(newPrice)],
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin
      .from("investments")
      .update(payload)
      .eq("id", row.id);
    if (!error) updatedCount += 1;
  });

  await Promise.all(updateJobs);

  return NextResponse.json({
    ok: true,
    updated: updatedCount,
    trackedCoins: coinIds,
  });
}

export async function GET(req: NextRequest) {
  return runRefresh(req);
}

export async function POST(req: NextRequest) {
  return runRefresh(req);
}
