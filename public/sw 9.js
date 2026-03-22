if (!self.define) {
  let e,
    s = {};
  const i = (i, t) => (
    (i = new URL(i + ".js", t).href),
    s[i] ||
      new Promise((s) => {
        if ("document" in self) {
          const e = document.createElement("script");
          ((e.src = i), (e.onload = s), document.head.appendChild(e));
        } else ((e = i), importScripts(i), s());
      }).then(() => {
        let e = s[i];
        if (!e) throw new Error(`Module ${i} didn’t register its module`);
        return e;
      })
  );
  self.define = (t, a) => {
    const n = e || ("document" in self ? document.currentScript.src : "") || location.href;
    if (s[n]) return;
    let c = {};
    const r = (e) => i(e, n),
      o = { module: { uri: n }, exports: c, require: r };
    s[n] = Promise.all(t.map((e) => o[e] || r(e))).then((e) => (a(...e), c));
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
          url: "/_next/static/DZe9KPeCoKSf0twJiPNPQ/_buildManifest.js",
          revision: "6310079bf1ae7bebeb6a2135896e4564",
        },
        {
          url: "/_next/static/DZe9KPeCoKSf0twJiPNPQ/_ssgManifest.js",
          revision: "b6652df95db52feb4daf4eca35380933",
        },
        { url: "/_next/static/chunks/1025-f05ab3416752179f.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/1180-78518de9b7bf4a88.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/1428-ad75d893d7fe495d.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/1452-3bb75234b7dab5c2.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/185-a403947f864951f8.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/1962-4be2d65d8d691e46.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/2298-60f74a5b8c21307b.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/2398-8e535533acebc545.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/2972-7dff33f647027e0a.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/3032-fd69f7c71fb48ccf.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/3169-904abcdfac330a4d.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/3660-7ab6914469c6fb2a.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/3878-a8b3e3fe377e21cc.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/3880-bd69ece4367ea7e9.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/4067-ed68241b75d2bebd.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/4347-39bbe31fa3abb70d.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/4765-ae1674622e24011b.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/4951-d8c0179b09ac578c.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/4978-6d6cad36cd224a6d.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/515-0a2c900ac4b15426.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/5255-55792b15f1ebdcc3.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/5598-474b99d2ff0952a7.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/5776-974a2aa354ec8293.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/5854.d1a1e04a7a04a7b8.js", revision: "d1a1e04a7a04a7b8" },
        { url: "/_next/static/chunks/5864-1c9d8ffe27bf60b7.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/5890-fd7db6328b4b6b83.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/5937-d9e364851a8db2ea.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/6137-4dc78bf963e49844.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/6244-d6ce410c94001a81.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/6553-555a87a9f2d04d50.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/6828-e242ad4fade6ee96.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/6875-2caa3b7f62e9acd7.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/6997-0c88d428ed6bca23.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/7081-54e04b76ab877ec8.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/7373-8fdc7367f8a5abd5.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/7537-6e040fa3dc7489b1.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/8280-ce4089d56c846796.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/8642-8280c600334c05af.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/9302-f64fc758e3b29a16.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/9915-e0ed0fed0f4212d3.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/993-acd20159c516f409.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/9941-bb8e32a532f6f730.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        { url: "/_next/static/chunks/9977-e4efbde822425cd6.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        {
          url: "/_next/static/chunks/app/_not-found/page-690510996f6312c2.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/auth/callback/page-167a48e0dfbe587f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/edit/page-4ab55eac506f5780.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/page-caf58115d05ca4c6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/bills/new/page-41d61be9902b92ac.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/bills/page-cdc43c3eca2b706e.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/change-orders/page-2e9c57bc836201ee.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/customers/%5Bid%5D/page-dcd3cee4aa9a04e0.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/customers/page-5669655c6043ffc7.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/dashboard/cashflow/page-001bd39a977b84b2.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/dashboard/loading-80f7c771c87b153b.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/dashboard/page-f0f0535f4c54277f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/design-system/page-e5c91713fcae8770.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/documents/page-d8d760d0b127a2eb.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/error-10b023a2ec147a28.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/page-06619790d13c3ed8.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/preview/page-47b7ea2f41ab3b85.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/print/page-ea0ed2ef316cd691.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/%5Bversion%5D/page-b5c014074cd1e4a3.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/page-36d8eb568eef82cc.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimates/new/page-e3c7d16bec99e2d8.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimates/page-df90b8c025c7b6bd.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/estimating/cost-codes/page-4286ebf83c4ec7d6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/finance/bills/page-d84582cc077d5871.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/finance/cost-allocation/page-cfb7a798c0e90e46.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/finance/expenses/page-ee1a13ad4ac1aa69.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/finance/invoices/page-98f96ec997b2b4fd.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/finance/labor-cost/page-7fb70d5e7eddf842.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/finance/page-9d2af53d10ba9000.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/accounts/page-7419dd4aa062dd77.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/ar/page-9c8cedc4010c0ee0.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/bank/page-241f5e3c637b2542.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/%5Bid%5D/page-77fac0e80cc6042f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/new/page-7d803ed3745458a6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/page-f35233b7279f1a8b.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/commissions/page-a1adbb5b8dae2e51.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/dashboard/page-27822d006a2d2639.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/deposits/page-12c4933277305a3f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/%5Bid%5D/page-e225235f202de8db.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/new/page-cd89855f6bd28374.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/page-1b163e5ea9ac919c.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/loading-c97c0dfd55414b43.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/page-a7abb2b6427f842d.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/print/page-39c1377e0f3fb17f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/new/page-7bba41c1fa6d0d71.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/page-9ce306f84c6a3285.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/page-dca150e08daade74.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/payments-received/page-6abe853f614b35c4.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/payments/page-9ad44d97c29eecba.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/reimbursements/page-6418b8c01887f551.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/vendors/page-a2d43193c34e66e1.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/financial/workers/page-cf9ee1c4a71214d0.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/inspection-log/page-28918adb281b719f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/advances/page-05952b8b04ae6806.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/cost-allocation/page-c3ccf9ad6d384bc1.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/daily/page-da35374fe43e67b4.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/entries/page-7ebf2b78c529207a.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/%5Bid%5D/page-65da5fc13e0bf053.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/new/page-e38d25f480dec42e.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/page-65e32b475ec6047b.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/layout-0717ab95f2b32c7b.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/monthly/page-210f7e20fdf62e3a.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/page-97ddcb9b454f2627.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/%5Bid%5D/receipt/page-bdaab689e338f5e3.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/page-09443525bd21f6ab.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll-summary/page-d6fcccc1917e1075.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll/page-5c96076a8dca149f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/receipts/page-ae25afdf6fe276e8.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/reimbursements/page-a929e3cf6b7e4f8b.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/review/page-247311ba26c8f3d6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/%5Bid%5D/page-2a9a40a2042ed766.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/page-6f3394cef767b197.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/timesheets/page-e83d9dc1f4b4a8dc.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-balances/page-11029ac0cacb04b3.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-invoices/page-272dd932d164ae17.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/balance/page-b0a4ae67b2b0d151.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/page-17ab65022eccb357.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/page-8cf883826cd376e4.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/print/page-e899fba56380e8cd.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/new/page-d1008edb73014c63.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/page-8db1dd1c747e4dda.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/layout-d69aaf5e751e9b0c.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/login/page-16545a23e10f39f6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/logout/page-0e2d1c0f11cad525.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/materials/catalog/page-9728b0b4d3840e28.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/not-found-369b22b4c0adb378.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/offline/page-ea81c79c8b653804.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/owner/page-89c590766f5060e0.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/page-7309a2699dc423f6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/people/vendors/page-6359e243c2035cea.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/procurement/purchase-orders/page-1fc9b473784dd4c1.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/edit/page-5b1346ca164b3376.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/page-51a4ed0fc3697329.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/new/page-a83af4319e9d5279.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/labor/page-85ab1b1dcdd16982.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/page-b0273f6d3901b012.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/profit/page-a06a740f4235a82d.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/bills/page-d5432bfcc47c0dfd.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/page-d29af96aff9af67d.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/page-41f489fd0481f8bc.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/daily-logs/page-4710bba4873fbf6c.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/documents/page-6709023d55711c03.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/new/page-d9f5d7d7fa54f711.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/page-d5fc800e0a5dbe6d.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/projects/schedule/page-1e08188e38f3497c.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/punch-list/new/page-cbd4dcba14670684.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/punch-list/page-c1fa806504f7e780.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/receipt/page-f6e3b18ef72dd40d.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/schedule/page-72d69c1e07e23ea6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/account/page-ff4f6d298bd5f3b1.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/categories/page-34736d51c4c923b4.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/company/page-4d0d7a9f14184e25.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/lists/page-d62a3e99bced74d6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/page-f29cf146d6d0d350.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/permissions/page-0d0ac8d15b80971a.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/subcontractors/page-56f3a88088bebe1e.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/settings/users/page-b8f66748d67bfbca.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/site-photos/page-88b6b5eaa7953e5b.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/site-photos/upload/page-3d68cfc4073ecbfb.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/%5Bid%5D/page-93616d629193ac03.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/page-3ceacef61ed15a82.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/system-health/page-522f0eca907228ff.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/system-logs/page-6ea003013484b0e0.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/system-metrics/page-269b6918af6adc5d.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/system-tests/page-5c9a8cd2c1e71200.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/system-tests/ui/page-3068a2861e7cccb6.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/system/backups/page-fb46f3f99759b3ea.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/tasks/new/page-428caa20890eb83f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/tasks/page-7ea5c505d75e5314.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/upload-receipt/page-94a165fd1ab8abe8.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/vendors/page-3dfd88edf4a26217.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/app/workers/page-16d2e047bc85cdaf.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/fd9d1056-e8ab1e239197c1a4.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/framework-8e0e0f4a6b83a956.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        { url: "/_next/static/chunks/main-059b7822269b4122.js", revision: "DZe9KPeCoKSf0twJiPNPQ" },
        {
          url: "/_next/static/chunks/main-app-7691ad3584d91f8b.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/pages/_app-3c9ca398d360b709.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/pages/_error-cf5ca766ac8f493f.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        {
          url: "/_next/static/chunks/polyfills-42372ed130431b0a.js",
          revision: "846118c33b2c0e922d7b3a7676f81f6f",
        },
        {
          url: "/_next/static/chunks/webpack-0e02bb6834966566.js",
          revision: "DZe9KPeCoKSf0twJiPNPQ",
        },
        { url: "/_next/static/css/08c4f0a8380a59d0.css", revision: "08c4f0a8380a59d0" },
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
        { url: "/offline", revision: "DZe9KPeCoKSf0twJiPNPQ" },
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
      ({ request: e, url: { pathname: s }, sameOrigin: i }) =>
        "1" === e.headers.get("RSC") &&
        "1" === e.headers.get("Next-Router-Prefetch") &&
        i &&
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
      ({ request: e, url: { pathname: s }, sameOrigin: i }) =>
        "1" === e.headers.get("RSC") && i && !s.startsWith("/api/"),
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
