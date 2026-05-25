import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useOutletContext,
} from "react-router-dom";
import { useMemo } from "react";
import { loadSettings, type Settings } from "./lib/settings.js";
import { makeClient } from "./lib/client.js";
import type { GitHubClient } from "@gitmarks/core";
import { SetupPage } from "./routes/SetupPage.js";
import { ListPage } from "./routes/ListPage.js";
import { TagsPage } from "./routes/TagsPage.js";

interface AppContext {
  settings: Settings;
  client: GitHubClient;
}

// Exported for tests, which compose <RequireSettings/> under a MemoryRouter to
// sidestep a Node 24 / undici / jsdom AbortSignal incompatibility that breaks
// createHashRouter under test. Production wiring is in App() below.
export function RequireSettings() {
  const settings = loadSettings();
  // useMemo keyed on settings fields so client identity is stable across renders.
  // useGitmarksData's effect deps include the client; an unstable client re-fires the load.
  const client = useMemo(
    () => (settings != null ? makeClient(settings) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.token, settings?.owner, settings?.repo, settings?.branch],
  );
  if (settings == null || client == null) return <Navigate to="/setup" replace />;
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
          ],
        },
      ]),
    [],
  );
  return <RouterProvider router={router} />;
}
