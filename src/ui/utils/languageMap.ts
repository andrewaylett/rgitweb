/** Extension (lowercase, without the dot) -> highlight.js language alias. */
const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  sql: "sql",
  php: "php",
  pl: "perl",
  lua: "lua",
  r: "r",
  scala: "scala",
  gradle: "gradle",
  dockerfile: "dockerfile",
  makefile: "makefile",
  diff: "diff",
  patch: "diff",
};

const FILENAME_LANGUAGE: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  ".gitignore": "plaintext",
};

/** Best-effort language guess from a file name, for highlight.js. */
export function guessLanguage(filename: string): string | undefined {
  const base = (filename.split("/").pop() ?? filename).toLowerCase();
  if (FILENAME_LANGUAGE[base]) {
    return FILENAME_LANGUAGE[base];
  }
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return undefined;
  }
  const ext = base.slice(dot + 1);
  return EXTENSION_LANGUAGE[ext];
}

export function isMarkdown(filename: string): boolean {
  return guessLanguage(filename) === "markdown";
}
