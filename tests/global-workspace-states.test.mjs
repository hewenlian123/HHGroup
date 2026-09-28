import { createRequire } from "node:module";
const requireApp = createRequire(process.cwd() + "/package.json");
import { test } from "node:test";
import assert from "node:assert/strict";
const React = requireApp("react");
global.React = React;
requireApp.extensions[".css"] = () => {};
const { renderToStaticMarkup } = requireApp("react-dom/server");
function mock(name, exports) {
  const id = requireApp.resolve(name);
  requireApp.cache[id] = { id, filename: id, loaded: true, exports };
}
mock("next/navigation", {
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/projects",
  useSearchParams: () => new URLSearchParams(),
});
mock("./src/components/toast/toast-provider.tsx", { useToast: () => ({ toast() {} }) });
mock("./src/app/projects/actions.ts", {});
mock("./src/app/estimates/actions.ts", {});
const { ProjectsListClient } = requireApp("./src/app/projects/projects-list-client.tsx");
const { EstimatesListClient } = requireApp("./src/app/estimates/estimates-list-client.tsx");
const { CustomersClient } = requireApp("./src/app/customers/customers-client.tsx");
const { ServerDataLoadFallback } = requireApp("./src/components/server-data-load-fallback.tsx");
const project = {
  id: "fixture-project",
  name: "Fixture project",
  clientName: "Fixture client",
  status: "active",
  budget: 12345,
  revenue: 12345,
  actualCost: 678,
  expenseCost: 600,
  laborCost: 78,
  reimbursementCost: 0,
  billedAmount: 1000,
  paidAmount: 500,
  openAR: 500,
  profit: 11667,
  marginPct: 94.5,
  profitReadinessWarning: null,
  financialSource: "legacy",
  updatedAt: "2026-09-01",
};
const estimate = {
  id: "fixture-estimate",
  number: "FIXTURE-1",
  client: "Fixture client",
  project: "Fixture estimate",
  status: "Draft",
  total: 12345.67,
  updatedAt: "2026-09-01",
};
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const configurations = [
  ["projects", ProjectsListClient, { rows: [] }, "dataLoadWarning", { rows: [project] }],
  [
    "estimates",
    EstimatesListClient,
    { list: [], errorMessage: null, deleteEstimateAction: async () => ({ ok: true }) },
    "loadWarning",
    { list: [estimate] },
  ],
  [
    "customers",
    CustomersClient,
    { initialCustomers: [] },
    "dataLoadWarning",
    { initialCustomers: [{ id: "fixture-customer", name: "Fixture client", status: "active" }] },
  ],
];
for (const [name, Component, props, warning, stale] of configurations) {
  test(`${name}: read failure and denial are retryable errors, never empty or current amounts`, () => {
    for (const message of ["Read failed", "Permission denied"])
      for (const data of [{}, stale]) {
        const html = render(Component, { ...props, ...data, [warning]: message });
        assert.match(html, /role="alert"/);
        assert.match(html, />Retry</);
        assert.doesNotMatch(
          html,
          /\$[\d,]|No (?:projects|estimates|customers) yet|Fixture (?:project|estimate|client)/
        );
      }
  });
  test(`${name}: successful empty remains an empty state`, () => {
    const html = render(Component, { ...props, [warning]: null });
    assert.match(html, /No (?:projects|estimates|customers) yet/);
    assert.doesNotMatch(html, /role="alert"/);
  });
}
test("successful amounts retain their existing display", () => {
  assert.match(render(ProjectsListClient, { rows: [project] }), /\$12,345/);
  assert.match(
    render(EstimatesListClient, { list: [estimate], loadWarning: null, errorMessage: null }),
    /\$12,345\.67 pipeline/
  );
});
test("shared server fallback keeps Back and provides Retry", () => {
  const html = render(ServerDataLoadFallback, { message: "Read failed", backHref: "/projects" });
  assert.match(html, />Retry</);
  assert.match(html, /href="\/projects"/);
});
