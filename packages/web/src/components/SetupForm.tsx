import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveSettings, type Settings } from "../lib/settings.js";
import { validateConnection, type ValidateResult } from "../lib/client.js";

type ValidateFn = (settings: Settings) => Promise<ValidateResult>;

interface Props {
  validate?: ValidateFn;
}

const labelClass = "block text-sm text-cyan-soft mb-1";
const inputClass =
  "w-full px-3 py-2 bg-mist border border-fog rounded text-cyan-soft focus:border-cyan focus:outline-none";
const buttonClass =
  "px-4 py-2 rounded bg-cyan text-ink font-semibold hover:bg-cyan-soft disabled:opacity-40 disabled:cursor-not-allowed";

export function SetupForm({ validate = validateConnection }: Props) {
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(null);
  const navigate = useNavigate();

  const settings: Settings = { token, owner, repo, branch };
  const formComplete = token.length > 0 && owner.length > 0 && repo.length > 0 && branch.length > 0;

  async function onValidate() {
    setValidating(true);
    setValidated(false);
    setStatus(null);
    const result = await validate(settings);
    setValidating(false);
    if (result.status === "ok-with-files") {
      setStatus({ kind: "ok", message: "✓ valid PAT, repo + bookmarks.json found" });
      setValidated(true);
    } else if (result.status === "ok-no-files") {
      setStatus({ kind: "ok", message: "✓ valid PAT, repo exists (bookmarks.json will be created on first save)" });
      setValidated(true);
    } else if (result.status === "auth-failed") {
      setStatus({ kind: "err", message: "Invalid token — check PAT permissions" });
    } else if (result.status === "repo-not-found") {
      setStatus({ kind: "err", message: "Repo not found — check owner/repo/branch" });
    } else {
      setStatus({ kind: "err", message: `Network error: ${result.message}` });
    }
  }

  function onSave() {
    saveSettings(settings);
    navigate("/");
  }

  return (
    <form
      className="max-w-md mx-auto p-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (validated) onSave();
      }}
    >
      <h1 className="text-magenta text-2xl mb-4">Set up gitmarks</h1>

      <label>
        <span className={labelClass}>GitHub fine-grained PAT</span>
        <input
          aria-label="token"
          type="password"
          autoComplete="off"
          className={inputClass}
          value={token}
          onChange={(e) => { setToken(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <label>
        <span className={labelClass}>Owner</span>
        <input
          aria-label="owner"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={owner}
          onChange={(e) => { setOwner(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <label>
        <span className={labelClass}>Repo</span>
        <input
          aria-label="repo"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={repo}
          onChange={(e) => { setRepo(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <label>
        <span className={labelClass}>Branch</span>
        <input
          aria-label="branch"
          type="text"
          autoComplete="off"
          className={inputClass}
          value={branch}
          onChange={(e) => { setBranch(e.target.value); setValidated(false); setStatus(null); }}
        />
      </label>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          className={`${buttonClass} bg-fog text-cyan-soft`}
          disabled={!formComplete || validating}
          onClick={onValidate}
        >
          {validating ? "Validating…" : "Validate"}
        </button>
        <button
          type="submit"
          className={buttonClass}
          disabled={!validated}
        >
          Save
        </button>
      </div>

      {status && (
        <p className={status.kind === "ok" ? "text-cyan" : "text-magenta"}>
          {status.message}
        </p>
      )}
    </form>
  );
}
