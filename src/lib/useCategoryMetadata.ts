"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  buildCategoryMetadataLookup,
  buildDistinctCategoryNames,
  ensureCategoryMetadataForNames,
  type CategoryMetadataLookup,
} from "@/lib/categoryMetadata";

const EMPTY_LOOKUP: CategoryMetadataLookup = new Map();

export const useCategoryMetadata = (
  names: Array<string | null | undefined>,
): CategoryMetadataLookup => {
  const [lookup, setLookup] = useState<CategoryMetadataLookup>(new Map());

  const namesSignature = buildDistinctCategoryNames(names).join("||");
  const stableNames = useMemo(
    () => (namesSignature ? namesSignature.split("||") : []),
    [namesSignature],
  );

  useEffect(() => {
    if (!stableNames.length) return;

    let active = true;

    (async () => {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (!userId) {
        if (active) setLookup(new Map());
        return;
      }

      try {
        const result = await ensureCategoryMetadataForNames({
          client: supabase,
          userId,
          names: stableNames,
        });
        if (!active) return;
        setLookup(buildCategoryMetadataLookup(result.rows));
      } catch {
        if (!active) return;
        setLookup(new Map());
      }
    })();

    return () => {
      active = false;
    };
  }, [namesSignature, stableNames]);

  if (!stableNames.length) return EMPTY_LOOKUP;
  return lookup;
};
