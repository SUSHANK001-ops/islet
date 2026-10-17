import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  tasksList,
  tasksAdd,
  tasksToggle,
  tasksDelete,
  type Task,
} from "./bridge";

/**
 * Tasks tab: a to-do list. Loads on mount, mutates via the bridge (Rust owns
 * the file). Shows loading, empty, and (implicit) error-free states.
 */
export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    tasksList()
      .then((l) => alive && setTasks(l.tasks))
      .catch(() => alive && setTasks([]));
    return () => {
      alive = false;
    };
  }, []);

  function add() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    void tasksAdd(title).then((l) => setTasks(l.tasks));
  }

  if (!tasks) {
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
        <input
          class="islet-input"
          placeholder={t("tasks.add")}
          value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
      </form>

      {tasks.length === 0 ? (
        <div class="islet-empty">{t("tasks.empty")}</div>
      ) : (
        <ul class="islet-items">
          {tasks.map((task) => (
            <li key={task.id} class={`islet-item${task.done ? " done" : ""}`}>
              <label class="islet-check">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() =>
                    void tasksToggle(task.id).then((l) => setTasks(l.tasks))
                  }
                />
                <span>{task.title}</span>
              </label>
              <button
                class="islet-icon-btn"
                aria-label={t("tasks.delete")}
                onClick={() =>
                  void tasksDelete(task.id).then((l) => setTasks(l.tasks))
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
