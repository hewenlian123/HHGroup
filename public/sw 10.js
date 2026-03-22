if (!self.define) {
  let e,
    s = {};
  const a = (a, n) => (
    (a = new URL(a + ".js", n).href),
    s[a] ||
      new Promise((s) => {
        if ("document" in self) {
          const e = document.createElement("script");
          ((e.src = a), (e.onload = s), document.head.appendChild(e));
        } else ((e = a), importScripts(a), s());
      }).then(() => {
        let e = s[a];
        if (!e) throw new Error(`Module ${a} didn’t register its module`);
        return e;
      })
  );
  self.define = (n, i) => {
    const p = e || ("document" in self ? document.currentScript.src : "") || location.href;
    if (s[p]) return;
    let r = {};
    const t = (e) => a(e, p),
      c = { module: { uri: p }, exports: r, require: t };
    s[p] = Promise.all(n.map((e) => c[e] || t(e))).then((e) => (i(...e), r));
  };
}
define(["./workbox-f1770938"], function (e) {
  "use strict";
  (importScripts("/fallback-ce627215c0e4a9af.js"),
    self.skipWaiting(),
    e.clientsClaim(),
    e.precacheAndRoute(
      [
        {
          url: "/_next/static/Jha7mJQpyeOEe8ApH-xrD/_buildManifest.js",
          revision: "6310079bf1ae7bebeb6a2135896e4564",
        },
        {
          url: "/_next/static/Jha7mJQpyeOEe8ApH-xrD/_ssgManifest.js",
          revision: "b6652df95db52feb4daf4eca35380933",
        },
        { url: "/_next/static/chunks/1428-ad75d893d7fe495d.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/2173-7e296df045cf3ec4.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/2298-60f74a5b8c21307b.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/2398-9bda3614594bec1a.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/2972-7dff33f647027e0a.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/3032-a117637b20d9fc07.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/3169-2e07b9c33e4a70d6.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/3878-011d9acbd7cb9583.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4067-f7289a3f1713e033.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4313-deaf6964374f1cfc.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4490-ae0881d59add08f3.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4579-cc05a43c01b44d9a.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4647-aff3f993446a087e.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4765-ae1674622e24011b.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4951-8c75f7812f6bd557.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/4978-e04c17004b3a4230.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/5152-c375491f06b4c92b.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/5235-30e4926098a4288c.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/5255-b6b5f6c6b3c15cb4.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/5864-7f3d8ffa7f3df806.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/5937-fb7a2eb58e2ae561.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6137-4dc78bf963e49844.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6244-b169e7d0bcc52c08.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6371-c02d3ceef55536b6.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6535-e4d45e52b1590f5e.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6590-2a50915156efc90f.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6712-f91d694f0923d48b.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6875-1bb8c35e9943c2d3.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/6997-0c88d428ed6bca23.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7129-5dcd0ff29ba0d22a.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7188-d85c6067abeffc7e.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7262-fb1dd9f46bd4a1ab.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7373-75103f181921d05a.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7406-2cea84ec6901e681.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7582-5d376ca55d36a155.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7710-103cd4985423b831.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/7782-d42b103e71e0b54f.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/8119-3ea25d336323d1a0.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/8280-ce4089d56c846796.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/8642-2b46f4b6f7c0e9d6.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/8828-a81677c61519bc78.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/9243-e7fbd79ef7450037.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/9351-f7338a702e25686e.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/9915-23e961f60fdf2de4.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/_next/static/chunks/993-acd20159c516f409.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        {
          url: "/_next/static/chunks/app/_not-found/page-3ee824efa5b8bf57.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/auth/callback/page-167a48e0dfbe587f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/edit/page-fd50fdda62ab650d.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/page-0c29e004e310f091.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/bills/new/page-e9c68754c87255e8.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/bills/page-cdd875c444c7b724.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/change-orders/page-2e9c57bc836201ee.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/customers/%5Bid%5D/page-a96fd16ec834b299.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/customers/page-4e3ad86deff94419.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/dashboard/cashflow/page-e7a4d2f0605d57e8.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/dashboard/loading-80f7c771c87b153b.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/dashboard/page-41e99d1ba22c47a9.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/design-system/page-6041fc931357074a.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/documents/page-cc63e74ac0167fd4.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/error-10b023a2ec147a28.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/page-d987ed8e8ffbafbe.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/preview/page-47b7ea2f41ab3b85.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/print/page-ea0ed2ef316cd691.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/%5Bversion%5D/page-89e06b8e98e4d065.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/page-36d8eb568eef82cc.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimates/new/page-b844ee416a76f7a3.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimates/page-df90b8c025c7b6bd.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/estimating/cost-codes/page-90c43fe31d251c80.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/finance/bills/page-2efac498e73fb436.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/finance/cost-allocation/page-85cf597a181e287f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/finance/expenses/page-16ab21c7c7a6cd1b.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/finance/invoices/page-10ed57ef6f3e2171.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/finance/labor-cost/page-6c6ff6ce44af340f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/finance/page-00878a62f76802a4.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/accounts/page-752add04c4eec877.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/ar/page-9c8cedc4010c0ee0.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/bank/page-c8425dc1322d91df.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/%5Bid%5D/page-059563209b7fe0ae.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/new/page-668689eaac92222f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/page-8342dc8f538a1c79.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/commissions/page-ebd2f5253c2146fb.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/dashboard/page-ffcb3f6ab30cb642.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/deposits/page-4acc1bbddad1df3a.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/%5Bid%5D/page-64fcd6a14d6b61c8.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/new/page-6a473a8b1f85fc33.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/page-006504fbec461332.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/loading-132c0920f5e1a90b.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/page-67e9873da318509e.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/print/page-39c1377e0f3fb17f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/new/page-d63c4f8b9690eac6.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/page-8b1470bf17b2b37d.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/page-dca150e08daade74.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/payments/page-118359ef223e8e87.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/reimbursements/page-9ca05f3058fb7d69.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/vendors/page-5ff02127cfffd925.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/financial/workers/page-cf9ee1c4a71214d0.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/inspection-log/page-510a2b46b7156e23.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/advances/page-df92ff078565ee0a.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/cost-allocation/page-c91d241841d84b82.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/daily/page-6d7491c7e7309f60.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/entries/page-4668e9712385c339.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/%5Bid%5D/page-228d15674bba7b73.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/new/page-7519315a181f8969.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/page-2803d676fc9eeb36.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/layout-5a318898b44f3b6d.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/monthly/page-7bc5275fa9889e96.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/page-3b52f398136ab012.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/%5Bid%5D/receipt/page-bdaab689e338f5e3.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/page-9967b32a7cd04342.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll-summary/page-21f5bc6f3ab3fe85.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll/page-6e5b0cfc6dc89a6c.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/receipts/page-70b7c932f3cb5a76.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/reimbursements/page-a062fa2f7bf80717.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/review/page-0eff5b35e2e591de.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/%5Bid%5D/page-f650abdc023caf54.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/page-acaffe6e0fdaf802.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/timesheets/page-cd64262ba9d28d3e.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-balances/page-11029ac0cacb04b3.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-invoices/page-c4b3b7744c46cf01.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/balance/page-536426b944422bce.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/page-cc1666957ccc14d4.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/page-c8809cac9095e26f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/print/page-aef65e9f5c1f62ed.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/new/page-b3fbe1427fa7535d.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/page-ae880c241d264c5a.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/layout-b85db4d23fb78092.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/login/page-16545a23e10f39f6.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/logout/page-0e2d1c0f11cad525.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/materials/catalog/page-318dfb9d1837aff0.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/not-found-9753ad0c65aa81a2.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/offline/page-f648736e9361bdc1.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/owner/page-98dd82b39846edd1.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/page-d78a36e801d3d26f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/procurement/purchase-orders/page-cceb45eb8f1ae953.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/edit/page-815efe0bc8bb838b.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/page-51a4ed0fc3697329.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/new/page-a73f69ccbf1f5adb.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/labor/page-f07f40b83a5472b2.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/page-efddb2c5d7224ade.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/profit/page-4769d5ac7cf28df4.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/bills/page-a20bd6730216e19f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/page-d29af96aff9af67d.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/page-0d99d9546d960823.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/daily-logs/page-476f293252b7f590.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/documents/page-8a7b51d5bb9a830f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/new/page-e78bf01fb4b34316.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/page-2585247dc48b8421.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/projects/schedule/page-e548ee20327c5e86.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/punch-list/new/page-2520d8e513292482.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/punch-list/page-60ff1a9055e20960.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/receipt/page-87b9a61bf352f641.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/schedule/page-31966210a18140b6.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/account/page-ff4f6d298bd5f3b1.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/categories/page-c1e6067facfbad6c.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/company/page-8743dedb42b47807.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/lists/page-c4da457c95ac19c1.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/page-9d28fc7c35663c8f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/permissions/page-d70ed7ce462de8e0.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/subcontractors/page-7b63d83926dcb2a7.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/settings/users/page-6a166ecdb9fedc14.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/site-photos/page-079ac9e1a9c3ee2f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/site-photos/upload/page-13f393af542fa0b9.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/%5Bid%5D/page-5d89e3eca0960835.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/page-5bb21e634dd31619.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/system-health/page-522f0eca907228ff.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/system-logs/page-6ea003013484b0e0.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/system-metrics/page-269b6918af6adc5d.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/system-tests/page-5c9a8cd2c1e71200.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/system-tests/ui/page-3068a2861e7cccb6.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/system/backups/page-fb46f3f99759b3ea.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/tasks/new/page-9c2ef57889bec901.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/tasks/page-cad7e6b627827b9d.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/upload-receipt/page-2e350ce58c047f0b.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/app/workers/page-708baf0b80bd5965.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/fd9d1056-e8ab1e239197c1a4.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/framework-8e0e0f4a6b83a956.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        { url: "/_next/static/chunks/main-9a7be8bedc7a107d.js", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        {
          url: "/_next/static/chunks/main-app-7691ad3584d91f8b.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/pages/_app-3c9ca398d360b709.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/pages/_error-cf5ca766ac8f493f.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        {
          url: "/_next/static/chunks/polyfills-42372ed130431b0a.js",
          revision: "846118c33b2c0e922d7b3a7676f81f6f",
        },
        {
          url: "/_next/static/chunks/webpack-adf6532065f37012.js",
          revision: "Jha7mJQpyeOEe8ApH-xrD",
        },
        { url: "/_next/static/css/5c840a0dcec112ba.css", revision: "5c840a0dcec112ba" },
        {
          url: "/_next/static/media/19cfc7226ec3afaa-s.woff2",
          revision: "9dda5cfc9a46f256d0e131bb535e46f8",
        },
        {
          url: "/_next/static/media/21350d82a1f187e9-s.woff2",
          revision: "4e2553027f1d60eff32898367dd4d541",
        },
        {
          url: "/_next/static/media/4473ecc91f70f139-s.p.woff",
          revision: "78e6fc13ea317b55ab0bd6dc4849c110",
        },
        {
          url: "/_next/static/media/463dafcda517f24f-s.p.woff",
          revision: "cbeb6d2d96eaa268b4b5beb0b46d9632",
        },
        {
          url: "/_next/static/media/8e9860b6e62d6359-s.woff2",
          revision: "01ba6c2a184b8cba08b0d57167664d75",
        },
        {
          url: "/_next/static/media/ba9851c3c22cd980-s.woff2",
          revision: "9e494903d6b0ffec1a1e14d34427d44d",
        },
        {
          url: "/_next/static/media/c5fe6dc8356a8c31-s.woff2",
          revision: "027a89e9ab733a145db70f09b8a18b42",
        },
        {
          url: "/_next/static/media/df0a9ae256c0569c-s.woff2",
          revision: "d54db44de5ccb18886ece2fda72bdfe0",
        },
        {
          url: "/_next/static/media/e4af272ccee01ff0-s.p.woff2",
          revision: "65850a373e258f1c897a2b3d75eb74de",
        },
        { url: "/fallback-ce627215c0e4a9af.js", revision: "4f20e76600cac989810927f2e95e5b79" },
        { url: "/favicon.png", revision: "6630b11844e57e2428939b20f3ad57a9" },
        { url: "/icons/icon-192.png", revision: "3afc847bfceaae90fdf247b86a50b79a" },
        { url: "/icons/icon-512.png", revision: "1a9bde0e31159e0df005e4e9f882bfce" },
        { url: "/logo.png", revision: "6d85f36f8b880b57837c9476c436d53e" },
        { url: "/manifest.json", revision: "1ed948487cd83d4233132473a4d46e82" },
        { url: "/offline", revision: "Jha7mJQpyeOEe8ApH-xrD" },
        { url: "/sw 2.js", revision: "f3f7d568a550c33911c6338b6f9aa9fc" },
        { url: "/sw 3.js", revision: "1dac8afa02d6964fac2dfe1b76a2c66c" },
        { url: "/sw 4.js", revision: "4da3cdd47b8f85dd89203c77c4e2c37d" },
        { url: "/sw 5.js", revision: "f96cdc76c11480b7f1d4be96158062c3" },
        { url: "/swe-worker-5c72df51bb1f6ee0.js", revision: "5a47d90db13bb1309b25bdf7b363570e" },
      ],
      { ignoreURLParametersMatching: [/^utm_/, /^fbclid$/] }
    ),
    e.cleanupOutdatedCaches(),
    e.registerRoute(
      "/",
      new e.NetworkFirst({
        cacheName: "start-url",
        plugins: [
          {
            cacheWillUpdate: async ({ response: e }) =>
              e && "opaqueredirect" === e.type
                ? new Response(e.body, { status: 200, statusText: "OK", headers: e.headers })
                : e,
          },
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      new e.CacheFirst({
        cacheName: "google-fonts-webfonts",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 31536e3 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      new e.StaleWhileRevalidate({
        cacheName: "google-fonts-stylesheets",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      new e.StaleWhileRevalidate({
        cacheName: "static-font-assets",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      new e.StaleWhileRevalidate({
        cacheName: "static-image-assets",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 2592e3 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\/_next\/static.+\.js$/i,
      new e.CacheFirst({
        cacheName: "next-static-js-assets",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\/_next\/image\?url=.+$/i,
      new e.StaleWhileRevalidate({
        cacheName: "next-image",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\.(?:mp3|wav|ogg)$/i,
      new e.CacheFirst({
        cacheName: "static-audio-assets",
        plugins: [
          new e.RangeRequestsPlugin(),
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\.(?:mp4|webm)$/i,
      new e.CacheFirst({
        cacheName: "static-video-assets",
        plugins: [
          new e.RangeRequestsPlugin(),
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\.(?:js)$/i,
      new e.StaleWhileRevalidate({
        cacheName: "static-js-assets",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\.(?:css|less)$/i,
      new e.StaleWhileRevalidate({
        cacheName: "static-style-assets",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\/_next\/data\/.+\/.+\.json$/i,
      new e.StaleWhileRevalidate({
        cacheName: "next-data",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      /\.(?:json|xml|csv)$/i,
      new e.NetworkFirst({
        cacheName: "static-data-assets",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      ({ sameOrigin: e, url: { pathname: s } }) =>
        !(!e || s.startsWith("/api/auth/callback") || !s.startsWith("/api/")),
      new e.NetworkFirst({
        cacheName: "apis",
        networkTimeoutSeconds: 10,
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      ({ request: e, url: { pathname: s }, sameOrigin: a }) =>
        "1" === e.headers.get("RSC") &&
        "1" === e.headers.get("Next-Router-Prefetch") &&
        a &&
        !s.startsWith("/api/"),
      new e.NetworkFirst({
        cacheName: "pages-rsc-prefetch",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      ({ request: e, url: { pathname: s }, sameOrigin: a }) =>
        "1" === e.headers.get("RSC") && a && !s.startsWith("/api/"),
      new e.NetworkFirst({
        cacheName: "pages-rsc",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      ({ url: { pathname: e }, sameOrigin: s }) => s && !e.startsWith("/api/"),
      new e.NetworkFirst({
        cacheName: "pages",
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    e.registerRoute(
      ({ sameOrigin: e }) => !e,
      new e.NetworkFirst({
        cacheName: "cross-origin",
        networkTimeoutSeconds: 10,
        plugins: [
          new e.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 3600 }),
          {
            handlerDidError: async ({ request: e }) =>
              "undefined" != typeof self ? self.fallback(e) : Response.error(),
          },
        ],
      }),
      "GET"
    ));
});
