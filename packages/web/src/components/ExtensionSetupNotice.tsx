import { openExtensionOptions } from "../lib/settings.js";

/**
 * Shown instead of the PAT form when this page is the copy bundled in the
 * browser extension: setup belongs to the extension's settings page, and the
 * web UI then reads those same settings (no second setup).
 */
export function ExtensionSetupNotice() {
  return (
    <main data-testid="extension-setup-notice" className="min-h-screen">
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h1 className="text-magenta text-2xl mb-4">gitmarks isn&apos;t set up yet</h1>
        <p className="text-sm text-cyan-soft">
          Connect your GitHub repo in the extension&apos;s settings. This page uses the same
          settings, so you only do it once.
        </p>
        <button
          type="button"
          onClick={() => openExtensionOptions()}
          className="px-4 py-2 rounded border border-cyan text-cyan hover:bg-cyan hover:text-ink"
        >
          Open gitmarks settings
        </button>
      </div>
    </main>
  );
}
