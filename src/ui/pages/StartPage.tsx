import { useState, type SyntheticEvent } from "react";

import { Link, useNavigate } from "react-router-dom";

import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { summaryPath } from "../paths.js";
import {
  addRecentRepo,
  loadRecentRepos,
  removeRecentRepo,
} from "../utils/recentRepos.js";

export function StartPage() {
  useDocumentTitle("rgitweb");
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [recents, setRecents] = useState(() => loadRecentRepos());

  const openRepo = (repoUrl: string) => {
    const trimmed = repoUrl.trim().replace(/\/+$/, "");
    if (!trimmed) {
      return;
    }
    addRecentRepo(trimmed);
    void navigate(summaryPath(trimmed));
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    openRepo(url);
  };

  const handleForget = (repoUrl: string) => {
    removeRecentRepo(repoUrl);
    setRecents(loadRecentRepos());
  };

  return (
    <div className="page start-page">
      <h1>rgitweb</h1>
      <p>
        Browse a Git repository straight from a static, dumb-HTTP host — no
        server-side logic involved. Point this at the base URL of a bare
        repository that has been prepared with{" "}
        <code>git update-server-info</code> and served with CORS enabled
        (including{" "}
        <code>Access-Control-Expose-Headers: Accept-Ranges, Content-Range</code>
        ).
      </p>
      <form onSubmit={handleSubmit} className="repo-form">
        <label htmlFor="repo-url">Repository URL</label>
        <input
          id="repo-url"
          type="url"
          required
          placeholder="https://example.com/path/to/repo.git"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
          }}
        />
        <button type="submit">Open</button>
      </form>
      {recents.length > 0 && (
        <section>
          <h2>Recent repositories</h2>
          <ul className="recent-list">
            {recents.map((entry) => (
              <li key={entry.url}>
                <Link
                  to={summaryPath(entry.url)}
                  onClick={() => {
                    addRecentRepo(entry.url);
                  }}
                >
                  {entry.url}
                </Link>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    handleForget(entry.url);
                  }}
                >
                  forget
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
