import { useEffect, useMemo, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import {
  tasksList,
  tasksAdd,
  tasksToggle,
  tasksDelete,
  type Task,
} from "./bridge";

/**
 * Tasks tab: a to-do list. Loads on mount, mutates via the bridge (Rust owns
 * the file). Mutations are OPTIMISTIC — the UI updates immediately and the
 * authoritative list from Rust replaces it when the call resolves, so rapid
 * toggles feel instant instead of lagging a round-trip each time. A failed load
 * shows a real error state rather than silently looking empty.
 */
export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    tasksList()
      .then((l) => alive && setTasks(l.tasks))
      .catch(() => {
        if (!alive) return;
        setError(true);
        setTasks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const remaining = useMemo(
    () => (tasks ? tasks.filter((x) => !x.done).length : 0),
    [tasks]
  );
  const hasDone = useMemo(
    () => (tasks ? tasks.some((x) => x.done) : false),
    [tasks]
  );

  function add() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    // Optimistic: show the task right away with a temporary id.
    const temp: Task = {
      id: `tmp-${Date.now()}`,
      title,
      done: false,
      createdAt: Date.now(),
    };
    setTasks((cur) => [...(cur ?? []), temp]);
    void tasksAdd(title)
      .then((l) => setTasks(l.tasks))
      .catch(() => setError(true));
  }

  function toggle(task: Task) {
    // Optimistic flip, then reconcile with the server's list.
    setTasks((cur) =>
      (cur ?? []).map((x) => (x.id === task.id ? { ...x, done: !x.done } : x))
    );
    void tasksToggle(task.id)
      .then((l) => setTasks(l.tasks))
      .catch(() => setError(true));
  }

  function remove(id: string) {
    setTasks((cur) => (cur ?? []).filter((x) => x.id !== id));
    void tasksDelete(id)
      .then((l) => setTasks(l.tasks))
      .catch(() => setError(true));
  }

  function clearDone() {
    const done = (tasks ?? []).filter((x) => x.done);
    setTasks((cur) => (cur ?? []).filter((x) => !x.done));
    // Delete each completed task; the last response is the source of truth.
    done.reduce(
      (p, task) => p.then(() => tasksDelete(task.id)),
      Promise.resolve<unknown>(null)
    )
      .then(() => tasksList())
      .then((l) => setTasks(l.tasks))
      .catch(() => setError(true));
  }

  if (!tasks) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  if (error && tasks.length === 0) {
    return (
      <div class="islet-empty" role="alert">
        <Icon name="checklist" size={22} class="islet-empty-icon" />
        <span>{t("tasks.error")}</span>
      </div>
    );
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
          aria-label={t("tasks.add")}
        />
        <button
          type="submit"
          class="islet-add-btn"
          aria-label={t("tasks.addAction")}
          title={t("tasks.addAction")}
          disabled={!draft.trim()}
        >
          <Icon name="plus" size={18} />
        </button>
      </form>

      {tasks.length === 0 ? (
        <div class="islet-empty">
          <Icon name="checklist" size={22} class="islet-empty-icon" />
          <span>{t("tasks.empty")}</span>
        </div>
      ) : (
        <>
          <ul class="islet-items">
            {tasks.map((task) => (
              <li key={task.id} class={`islet-item${task.done ? " done" : ""}`}>
                <label class="islet-check">
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => toggle(task)}
                  />
                  <span class="islet-checkbox" aria-hidden="true" />
                  <span>{task.title}</span>
                </label>
                <button
                  class="islet-icon-btn"
                  aria-label={t("tasks.delete")}
                  title={t("tasks.delete")}
                  onClick={() => remove(task.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div class="islet-list-footer">
            <span>
              {remaining === 0
                ? t("tasks.allDone")
                : t("tasks.remaining", { n: remaining })}
            </span>
            {hasDone ? (
              <button class="islet-text-btn" onClick={clearDone}>
                {t("tasks.clearDone")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
