/**
 * Builds a small, deterministic git repository via the real `git` CLI, then
 * exposes it as a dumb-HTTP-style directory tree (HEAD, info/refs,
 * objects/...) for the fake-fetch fixtures to serve.
 *
 * The repo is built once per test run (memoised) since it involves several
 * `git` subprocess calls.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { definite } from "../../src/git/assert.js";

const BUILD_DIR = join(process.cwd(), "build", "test-fixtures");
const WORK_DIR = join(BUILD_DIR, "work");
export const REPO_DIR = join(BUILD_DIR, "repo.git");

// Jest runs each test file in its own worker process, and several of them
// build (or reuse) this fixture concurrently. `DONE_MARKER` records that a
// build finished; `LOCK_DIR` (an atomically-created directory) makes sure
// only one process builds it, while the others poll and then reuse it.
const DONE_MARKER = join(BUILD_DIR, ".fixture-complete");
const LOCK_DIR = join(BUILD_DIR, ".fixture-lock");

const AUTHOR_NAME = "Test Author";
const AUTHOR_EMAIL = "author@example.com";
const COMMITTER_NAME = "Test Committer";
const COMMITTER_EMAIL = "committer@example.com";

// All of these are fixed at authoring time (not derived from git output),
// so they can be reported without rebuilding when another process already
// built the fixture.
const LARGE_FILE_PATH = "assets/large.txt";
const CHANGED_FILE_PATH = "CHANGELOG.md";
const SUBDIR_FILE_PATH = "src/pkg/util.txt";
const SYMLINK_PATH = "link-to-readme";
const BRANCH_NAME = "feature-branch";
const LIGHTWEIGHT_TAG = "v0.1-lw";
const ANNOTATED_TAG = "v0.2-annotated";
const ANNOTATED_TAG_MESSAGE = "Release 0.2\n\nSee CHANGELOG.md for details.\n";

function fixtureMetadata(): FixtureRepo {
  return {
    repoDir: REPO_DIR,
    workDir: WORK_DIR,
    largeFilePath: LARGE_FILE_PATH,
    changedFilePath: CHANGED_FILE_PATH,
    subdirFilePath: SUBDIR_FILE_PATH,
    symlinkPath: SYMLINK_PATH,
    branchName: BRANCH_NAME,
    lightweightTag: LIGHTWEIGHT_TAG,
    annotatedTag: ANNOTATED_TAG,
    annotatedTagMessage: ANNOTATED_TAG_MESSAGE,
  };
}

// Fixed, incrementing timestamps for determinism and well-defined ordering.
let clock = 1_700_000_000;
function nextDate(): string {
  clock += 60;
  return `${clock} +0000`;
}

export interface FixtureRepo {
  readonly repoDir: string;
  readonly workDir: string;
  readonly largeFilePath: string;
  readonly changedFilePath: string;
  readonly subdirFilePath: string;
  readonly symlinkPath: string;
  readonly branchName: string;
  readonly lightweightTag: string;
  readonly annotatedTag: string;
  readonly annotatedTagMessage: string;
}

function git(args: string[]): string {
  const date = nextDate();
  return execFileSync("git", args, {
    cwd: WORK_DIR,
    env: {
      ...process.env,
      GIT_DIR: REPO_DIR,
      GIT_WORK_TREE: WORK_DIR,
      GIT_AUTHOR_NAME: AUTHOR_NAME,
      GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: COMMITTER_NAME,
      GIT_COMMITTER_EMAIL: COMMITTER_EMAIL,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
    encoding: "utf8",
  });
}

/** Runs a git command against the built fixture repo (for use from tests). */
export function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: WORK_DIR,
    env: {
      ...process.env,
      GIT_DIR: REPO_DIR,
      GIT_WORK_TREE: WORK_DIR,
    },
    encoding: "utf8",
  }).trim();
}

function commit(message: string): string {
  git(["add", "-A"]);
  git(["commit", "-m", message, "--allow-empty"]);
  return runGit(["rev-parse", "HEAD"]);
}

function write(relPath: string, content: string): void {
  const full = join(WORK_DIR, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

let fixturePromise: Promise<FixtureRepo> | undefined;

export function buildFixtureRepo(): Promise<FixtureRepo> {
  fixturePromise ??= Promise.resolve().then(() => buildFixtureRepoOnce());
  return fixturePromise;
}

/**
 * Builds the fixture repo, coordinating with other concurrently-running
 * Jest worker processes (each test file gets its own process) via a
 * filesystem lock so it is only actually built once.
 */
function buildFixtureRepoOnce(): FixtureRepo {
  if (existsSync(DONE_MARKER)) {
    return fixtureMetadata();
  }

  mkdirSync(BUILD_DIR, { recursive: true });

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      break; // we hold the lock
    } catch {
      if (existsSync(DONE_MARKER)) {
        return fixtureMetadata();
      }
      if (Date.now() > deadline) {
        throw new Error(
          "Timed out waiting for another process to build the fixture repo",
        );
      }
      execFileSync("sleep", ["0.2"]);
    }
  }

  try {
    if (existsSync(DONE_MARKER)) {
      // Another process finished while we were racing for the lock.
      return fixtureMetadata();
    }
    buildFixtureRepoSync();
    writeFileSync(DONE_MARKER, "done\n");
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }

  return fixtureMetadata();
}

function buildFixtureRepoSync(): void {
  rmSync(WORK_DIR, { recursive: true, force: true });
  rmSync(REPO_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", "-q"], {
    cwd: WORK_DIR,
    env: { ...process.env, GIT_DIR: REPO_DIR, GIT_WORK_TREE: WORK_DIR },
  });

  write("README.md", "Hello from the rgitweb test fixture.\n");
  write(CHANGED_FILE_PATH, "# Changelog\n\n## 0.1\n\nInitial release.\n");
  commit("Initial commit");

  write(SUBDIR_FILE_PATH, "a utility file\n");
  write("src/pkg/other.txt", "another file, untouched afterwards\n");
  commit("Add subdirectory with a couple of files");

  // A commit that does NOT touch the changed file, to make sure
  // path-filtered log correctly skips it.
  write("unrelated.txt", "nothing to see here\n");
  commit("Unrelated change");

  write(CHANGED_FILE_PATH, "# Changelog\n\n## 0.2\n\nSecond release.\n");
  commit("Update changelog for 0.2");

  symlinkSync("README.md", join(WORK_DIR, SYMLINK_PATH));
  commit("Add a symlink");

  git(["branch", BRANCH_NAME]);

  git(["tag", LIGHTWEIGHT_TAG]);

  // Large, moderately repetitive-but-varied file so that pack delta
  // compression kicks in against its later revision.
  write(LARGE_FILE_PATH, buildLargeText(200 * 1024, 1));
  commit("Add a large file");

  const featureBranch = "feature-for-merge";
  git(["checkout", "-q", "-b", featureBranch]);
  write("feature.txt", "work done on a feature branch\n");
  commit("Feature branch commit");
  git(["checkout", "-q", "main"]);

  // Modify the large file slightly, so its packed representation should
  // delta against the previous version.
  write(LARGE_FILE_PATH, buildLargeText(200 * 1024, 2));
  commit("Tweak the large file");

  git(["merge", "--no-ff", "-m", "Merge feature branch", featureBranch]);

  git(["tag", "-a", ANNOTATED_TAG, "-m", ANNOTATED_TAG_MESSAGE]);

  // Pack most objects, then add one more loose commit afterwards so both
  // the loose and packed read paths get exercised.
  git(["repack", "-a", "-d", "-q"]);

  write(CHANGED_FILE_PATH, "# Changelog\n\n## 0.3\n\nPost-repack release.\n");
  commit("Post-repack changelog update (stays loose)");

  git(["update-server-info"]);
}

function buildLargeText(minBytes: number, seed: number): string {
  const words = [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
    "india",
    "juliet",
    "kilo",
    "lima",
  ];
  let out = `seed:${seed}\n`;
  let n = seed;
  while (out.length < minBytes) {
    n = (n * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
    const word = definite(words[n % words.length], "word index out of range");
    out += word + " ";
    if (n % 17 === 0) {
      out += "\n";
    }
  }
  return out;
}
