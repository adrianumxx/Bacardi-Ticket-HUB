import { describe, expect, it } from "vitest";
import { emailHtml, escapeHtml } from "@/lib/mail";
import { endOfDay } from "@/lib/utils";

describe("escapeHtml", () => {
  it("escapes HTML control characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands and quotes", () => {
    expect(escapeHtml(`Tom & Jerry's`)).toBe("Tom &amp; Jerry&#39;s");
  });
});

describe("emailHtml", () => {
  it("does not emit unescaped user markup", () => {
    const html = emailHtml("Title", `<img src=x onerror="steal()">`);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});

describe("endOfDay", () => {
  it("returns the last millisecond of the given day", () => {
    const end = endOfDay("2026-07-03");
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("returns an invalid date for garbage input without throwing", () => {
    expect(Number.isNaN(endOfDay("not-a-date").getTime())).toBe(true);
  });
});
