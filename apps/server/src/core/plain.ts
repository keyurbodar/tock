/**
 * Markdown to the plain words a sidebar row or a notification shows: titles and previews are derived on the server,
 * so a message written as "# Plan **bold** *soft*" never reaches the client as markup. A reply's leading
 * tock-quote blockquote is context for the agent, so it never becomes the title or the preview.
 */
export function plainMarkdown(text: string): string {
  return text
    .replace(/^> \[(?:\\.|[^\]\\\n])*\]\(tock-quote:[^)\s]+\)[ \t]*\n*/, "")
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, "$1")
}
