import { expect, type Locator } from "@playwright/test";

const LETTER_PAGE_HEIGHT_PX = 1056;
const LETTER_PAGE_HEIGHT_TOLERANCE_PX = 3;

/**
 * Checks the pre-PDF invariant: every logical customer-document page already fits within one
 * physical Letter sheet, reserves its footer, and keeps scope content structurally intact.
 */
export async function expectBoundedLetterPages(pages: Locator): Promise<void> {
  const pageIntegrity = await pages.evaluateAll((nodes) =>
    nodes.map((node, index) => {
      const pageBox = node.getBoundingClientRect();
      const footer = node.querySelector("footer");
      const footerBox = footer?.getBoundingClientRect();
      const contentChildren = Array.from(node.children).filter(
        (child) =>
          !child.classList.contains("estimate-page-label") &&
          child.tagName.toLowerCase() !== "footer"
      );
      const contentBoxes = contentChildren.map((child) => child.getBoundingClientRect());
      const contentBottom = Math.max(0, ...contentBoxes.map((box) => box.bottom - pageBox.top));
      const childEscapesPage = contentBoxes.some(
        (box) => box.top < pageBox.top || box.bottom > pageBox.bottom
      );
      const orphanSectionCount = Array.from(
        node.querySelectorAll(".estimate-scope-section")
      ).filter(
        (section) => !section.querySelector('[data-testid="estimate-line-item-output"]')
      ).length;
      const detachedItemTitleCount = Array.from(
        node.querySelectorAll<HTMLElement>('[data-testid="estimate-line-item-output"]')
      ).filter((item) => !item.querySelector("h4")).length;

      return {
        page: index + 1,
        boxHeight: pageBox.height,
        clientHeight: node.clientHeight,
        clientWidth: node.clientWidth,
        scrollHeight: node.scrollHeight,
        scrollWidth: node.scrollWidth,
        contentBottom,
        footerTop: footerBox ? footerBox.top - pageBox.top : null,
        childEscapesPage,
        orphanSectionCount,
        detachedItemTitleCount,
      };
    })
  );
  const invalidPages = pageIntegrity.filter((page) => {
    const expectedMinimum = LETTER_PAGE_HEIGHT_PX - LETTER_PAGE_HEIGHT_TOLERANCE_PX;
    const expectedMaximum = LETTER_PAGE_HEIGHT_PX + LETTER_PAGE_HEIGHT_TOLERANCE_PX;
    const contentLimit = page.footerTop == null ? page.clientHeight - 24 : page.footerTop - 4;

    return (
      page.clientHeight < expectedMinimum ||
      page.clientHeight > expectedMaximum ||
      Math.abs(page.boxHeight - page.clientHeight) > LETTER_PAGE_HEIGHT_TOLERANCE_PX ||
      page.scrollHeight > page.clientHeight + 3 ||
      page.scrollWidth > page.clientWidth + 1 ||
      page.contentBottom > contentLimit ||
      page.childEscapesPage ||
      page.orphanSectionCount > 0 ||
      page.detachedItemTitleCount > 0
    );
  });

  expect(invalidPages).toEqual([]);
}
