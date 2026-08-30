/**
 * Public entry point of the Git data layer. UI code must import only from
 * here, not from any other module under `src/git/`.
 */

export * from "./types.js";

import { createRepositoryImpl } from "./repository.js";
import { createTransport, TransportError } from "./transport.js";
import {
  NotFoundError,
  RepositoryAccessError,
  type OpenOptions,
  type Repository,
} from "./types.js";

/**
 * Opens a dumb-HTTP git repository at `url`, validating that it looks like
 * one (an `info/refs` file is reachable and non-empty) before returning.
 */
export async function openRepository(
  url: string,
  options?: OpenOptions,
): Promise<Repository> {
  const baseUrl = url.replace(/\/+$/, "");
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const transport = createTransport(fetchImpl);

  let infoRefsText: string;
  try {
    infoRefsText = await transport.fetchText(`${baseUrl}/info/refs`);
  } catch (error) {
    if (error instanceof TransportError) {
      throw new RepositoryAccessError(
        `Could not reach ${baseUrl}`,
        "A network or CORS error occurred while fetching info/refs. Check that " +
          `the server at ${baseUrl} is reachable, and that it sends CORS headers ` +
          "permitting this origin (including exposing Accept-Ranges/Content-Range " +
          "for range requests against pack files).",
      );
    }
    if (error instanceof NotFoundError) {
      throw new RepositoryAccessError(
        `${baseUrl} does not look like a Git repository`,
        `No info/refs file was found at ${baseUrl}/info/refs. Run ` +
          "'git update-server-info' in the repository so it can be served over " +
          "dumb HTTP, and double-check the URL.",
      );
    }
    throw error;
  }

  if (infoRefsText.trim().length === 0) {
    throw new RepositoryAccessError(
      `${baseUrl} advertises no refs`,
      "info/refs was empty, which usually means this is not a Git repository, " +
        "or it has no branches or tags yet.",
    );
  }

  return createRepositoryImpl(baseUrl, transport);
}
