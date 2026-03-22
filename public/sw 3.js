if (!self.define) {
  let a,
    e = {};
  const s = (s, c) => (
    (s = new URL(s + ".js", c).href),
    e[s] ||
      new Promise((e) => {
        if ("document" in self) {
          const a = document.createElement("script");
          ((a.src = s), (a.onload = e), document.head.appendChild(a));
        } else ((a = s), importScripts(s), e());
      }).then(() => {
        let a = e[s];
        if (!a) throw new Error(`Module ${s} didn’t register its module`);
        return a;
      })
  );
  self.define = (c, n) => {
    const i = a || ("document" in self ? document.currentScript.src : "") || location.href;
    if (e[i]) return;
    let t = {};
    const r = (a) => s(a, i),
      u = { module: { uri: i }, exports: t, require: r };
    e[i] = Promise.all(c.map((a) => u[a] || r(a))).then((a) => (n(...a), t));
  };
}
define(["./workbox-f1770938"], function (a) {
  "use strict";
  (importScripts("/fallback-ce627215c0e4a9af.js"),
    self.skipWaiting(),
    a.clientsClaim(),
    a.precacheAndRoute(
      [
        {
          url: "/_next/static/H2Rj3gFcalJuf_nacurJ7/_buildManifest.js",
          revision: "6310079bf1ae7bebeb6a2135896e4564",
        },
        {
          url: "/_next/static/H2Rj3gFcalJuf_nacurJ7/_ssgManifest.js",
          revision: "b6652df95db52feb4daf4eca35380933",
        },
        { url: "/_next/static/chunks/1428-0426f1c33f5a6312.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/1497-df07940366c9c916.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/2173-054dcb59f6ecd0c9.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/2697-a66fde94488e1373.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/2972-b6f204029ad9030d.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/3169-3b5ead06fcff8d44.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/3878-311107f4f77e82fb.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/4313-21561a776890bad2.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/4475-85b3d19cab91a259.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/4647-0db6788cb1739b8d.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/5152-50fdee1a475a2b89.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/5350-8687b35a109d4cc5.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/5462-62119837ff987552.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/6137-4dc78bf963e49844.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/6244-2dd049b8c3a6afab.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/6535-e007adf1747132cb.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/6712-6fb303d896f410f3.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/6875-786c9a233e029b64.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/6997-ae388f14c795ceab.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/7373-35cca38dd6f07f9a.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/7582-7f75c25a534a2943.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/7710-fe901a563d0e19b5.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/7782-3c7affc891754f67.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/8119-3d25dd60898b6aa2.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/8280-ce4089d56c846796.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/849-2db406cf1100673d.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/8828-25dcc1a419a9a99f.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/_next/static/chunks/9351-f7338a702e25686e.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        {
          url: "/_next/static/chunks/app/_not-found/page-b4239562641b7df1.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/auth/callback/page-81c3907eb009a02e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/edit/page-85aed2ba19907f84.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/page-aa9c8b404618f006.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/bills/new/page-7bee5254e4a1147c.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/bills/page-a9f39fa01d957cf5.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/customers/%5Bid%5D/page-9dcf1c6cb197d0f8.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/customers/page-46330a411624f657.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/dashboard/cashflow/page-1871bb5c437e8db1.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/dashboard/loading-6963a18d08a36e4a.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/dashboard/page-a277051cdb28325e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/design-system/page-4db8543e9ea085c2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/documents/page-35291f3f33769d44.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/error-8e0ce99d432a82db.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/page-d2e4a2fe54db934e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/preview/page-47b7ea2f41ab3b85.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/print/page-cc37b75671f30398.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/%5Bversion%5D/page-b01a0eeeca7d80eb.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/page-6e4718b8fbfdb74e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimates/new/page-22a9aa78c51d64b0.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimates/page-b01ed136c5b944cb.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/estimating/cost-codes/page-6c23e8f43f9e2663.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/finance/bills/page-f7227cbf714682ec.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/finance/cost-allocation/page-36827cf37beb1ec3.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/finance/expenses/page-9345f7478413cb07.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/finance/invoices/page-4aad60af98bb6ea9.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/finance/labor-cost/page-6fadc67b1843c6ef.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/finance/page-dd746bdda1521c50.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/accounts/page-4a6e27cbb0880a07.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/ar/page-9c8cedc4010c0ee0.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/bank/page-f6ad8fce7ebbe4d2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/%5Bid%5D/page-b1db8bf36d202756.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/new/page-415df45c44efe841.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/page-a8ac1a0ca20ea490.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/commissions/page-287704452cd56ad5.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/dashboard/page-1592600dda1dc04d.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/deposits/page-54076086c71c6d72.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/%5Bid%5D/page-cb8c893f5931b87b.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/new/page-089f3b00b1be3278.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/page-7ba9cc01fd236b0c.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/loading-b4db8ca2a588a401.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/page-e0967e86e65711eb.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/print/page-791ba1600f01b62b.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/new/page-b9b3151eb6f7f6d6.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/page-a3d6fd71488c2fa9.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/page-cd0d05f77131b2f7.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/payments/page-6da68700024255e6.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/reimbursements/page-bffe3c016a197a5e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/financial/vendors/page-cd1b56412090413c.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/inspection-log/page-f0cea49a00f5cdcc.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/cost-allocation/page-c00015762bf2b0f2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/daily/page-61689ba67ba9ade8.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/entries/page-96dc40df400d5365.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/%5Bid%5D/page-72edde81435701e2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/new/page-07cd2959a7f79cf7.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/page-a79f723be4422e05.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/layout-6b990e11d75d06a2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/monthly/page-8b4fb9690243e6c8.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/page-53b56e9269d83325.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/%5Bid%5D/receipt/page-e0ac86d9954d85df.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/page-dd951341f4ebb58b.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll-summary/page-ca31db775157092e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll/page-f9b0e50652951670.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/receipts/page-87ba265a6a4ae2d1.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/reimbursements/page-4b08d9e47f5833a1.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/review/page-c8c0115f617c9c3e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/%5Bid%5D/page-5d8f6456434a8cc2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/page-4beb1089c445f60b.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/timesheets/page-9a95b15f556e0031.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-invoices/page-73aece96583ec726.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/page-b77d22aff68a7a30.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/page-1d30ba16f0c8f875.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/print/page-ca892056b3d99dab.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/new/page-cbfb9a290ae4c33d.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/page-8b5c3442e6393458.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/layout-fd5d2718e1446fbb.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/login/page-81d87c5088e18b8c.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/logout/page-87b89ccac1a4f7f1.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/materials/catalog/page-f923757ab9d9c2d9.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/not-found-70f008598575deab.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/offline/page-c0bc3b34b8cabdb7.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/owner/page-b910533f94735dde.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/page-68f2011316e7ab0e.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/procurement/purchase-orders/page-81f3cf90bea6e3d2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/edit/page-cd5ab023c7da7ec6.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/page-01c24f0946dbbfd0.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/new/page-eb3f45f05714716c.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/labor/page-613dc325b835c9fb.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/page-5e94bfa84f319f23.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/profit/page-e6125718ac2ce576.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/bills/page-1320efc045194ab1.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/page-40db0b4df094de96.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/page-a2f55dc2d96da59c.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/daily-logs/page-d23b61b3d44da5ed.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/documents/page-11a52fe47c7be5e6.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/new/page-d415511ed75e0d32.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/page-1c675874ad032e45.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/projects/schedule/page-e2b7f99e3a936d21.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/punch-list/new/page-0fec45d6c8f4706a.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/punch-list/page-17abf5c1c60fe52b.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/receipt/page-6352ab6730c86127.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/schedule/page-8a74da51836f52db.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/account/page-7fe21184e6467d07.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/categories/page-432ebcee40bf0cd9.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/company/page-a9c476ebe07134be.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/lists/page-6eac578e3e88b8e9.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/page-103f3892c61ab1f3.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/permissions/page-65cbb27279a18fa0.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/subcontractors/page-d604e7a72f2de7bb.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/settings/users/page-10d8775d9c0f3d7f.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/site-photos/page-68bb6f4c50128174.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/site-photos/upload/page-6c3a057b774af5d6.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/%5Bid%5D/page-b712880241f4a7aa.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/page-07921cd74650c4f2.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/tasks/new/page-eeccbc7de72fb6fd.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/tasks/page-001936ef83ad2fd7.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/upload-receipt/page-cc21241bc14cc285.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/app/workers/page-1193d69a577269ba.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/fd9d1056-c94a455c5b14996f.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/framework-8e0e0f4a6b83a956.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        { url: "/_next/static/chunks/main-0490662491adebf2.js", revision: "H2Rj3gFcalJuf_nacurJ7" },
        {
          url: "/_next/static/chunks/main-app-7691ad3584d91f8b.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/pages/_app-3c9ca398d360b709.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/pages/_error-cf5ca766ac8f493f.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        {
          url: "/_next/static/chunks/polyfills-42372ed130431b0a.js",
          revision: "846118c33b2c0e922d7b3a7676f81f6f",
        },
        {
          url: "/_next/static/chunks/webpack-adf6532065f37012.js",
          revision: "H2Rj3gFcalJuf_nacurJ7",
        },
        { url: "/_next/static/css/0e1cacf089df3e2e.css", revision: "0e1cacf089df3e2e" },
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
        { url: "/offline", revision: "H2Rj3gFcalJuf_nacurJ7" },
        { url: "/swe-worker-5c72df51bb1f6ee0.js", revision: "5a47d90db13bb1309b25bdf7b363570e" },
      ],
      { ignoreURLParametersMatching: [/^utm_/, /^fbclid$/] }
    ),
    a.cleanupOutdatedCaches(),
    a.registerRoute(
      "/",
      new a.NetworkFirst({
        cacheName: "start-url",
        plugins: [
          {
            cacheWillUpdate: async ({ response: a }) =>
              a && "opaqueredirect" === a.type
                ? new Response(a.body, { status: 200, statusText: "OK", headers: a.headers })
                : a,
          },
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      new a.CacheFirst({
        cacheName: "google-fonts-webfonts",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 31536e3 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      new a.StaleWhileRevalidate({
        cacheName: "google-fonts-stylesheets",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      new a.StaleWhileRevalidate({
        cacheName: "static-font-assets",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      new a.StaleWhileRevalidate({
        cacheName: "static-image-assets",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 2592e3 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\/_next\/static.+\.js$/i,
      new a.CacheFirst({
        cacheName: "next-static-js-assets",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\/_next\/image\?url=.+$/i,
      new a.StaleWhileRevalidate({
        cacheName: "next-image",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\.(?:mp3|wav|ogg)$/i,
      new a.CacheFirst({
        cacheName: "static-audio-assets",
        plugins: [
          new a.RangeRequestsPlugin(),
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\.(?:mp4|webm)$/i,
      new a.CacheFirst({
        cacheName: "static-video-assets",
        plugins: [
          new a.RangeRequestsPlugin(),
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\.(?:js)$/i,
      new a.StaleWhileRevalidate({
        cacheName: "static-js-assets",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\.(?:css|less)$/i,
      new a.StaleWhileRevalidate({
        cacheName: "static-style-assets",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\/_next\/data\/.+\/.+\.json$/i,
      new a.StaleWhileRevalidate({
        cacheName: "next-data",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      /\.(?:json|xml|csv)$/i,
      new a.NetworkFirst({
        cacheName: "static-data-assets",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      ({ sameOrigin: a, url: { pathname: e } }) =>
        !(!a || e.startsWith("/api/auth/callback") || !e.startsWith("/api/")),
      new a.NetworkFirst({
        cacheName: "apis",
        networkTimeoutSeconds: 10,
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      ({ request: a, url: { pathname: e }, sameOrigin: s }) =>
        "1" === a.headers.get("RSC") &&
        "1" === a.headers.get("Next-Router-Prefetch") &&
        s &&
        !e.startsWith("/api/"),
      new a.NetworkFirst({
        cacheName: "pages-rsc-prefetch",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      ({ request: a, url: { pathname: e }, sameOrigin: s }) =>
        "1" === a.headers.get("RSC") && s && !e.startsWith("/api/"),
      new a.NetworkFirst({
        cacheName: "pages-rsc",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      ({ url: { pathname: a }, sameOrigin: e }) => e && !a.startsWith("/api/"),
      new a.NetworkFirst({
        cacheName: "pages",
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    a.registerRoute(
      ({ sameOrigin: a }) => !a,
      new a.NetworkFirst({
        cacheName: "cross-origin",
        networkTimeoutSeconds: 10,
        plugins: [
          new a.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 3600 }),
          {
            handlerDidError: async ({ request: a }) =>
              "undefined" != typeof self ? self.fallback(a) : Response.error(),
          },
        ],
      }),
      "GET"
    ));
});
