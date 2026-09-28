import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollElementIntoViewNearest } from "@/lib/list-flow";

describe("scrollElementIntoViewNearest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses instant scrolling when reduced motion is requested", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    );
    const scrollIntoView = vi.fn();

    scrollElementIntoViewNearest({ scrollIntoView } as unknown as Element);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  });

  it("keeps smooth continuity when motion is allowed", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
    const scrollIntoView = vi.fn();

    scrollElementIntoViewNearest({ scrollIntoView } as unknown as Element);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  });
});
