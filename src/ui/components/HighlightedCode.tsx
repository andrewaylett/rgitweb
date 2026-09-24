import { useAsync } from "../hooks/useAsync.js";
import { guessLanguage } from "../utils/languageMap.js";

const MAX_HIGHLIGHT_BYTES = 500 * 1024;

export function HighlightedCode({
  text,
  filename,
}: {
  readonly text: string;
  readonly filename: string;
}) {
  const language = guessLanguage(filename);
  const state = useAsync(async () => {
    if (text.length > MAX_HIGHLIGHT_BYTES) {
      return;
    }
    const { default: hljs } = await import("highlight.js");
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(text, { language }).value;
      }
      return hljs.highlightAuto(text).value;
    } catch {
      return;
    }
  }, [text, language]);

  const lineCount = text.length === 0 ? 1 : text.split("\n").length;
  const html = state.status === "success" ? state.data : undefined;

  return (
    <div className="code-block">
      <pre className="line-numbers" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => index + 1).join("\n")}
      </pre>
      <pre
        className="code hljs"
        dangerouslySetInnerHTML={{ __html: html ?? escapeHtml(text) }}
      />
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
