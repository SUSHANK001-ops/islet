import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import {
  notesList,
  notesAdd,
  notesUpdate,
  notesDelete,
  type Note,
} from "./bridge";

/**
 * Notes tab: quick notes. Add from the top box (Enter adds, Shift+Enter makes a
 * new line); edit inline with a short debounce autosave AND a save-on-blur
 * safety net; delete per note.
 *
 * WHY the add box needed fixing: it was a multi-line <textarea> in a <form>
 * with no submit button, so Enter inserted a newline and never submitted —
 * there was no way to add a note from the keyboard at all. It now treats Enter
 * as "add" and Shift+Enter as "new line", with a visible add button too.
 */
export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState("");
  // Per-note "Saved" flash timers so edits give feedback without a toast.
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounce autosave per note so typing does not hammer the backend.
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  // Only the latest save response may replace local text; an older request can
  // otherwise arrive late and visibly rewind what the user just typed.
  const saveVersions = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let alive = true;
    notesList()
      .then((l) => alive && setNotes(l.notes))
      .catch(() => {
        if (!alive) return;
        setError(true);
        setNotes([]);
      });
    return () => {
      alive = false;
      saveTimers.current.forEach((h) => clearTimeout(h));
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const temp: Note = { id: `tmp-${Date.now()}`, text, updatedAt: Date.now() };
    setNotes((cur) => [temp, ...(cur ?? [])]);
    void notesAdd(text)
      .then((l) => setNotes(l.notes))
      .catch(() => setError(true));
  }

  function flashSaved(id: string) {
    setSavedId(id);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedId(null), 1200);
  }

  function persist(id: string, text: string) {
    const version = (saveVersions.current.get(id) ?? 0) + 1;
    saveVersions.current.set(id, version);
    void notesUpdate(id, text)
      .then((l) => {
        if (saveVersions.current.get(id) !== version) return;
        setNotes(l.notes);
        flashSaved(id);
      })
      .catch(() => setError(true));
  }

  function edit(note: Note, text: string) {
    // Update locally so the textarea stays controlled and responsive.
    setNotes((cur) =>
      (cur ?? []).map((n) => (n.id === note.id ? { ...n, text } : n))
    );
    // Debounced autosave (700ms after the last keystroke).
    const timers = saveTimers.current;
    const existing = timers.get(note.id);
    if (existing) clearTimeout(existing);
    timers.set(
      note.id,
      setTimeout(() => {
        timers.delete(note.id);
        persist(note.id, text);
      }, 700)
    );
  }

  function saveNow(note: Note, text: string) {
    // Blur safety net: flush a pending debounce immediately. The controlled
    // note already contains `text`, so comparing against note.text here would
    // cancel the only save and silently lose the edit.
    const timers = saveTimers.current;
    const existing = timers.get(note.id);
    if (!existing) return;
    clearTimeout(existing);
    timers.delete(note.id);
    persist(note.id, text);
  }

  function remove(id: string) {
    setNotes((cur) => (cur ?? []).filter((n) => n.id !== id));
    void notesDelete(id)
      .then((l) => setNotes(l.notes))
      .catch(() => setError(true));
  }

  if (!notes) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  if (error && notes.length === 0) {
    return (
      <div class="islet-empty" role="alert">
        <Icon name="note" size={22} class="islet-empty-icon" />
        <span>{t("notes.error")}</span>
      </div>
    );
  }

  return (
    <div class="islet-list">
      <form
        class="islet-add-row islet-add-row-notes"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <textarea
          class="islet-input islet-textarea"
          placeholder={t("notes.add")}
          value={draft}
          rows={2}
          aria-label={t("notes.add")}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter adds; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="submit"
          class="islet-add-btn"
          aria-label={t("notes.addAction")}
          title={t("notes.addAction")}
          disabled={!draft.trim()}
        >
          <Icon name="plus" size={18} />
        </button>
      </form>
      <p class="islet-input-hint">{t("notes.hint")}</p>

      {notes.length === 0 ? (
        <div class="islet-empty">
          <Icon name="note" size={22} class="islet-empty-icon" />
          <span>{t("notes.empty")}</span>
        </div>
      ) : (
        <ul class="islet-items">
          {notes.map((note) => (
            <li key={note.id} class="islet-note">
              <textarea
                class="islet-input islet-textarea"
                value={note.text}
                rows={2}
                onInput={(e) => edit(note, e.currentTarget.value)}
                onBlur={(e) => saveNow(note, e.currentTarget.value)}
              />
              <div class="islet-note-side">
                <button
                  class="islet-icon-btn"
                  aria-label={t("notes.delete")}
                  title={t("notes.delete")}
                  onClick={() => remove(note.id)}
                >
                  <Icon name="close" size={16} />
                </button>
                {savedId === note.id ? (
                  <span class="islet-saved-flag" role="status">
                    {t("notes.saved")}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
