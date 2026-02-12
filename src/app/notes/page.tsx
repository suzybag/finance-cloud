"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Cloud,
  File,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
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

const isStorageMissingError = (message?: string | null) => {
  const text = (message || "").toLowerCase();
  return text.includes("not found") || text.includes("does not exist");
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

const saveStoreToBucket = async (userId: string, bucket: string, notes: NoteRow[]) => {
  const payload: NotesStorePayload = { version: 1, notes };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(getStorePath(userId), blob, {
    upsert: true,
    contentType: "application/json",
  });
  return { ok: !error, error: error?.message || null };
};

const resolveAttachmentUrl = async (bucket: string, filePath: string) => {
  const { data: signed, error: signedError } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(filePath, 60 * 60);

  if (!signedError && signed?.signedUrl) return signed.signedUrl;

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicData.publicUrl || null;
};

export default function NotesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [bucketName, setBucketName] = useState<string>(PRIMARY_BUCKET);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [attachments, setAttachments] = useState<NoteFileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

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

  const persistStore = useCallback(
    async (nextNotes: NoteRow[]) => {
      if (!userId) return false;

      setSaveState("saving");
      const firstTry = await saveStoreToBucket(userId, bucketName, nextNotes);
      if (firstTry.ok) {
        setSaveState("saved");
        return true;
      }

      if (bucketName !== FALLBACK_BUCKET) {
        const fallbackTry = await saveStoreToBucket(userId, FALLBACK_BUCKET, nextNotes);
        if (fallbackTry.ok) {
          setBucketName(FALLBACK_BUCKET);
          setFeedback("Storage principal indisponivel. Usando bucket de fallback.");
          setSaveState("saved");
          return true;
        }
      }

      setSaveState("error");
      setFeedback(`Nao foi possivel salvar: ${firstTry.error || "erro desconhecido"}`);
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

  const flushPendingSave = useCallback(async () => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    await persistStore(latestNotesRef.current);
  }, [persistStore]);

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
    if (loadError) {
      if (!isStorageMissingError(loadError.message)) {
        setFeedback(`Falha ao carregar notas: ${loadError.message}`);
      }
    } else {
      try {
        const parsed = JSON.parse(await storeFile.text()) as Partial<NotesStorePayload>;
        initialNotes = normalizeNotes(user.id, parsed.notes);
      } catch {
        initialNotes = [];
      }
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
          setFeedback(`Nao foi possivel inicializar notas: ${firstWrite.error || "erro desconhecido"}`);
        }
      } else if (!firstWrite.ok) {
        setFeedback(`Nao foi possivel inicializar notas: ${firstWrite.error || "erro desconhecido"}`);
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
          const fileBucket = attachment.bucket || bucketName;
          const signedUrl = await resolveAttachmentUrl(fileBucket, attachment.file_path);
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
  }, [selectedNoteId, selectedAttachmentKey, bucketName, selectedNote]);

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

    const confirmed = window.confirm("Excluir esta nota e todos os anexos?");
    if (!confirmed) return;

    await flushPendingSave();
    setDeletingNoteId(selectedNote.id);
    setFeedback(null);

    const groupedByBucket = selectedNote.attachments.reduce<Record<string, string[]>>((acc, attachment) => {
      const key = attachment.bucket || bucketName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(attachment.file_path);
      return acc;
    }, {});

    const removeJobs = Object.entries(groupedByBucket).map(([bucket, paths]) =>
      supabase.storage.from(bucket).remove(paths),
    );
    await Promise.all(removeJobs);

    let remaining = latestNotesRef.current.filter((note) => note.id !== selectedNote.id);
    if (!remaining.length) {
      remaining = [createNewNote(userId, "Nova nota 1")];
    }
    remaining = ensureSorted(remaining);

    setNotes(remaining);
    latestNotesRef.current = remaining;

    const next = remaining[0];
    setSelectedNoteId(next.id);
    setDraftFromNote(next);
    setDeletingNoteId(null);
    setSaveState("saving");
    await persistStore(remaining);
  };

  const uploadFileWithFallback = useCallback(
    async (filePath: string, file: File) => {
      const first = await supabase
        .storage
        .from(bucketName)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (!first.error) return { ok: true, bucket: bucketName, error: null as string | null };

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
      }

      return { ok: false, bucket: bucketName, error: first.error.message };
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
    if (!selectedNote) return;

    const confirmed = window.confirm(`Remover anexo "${attachment.file_name}"?`);
    if (!confirmed) return;

    await flushPendingSave();
    setDeletingAttachmentId(attachment.id);
    setFeedback(null);

    const fileBucket = attachment.bucket || bucketName;
    await supabase.storage.from(fileBucket).remove([attachment.file_path]);

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
    setDeletingAttachmentId(null);
    await persistStore(next);
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
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <section className="rounded-2xl border border-slate-700/40 bg-[#0b0d12]/95 p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">Minhas notas</h2>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-500/45 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700/70"
                onClick={handleCreateNote}
              >
                <Plus className="h-3.5 w-3.5" />
                Nova
              </button>
            </div>

            <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
              {notes.map((note) => {
                const active = selectedNoteId === note.id;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => void handleSelectNote(note)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      active
                        ? "border-slate-500/60 bg-slate-800/65"
                        : "border-slate-700/45 bg-slate-900/45 hover:bg-slate-800/60"
                    }`}
                  >
                    <p className="line-clamp-1 text-sm font-semibold text-slate-100">
                      {getNoteCardTitle(note)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                      {(note.content || "Sem conteudo").trim()}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {formatDateTime(note.updated_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700/40 bg-[#07080d]/95 p-4 backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                <Cloud className="h-3.5 w-3.5" />
                {getSaveLabel(saveState)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-600/50 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700/80 disabled:opacity-60"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedNoteId || uploadingFiles}
                >
                  {uploadingFiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  Anexar foto ou arquivo
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-600/50 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700/80 disabled:opacity-60"
                  onClick={handleRenameCurrentNote}
                  disabled={!selectedNoteId}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Nomear nota
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-300/25 bg-rose-950/45 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-900/45 disabled:opacity-60"
                  onClick={() => void handleDeleteCurrentNote()}
                  disabled={!selectedNoteId || deletingNoteId === selectedNoteId}
                >
                  {deletingNoteId === selectedNoteId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Excluir nota
                </button>
              </div>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Nome da nota
              </span>
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={(event) => setDraftTitle(event.target.value.trim())}
                placeholder="Digite o nome da nota"
                className="w-full border-b border-slate-600/40 bg-transparent px-1 py-2 text-xl font-semibold text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>

            <div
              className="min-h-[320px] rounded-xl border border-violet-300/15 bg-black/35 p-3"
              onClick={() => editorRef.current?.focus()}
            >
              <textarea
                ref={editorRef}
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                placeholder="Clique aqui e comeca a escrever..."
                className="h-[320px] w-full resize-none bg-transparent text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500"
              />

              {imageAttachments.length ? (
                <div className="mt-3 border-t border-violet-300/15 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                    Imagens na nota
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {imageAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="overflow-hidden rounded-lg border border-violet-300/15 bg-black/35"
                      >
                        {attachment.signedUrl ? (
                          <a href={attachment.signedUrl} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={attachment.signedUrl}
                              alt={attachment.file_name}
                              loading="lazy"
                              className="h-36 w-full bg-black/30 object-contain"
                            />
                          </a>
                        ) : (
                          <div className="flex h-36 items-center justify-center text-xs text-slate-500">
                            Imagem indisponivel
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 border-t border-violet-300/10 px-2 py-1.5">
                          <span className="truncate text-xs text-slate-300">{attachment.file_name}</span>
                          <button
                            type="button"
                            className="rounded-md border border-rose-400/35 bg-rose-500/10 p-1 text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
                            onClick={() => void handleDeleteAttachment(attachment)}
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

            <div className="mt-4 rounded-xl border border-violet-300/15 bg-slate-950/45 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Arquivos anexados</h3>
                {loadingAttachments ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
              </div>

              {!fileAttachments.length ? (
                <p className="text-xs text-slate-500">
                  Sem arquivos extras. As imagens aparecem dentro do bloco da nota.
                </p>
              ) : (
                <div className="space-y-2">
                  {fileAttachments.map((attachment) => {
                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-violet-300/10 bg-black/30 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <File className="h-4 w-4 text-slate-300" />
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
                          onClick={() => void handleDeleteAttachment(attachment)}
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
              <div className="mt-3 rounded-lg border border-violet-300/20 bg-violet-950/35 px-3 py-2 text-xs text-violet-100">
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
          </section>
        </div>
      )}
    </AppShell>
  );
}
