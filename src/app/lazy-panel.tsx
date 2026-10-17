import { useEffect, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import { t } from "../ui/i18n";
import { TAB_LOADERS, type TabId } from "./tabs";

// Loads a tab's panel on demand (dynamic import) and renders loading + error
// states so a slow or failed import never shows a blank panel.
export function LazyPanel({ id }: { id: TabId }) {
  const [Comp, setComp] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setComp(null);
    setFailed(false);
    TAB_LOADERS[id]()
      .then((m) => {
        if (alive) setComp(() => m.default);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (failed) {
    return <div class="islet-empty">{t("common.error")}</div>;
  }
  if (!Comp) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }
  return <Comp />;
}
