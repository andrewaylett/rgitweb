import { Link } from "react-router-dom";

import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { summaryPath } from "../paths.js";
import { featuredRepos } from "../featuredRepos.js";

export function StartPage() {
  useDocumentTitle("rgitweb");

  return (
    <div className="page start-page">
      <h1>rgitweb</h1>
      <p>
        A fully static, client-side Git repository browser — no server-side
        logic involved. It reads a repository's dumb-HTTP layout (
        <code>info/refs</code>, loose objects, and pack files fetched with HTTP
        Range requests) straight from the browser, so the host must serve it
        over CORS (including{" "}
        <code>Access-Control-Expose-Headers: Accept-Ranges, Content-Range</code>
        ). Most Git hosts don't, which is why this page lists only repositories
        configured for this deployment rather than taking an arbitrary URL.
      </p>
      {featuredRepos.length > 0 ? (
        <section>
          <h2>Repositories</h2>
          <ul className="featured-list">
            {featuredRepos.map((repo) => (
              <li key={repo.url}>
                <Link to={summaryPath(repo.url)}>{repo.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p>
          No repositories are configured for this deployment. See{" "}
          <code>src/ui/featuredRepos.ts</code> in the rgitweb source for how to
          add one.
        </p>
      )}
    </div>
  );
}
