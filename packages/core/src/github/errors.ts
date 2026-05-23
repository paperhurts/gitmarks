export class GitHubError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

export class GitHubAuthError extends GitHubError {
  constructor(message = "GitHub authentication failed") {
    super(message, 401);
    this.name = "GitHubAuthError";
  }
}

export class GitHubConflictError extends GitHubError {
  readonly path: string;

  constructor(path: string, status = 409) {
    super(`conflict writing ${path}`, status);
    this.name = "GitHubConflictError";
    this.path = path;
  }
}

export class GitHubNotFoundError extends GitHubError {
  readonly path: string;

  constructor(path: string) {
    super(`not found: ${path}`, 404);
    this.name = "GitHubNotFoundError";
    this.path = path;
  }
}
