import { getStorageItem, setStorageItem } from "@/lib/safeStorage";

const STORAGE_KEY_PREFIX = "agenda_dashboard_countdown_v1";
export const DASHBOARD_COUNTDOWN_UPDATED_EVENT = "agenda_dashboard_countdown_updated";

const normalizeIds = (input: unknown) => {
  if (!Array.isArray(input)) return [] as string[];
  const unique = new Set<string>();
  input.forEach((value) => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (!id) return;
    unique.add(id);
  });
  return Array.from(unique);
};

const keyFor = (userId: string) => `${STORAGE_KEY_PREFIX}:${userId}`;

export const getDashboardCountdownEventIds = (userId?: string | null) => {
  if (!userId) return [] as string[];
  try {
    const raw = getStorageItem(keyFor(userId), "local");
    if (!raw) return [] as string[];

    const parsed = JSON.parse(raw) as { eventIds?: unknown } | unknown;
    if (Array.isArray(parsed)) {
      return normalizeIds(parsed);
    }
    if (parsed && typeof parsed === "object") {
      return normalizeIds((parsed as { eventIds?: unknown }).eventIds);
    }
    return [] as string[];
  } catch {
    return [] as string[];
  }
};

export const setDashboardCountdownEventIds = (userId: string, ids: string[]) => {
  const normalized = normalizeIds(ids);
  const payload = {
    eventIds: normalized,
    updatedAt: new Date().toISOString(),
  };
  setStorageItem(keyFor(userId), JSON.stringify(payload), "local");

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_COUNTDOWN_UPDATED_EVENT, {
        detail: { userId, eventIds: normalized },
      }),
    );
  }
};
