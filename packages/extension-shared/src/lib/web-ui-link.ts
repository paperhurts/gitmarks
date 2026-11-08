/** Where each shell's build puts the bundled web UI (scripts/copy-web.mjs). */
export const WEB_UI_PATH = "web/index.html";

export interface WebUiLinkDeps {
  getURL: (path: string) => string;
  openTab: (url: string) => unknown;
  closePopup: () => void;
}

/**
 * Point the popup's "Open web UI" link at the copy of the web UI bundled in
 * the extension. That page runs on the extension's own origin, so it reads
 * the settings the user already entered here instead of asking for the PAT a
 * second time (the public github.io site can't see extension storage).
 *
 * The static href in popup.html (the public site) stays as a fallback if this
 * never runs. Opened via tabs.create because a plain link from a popup to an
 * extension page isn't reliable across browsers; that needs no permission.
 */
export function wireWebUiLink(link: HTMLAnchorElement | null, deps: WebUiLinkDeps): void {
  if (link == null) return;
  const url = deps.getURL(WEB_UI_PATH);
  link.href = url;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    void deps.openTab(url);
    deps.closePopup();
  });
}
