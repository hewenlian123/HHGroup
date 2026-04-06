if (!self.define) {
  let s,
    e = {};
  const t = (t, a) => (
    (t = new URL(t + ".js", a).href),
    e[t] ||
      new Promise((e) => {
        if ("document" in self) {
          const s = document.createElement("script");
          ((s.src = t), (s.onload = e), document.head.appendChild(s));
        } else ((s = t), importScripts(t), e());
      }).then(() => {
        let s = e[t];
        if (!s) throw new Error(`Module ${t} didn’t register its module`);
        return s;
      })
  );
  self.define = (a, n) => {
    const i = s || ("document" in self ? document.currentScript.src : "") || location.href;
    if (e[i]) return;
    let c = {};
    const m = (s) => t(s, i),
      r = { module: { uri: i }, exports: c, require: m };
    e[i] = Promise.all(a.map((s) => r[s] || m(s))).then((s) => (n(...s), c));
  };
}
define(["./workbox-f1770938"], function (s) {
  "use strict";
  (importScripts("/fallback-ce627215c0e4a9af.js"),
    self.skipWaiting(),
    s.clientsClaim(),
    s.precacheAndRoute(
      [
        { url: "/_next/static/chunks/1336-7c8ac1e23a21682e.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/1609-f9d17d51d3f395a0.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/164f4fb6.01f62cdcaa6548f8.js", revision: "01f62cdcaa6548f8" },
        { url: "/_next/static/chunks/2100-8442c88ab916748d.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/2116-2d873f8dcbebd1b7.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/2374-99035c5f05e00dc9.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/257.990da16794a31292.js", revision: "990da16794a31292" },
        { url: "/_next/static/chunks/2961-6474136750bf8ca0.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/2972-301abbadfe8edd54.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/2f0b94e8.452a2d27023d71da.js", revision: "452a2d27023d71da" },
        { url: "/_next/static/chunks/3169-9020c8c0d6e5d75f.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/3588-c52fd6e3eeca69a8.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/3660-621825b85bbf84bc.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/3969.65f2cc9d11e52187.js", revision: "65f2cc9d11e52187" },
        { url: "/_next/static/chunks/4456-f0adc95d4c5af540.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/4506-04f26af41aac1930.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/4793-ba8d5d55483cbc3a.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/4819-ad01df45cf44e78d.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/489-6185e214da90d907.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/4910.d74da32d3a5486d5.js", revision: "d74da32d3a5486d5" },
        { url: "/_next/static/chunks/5061-6e640e5bcd768e49.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/5255-bfc3713f79caa223.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/5308-42342503caa7f4f9.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/5400-01c327f7312b663c.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/54a60aa6.77153ce3b1d1ced6.js", revision: "77153ce3b1d1ced6" },
        { url: "/_next/static/chunks/5525.07d34a423925b46b.js", revision: "07d34a423925b46b" },
        { url: "/_next/static/chunks/5602-584d6a701882d1bb.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/5707-e6665cd8eb63ef81.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/5854.d1a1e04a7a04a7b8.js", revision: "d1a1e04a7a04a7b8" },
        { url: "/_next/static/chunks/5864-5e12f91306b290f9.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/5937-879c4ae93766c124.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/5968-4fe1f80e4de0b71b.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6137-4dc78bf963e49844.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6148-d470274363a0d271.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6415-e8a65a6d8fbec695.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6520-666dd6dce8c4c03e.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6553-3237184276775bb0.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6665-8d7351b19727c960.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6705-bbf6c84e3fb30a7a.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6839.201b1af8ea02b716.js", revision: "201b1af8ea02b716" },
        { url: "/_next/static/chunks/6875-999a7cd2d127cf74.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6930-37c87b857e12fc13.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/6997-d8a92cc28636847a.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/708-95066ac854a63997.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/7081-649813016aa121f1.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/70e0d97a.10697e149c892b07.js", revision: "10697e149c892b07" },
        { url: "/_next/static/chunks/7129-4633099acd21b090.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/7235-18061b1a86d80519.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/7307-0d9b294804aea88d.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/7537-4258b5af7bd1529b.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/7836-071508e63c680402.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8044-1f6d1015e1bc258d.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8094-63c7812447223ea3.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8132-c37c809abb8d4bbd.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8280-ce4089d56c846796.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8467-e78ef96abd997060.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8642-d492714e85f157ac.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8675-be662123c990bfce.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8710-1baca4628c3a9f41.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8758.6d2e237b08163e73.js", revision: "6d2e237b08163e73" },
        { url: "/_next/static/chunks/8768-7282ab9e116f4f83.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8848-99c76f823b9a86f1.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/8867-133f2a0fc2f8bc3d.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/9102-9c4b4af08a90d780.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/9302-b203ea82b1539199.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/9441-ffc8e39b791ceb1c.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/9529-28a078a9b1a4f356.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/9915-75594136d0847bd6.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/993-f0d0f44b467fc14b.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/9933-93520a3279798ba3.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/9941-16cc79f6eea55f3e.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/_next/static/chunks/ad2866b8.1fd5edbd6b1bba26.js", revision: "1fd5edbd6b1bba26" },
        {
          url: "/_next/static/chunks/app/(dashboard)/receipt-queue/page-7e71cc7850bed65f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/_not-found/page-27d043261d046a2a.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/auth/callback/page-2420f1b46f85fc60.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/edit/page-82c27712a9016c38.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/page-8ee00f1b146ce443.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/bills/loading-4e685b8f81b02cf5.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/bills/new/page-669cd4871197a06c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/bills/page-64290f7cb9c3886e.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/change-orders/page-ecad7039a7242066.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/customers/%5Bid%5D/page-25683c7963d7e242.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/customers/page-0c88ba8ad85fa031.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/dashboard/cashflow/page-304246f7b091e4da.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/dashboard/loading-1047430b6ee62772.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/dashboard/page-63ad512659cb50ff.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/design-system/page-c829c643ca2f43c8.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/documents/page-f38dcc91814761a7.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/error-5c553c944879fe34.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/page-75bd1d072f5342f2.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/preview/page-d1621e8b7a62b0f0.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/print/page-16c93656fee8448f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/%5Bversion%5D/page-2fb0316503490600.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/page-1cc9407ce782b59e.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimates/new/page-6d65cf99828e8608.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimates/page-d412def9453b0675.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/estimating/cost-codes/page-ad03dc0734046646.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/finance/advances/page-680bb5373b4a06af.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/finance/bills/page-3289d88f1cc9902a.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/finance/cost-allocation/page-ee7083be634d545f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/finance/expenses/page-e6c28b1f6a553bb1.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/finance/invoices/page-3f48d66244f7533c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/finance/labor-cost/page-da94662d49e40843.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/finance/page-394bd436fa89f70b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/accounts/page-f4b5eebc85c029ad.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/ar/page-89b73633adef9912.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/bank/page-1aeaab286780bbeb.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/%5Bid%5D/page-a7b98f29dab495c4.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/new/page-716647f7b1af86ef.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/page-1340b4c5d8e328ad.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/commissions/page-fa3009f992d0e712.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/dashboard/loading-7a8f4d8007ae9b8c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/dashboard/page-3cda591dc59c538d.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/deposits/page-e2dd9953da5d0023.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/%5Bid%5D/page-d54f3b5d4db95c6c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/new/page-9fdd1989d128600b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/page-c27af7d90e55e1de.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/loading-3b6038ab4b46c690.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/page-884df16dd8573c7a.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/print/page-264ed39463aa4268.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/new/page-6ba79bf2c3f6f2ee.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/page-4bb8ec3777103336.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/page-01075096e6a4746a.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/payments-received/page-01b47c8eeacf38b3.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/payments/page-96bbb0a2a6db5e4f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/receipt-queue/page-31935ed1459fbb38.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/reimbursements/page-1632848f2fc5431c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/vendors/page-eb729a3f78f18d4f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/financial/workers/page-ecbc23ddf122bc32.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/inspection-log/page-bdfe5d51a6e3b9f7.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/advances/page-e1dc8731f5d5eb6b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/cost-allocation/page-163d3762372b3250.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/daily-entry/page-699a79760fc847de.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/daily/page-a5ca2107652dc35e.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/entries/page-4c127f388811da0e.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/%5Bid%5D/page-a9f182233b76e511.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/new/page-d9e9a7b85dbb8d8d.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/page-1283ac2f7b01be0e.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/layout-24a48001dfd50a64.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/monthly/page-5fe8b5cb7041e5dc.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/page-ff13dc98ced3e3df.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/%5Bid%5D/receipt/layout-1319ec95e0406df7.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/%5Bid%5D/receipt/page-3bce19884e7984db.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/page-942f1e64c7bc490a.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll-summary/page-103f1a67609afa41.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll/page-da5a3e48edc67c46.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/receipts/page-0f8ff30b7b5161c9.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/reimbursements/page-f356b53b823b11d1.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/review/page-3d7df6d79e446770.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/%5Bid%5D/page-85a5b8fd7f33f275.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/page-76bd385fc6c4675f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/timesheets/page-20eb8daa5bef65ed.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-balances/page-21935c197334e716.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-invoices/page-513dbb84a1a9a055.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/balance/page-c8c93ceef39fb522.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/page-6839fbd05149d4d2.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/page-a0a45d5bf15eda9b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/print/page-b7ec1f21d6936f1e.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/new/page-a902b2e14cd495cf.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/page-6220480250171a36.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/layout-739f4b37e0129fe6.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/login/page-b6434a5905a26033.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/logout/page-b38ecfc88d2e2393.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/materials/catalog/page-9bd333dea905026b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/not-found-2e45947948febfcf.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/offline/page-7fed518819fe6077.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/owner/page-c465c93ece9b2272.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/page-43bcdab80277dec5.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/people/vendors/page-d39bc335cf970108.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/procurement/purchase-orders/page-8b3f381c042010cb.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/edit/page-4dade53c4a7022e0.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/page-48b8d1f1bb06ea65.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/new/page-27673dab3d7cf654.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/edit/page-c8f39ee17e07cdcc.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/labor/page-d5247926de7a90eb.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/page-cdfcf3d01078e561.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/profit/page-7db84df9d4850b40.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/bills/page-95954e55ba280b9f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/page-86728c0b71edfe40.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/page-0e1c9cbfe7bf9f44.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/daily-logs/page-7647cf65961c3d70.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/documents/page-29c4a56f727d7154.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/new/page-75aba3004c384993.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/page-c3f23d8fe59c702a.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/projects/schedule/page-83fe7e17f63d00a5.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/punch-list/new/page-53ce0e3b471c79cf.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/punch-list/page-52f8c754fa20edf8.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/receipt/page-5dc1e424e8b6874b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/receipt/print/%5Bid%5D/page-d2132fb6fd115cba.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/receipt/print/layout-62bc2fe4f5452e1c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/schedule/page-f81078f9168055ba.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/account/page-c23f9d38e9c01e46.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/categories/page-c51aee13d4ef0f79.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/company/page-864333b32b786c5b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/lists/page-895d57152e019d0c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/page-2b9d96d37b321d6c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/permissions/page-1a6be32e290a5a42.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/subcontractors/page-d0de384905b46038.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/settings/users/page-a4e66bc64284b67c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/site-photos/page-790b153ead46ddec.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/site-photos/upload/page-7c94c7aa7f2cb7a4.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/%5Bid%5D/page-c3830229f3548260.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/page-1884d5ef8ffd2a21.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/system-health/page-abf5447cef01dfaf.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/system-logs/page-e18be9356477eece.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/system-metrics/page-15bf11c325b43df5.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/system-tests/page-4914c6842243a2de.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/system-tests/ui/page-d5158749d8d3752a.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/system/backups/page-12ff511f51ce45b6.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/tasks/new/page-ae174ae7431d80a4.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/tasks/page-5a86516b06b104f2.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/upload-receipt/page-f7fc7f5625d95688.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/vendors/page-ec9664a4f4cd96b1.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/edit/page-bcc0e1682e1f50ab.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/page-fead716224bf25f7.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/statement/page-2b97ffb26e078c20.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/statement/print/page-96ab25daef1f90aa.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/workers/page-7ac19f54d4518439.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/app/workers/summary/page-8f13b11163579f33.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        { url: "/_next/static/chunks/b645e135.7db7a52a2f989500.js", revision: "7db7a52a2f989500" },
        { url: "/_next/static/chunks/bc98253f.5b0f4fe717c5b99c.js", revision: "5b0f4fe717c5b99c" },
        {
          url: "/_next/static/chunks/fd9d1056-206824f049ead719.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/framework-8e0e0f4a6b83a956.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        { url: "/_next/static/chunks/main-484ca26bb44cdf16.js", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        {
          url: "/_next/static/chunks/main-app-7691ad3584d91f8b.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/pages/_app-3c9ca398d360b709.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/pages/_error-cf5ca766ac8f493f.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        {
          url: "/_next/static/chunks/polyfills-42372ed130431b0a.js",
          revision: "846118c33b2c0e922d7b3a7676f81f6f",
        },
        {
          url: "/_next/static/chunks/webpack-5b3c5a5e528a4b7c.js",
          revision: "mhvU3QMmm-mtt1YX6s4IH",
        },
        { url: "/_next/static/css/2b8e2ccf1a26d20e.css", revision: "2b8e2ccf1a26d20e" },
        { url: "/_next/static/css/46fbf19b428030c7.css", revision: "46fbf19b428030c7" },
        { url: "/_next/static/css/7fb58c072db6e5c5.css", revision: "7fb58c072db6e5c5" },
        { url: "/_next/static/css/d86c20e2d9d8f5b6.css", revision: "d86c20e2d9d8f5b6" },
        { url: "/_next/static/css/d879890de24e5d72.css", revision: "d879890de24e5d72" },
        { url: "/_next/static/css/e4003f0cd5bec11e.css", revision: "e4003f0cd5bec11e" },
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
        {
          url: "/_next/static/mhvU3QMmm-mtt1YX6s4IH/_buildManifest.js",
          revision: "6310079bf1ae7bebeb6a2135896e4564",
        },
        {
          url: "/_next/static/mhvU3QMmm-mtt1YX6s4IH/_ssgManifest.js",
          revision: "b6652df95db52feb4daf4eca35380933",
        },
        { url: "/fallback-ce627215c0e4a9af.js", revision: "4f20e76600cac989810927f2e95e5b79" },
        { url: "/favicon.png", revision: "6630b11844e57e2428939b20f3ad57a9" },
        { url: "/icons/icon-192.png", revision: "3afc847bfceaae90fdf247b86a50b79a" },
        { url: "/icons/icon-512.png", revision: "1a9bde0e31159e0df005e4e9f882bfce" },
        { url: "/logo.png", revision: "6d85f36f8b880b57837c9476c436d53e" },
        { url: "/manifest.json", revision: "1ed948487cd83d4233132473a4d46e82" },
        { url: "/offline", revision: "mhvU3QMmm-mtt1YX6s4IH" },
        { url: "/sw 10.js", revision: "145677663506f5a9a1da603bf1a3bf31" },
        { url: "/sw 11.js", revision: "887d3068154ae66437812f19cca5eeb0" },
        { url: "/sw 2.js", revision: "39a1ef70ec75cb5621a353cd20855981" },
        { url: "/sw 3.js", revision: "15e3c5db89a3194e4322f0733af218b8" },
        { url: "/sw 4.js", revision: "1351d1fe74ac02f02d38efbb87c6857b" },
        { url: "/sw 5.js", revision: "09ab146c58cafca74470a080ce67e26b" },
        { url: "/sw 6.js", revision: "145677663506f5a9a1da603bf1a3bf31" },
        { url: "/sw 7.js", revision: "145677663506f5a9a1da603bf1a3bf31" },
        { url: "/sw 8.js", revision: "ce20207aa531ba740db12d1a4260317f" },
        { url: "/sw 9.js", revision: "0e0cb9c5c4b280b2198ca1caeec5e982" },
        { url: "/swe-worker-5c72df51bb1f6ee0.js", revision: "5a47d90db13bb1309b25bdf7b363570e" },
      ],
      { ignoreURLParametersMatching: [/^utm_/, /^fbclid$/] }
    ),
    s.cleanupOutdatedCaches(),
    s.registerRoute(
      "/",
      new s.NetworkFirst({
        cacheName: "start-url",
        plugins: [
          {
            cacheWillUpdate: async ({ response: s }) =>
              s && "opaqueredirect" === s.type
                ? new Response(s.body, { status: 200, statusText: "OK", headers: s.headers })
                : s,
          },
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      new s.CacheFirst({
        cacheName: "google-fonts-webfonts",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 31536e3 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      new s.StaleWhileRevalidate({
        cacheName: "google-fonts-stylesheets",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      new s.StaleWhileRevalidate({
        cacheName: "static-font-assets",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 604800 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      new s.StaleWhileRevalidate({
        cacheName: "static-image-assets",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 2592e3 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\/_next\/static.+\.js$/i,
      new s.CacheFirst({
        cacheName: "next-static-js-assets",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\/_next\/image\?url=.+$/i,
      new s.StaleWhileRevalidate({
        cacheName: "next-image",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\.(?:mp3|wav|ogg)$/i,
      new s.CacheFirst({
        cacheName: "static-audio-assets",
        plugins: [
          new s.RangeRequestsPlugin(),
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\.(?:mp4|webm)$/i,
      new s.CacheFirst({
        cacheName: "static-video-assets",
        plugins: [
          new s.RangeRequestsPlugin(),
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\.(?:js)$/i,
      new s.StaleWhileRevalidate({
        cacheName: "static-js-assets",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\.(?:css|less)$/i,
      new s.StaleWhileRevalidate({
        cacheName: "static-style-assets",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\/_next\/data\/.+\/.+\.json$/i,
      new s.StaleWhileRevalidate({
        cacheName: "next-data",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      /\.(?:json|xml|csv)$/i,
      new s.NetworkFirst({
        cacheName: "static-data-assets",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      ({ sameOrigin: s, url: { pathname: e } }) =>
        !(!s || e.startsWith("/api/auth/callback") || !e.startsWith("/api/")),
      new s.NetworkFirst({
        cacheName: "apis",
        networkTimeoutSeconds: 10,
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      ({ request: s, url: { pathname: e }, sameOrigin: t }) =>
        "1" === s.headers.get("RSC") &&
        "1" === s.headers.get("Next-Router-Prefetch") &&
        t &&
        !e.startsWith("/api/"),
      new s.NetworkFirst({
        cacheName: "pages-rsc-prefetch",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      ({ request: s, url: { pathname: e }, sameOrigin: t }) =>
        "1" === s.headers.get("RSC") && t && !e.startsWith("/api/"),
      new s.NetworkFirst({
        cacheName: "pages-rsc",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      ({ url: { pathname: s }, sameOrigin: e }) => e && !s.startsWith("/api/"),
      new s.NetworkFirst({
        cacheName: "pages",
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 86400 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ),
    s.registerRoute(
      ({ sameOrigin: s }) => !s,
      new s.NetworkFirst({
        cacheName: "cross-origin",
        networkTimeoutSeconds: 10,
        plugins: [
          new s.ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 3600 }),
          {
            handlerDidError: async ({ request: s }) =>
              "undefined" != typeof self ? self.fallback(s) : Response.error(),
          },
        ],
      }),
      "GET"
    ));
});
