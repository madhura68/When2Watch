import { describe, expect, it } from "vitest";
import { summaryText } from "@/server/summary-text";

describe("summary text for local display", () => {
  it("keeps readable paragraphs, Unicode and entities without active markup or asset URLs", () => {
    expect(summaryText('<p>Zoë &amp; café&nbsp;– <b>MI5</b>.</p><p>Lees <a href="https://example.test/tracker">verder</a>.<img src="https://example.test/image" alt="asset"><script>alert("secret")</script><style>p{color:red}</style></p>'))
      .toBe("Zoë & café – MI5.\n\nLees verder.");
  });
  it("normalizes spaces and retains plain text instead of interpreting encoded tags twice", () => {
    expect(summaryText("<p>  Een   titel </p><p> &lt;b&gt;tekst&lt;/b&gt; </p>"))
      .toBe("Een titel\n\n<b>tekst</b>");
  });
  it.each([null, undefined, 45, [], {}, "", " \n ", "<p> </p>", "<script>alert(1)</script><style>x{}</style><img src='x'>"])("treats unusable input as absent: %j", (input) => {
    expect(summaryText(input)).toBeNull();
  });
});
