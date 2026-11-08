import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useOutletContext,
} from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  isExtensionPage,
  loadExtensionSettings,
  loadSettings,
  type Settings,
} from "./lib/settings.js";
import { ExtensionSetupNotice } from "./components/ExtensionSetupNotice.js";
import { makeClient } from "./lib/client.js";
import type { GitHubClient } from "@gitmarks/core";
import { SetupPage } from "./routes/SetupPage.js";
import { ListPage } from "./routes/ListPage.js";
import { TagsPage } from "./routes/TagsPage.js";
import { TrashPage } from "./routes/TrashPage.js";

interface AppContext {
  settings: Settings;
  client: GitHubClient;
}

// Exported for tests, which compose <RequireSettings/> under a MemoryRouter to
// sidestep a Node 24 / undici / jsdom AbortSignal incompatibility that breaks
// createHashRouter under test. Production wiring is in App() below.
export function RequireSettings() {
  // On the public site settings live in localStorage and load synchronously.
  // In the copy bundled with the extension they come from the extension's
  // storage.local (async), so the user never sets up twice.
  const inExtension = isExtensionPage();
  const [settings, setSettings] = useState<Settings | null | undefined>(() =>
    inExtension ? undefined : loadSettings(),
  );
  useEffect(() => {
    if (!inExtension) return;
    let live = true;
    loadExtensionSettings().then(
      (s) => live && setSettings(s),
      (err) => {
        console.error("[gitmarks] reading extension settings failed", err);
        if (live) setSettings(null);
      },
    );
    return () => {
      live = false;
    };
  }, [inExtension]);
  // useMemo keyed on settings fields so client identity is stable across renders.
  // useGitmarksData's effect deps include the client; an unstable client re-fires the load.
  const client = useMemo(
    () => (settings != null ? makeClient(settings) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.token, settings?.owner, settings?.repo, settings?.branch],
  );
  if (settings === undefined) {
    return <p className="p-6 text-sm text-cyan-soft">loading…</p>;
  }
  if (settings == null || client == null) {
    return inExtension ? <ExtensionSetupNotice /> : <Navigate to="/setup" replace />;
  }
  const ctx: AppContext = { settings, client };
  return <Outlet context={ctx} />;
}

export function useAppContext(): AppContext {
  return useOutletContext<AppContext>();
}

function ListPageWithContext() {
  const { client } = useAppContext();
  return <ListPage client={client} />;
}

function TagsPageWithContext() {
  const { client } = useAppContext();
  return <TagsPage client={client} />;
}

function TrashPageWithContext() {
  const { client } = useAppContext();
  return <TrashPage client={client} />;
}

export function App() {
  const router = useMemo(
    () =>
      createHashRouter([
        { path: "/setup", element: <SetupPage /> },
        {
          element: <RequireSettings />,
          children: [
            { path: "/", element: <ListPageWithContext /> },
            { path: "/tags", element: <TagsPageWithContext /> },
            { path: "/trash", element: <TrashPageWithContext /> },
          ],
        },
      ]),
    [],
  );
  return <RouterProvider router={router} />;
}
