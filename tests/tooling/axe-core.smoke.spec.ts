import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("axe analyzes a controlled accessible page with zero violations", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>Accessibility tooling smoke</title></head>
      <body>
        <main>
          <h1>Accessibility tooling smoke</h1>
          <form>
            <label for="project-name">Project name</label>
            <input id="project-name" name="projectName" autocomplete="organization" />
            <button type="submit">Save</button>
          </form>
        </main>
      </body>
    </html>
  `);

  const result = await new AxeBuilder({ page }).analyze();

  expect(result.violations).toEqual([]);
});
