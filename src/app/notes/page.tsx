"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Clock3,
  Cloud,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DrawOutlineButton } from "@/components/DrawOutlineButton";
import { SpringModal } from "@/components/SpringModal";
import { supabase } from "@/lib/supabaseClient";

type NoteAttachment = {
  id: string;
  file_name: string;
  file_path: string;
  bucket: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  attachments: NoteAttachment[];
};

type NoteFileView = NoteAttachment & {
  signedUrl: string | null;
};

type NotesStorePayload = {
  version: number;
  notes: NoteRow[];
};

type NotePersistRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type NoteFilePersistRow = {
  id: string;
  note_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  bucket?: string | null;
};

const PRIMARY_BUCKET = "note-files";
const FALLBACK_BUCKET = "avatars";
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const sortNotesByUpdated = (a: NoteRow, b: NoteRow) =>
  new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

const sanitizeFileName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

const formatBytes = (value: number | null) => {
  if (!value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const getSaveLabel = (state: "idle" | "saving" | "saved" | "error") => {
  if (state === "saving") return "Salvando...";
  if (state === "saved") return "Salvo na nuvem";
  if (state === "error") return "Falha ao salvar";
  return "Pronto";
};

const getNoteCardTitle = (note: NoteRow) => {
  const title = note.title.trim();
  return title || "Sem nome";
};

const compactText = (value: string) =>
  value
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\s+/g, " ")
    .trim();

const getNotePreview = (note: NoteRow) => {
  const cleaned = compactText(note.content || "");
  if (!cleaned) return "Sem conteudo";
  if (cleaned.length <= 90) return cleaned;
  return `${cleaned.slice(0, 90)}...`;
};

const getAttachmentCountLabel = (count: number) => {
  if (count <= 0) return "Sem anexos";
  if (count === 1) return "1 anexo";
  return `${count} anexos`;
};

const isStorageMissingError = (message?: string | null) => {
  const text = (message || "").toLowerCase();
  return text.includes("not found") || text.includes("does not exist");
};

const isMissingBucketColumnError = (message?: string | null) => {
  const text = (message || "").toLowerCase();
  return text.includes("bucket") && (text.includes("does not exist") || text.includes("could not find the column"));
};

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getStorePath = (userId: string) => `${userId}/notes/notes.json`;

const createNewNote = (userId: string, title: string): NoteRow => {
  const now = new Date().toISOString();
  return {
    id: createId(),
    user_id: userId,
    title,
    content: "",
    created_at: now,
    updated_at: now,
    attachments: [],
  };
};

const ensureSorted = (notes: NoteRow[]) => [...notes].sort(sortNotesByUpdated);

const toSafeTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const mergeNotesByMostRecent = (storageNotes: NoteRow[], databaseNotes: NoteRow[]) => {
  const map = new Map<string, NoteRow>();
  for (const note of [...storageNotes, ...databaseNotes]) {
    const previous = map.get(note.id);
    if (!previous) {
      map.set(note.id, note);
      continue;
    }

    const noteIsNewest = toSafeTimestamp(note.updated_at) >= toSafeTimestamp(previous.updated_at);
    const newest = noteIsNewest ? note : previous;
    const oldest = noteIsNewest ? previous : note;

    map.set(note.id, {
      ...newest,
      // Notes from DB intentionally do not carry attachments. Keep union from both sources.
      attachments: mergeAttachments(newest.attachments, oldest.attachments),
    });
  }
  return ensureSorted(Array.from(map.values()));
};

const normalizeAttachments = (value: unknown): NoteAttachment[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item as Partial<NoteAttachment> | null)
    .filter((item): item is Partial<NoteAttachment> => !!item && !!item.id && !!item.file_path)
    .map((item) => ({
      id: String(item.id),
      file_name: typeof item.file_name === "string" && item.file_name.trim()
        ? item.file_name
        : "arquivo",
      file_path: String(item.file_path),
      bucket: typeof item.bucket === "string" && item.bucket.trim() ? item.bucket : null,
      mime_type: typeof item.mime_type === "string" ? item.mime_type : null,
      size_bytes: typeof item.size_bytes === "number" ? item.size_bytes : null,
      created_at: typeof item.created_at === "string" ? item.created_at : new Date().toISOString(),
    }));
};

const normalizeNotes = (userId: string, value: unknown): NoteRow[] => {
  if (!Array.isArray(value)) return [];
  return ensureSorted(
    value
      .map((item) => item as Partial<NoteRow> | null)
      .filter((item): item is Partial<NoteRow> => !!item && typeof item.id === "string")
      .map((item) => ({
        id: item.id as string,
        user_id: typeof item.user_id === "string" && item.user_id ? item.user_id : userId,
        title: typeof item.title === "string" ? item.title : "",
        content: typeof item.content === "string" ? item.content : "",
        created_at: typeof item.created_at === "string" ? item.created_at : new Date().toISOString(),
        updated_at: typeof item.updated_at === "string" ? item.updated_at : new Date().toISOString(),
        attachments: normalizeAttachments(item.attachments),
      })),
  );
};

const mergeAttachments = (storageAttachments: NoteAttachment[], dbAttachments: NoteAttachment[]) => {
  const map = new Map<string, NoteAttachment>();
  for (const attachment of [...storageAttachments, ...dbAttachments]) {
    const previous = map.get(attachment.id);
    if (!previous) {
      map.set(attachment.id, attachment);
      continue;
    }

    if (!previous.bucket && attachment.bucket) {
      map.set(attachment.id, attachment);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => toSafeTimestamp(b.created_at) - toSafeTimestamp(a.created_at),
  );
};

const mergeDbAttachmentsIntoNotes = (notes: NoteRow[], rows: NoteFilePersistRow[]) => {
  const rowsByNote = new Map<string, NoteAttachment[]>();
  for (const row of rows) {
    const current = rowsByNote.get(row.note_id) ?? [];
    current.push({
      id: row.id,
      file_name: row.file_name,
      file_path: row.file_path,
      bucket: row.bucket ?? null,
      mime_type: row.mime_type ?? null,
      size_bytes: row.size_bytes ?? null,
      created_at: row.created_at,
    });
    rowsByNote.set(row.note_id, current);
  }

  return ensureSorted(
    notes.map((note) => {
      const dbAttachments = rowsByNote.get(note.id) ?? [];
      if (!dbAttachments.length) return note;
      return {
        ...note,
        attachments: mergeAttachments(note.attachments, dbAttachments),
      };
    }),
  );
};

const saveStoreToBucket = async (userId: string, bucket: string, notes: NoteRow[]) => {
  const payload: NotesStorePayload = { version: 1, notes };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(getStorePath(userId), blob, {
    upsert: true,
    contentType: "application/json",
  });
  return { ok: !error, error: error?.message || null };
};

const mapNotesToPersistRows = (userId: string, notes: NoteRow[]): NotePersistRow[] =>
  notes.map((note) => ({
    id: note.id,
    user_id: userId,
    title: note.title || "",
    content: note.content || "",
    created_at: note.created_at,
    updated_at: note.updated_at,
  }));

const saveStoreToDatabase = async (userId: string, notes: NoteRow[]) => {
  const payload = mapNotesToPersistRows(userId, notes);
  const { error } = await supabase
    .from("notes")
    .upsert(payload, { onConflict: "id" });
  return { ok: !error, error: error?.message || null };
};

const loadStoreFromDatabase = async (userId: string) => {
  const { data, error } = await supabase
    .from("notes")
    .select("id, user_id, title, content, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return { notes: [] as NoteRow[], error: error.message };
  return {
    notes: normalizeNotes(userId, data ?? []),
    error: null as string | null,
  };
};

const loadAttachmentsFromDatabase = async (userId: string) => {
  const withBucketSelect = "id, note_id, user_id, file_name, file_path, mime_type, size_bytes, created_at, bucket";
  const withoutBucketSelect = "id, note_id, user_id, file_name, file_path, mime_type, size_bytes, created_at";

  const withBucketQuery = await supabase
    .from("note_files")
    .select(withBucketSelect)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  let rowsData: unknown[] | null = withBucketQuery.data as unknown[] | null;
  let rowsError = withBucketQuery.error;

  if (rowsError && isMissingBucketColumnError(rowsError.message)) {
    const withoutBucketQuery = await supabase
      .from("note_files")
      .select(withoutBucketSelect)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    rowsData = withoutBucketQuery.data as unknown[] | null;
    rowsError = withoutBucketQuery.error;
  }

  if (rowsError) {
    return { rows: [] as NoteFilePersistRow[], error: rowsError.message };
  }

  const rows = (Array.isArray(rowsData) ? rowsData : []).map((item) => {
    const row = item as Partial<NoteFilePersistRow>;
    return {
      id: String(row.id || ""),
      note_id: String(row.note_id || ""),
      user_id: String(row.user_id || userId),
      file_name: typeof row.file_name === "string" && row.file_name.trim() ? row.file_name : "arquivo",
      file_path: String(row.file_path || ""),
      mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
      size_bytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
      created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
      bucket: typeof row.bucket === "string" && row.bucket.trim() ? row.bucket : null,
    } satisfies NoteFilePersistRow;
  }).filter((row) => row.id && row.note_id && row.file_path);

  return { rows, error: null as string | null };
};

const saveAttachmentsToDatabase = async (
  userId: string,
  noteId: string,
  attachments: NoteAttachment[],
) => {
  if (!attachments.length) return { ok: true, error: null as string | null };

  const withBucketPayload: NoteFilePersistRow[] = attachments.map((attachment) => ({
    id: attachment.id,
    note_id: noteId,
    user_id: userId,
    file_name: attachment.file_name,
    file_path: attachment.file_path,
    bucket: attachment.bucket,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    created_at: attachment.created_at,
  }));

  const withBucketWrite = await supabase
    .from("note_files")
    .upsert(withBucketPayload, { onConflict: "id" });

  let writeError = withBucketWrite.error;
  if (writeError && isMissingBucketColumnError(writeError.message)) {
    const withoutBucketPayload = withBucketPayload.map((row) => ({
      id: row.id,
      note_id: row.note_id,
      user_id: row.user_id,
      file_name: row.file_name,
      file_path: row.file_path,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
    }));
    const withoutBucketWrite = await supabase
      .from("note_files")
      .upsert(withoutBucketPayload, { onConflict: "id" });
    writeError = withoutBucketWrite.error;
  }

  return { ok: !writeError, error: writeError?.message || null };
};

const resolveAttachmentUrl = async (bucket: string | null, filePath: string) => {
  const candidates = Array.from(new Set([
    bucket,
    PRIMARY_BUCKET,
    FALLBACK_BUCKET,
  ].filter((value): value is string => !!value)));

  for (const candidate of candidates) {
    const { data: signed, error: signedError } = await supabase
      .storage
      .from(candidate)
      .createSignedUrl(filePath, 60 * 60);

    if (!signedError && signed?.signedUrl) return signed.signedUrl;

    const { data: publicData } = supabase.storage.from(candidate).getPublicUrl(filePath);
    if (publicData.publicUrl) return publicData.publicUrl;
  }

  return null;
};

export default function NotesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [bucketName, setBucketName] = useState<string>(PRIMARY_BUCKET);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [attachments, setAttachments] = useState<NoteFileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [confirmDeleteNoteOpen, setConfirmDeleteNoteOpen] = useState(false);
  const [pendingAttachmentDelete, setPendingAttachmentDelete] = useState<NoteFileView | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [manualSaving, setManualSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [noteCoverById, setNoteCoverById] = useState<Record<string, string>>({});

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNotesRef = useRef<NoteRow[]>([]);

  useEffect(() => {
    latestNotesRef.current = notes;
  }, [notes]);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return notes;
    return notes.filter((note) => {
      const title = getNoteCardTitle(note).toLowerCase();
      const content = compactText(note.content || "").toLowerCase();
      return title.includes(term) || content.includes(term);
    });
  }, [notes, searchTerm]);

  const selectedAttachmentKey = useMemo(() => {
    if (!selectedNote) return "";
    return selectedNote.attachments
      .map((attachment) => `${attachment.id}:${attachment.file_path}:${attachment.bucket || ""}`)
      .join("|");
  }, [selectedNote]);

  const imageAttachments = useMemo(
    () => attachments.filter((attachment) => (attachment.mime_type || "").startsWith("image/")),
    [attachments],
  );

  const fileAttachments = useMemo(
    () => attachments.filter((attachment) => !(attachment.mime_type || "").startsWith("image/")),
    [attachments],
  );

  const noteCoverKey = useMemo(
    () =>
      notes
        .map((note) => {
          const firstImage = note.attachments.find((attachment) =>
            (attachment.mime_type || "").startsWith("image/"),
          );
          return `${note.id}:${firstImage?.id || ""}:${firstImage?.file_path || ""}:${firstImage?.bucket || ""}`;
        })
        .join("|"),
    [notes],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const covers = await Promise.all(
        notes.map(async (note) => {
          const firstImage = note.attachments.find((attachment) =>
            (attachment.mime_type || "").startsWith("image/"),
          );
          if (!firstImage) return [note.id, null] as const;
          const url = await resolveAttachmentUrl(firstImage.bucket, firstImage.file_path);
          return [note.id, url] as const;
        }),
      );

      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [noteId, url] of covers) {
        if (url) next[noteId] = url;
      }
      setNoteCoverById(next);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [noteCoverKey, notes]);

  const persistStore = useCallback(
    async (nextNotes: NoteRow[]) => {
      if (!userId) return false;

      setSaveState("saving");
      const firstTry = await saveStoreToBucket(userId, bucketName, nextNotes);
      if (firstTry.ok) {
        const mirrorDb = await saveStoreToDatabase(userId, nextNotes);
        if (!mirrorDb.ok) {
          setFeedback("Notas salvas na nuvem, mas houve falha ao sincronizar no banco.");
        }
        setSaveState("saved");
        return true;
      }

      if (bucketName !== FALLBACK_BUCKET) {
        const fallbackTry = await saveStoreToBucket(userId, FALLBACK_BUCKET, nextNotes);
        if (fallbackTry.ok) {
          setBucketName(FALLBACK_BUCKET);
          setFeedback("Storage principal indisponivel. Usando bucket de fallback.");
          const mirrorDb = await saveStoreToDatabase(userId, nextNotes);
          if (!mirrorDb.ok) {
            setFeedback("Notas salvas no fallback, mas houve falha ao sincronizar no banco.");
          }
          setSaveState("saved");
          return true;
        }
      }

      const dbTry = await saveStoreToDatabase(userId, nextNotes);
      if (dbTry.ok) {
        setFeedback("Storage indisponivel no momento. Notas salvas no banco de dados.");
        setSaveState("saved");
        return true;
      }

      setSaveState("error");
      setFeedback(`Nao foi possivel salvar: ${firstTry.error || dbTry.error || "erro desconhecido"}`);
      return false;
    },
    [bucketName, userId],
  );

  const queuePersist = useCallback(
    (nextNotes: NoteRow[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState("saving");
      latestNotesRef.current = nextNotes;
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void persistStore(latestNotesRef.current);
      }, 550);
    },
    [persistStore],
  );

  const syncDraftIntoLatestNotes = useCallback(() => {
    if (!selectedNoteId) {
      return { notes: latestNotesRef.current, changed: false };
    }

    const source = latestNotesRef.current;
    let changed = false;
    const now = new Date().toISOString();
    const merged = source.map((note) => {
      if (note.id !== selectedNoteId) return note;
      if (note.title === draftTitle && note.content === draftContent) return note;
      changed = true;
      return {
        ...note,
        title: draftTitle,
        content: draftContent,
        updated_at: now,
      };
    });

    if (!changed) {
      return { notes: source, changed: false };
    }

    const sorted = ensureSorted(merged);
    setNotes(sorted);
    latestNotesRef.current = sorted;
    return { notes: sorted, changed: true };
  }, [draftContent, draftTitle, selectedNoteId]);

  const flushPendingSave = useCallback(async () => {
    const synced = syncDraftIntoLatestNotes();
    if (!saveTimerRef.current && !synced.changed) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await persistStore(synced.notes);
  }, [persistStore, syncDraftIntoLatestNotes]);

  const handleManualSave = useCallback(async () => {
    if (!userId) return;
    setFeedback(null);
    setManualSaving(true);
    try {
      const synced = syncDraftIntoLatestNotes();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      await persistStore(synced.notes);
    } finally {
      setManualSaving(false);
    }
  }, [persistStore, syncDraftIntoLatestNotes, userId]);

  const setDraftFromNote = useCallback((note: NoteRow) => {
    setDraftTitle(note.title || "");
    setDraftContent(note.content || "");
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      setLoading(false);
      setFeedback("Sessao nao encontrada.");
      return;
    }

    setUserId(user.id);

    const primaryProbe = await supabase.storage
      .from(PRIMARY_BUCKET)
      .list(`${user.id}/notes`, { limit: 1 });

    const resolvedBucket = primaryProbe.error ? FALLBACK_BUCKET : PRIMARY_BUCKET;
    setBucketName(resolvedBucket);

    const { data: storeFile, error: loadError } = await supabase
      .storage
      .from(resolvedBucket)
      .download(getStorePath(user.id));

    let initialNotes: NoteRow[] = [];
    let storageLoadFailed = false;
    if (loadError) {
      storageLoadFailed = !isStorageMissingError(loadError.message);
    } else {
      try {
        const parsed = JSON.parse(await storeFile.text()) as Partial<NotesStorePayload>;
        initialNotes = normalizeNotes(user.id, parsed.notes);
      } catch {
        initialNotes = [];
        storageLoadFailed = true;
      }
    }

    const dbLoad = await loadStoreFromDatabase(user.id);
    if (dbLoad.notes.length) {
      if (!initialNotes.length) {
        initialNotes = dbLoad.notes;
        if (storageLoadFailed) {
          setFeedback("Storage indisponivel. Notas carregadas do banco de dados.");
        }
      } else {
        initialNotes = mergeNotesByMostRecent(initialNotes, dbLoad.notes);
      }
    } else if (dbLoad.error && storageLoadFailed) {
      setFeedback(`Falha ao carregar notas: ${dbLoad.error}`);
    }

    const attachmentLoad = await loadAttachmentsFromDatabase(user.id);
    if (attachmentLoad.rows.length && initialNotes.length) {
      initialNotes = mergeDbAttachmentsIntoNotes(initialNotes, attachmentLoad.rows);
    } else if (attachmentLoad.error && !storageLoadFailed) {
      setFeedback(`Falha ao carregar anexos: ${attachmentLoad.error}`);
    }

    if (!initialNotes.length) {
      initialNotes = [createNewNote(user.id, "Minha primeira nota")];
      const firstWrite = await saveStoreToBucket(user.id, resolvedBucket, initialNotes);
      if (!firstWrite.ok && resolvedBucket !== FALLBACK_BUCKET) {
        const fallbackWrite = await saveStoreToBucket(user.id, FALLBACK_BUCKET, initialNotes);
        if (fallbackWrite.ok) {
          setBucketName(FALLBACK_BUCKET);
          setFeedback("Storage principal indisponivel. Usando bucket de fallback.");
        } else {
          const dbWrite = await saveStoreToDatabase(user.id, initialNotes);
          if (dbWrite.ok) {
            setFeedback("Storage indisponivel. Nota inicial salva no banco de dados.");
          } else {
            setFeedback(`Nao foi possivel inicializar notas: ${firstWrite.error || dbWrite.error || "erro desconhecido"}`);
          }
        }
      } else if (!firstWrite.ok) {
        const dbWrite = await saveStoreToDatabase(user.id, initialNotes);
        if (dbWrite.ok) {
          setFeedback("Storage indisponivel. Nota inicial salva no banco de dados.");
        } else {
          setFeedback(`Nao foi possivel inicializar notas: ${firstWrite.error || dbWrite.error || "erro desconhecido"}`);
        }
      }
    }

    const sorted = ensureSorted(initialNotes);
    setNotes(sorted);
    latestNotesRef.current = sorted;

    const first = sorted[0];
    setSelectedNoteId(first.id);
    setDraftFromNote(first);
    setLoading(false);

    requestAnimationFrame(() => editorRef.current?.focus());
  }, [setDraftFromNote]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      void persistStore(latestNotesRef.current);
    };
  }, [persistStore]);

  useEffect(() => {
    if (!selectedNoteId) return;

    setNotes((prev) => {
      const current = prev.find((note) => note.id === selectedNoteId);
      if (!current) return prev;
      if (current.title === draftTitle && current.content === draftContent) return prev;

      const updated = ensureSorted(
        prev.map((note) =>
          note.id === selectedNoteId
            ? {
              ...note,
              title: draftTitle,
              content: draftContent,
              updated_at: new Date().toISOString(),
            }
            : note,
        ),
      );
      latestNotesRef.current = updated;
      queuePersist(updated);
      return updated;
    });
  }, [draftContent, draftTitle, selectedNoteId, queuePersist]);

  useEffect(() => {
    if (!selectedNote) {
      setAttachments([]);
      return;
    }

    let cancelled = false;
    setLoadingAttachments(true);

    const run = async () => {
      const views = await Promise.all(
        selectedNote.attachments.map(async (attachment) => {
          const signedUrl = await resolveAttachmentUrl(attachment.bucket, attachment.file_path);
          return {
            ...attachment,
            signedUrl,
          } as NoteFileView;
        }),
      );

      if (!cancelled) {
        setAttachments(views);
        setLoadingAttachments(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedNoteId, selectedAttachmentKey, selectedNote]);

  const handleSelectNote = async (note: NoteRow) => {
    if (note.id === selectedNoteId) return;
    await flushPendingSave();
    setSelectedNoteId(note.id);
    setDraftFromNote(note);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const handleCreateNote = async () => {
    if (!userId) return;
    await flushPendingSave();

    const created = createNewNote(userId, `Nova nota ${notes.length + 1}`);
    const next = ensureSorted([created, ...latestNotesRef.current]);
    setNotes(next);
    latestNotesRef.current = next;
    setSelectedNoteId(created.id);
    setDraftFromNote(created);
    setAttachments([]);
    setSaveState("saving");
    await persistStore(next);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const handleRenameCurrentNote = () => {
    if (!selectedNote) return;
    const currentName = draftTitle.trim() || getNoteCardTitle(selectedNote);
    const nextName = window.prompt("Nome da nota:", currentName);
    if (nextName === null) return;
    setDraftTitle(nextName.trim());
  };

  const handleDeleteCurrentNote = async () => {
    if (!selectedNote || !userId) return;
    const noteToDelete = selectedNote;

    await flushPendingSave();
    setDeletingNoteId(noteToDelete.id);
    setFeedback(null);

    try {
      const groupedByBucket = noteToDelete.attachments.reduce<Record<string, string[]>>((acc, attachment) => {
        const keys = attachment.bucket ? [attachment.bucket] : [PRIMARY_BUCKET, FALLBACK_BUCKET];
        for (const key of keys) {
          if (!acc[key]) acc[key] = [];
          acc[key].push(attachment.file_path);
        }
        return acc;
      }, {});

      const removeJobs = Object.entries(groupedByBucket).map(([bucket, paths]) =>
        supabase.storage.from(bucket).remove(paths),
      );
      await Promise.all(removeJobs);

      await supabase
        .from("notes")
        .delete()
        .eq("id", noteToDelete.id)
        .eq("user_id", userId);

      await supabase
        .from("note_files")
        .delete()
        .eq("note_id", noteToDelete.id)
        .eq("user_id", userId);

      let remaining = latestNotesRef.current.filter((note) => note.id !== noteToDelete.id);
      if (!remaining.length) {
        remaining = [createNewNote(userId, "Nova nota 1")];
      }
      remaining = ensureSorted(remaining);

      setNotes(remaining);
      latestNotesRef.current = remaining;

      const next = remaining[0];
      setSelectedNoteId(next.id);
      setDraftFromNote(next);
      setSaveState("saving");
      await persistStore(remaining);
      setFeedback("Nota excluida com sucesso.");
    } catch {
      setFeedback("Nao foi possivel excluir a nota agora.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  const uploadFileWithFallback = useCallback(
    async (filePath: string, file: globalThis.File) => {
      const first = await supabase
        .storage
        .from(bucketName)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (!first.error) return { ok: true, bucket: bucketName, error: null as string | null };

      let secondError: string | null = null;
      if (bucketName !== FALLBACK_BUCKET) {
        const second = await supabase
          .storage
          .from(FALLBACK_BUCKET)
          .upload(filePath, file, {
            upsert: false,
            contentType: file.type || "application/octet-stream",
          });

        if (!second.error) {
          setBucketName(FALLBACK_BUCKET);
          return { ok: true, bucket: FALLBACK_BUCKET, error: null as string | null };
        }

        secondError = second.error.message;
      }

      const fullError = [first.error.message, secondError].filter(Boolean).join(" | ");
      return { ok: false, bucket: bucketName, error: fullError || first.error.message };
    },
    [bucketName],
  );

  const handleAttachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !selectedNote || !userId) return;

    await flushPendingSave();
    setUploadingFiles(true);
    setFeedback(null);

    const failures: string[] = [];
    const newAttachments: NoteAttachment[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        failures.push(`${file.name}: acima de 20MB`);
        continue;
      }

      const safeName = sanitizeFileName(file.name);
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = `${userId}/notes/files/${selectedNote.id}/${unique}-${safeName}`;

      const uploadRes = await uploadFileWithFallback(filePath, file);
      if (!uploadRes.ok) {
        failures.push(`${file.name}: ${uploadRes.error || "falha no upload"}`);
        continue;
      }

      newAttachments.push({
        id: createId(),
        file_name: file.name,
        file_path: filePath,
        bucket: uploadRes.bucket,
        mime_type: file.type || null,
        size_bytes: file.size,
        created_at: new Date().toISOString(),
      });
    }

    if (newAttachments.length) {
      const nextNotes = ensureSorted(
        latestNotesRef.current.map((note) =>
          note.id === selectedNote.id
            ? {
              ...note,
              attachments: [...note.attachments, ...newAttachments],
              updated_at: new Date().toISOString(),
            }
            : note,
        ),
      );

      // Keep attachment order newest first
      const fixed = nextNotes.map((note) =>
        note.id === selectedNote.id
          ? {
            ...note,
            attachments: [...note.attachments].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            ),
          }
          : note,
      );

      setNotes(fixed);
      latestNotesRef.current = fixed;
      const dbAttachSave = await saveAttachmentsToDatabase(userId, selectedNote.id, newAttachments);
      if (!dbAttachSave.ok) {
        failures.push(`metadata: ${dbAttachSave.error || "falha ao sincronizar anexos no banco"}`);
      }
      await persistStore(fixed);
    }

    setUploadingFiles(false);
    event.target.value = "";

    if (!failures.length) {
      setFeedback("Arquivos anexados com sucesso.");
      return;
    }

    setFeedback(`Alguns anexos falharam: ${failures.slice(0, 3).join(" | ")}`);
  };

  const handleDeleteAttachment = async (attachment: NoteFileView) => {
    if (!selectedNote || !userId) return;

    await flushPendingSave();
    setDeletingAttachmentId(attachment.id);
    setFeedback(null);

    try {
      const candidateBuckets = attachment.bucket
        ? [attachment.bucket]
        : [PRIMARY_BUCKET, FALLBACK_BUCKET];

      await Promise.all(
        candidateBuckets.map((bucket) => supabase.storage.from(bucket).remove([attachment.file_path])),
      );

      await supabase
        .from("note_files")
        .delete()
        .eq("id", attachment.id)
        .eq("user_id", userId);

      const next = ensureSorted(
        latestNotesRef.current.map((note) =>
          note.id === selectedNote.id
            ? {
              ...note,
              attachments: note.attachments.filter((item) => item.id !== attachment.id),
              updated_at: new Date().toISOString(),
            }
            : note,
        ),
      );

      setNotes(next);
      latestNotesRef.current = next;
      await persistStore(next);
      setFeedback("Anexo removido com sucesso.");
    } catch {
      setFeedback("Nao foi possivel remover o anexo agora.");
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const handleConfirmDeleteCurrentNote = async () => {
    try {
      await handleDeleteCurrentNote();
    } finally {
      setConfirmDeleteNoteOpen(false);
    }
  };

  const handleConfirmDeleteAttachment = async () => {
    if (!pendingAttachmentDelete) return;
    try {
      await handleDeleteAttachment(pendingAttachmentDelete);
    } finally {
      setPendingAttachmentDelete(null);
    }
  };

  return (
    <AppShell
      title="Bloco de Notas"
      subtitle="Notas e anexos sincronizados na nuvem"
      contentClassName="notes-dark-bg"
    >
      {loading ? (
        <div className="rounded-2xl border border-slate-700/40 bg-[#090a0f]/95 p-6 text-slate-200">
          Carregando notas...
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
          <section className="relative overflow-hidden rounded-3xl border border-slate-700/45 bg-[linear-gradient(165deg,#0e1118,#090b11)] p-4 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_240px_at_10%_-12%,rgba(56,189,248,.18),transparent),radial-gradient(520px_280px_at_110%_14%,rgba(167,139,250,.16),transparent)]" />

            <div className="relative">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 p-2 text-cyan-200">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-100">Minhas notas</h2>
                    <p className="text-[11px] text-slate-400">{notes.length} itens sincronizados</p>
                  </div>
                </div>
                <DrawOutlineButton
                  type="button"
                  lineClassName="bg-cyan-200"
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
                  onClick={handleCreateNote}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nova
                </DrawOutlineButton>
              </div>

              <label className="mb-3 block">
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por titulo ou conteudo..."
                    className="w-full rounded-xl border border-slate-600/45 bg-slate-900/65 py-2 pl-9 pr-3 text-xs font-medium text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-400/20"
                  />
                </span>
              </label>

              <div className="mb-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>{filteredNotes.length} exibidas</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/25 bg-violet-500/10 px-2 py-0.5 text-violet-200">
                  <Sparkles className="h-3 w-3" />
                  Keep-like
                </span>
              </div>

              <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
                {filteredNotes.length ? (
                  filteredNotes.map((note) => {
                    const active = selectedNoteId === note.id;
                    const attachmentCount = note.attachments.length;
                    const hasImage = note.attachments.some((attachment) =>
                      (attachment.mime_type || "").startsWith("image/"),
                    );
                    const coverUrl = noteCoverById[note.id] || null;

                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => void handleSelectNote(note)}
                        className={`w-full rounded-2xl border px-3.5 py-3 text-left transition ${
                          active
                            ? "border-cyan-300/35 bg-[linear-gradient(140deg,rgba(16,30,46,0.88),rgba(15,21,36,0.9))] shadow-[0_14px_35px_rgba(6,182,212,0.15)]"
                            : "border-slate-700/55 bg-slate-900/45 hover:border-slate-500/55 hover:bg-slate-800/55"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-slate-100">
                            {getNoteCardTitle(note)}
                          </p>
                          {hasImage ? (
                            coverUrl ? (
                              <span className="inline-flex h-12 w-12 overflow-hidden rounded-xl border border-amber-300/35 bg-black/35 p-0.5 shadow-[0_6px_20px_rgba(245,158,11,0.25)]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={coverUrl}
                                  alt={`Capa da nota ${getNoteCardTitle(note)}`}
                                  loading="lazy"
                                  className="h-full w-full rounded-lg object-cover"
                                />
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-xl border border-amber-300/30 bg-amber-500/10 p-1.5 text-amber-200">
                                <ImageIcon className="h-4 w-4" />
                              </span>
                            )
                          ) : null}
                        </div>

                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-300/90">
                          {getNotePreview(note)}
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <Clock3 className="h-3 w-3" />
                            {formatDateTime(note.updated_at)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/35 bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-100">
                            <Paperclip className="h-3 w-3" />
                            {getAttachmentCountLabel(attachmentCount)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-600/55 bg-slate-900/45 px-3 py-5 text-center text-xs text-slate-400">
                    Nenhuma nota encontrada para a busca.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl border border-slate-700/45 bg-[linear-gradient(170deg,#0b0f17,#080a11)] p-4 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(620px_240px_at_90%_-12%,rgba(14,165,233,.16),transparent),radial-gradient(520px_260px_at_-6%_100%,rgba(244,114,182,.08),transparent)]" />

            <div className="relative">
              <div className="mb-4 rounded-2xl border border-slate-700/45 bg-slate-900/45 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                    <Cloud className="h-3.5 w-3.5" />
                    {getSaveLabel(saveState)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DrawOutlineButton
                      type="button"
                      lineClassName="bg-slate-200"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-500/70 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-400/80 hover:bg-slate-900/80 disabled:opacity-60"
                      onClick={() => void handleManualSave()}
                      disabled={!selectedNoteId || manualSaving || saveState === "saving"}
                    >
                      {manualSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Salvar
                    </DrawOutlineButton>
                    <DrawOutlineButton
                      type="button"
                      lineClassName="bg-violet-200"
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-300/35 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/25 disabled:opacity-60"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!selectedNoteId || uploadingFiles}
                    >
                      {uploadingFiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                      Anexar foto ou arquivo
                    </DrawOutlineButton>
                    <DrawOutlineButton
                      type="button"
                      lineClassName="bg-slate-300"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-600/55 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700/80 disabled:opacity-60"
                      onClick={handleRenameCurrentNote}
                      disabled={!selectedNoteId}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Nomear nota
                    </DrawOutlineButton>
                    <DrawOutlineButton
                      type="button"
                      lineClassName="bg-rose-300"
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-300/25 bg-rose-950/45 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-900/45 disabled:opacity-60"
                      onClick={() => setConfirmDeleteNoteOpen(true)}
                      disabled={!selectedNoteId || deletingNoteId === selectedNoteId}
                    >
                      {deletingNoteId === selectedNoteId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Excluir nota
                    </DrawOutlineButton>
                  </div>
                </div>
              </div>

              <label className="mb-3 block rounded-2xl border border-slate-700/45 bg-slate-900/35 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">
                  <Pencil className="h-3.5 w-3.5" />
                  Nome da nota
                </span>
                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={(event) => setDraftTitle(event.target.value.trim())}
                  placeholder="Digite o nome da nota"
                  className="mt-2 w-full border-b border-slate-600/45 bg-transparent px-1 pb-1.5 pt-0.5 text-2xl font-extrabold tracking-tight text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/45"
                />
              </label>

              <div
                className="min-h-[360px] rounded-2xl border border-cyan-300/15 bg-[linear-gradient(180deg,rgba(3,7,18,.72),rgba(2,6,23,.88))] p-4"
                onClick={() => editorRef.current?.focus()}
              >
                <div className="textarea-floating w-full">
                  <textarea
                    id="note-floating-content"
                    ref={editorRef}
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    placeholder="Escreva sua ideia, checklist ou observacoes..."
                    className="textarea h-[340px] w-full resize-none bg-transparent text-[15px] leading-7 text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <label className="textarea-floating-label" htmlFor="note-floating-content">
                    Sua nota
                  </label>
                </div>

                {imageAttachments.length ? (
                  <div className="mt-4 border-t border-cyan-300/15 pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.11em] text-cyan-100">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Galeria da nota
                      </p>
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">
                        {imageAttachments.length} foto(s)
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {imageAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="overflow-hidden rounded-xl border border-cyan-300/20 bg-black/35"
                        >
                          {attachment.signedUrl ? (
                            <a href={attachment.signedUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={attachment.signedUrl}
                                alt={attachment.file_name}
                                loading="lazy"
                                className="h-36 w-full bg-black/40 object-cover"
                              />
                            </a>
                          ) : (
                            <div className="flex h-36 items-center justify-center text-xs text-slate-500">
                              Imagem indisponivel
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 border-t border-cyan-300/10 px-2 py-1.5">
                            <span className="truncate text-xs text-slate-200">{attachment.file_name}</span>
                            <button
                              type="button"
                              className="rounded-md border border-rose-400/35 bg-rose-500/10 p-1 text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                              onClick={() => setPendingAttachmentDelete(attachment)}
                              disabled={deletingAttachmentId === attachment.id}
                              aria-label={`Excluir ${attachment.file_name}`}
                            >
                              {deletingAttachmentId === attachment.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-violet-300/20 bg-slate-950/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
                    <FileText className="h-4 w-4 text-violet-300" />
                    Arquivos anexados
                  </h3>
                  {loadingAttachments ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                </div>

                {!fileAttachments.length ? (
                  <p className="text-xs text-slate-500">
                    Sem arquivos extras. As imagens aparecem no bloco acima para visualizacao rapida.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {fileAttachments.map((attachment) => {
                      return (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-violet-300/20 bg-black/30 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <FileIcon className="h-4 w-4 text-violet-200" />
                              {attachment.signedUrl ? (
                                <a
                                  href={attachment.signedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-xs font-medium text-violet-100 hover:underline"
                                >
                                  {attachment.file_name}
                                </a>
                              ) : (
                                <span className="truncate text-xs font-medium text-slate-300">
                                  {attachment.file_name}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {formatBytes(attachment.size_bytes)} - {formatDateTime(attachment.created_at)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="rounded-md border border-rose-400/35 bg-rose-500/10 p-1.5 text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                            onClick={() => setPendingAttachmentDelete(attachment)}
                            disabled={deletingAttachmentId === attachment.id}
                            aria-label={`Excluir ${attachment.file_name}`}
                          >
                            {deletingAttachmentId === attachment.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {feedback ? (
                <div className="mt-3 rounded-xl border border-violet-300/25 bg-violet-950/35 px-3 py-2 text-xs text-violet-100">
                  {feedback}
                </div>
              ) : null}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(event) => void handleAttachFiles(event)}
                className="hidden"
              />
            </div>
          </section>
        </div>
      )}

      <SpringModal
        isOpen={confirmDeleteNoteOpen}
        onClose={() => setConfirmDeleteNoteOpen(false)}
        onConfirm={() => void handleConfirmDeleteCurrentNote()}
        title="Excluir nota?"
        description="Essa acao remove a nota e todos os anexos vinculados da nuvem."
        confirmLabel={deletingNoteId === selectedNoteId ? "Excluindo..." : "Excluir nota"}
        cancelLabel="Cancelar"
        loading={deletingNoteId === selectedNoteId}
        tone="danger"
      />

      <SpringModal
        isOpen={!!pendingAttachmentDelete}
        onClose={() => setPendingAttachmentDelete(null)}
        onConfirm={() => void handleConfirmDeleteAttachment()}
        title="Remover anexo?"
        description={
          pendingAttachmentDelete
            ? `O arquivo \"${pendingAttachmentDelete.file_name}\" sera removido permanentemente.`
            : "Confirme para remover este anexo."
        }
        confirmLabel={pendingAttachmentDelete && deletingAttachmentId === pendingAttachmentDelete.id ? "Removendo..." : "Remover anexo"}
        cancelLabel="Cancelar"
        loading={!!pendingAttachmentDelete && deletingAttachmentId === pendingAttachmentDelete.id}
        tone="danger"
      />
    </AppShell>
  );
}
