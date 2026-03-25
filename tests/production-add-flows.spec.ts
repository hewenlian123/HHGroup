import { test, expect, Page } from "@playwright/test";

type Flow = {
  name: string;
  path: string;
  submitText?: RegExp;
};

const BASE = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const isProd = /^https:\/\/hhprojectgroup\.com$/i.test(BASE);

const flows: Flow[] = [
  // PROJECTS
  { name: "Projects: add new project", path: "/projects/new", submitText: /create|save|add/i },
  { name: "Estimates: create estimate", path: "/estimates/new", submitText: /create|save|add/i },
  {
    name: "Change Orders: add change order",
    path: "/change-orders",
    submitText: /create|save|add/i,
  },
  { name: "Customers: add customer", path: "/customers", submitText: /create|save|add/i },

  // OPERATIONS
  { name: "Tasks: add task", path: "/tasks/new", submitText: /create|save|add/i },
  { name: "Punch List: add item", path: "/punch-list/new", submitText: /create|save|add/i },
  { name: "Schedule: add schedule entry", path: "/schedule", submitText: /create|save|add/i },
  {
    name: "Site Photos: upload photo",
    path: "/site-photos/upload",
    submitText: /upload|save|add/i,
  },
  { name: "Inspection Log: add record", path: "/inspection-log", submitText: /create|save|add/i },
  {
    name: "Material Catalog: add material",
    path: "/materials/catalog",
    submitText: /create|save|add/i,
  },

  // FINANCE
  {
    name: "Invoices: create invoice",
    path: "/financial/invoices/new",
    submitText: /create|save|add/i,
  },
  {
    name: "Payments Received: record payment",
    path: "/financial/payments-received",
    submitText: /create|save|add|record/i,
  },
  { name: "Deposits: add deposit", path: "/financial/deposits", submitText: /create|save|add/i },
  { name: "Bills: create bill", path: "/financial/bills/new", submitText: /create|save|add/i },
  {
    name: "Expenses: add expense",
    path: "/financial/expenses/new",
    submitText: /create|save|add/i,
  },
  { name: "Accounts: add account", path: "/financial/accounts", submitText: /create|save|add/i },

  // LABOR
  {
    name: "Time Entries: add time entry",
    path: "/labor/entries",
    submitText: /create|save|add|submit/i,
  },
  {
    name: "Reimbursements: add reimbursement",
    path: "/labor/reimbursements",
    submitText: /create|save|add|submit/i,
  },
  {
    name: "Worker Payments: record payment",
    path: "/labor/payments",
    submitText: /create|save|add|pay/i,
  },
  { name: "Worker Advances: add advance", path: "/labor/advances", submitText: /create|save|add/i },
  {
    name: "Worker Invoices: create worker invoice",
    path: "/labor/invoices/new",
    submitText: /create|save|add/i,
  },

  // PEOPLE
  { name: "Workers: add worker", path: "/labor/workers/new", submitText: /create|save|add/i },
  { name: "Vendors: add vendor", path: "/people/vendors", submitText: /create|save|add/i },
  {
    name: "Subcontractors: add subcontractor",
    path: "/subcontractors",
    submitText: /create|save|add/i,
  },
];

async function hasVisibleText(page: Page, re: RegExp) {
  const loc = page.getByText(re, { exact: false });
  return (
    (await loc.count()) > 0 &&
    (await loc
      .first()
      .isVisible()
      .catch(() => false))
  );
}

async function tryDismissToasts(page: Page) {
  // best-effort: close dialogs/toasts that may block clicks
  const closeButtons = page.getByRole("button", { name: /close|dismiss|ok|got it/i });
  const n = await closeButtons.count();
  for (let i = 0; i < Math.min(n, 2); i++) {
    await closeButtons
      .nth(i)
      .click()
      .catch(() => {});
  }
}

async function fillMinimalForm(page: Page, seed: string) {
  // Fill text inputs
  const textInputs = page.locator("input[type='text'], input:not([type]), input[type='email']");
  const tiCount = await textInputs.count();
  for (let i = 0; i < tiCount; i++) {
    const el = textInputs.nth(i);
    const disabled = await el.isDisabled().catch(() => true);
    if (disabled) continue;
    const value = await el.inputValue().catch(() => "");
    if (value) continue;
    await el.fill(`E2E ${seed}`).catch(() => {});
  }

  const textareas = page.locator("textarea");
  const taCount = await textareas.count();
  for (let i = 0; i < taCount; i++) {
    const el = textareas.nth(i);
    const disabled = await el.isDisabled().catch(() => true);
    if (disabled) continue;
    const value = await el.inputValue().catch(() => "");
    if (value) continue;
    await el.fill(`E2E ${seed}`).catch(() => {});
  }

  // Numbers
  const nums = page.locator("input[type='number']");
  const numCount = await nums.count();
  for (let i = 0; i < numCount; i++) {
    const el = nums.nth(i);
    const disabled = await el.isDisabled().catch(() => true);
    if (disabled) continue;
    const value = await el.inputValue().catch(() => "");
    if (value) continue;
    await el.fill("1").catch(() => {});
  }

  // Dates
  const dates = page.locator("input[type='date']");
  const today = new Date().toISOString().slice(0, 10);
  const dateCount = await dates.count();
  for (let i = 0; i < dateCount; i++) {
    const el = dates.nth(i);
    const disabled = await el.isDisabled().catch(() => true);
    if (disabled) continue;
    const value = await el.inputValue().catch(() => "");
    if (value) continue;
    await el.fill(today).catch(() => {});
  }
}

async function clickFirstAddButton(page: Page) {
  const candidates = [
    page.getByRole("button", { name: /new|add|create|record|upload/i }),
    page.getByRole("link", { name: /new|add|create/i }),
  ];
  for (const c of candidates) {
    const n = await c.count();
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        const el = c.nth(i);
        if (await el.isVisible().catch(() => false)) {
          await el.click().catch(() => {});
          return true;
        }
      }
    }
  }
  return false;
}

async function submit(page: Page, re?: RegExp) {
  const locator = re
    ? page.getByRole("button", { name: re })
    : page.getByRole("button", { name: /create|save|add|submit|record|upload/i });
  const n = await locator.count();
  for (let i = 0; i < n; i++) {
    const btn = locator.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

test.describe("Production add-data smoke", () => {
  test.skip(!isProd, "Set E2E_BASE_URL=https://hhprojectgroup.com to run production smoke.");

  for (const flow of flows) {
    test(flow.name, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
      });

      await page.goto(flow.path, { waitUntil: "domcontentloaded" });
      await tryDismissToasts(page);

      // If login required, fail with a clear message.
      if (page.url().includes("/login") || (await hasVisibleText(page, /sign in|login/i))) {
        throw new Error(`Auth required for ${flow.path} (redirected to login).`);
      }

      // Best-effort: open any create modal if we're on a list page.
      await clickFirstAddButton(page);
      await fillMinimalForm(page, `${Date.now()}`);
      await submit(page, flow.submitText);

      // Expect no immediate fatal errors on page
      expect(errors.join("\n")).not.toMatch(/pageerror:|console\.error:/i);

      // Also expect we don't show an obvious failure toast
      const failureText = page.getByText(/failed|error|unable to|permission denied|schema cache/i, {
        exact: false,
      });
      // Give UI a moment to toast
      await page.waitForTimeout(1200);
      if (
        (await failureText.count()) > 0 &&
        (await failureText
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        const t = await failureText
          .first()
          .innerText()
          .catch(() => "Unknown error");
        throw new Error(`UI error: ${t}`);
      }
    });
  }
});
