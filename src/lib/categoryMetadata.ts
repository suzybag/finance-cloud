import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeCategoryKey,
  resolveCategoryVisual,
} from "@/lib/categoryVisuals";

export type CategoryMetadataRow = {
  user_id: string;
  name: string;
  icon_name: string | null;
  icon_color: string | null;
};

export type CategoryMetadataLookup = Map<
  string,
  {
    name: string;
    icon_name: string | null;
    icon_color: string | null;
  }
>;

const emptyLookup = (): CategoryMetadataLookup => new Map();

export const isCategoryMetadataTableMissing = (rawMessage?: string | null) => {
  const text = (rawMessage || "").toLowerCase();
  if (!text) return false;
  if (!text.includes("transaction_categories")) return false;
  return (
    text.includes("could not find the table")
    || text.includes("schema cache")
    || text.includes("does not exist")
    || /relation .*transaction_categories/.test(text)
  );
};

export const buildDistinctCategoryNames = (
  names: Array<string | null | undefined>,
) => {
  const seen = new Set<string>();
  const output: string[] = [];

  names.forEach((name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const key = normalizeCategoryKey(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(trimmed);
  });

  return output;
};

export const buildCategoryMetadataLookup = (
  rows: Array<Pick<CategoryMetadataRow, "name" | "icon_name" | "icon_color">>,
): CategoryMetadataLookup => {
  const map = emptyLookup();
  rows.forEach((row) => {
    const key = normalizeCategoryKey(row.name);
    if (!key) return;
    map.set(key, {
      name: row.name,
      icon_name: row.icon_name ?? null,
      icon_color: row.icon_color ?? null,
    });
  });
  return map;
};

const buildFallbackRows = (names: string[]) =>
  names.map((name) => {
    const visual = resolveCategoryVisual({ categoryName: name });
    return {
      name,
      icon_name: visual.iconName,
      icon_color: visual.iconColor,
    };
  });

export const ensureCategoryMetadataForNames = async ({
  client,
  userId,
  names,
}: {
  client: SupabaseClient;
  userId: string;
  names: Array<string | null | undefined>;
}) => {
  const distinctNames = buildDistinctCategoryNames(names);
  if (!distinctNames.length) {
    return {
      rows: [] as Array<Pick<CategoryMetadataRow, "name" | "icon_name" | "icon_color">>,
      tableAvailable: true,
    };
  }

  const selectRes = await client
    .from("transaction_categories")
    .select("name, icon_name, icon_color")
    .eq("user_id", userId);

  if (selectRes.error) {
    if (isCategoryMetadataTableMissing(selectRes.error.message)) {
      return { rows: buildFallbackRows(distinctNames), tableAvailable: false };
    }
    throw new Error(selectRes.error.message || "Falha ao carregar categorias.");
  }

  const existingRows = (selectRes.data || []) as Array<
    Pick<CategoryMetadataRow, "name" | "icon_name" | "icon_color">
  >;
  const existingByKey = buildCategoryMetadataLookup(existingRows);

  const incompleteRows = existingRows
    .filter((row) => !row.icon_name || !row.icon_color)
    .map((row) => {
      const visual = resolveCategoryVisual({
        categoryName: row.name,
        iconName: row.icon_name,
        iconColor: row.icon_color,
      });
      return {
        user_id: userId,
        name: row.name,
        icon_name: visual.iconName,
        icon_color: visual.iconColor,
      };
    });

  const missing = distinctNames.filter(
    (name) => !existingByKey.has(normalizeCategoryKey(name)),
  );

  if (missing.length || incompleteRows.length) {
    const payload = [
      ...incompleteRows,
      ...missing.map((name) => {
        const visual = resolveCategoryVisual({ categoryName: name });
        return {
          user_id: userId,
          name,
          icon_name: visual.iconName,
          icon_color: visual.iconColor,
        };
      }),
    ];

    const upsertRes = await client
      .from("transaction_categories")
      .upsert(payload, { onConflict: "user_id,name", ignoreDuplicates: true });

    if (upsertRes.error && !isCategoryMetadataTableMissing(upsertRes.error.message)) {
      throw new Error(upsertRes.error.message || "Falha ao salvar categorias.");
    }

    if (!upsertRes.error) {
      payload.forEach((row) => {
        existingByKey.set(normalizeCategoryKey(row.name), {
          name: row.name,
          icon_name: row.icon_name,
          icon_color: row.icon_color,
        });
      });
    }
  }

  const rows = distinctNames.map((name) => {
    const match = existingByKey.get(normalizeCategoryKey(name));
    if (match) return match;
    const visual = resolveCategoryVisual({ categoryName: name });
    return {
      name,
      icon_name: visual.iconName,
      icon_color: visual.iconColor,
    };
  });

  return { rows, tableAvailable: true };
};
