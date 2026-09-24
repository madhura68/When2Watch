import { convert } from "html-to-text";

export function summaryText(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    return convert(input, {
      wordwrap: false,
      selectors: [
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "img", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
      ],
    }).replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim() || null;
  } catch {
    return null;
  }
}
