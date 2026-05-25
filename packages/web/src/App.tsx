import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { useMemo } from "react";
import { loadSettings } from "./lib/settings.js";
import { SetupPage } from "./routes/SetupPage.js";
import { ListPage } from "./routes/ListPage.js";
import { TagsPage } from "./routes/TagsPage.js";

export function RequireSettings() {
  const settings = loadSettings();
  if (settings == null) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

export function App() {
  const router = useMemo(
    () =>
      createHashRouter([
        { path: "/setup", element: <SetupPage /> },
        {
          element: <RequireSettings />,
          children: [
            { path: "/", element: <ListPage /> },
            { path: "/tags", element: <TagsPage /> },
          ],
        },
      ]),
    [],
  );
  return <RouterProvider router={router} />;
}
