import type { GitHubClient } from "@gitmarks/core";

interface Props {
  client: GitHubClient;
}

export function TagsPage(_props: Props) {
  return (
    <section data-testid="tags-page">
      <h1 className="text-cyan text-2xl">Tags</h1>
    </section>
  );
}
