import { ulid } from "ulid";

export function newUlid(): string {
  return ulid();
}
