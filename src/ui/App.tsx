import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { BlobPage } from "./pages/BlobPage.js";
import { CommitPage } from "./pages/CommitPage.js";
import { LogPage } from "./pages/LogPage.js";
import { RefsPage } from "./pages/RefsPage.js";
import { RepoLayout } from "./pages/RepoLayout.js";
import { StartPage } from "./pages/StartPage.js";
import { SummaryPage } from "./pages/SummaryPage.js";
import { TreePage } from "./pages/TreePage.js";
import "./styles.css";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/r/:repoUrl" element={<RepoLayout />}>
          <Route index element={<Navigate to="summary" replace />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="refs" element={<RefsPage />} />
          <Route path="log/:ref" element={<LogPage />} />
          <Route path="commit/:oid" element={<CommitPage />} />
          <Route path="tree/:ref/*" element={<TreePage />} />
          <Route path="blob/:ref/*" element={<BlobPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
