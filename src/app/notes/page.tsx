"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Cloud,
  File,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type NoteFileRow = {
  id: string;
  note_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type NoteFileView = NoteFileRow & {
  signedUrl: string | null;
};

const NOTE_BUCKET = "note-files";
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

const getNoteCardTitle = (note: NoteRow) => {
  const title = note.title.trim();
  if (title) return title;
  return "Sem nome";
};

const getSaveLabel = (state: "idle" | "saving" | "saved" | "error") => {
  if (state === "saving") return "Salvando...";
  if (state === "saved") return "Salvo na nuvem";
  if (state === "error") return "Falha ao salvar";
  return "Pronto";
};

export default function NotesPage() {
  const [userId, setUserId] = useState<string | null>(null);
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
  const latestDraftRef = useRef({ title: "", content: "" });
  const latestSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    latestDraftRef.current = { title: draftTitle, content: draftContent };
  }, [draftTitle, draftContent]);

  useEffect(() => {
    latestSelectedRef.current = selectedNoteId;
  }, [selectedNoteId]);

  const setDraftFromNote = useCallback((note: NoteRow) => {
    setDraftTitle(note.title ?? "");
    setDraftContent(note.content ?? "");
    latestDraftRef.current = { title: note.title ?? "", content: note.content ?? "" };
  }, []);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const persistNote = useCallback(
    async (noteId: string, title: string, content: string) => {
      const current = notes.find((note) => note.id === noteId);
      if (current && current.title === title && current.content === content) {
        setSaveState("saved");
        return true;
      }

      setSaveState("saving");
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from("notes")
        .update({ title, content, updated_at: updatedAt })
        .eq("id", noteId);

      if (error) {
        setSaveState("error");
        setFeedback(`Nao foi possivel salvar a nota: ${error.message}`);
        return false;
      }

      setNotes((prev) =>
        prev
          .map((note) =>
            note.id === noteId
              ? {
                ...note,
                title,
                content,
                updated_at: updatedAt,
              }
              : note,
          )
          .sort(sortNotesByUpdated),
      );
      setSaveState("saved");
      return true;
    },
    [notes],
  );

  const queuePersist = useCallback(
    (noteId: string, title: string, content: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState("saving");
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void persistNote(noteId, title, content);
      }, 550);
    },
    [persistNote],
  );

  const flushPendingSave = useCallback(async () => {
    const noteId = latestSelectedRef.current;
    if (!noteId) return;
    if (!saveTimerRef.current) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    await persistNote(
      noteId,
      latestDraftRef.current.title,
      latestDraftRef.current.content,
    );
  }, [persistNote]);

  const createBlankNote = useCallback(
    async (forcedUserId?: string, initialTitle = "") => {
      const resolvedUserId = forcedUserId || userId;
      if (!resolvedUserId) return null;

      const { data, error } = await supabase
        .from("notes")
        .insert({
          user_id: resolvedUserId,
          title: initialTitle,
          content: "",
        })
        .select("*")
        .single();

      if (error) {
        setFeedback(`Nao foi possivel criar nota: ${error.message}`);
        return null;
      }

      return data as NoteRow;
    },
    [userId],
  );

  const loadAttachments = useCallback(async (noteId: string) => {
    setLoadingAttachments(true);

    const { data, error } = await supabase
      .from("note_files")
      .select("*")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false });

    if (error) {
      setFeedback(`Nao foi possivel carregar anexos: ${error.message}`);
      setAttachments([]);
      setLoadingAttachments(false);
      return;
    }

    const rows = ((data as NoteFileRow[]) || []);
    const withSignedUrls = await Promise.all(
      rows.map(async (row) => {
        const { data: signedData, error: signedError } = await supabase
          .storage
          .from(NOTE_BUCKET)
          .createSignedUrl(row.file_path, 60 * 60);

        return {
          ...row,
          signedUrl: signedError ? null : signedData.signedUrl,
        } as NoteFileView;
      }),
    );

    if (latestSelectedRef.current === noteId) {
      setAttachments(withSignedUrls);
    }
    setLoadingAttachments(false);
  }, []);

  const loadNotes = useCallback(async () => {
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

    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      setLoading(false);
      setFeedback(`Nao foi possivel carregar notas: ${error.message}`);
      return;
    }

    let rows = ((data as NoteRow[]) || []).sort(sortNotesByUpdated);
    if (!rows.length) {
      const created = await createBlankNote(user.id, "Minha primeira nota");
      if (created) rows = [created];
    }

    setNotes(rows);

    if (rows.length) {
      const first = rows[0];
      setSelectedNoteId(first.id);
      setDraftFromNote(first);
      void loadAttachments(first.id);
      requestAnimationFrame(() => editorRef.current?.focus());
    }

    setLoading(false);
  }, [createBlankNote, loadAttachments, setDraftFromNote]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const noteId = latestSelectedRef.current;
      if (noteId) {
        void persistNote(
          noteId,
          latestDraftRef.current.title,
          latestDraftRef.current.content,
        );
      }
    };
  }, [persistNote]);

  useEffect(() => {
    if (!selectedNoteId) return;

    const current = notes.find((note) => note.id === selectedNoteId);
    if (!current) return;
    if (current.title === draftTitle && current.content === draftContent) return;

    queuePersist(selectedNoteId, draftTitle, draftContent);
  }, [draftTitle, draftContent, selectedNoteId, notes, queuePersist]);

  const handleSelectNote = async (note: NoteRow) => {
    if (note.id === selectedNoteId) return;
    await flushPendingSave();
    setSelectedNoteId(note.id);
    setDraftFromNote(note);
    setAttachments([]);
    void loadAttachments(note.id);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const handleCreateNote = async () => {
    await flushPendingSave();
    const created = await createBlankNote(undefined, `Nova nota ${notes.length + 1}`);
    if (!created) return;

    setNotes((prev) => [created, ...prev].sort(sortNotesByUpdated));
    setSelectedNoteId(created.id);
    setDraftFromNote(created);
    setAttachments([]);
    setSaveState("idle");
    setFeedback(null);
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

    setDeletingNoteId(selectedNote.id);
    setFeedback(null);

    const { data: files } = await supabase
      .from("note_files")
      .select("file_path")
      .eq("note_id", selectedNote.id);

    const filePaths = (files || [])
      .map((file) => (file as { file_path: string }).file_path)
      .filter(Boolean);

    if (filePaths.length) {
      await supabase.storage.from(NOTE_BUCKET).remove(filePaths);
    }

    const { error } = await supabase
      .from("notes")
      .delete()
      .eq("id", selectedNote.id);

    if (error) {
      setDeletingNoteId(null);
      setFeedback(`Nao foi possivel excluir nota: ${error.message}`);
      return;
    }

    let remaining = notes.filter((note) => note.id !== selectedNote.id);
    if (!remaining.length) {
      const created = await createBlankNote(userId);
      if (created) remaining = [created];
    }
    remaining = [...remaining].sort(sortNotesByUpdated);
    setNotes(remaining);

    if (remaining.length) {
      const next = remaining[0];
      setSelectedNoteId(next.id);
      setDraftFromNote(next);
      void loadAttachments(next.id);
    } else {
      setSelectedNoteId(null);
      setDraftTitle("");
      setDraftContent("");
      setAttachments([]);
    }

    setDeletingNoteId(null);
    setSaveState("idle");
  };

  const handleAttachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !selectedNoteId || !userId) return;

    setUploadingFiles(true);
    setFeedback(null);

    const failures: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        failures.push(`${file.name}: acima de 20MB`);
        continue;
      }

      const safeName = sanitizeFileName(file.name);
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = `${userId}/${selectedNoteId}/${unique}-${safeName}`;

      const { error: uploadError } = await supabase
        .storage
        .from(NOTE_BUCKET)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        failures.push(`${file.name}: falha no upload`);
        continue;
      }

      const { error: insertError } = await supabase
        .from("note_files")
        .insert({
          note_id: selectedNoteId,
          user_id: userId,
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        });

      if (insertError) {
        await supabase.storage.from(NOTE_BUCKET).remove([filePath]);
        failures.push(`${file.name}: falha ao registrar`);
      }
    }

    await loadAttachments(selectedNoteId);
    setUploadingFiles(false);
    event.target.value = "";

    if (!failures.length) {
      setFeedback("Arquivos anexados com sucesso.");
      return;
    }

    setFeedback(`Alguns anexos falharam: ${failures.slice(0, 3).join(" | ")}`);
  };

  const handleDeleteAttachment = async (attachment: NoteFileView) => {
    const confirmed = window.confirm(`Remover anexo "${attachment.file_name}"?`);
    if (!confirmed) return;

    setDeletingAttachmentId(attachment.id);
    setFeedback(null);

    await supabase.storage.from(NOTE_BUCKET).remove([attachment.file_path]);
    const { error } = await supabase
      .from("note_files")
      .delete()
      .eq("id", attachment.id);

    if (error) {
      setDeletingAttachmentId(null);
      setFeedback(`Nao foi possivel remover anexo: ${error.message}`);
      return;
    }

    setAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
    setDeletingAttachmentId(null);
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
                  Anexar arquivo
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
            </div>

            <div className="mt-4 rounded-xl border border-violet-300/15 bg-slate-950/45 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Anexos</h3>
                {loadingAttachments ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
              </div>

              {!attachments.length ? (
                <p className="text-xs text-slate-500">Sem anexos nesta nota.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => {
                    const isImage = (attachment.mime_type || "").startsWith("image/");
                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-violet-300/10 bg-black/30 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {isImage ? (
                              <ImageIcon className="h-4 w-4 text-cyan-300" />
                            ) : (
                              <File className="h-4 w-4 text-slate-300" />
                            )}
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
