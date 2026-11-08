import { SetupForm } from "../components/SetupForm.js";
import { ExtensionSetupNotice } from "../components/ExtensionSetupNotice.js";
import { isExtensionPage } from "../lib/settings.js";

export function SetupPage() {
  // Inside the extension, setup happens on the extension's settings page.
  if (isExtensionPage()) return <ExtensionSetupNotice />;
  return (
    <main data-testid="setup-page" className="min-h-screen">
      <SetupForm />
    </main>
  );
}
