export type StorageKind = "local" | "session";

const memoryStores: Record<StorageKind, Map<string, string>> = {
  local: new Map<string, string>(),
  session: new Map<string, string>(),
};

const storageAvailability: Record<StorageKind, boolean | null> = {
  local: null,
  session: null,
};

const getNativeStorage = (kind: StorageKind): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

const isStorageAvailable = (kind: StorageKind) => {
  const cached = storageAvailability[kind];
  if (cached !== null) return cached;

  const storage = getNativeStorage(kind);
  if (!storage) {
    storageAvailability[kind] = false;
    return false;
  }

  try {
    const probeKey = "__finance_storage_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    storageAvailability[kind] = true;
    return true;
  } catch {
    storageAvailability[kind] = false;
    return false;
  }
};

export const getStorageItem = (key: string, kind: StorageKind = "local") => {
  const storage = isStorageAvailable(kind) ? getNativeStorage(kind) : null;
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      storageAvailability[kind] = false;
    }
  }
  return memoryStores[kind].get(key) ?? null;
};

export const setStorageItem = (key: string, value: string, kind: StorageKind = "local") => {
  const storage = isStorageAvailable(kind) ? getNativeStorage(kind) : null;
  if (storage) {
    try {
      storage.setItem(key, value);
      memoryStores[kind].delete(key);
      return;
    } catch {
      storageAvailability[kind] = false;
    }
  }
  memoryStores[kind].set(key, value);
};

export const removeStorageItem = (key: string, kind: StorageKind = "local") => {
  const storage = isStorageAvailable(kind) ? getNativeStorage(kind) : null;
  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      storageAvailability[kind] = false;
    }
  }
  memoryStores[kind].delete(key);
};
