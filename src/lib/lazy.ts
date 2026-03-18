import { lazy, type ComponentType } from "react";

const LAZY_RELOAD_PREFIX = "magisterludi:lazy-reload";

function currentReloadKey() {
  if (typeof window === "undefined") {
    return null;
  }

  return `${LAZY_RELOAD_PREFIX}:${window.location.pathname}${window.location.search}`;
}

function clearReloadMarker() {
  const key = currentReloadKey();
  if (!key || typeof window === "undefined") return;
  window.sessionStorage.removeItem(key);
}

function isChunkLoadError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error ?? "")
          .toLowerCase()
          .trim();

  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("failed to import") ||
    message.includes("chunk")
  );
}

export function lazyImportComponent<
  TComponent extends ComponentType<any>,
  TModule extends Record<string, unknown> = Record<string, unknown>
>(loader: () => Promise<TModule>, exportName: keyof TModule) {
  return lazy(async () => {
    try {
      const module = await loader();
      clearReloadMarker();

      return {
        default: module[exportName] as TComponent
      };
    } catch (error) {
      const reloadKey = currentReloadKey();

      if (reloadKey && typeof window !== "undefined" && isChunkLoadError(error)) {
        const hasReloaded = window.sessionStorage.getItem(reloadKey) === "1";

        if (!hasReloaded) {
          window.sessionStorage.setItem(reloadKey, "1");
          window.location.reload();

          return new Promise<never>(() => {
            // Stop rendering while the page reloads to fetch the new chunk map.
          });
        }
      }

      throw error;
    }
  });
}
