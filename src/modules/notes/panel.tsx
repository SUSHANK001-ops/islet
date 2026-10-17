import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  notesList,
  notesAdd,
  notesUpdate,
  notesDelete,
  type Note,
} from "./bridge";

/**
 * Notes tab: quick notes. Add from the top box; edit inline (saves on blur);
 * delete per note. Rust owns the file. Loading + empty states included.
 */
export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    notesList()
      .then((l) => alive && setNotes(l.notes))
      .catch(() => alive && setNotes([]));
    return () => {
      alive = false;
    };
  }, []);

  function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void notesAdd(text).then((l) => setNotes(l.notes));
  }

  if (!notes) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  return (
    <div class="islet-list">
      <form
        class="islet-add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <textarea
          class="islet-input islet-textarea"
          placeholder={t("notes.add")}
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          rows={2}
        />
      </form>

      {notes.length === 0 ? (
        <div class="islet-empty">{t("notes.empty")}</div>
      ) : (
        <ul class="islet-items">
          {notes.map((note) => (
            <li key={note.id} class="islet-note">
              <textarea
                class="islet-input islet-textarea"
                value={note.text}
                rows={2}
                onBlur={(e) => {
                  const text = e.currentTarget.value;
                  if (text !== note.text) {
                    void notesUpdate(note.id, text).then((l) => setNotes(l.notes));
                  }
                }}
              />
              <button
                class="islet-icon-btn"
                aria-label={t("notes.delete")}
                onClick={() =>
                  void notesDelete(note.id).then((l) => setNotes(l.notes))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
