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
      p = { module: { uri: n }, exports: c, require: r };
    s[n] = Promise.all(t.map((e) => p[e] || r(e))).then((e) => (a(...e), c));
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
          url: "/_next/static/OJwi6TCKpZByzZXLowZt4/_buildManifest.js",
          revision: "6310079bf1ae7bebeb6a2135896e4564",
        },
        {
          url: "/_next/static/OJwi6TCKpZByzZXLowZt4/_ssgManifest.js",
          revision: "b6652df95db52feb4daf4eca35380933",
        },
        { url: "/_next/static/chunks/1025-91664c9ee00d1a40.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/1336-487b7e5e5abd8b64.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/1428-16868790a6fec997.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/164f4fb6.01f62cdcaa6548f8.js", revision: "01f62cdcaa6548f8" },
        { url: "/_next/static/chunks/257.990da16794a31292.js", revision: "990da16794a31292" },
        { url: "/_next/static/chunks/2814-f6aed05a70ef6475.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/2961-794eb19a4e501ab9.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/2972-af62affbbad75677.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/2f0b94e8.452a2d27023d71da.js", revision: "452a2d27023d71da" },
        { url: "/_next/static/chunks/316-8c733474779e25a6.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/3169-a272d2f7343014b6.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/3583-2c49253b752499be.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/3660-b366c8bf170de225.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/3880-bb87ee824e2980d1.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/3960-09906d2442cdfcd9.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/3969.65f2cc9d11e52187.js", revision: "65f2cc9d11e52187" },
        { url: "/_next/static/chunks/4067-f6fb12f6f4eda798.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/4201-f2aa5bde73ee41c4.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/4347-0a2dd8dbd6770781.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/4459-bded7e2288282188.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/4506-7c8f05fbada1c6c0.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/4793-0143adc7db50596e.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/4910.d74da32d3a5486d5.js", revision: "d74da32d3a5486d5" },
        { url: "/_next/static/chunks/5255-94a3a4d2ab8759fa.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/54a60aa6.77153ce3b1d1ced6.js", revision: "77153ce3b1d1ced6" },
        { url: "/_next/static/chunks/5525.07d34a423925b46b.js", revision: "07d34a423925b46b" },
        { url: "/_next/static/chunks/5574-10b23e8bbe9b1035.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/5598-cdb33770b575ab44.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/5602-584d6a701882d1bb.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/5776-30813deb68529294.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/5854.d1a1e04a7a04a7b8.js", revision: "d1a1e04a7a04a7b8" },
        { url: "/_next/static/chunks/5864-16f70ef020092955.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/5937-25b05643008644a7.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/5958-0b9718862db7fe6b.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6137-4dc78bf963e49844.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6197-3e5125eeaee5a195.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6466-6f7d05e737b21630.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6553-eb71f935013821b8.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6665-bbb986c060b28c2b.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6705-6225b086a0a09011.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6839.201b1af8ea02b716.js", revision: "201b1af8ea02b716" },
        { url: "/_next/static/chunks/6875-c6b9817282107fe2.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6960-accd069f3a4684f1.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/6997-5123212ea722e689.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/7081-dc51de108a49a4b8.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/70e0d97a.10697e149c892b07.js", revision: "10697e149c892b07" },
        { url: "/_next/static/chunks/7307-2393c16f503abe0b.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/7316-5d6d923bd10dc756.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/7537-4258b5af7bd1529b.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/8132-68695231e0fe8237.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/8280-ce4089d56c846796.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/8642-20bcb02dd864ee4f.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/8675-4ede494b442e60a9.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/8710-10d8bc3aec21204c.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/8758.6d2e237b08163e73.js", revision: "6d2e237b08163e73" },
        { url: "/_next/static/chunks/8768-53058b0c6efffd94.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/8848-99c76f823b9a86f1.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/9302-2b6c97e790b59dfe.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/9473-f59110329ea94f9a.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/9915-6b8cd5f14a2ac169.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/993-29a0979c7da13324.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/9933-83aa33c3022e14a6.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/9941-a7eea6b8955faab7.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/9974-bcfc76f767eae07b.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/9980-54634843c6e62b1d.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/_next/static/chunks/ad2866b8.1fd5edbd6b1bba26.js", revision: "1fd5edbd6b1bba26" },
        {
          url: "/_next/static/chunks/app/(dashboard)/receipt-queue/page-76255ce9e27b4b42.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/_not-found/page-cad9f93e7ea14a34.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/auth/callback/page-e583d5bc4c7cf276.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/edit/page-5891e0f2c70a94de.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/bills/%5Bid%5D/page-336ad1a8f234e687.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/bills/new/page-1efcf2038d603d67.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/bills/page-5492689421636d53.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/change-orders/page-d547357ea467bfbf.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/customers/%5Bid%5D/page-d6f512746cecfee2.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/customers/page-283863a2512a8ae3.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/dashboard/cashflow/page-29f6327d2d4173cc.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/dashboard/loading-144d04f9e75aa650.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/dashboard/page-b7feb0e0fba4606c.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/design-system/page-772cfbdaf5f4ec0e.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/documents/page-50aacded86a01e75.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/error-2c7c336b26136032.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/page-5079d817bc0296dc.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/preview/page-342048eb2f82705e.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/print/page-1ec27372864bea62.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/%5Bversion%5D/page-c8e455494ddef0cf.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimates/%5Bid%5D/snapshot/page-d97151077bc0398f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimates/new/page-25321267ea639795.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimates/page-0cc9ccafaabf69d7.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/estimating/cost-codes/page-94823ed00f104095.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/finance/advances/page-be20c180126715c5.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/finance/bills/page-962c527a5e2462f0.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/finance/cost-allocation/page-1e60096a45b6c961.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/finance/expenses/page-7d04e5ee838abab1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/finance/invoices/page-2f0e327f16b364f7.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/finance/labor-cost/page-76a10cfce197a0fa.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/finance/page-13864676760db4ea.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/accounts/page-8df11d244ff458c8.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/ar/page-89b73633adef9912.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/bank/page-d5f02681d5413f27.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/%5Bid%5D/page-1af64c278ce07e5f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/new/page-09c6df3fc03f8d34.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/bills/page-28daac16a541f28a.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/commissions/page-77c945fa06509fa3.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/dashboard/page-12bc62b8a6f6ea45.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/deposits/page-c67c3cfdc22a2517.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/%5Bid%5D/page-bf4cc25ce96f20eb.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/new/page-f7779b3093722cae.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/expenses/page-c1d1b33d2a1adc2d.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/loading-ba4220e95b613fff.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/page-0698ec55f37cedd9.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/%5Bid%5D/print/page-301b5005652b71b7.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/new/page-50bd5017e47f6c82.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/invoices/page-a60d159e5c436a77.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/page-01075096e6a4746a.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/payments-received/page-f1303aa2d48531bf.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/payments/page-19e4482f9ebbdaac.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/receipt-queue/page-9eef173f104bc1d1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/reimbursements/page-99ab16ea1216981f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/vendors/page-1c5784e1107e83d1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/financial/workers/page-2b2623a3589a57b2.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/inspection-log/page-e49c7b6a54fd5fb2.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/advances/page-ae19e644b2abb734.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/cost-allocation/page-247d30c5012724ad.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/daily-entry/page-373e39fa725e4638.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/daily/page-81656e85803a7dfc.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/entries/page-bd4627b1de18a81a.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/%5Bid%5D/page-9c4e1813b0ae035c.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/new/page-d1376740fe49f8dc.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/invoices/page-756e9449761cc88c.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/layout-d455d353d548b649.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/monthly/page-1e5db8ad0d9061b6.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/page-a91c34ce823ec8e5.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/%5Bid%5D/receipt/layout-1319ec95e0406df7.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/%5Bid%5D/receipt/page-f457fdc4ee2ea50a.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/payments/page-e6ac30cabb03dda1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll-summary/page-8eb68ff8ccf413bd.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/payroll/page-1cb55ebc04a69bda.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/receipts/page-1da80f45db97acb3.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/reimbursements/page-ab1ea3742688ff32.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/review/page-72f626b0e275c581.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/%5Bid%5D/page-e7792d3ea9ba7219.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/subcontractors/page-b6c4f292e13718b9.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/timesheets/page-1d9bcf4ac9ff9796.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-balances/page-058c7ae7c91ab5f9.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/worker-invoices/page-8bf9b6f33ca21343.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/balance/page-d7c7c644062ab465.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/page-63ccce036f85cd21.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/page-3beab16972c3d4d3.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/%5Bid%5D/statement/print/page-11eeb6c9cbe6904a.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/new/page-1ac053a24474f740.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/labor/workers/page-2f5571fab9a21488.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/layout-fddf9b11e586bc25.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/login/page-b6434a5905a26033.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/logout/page-e3dae9c7aed43aea.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/materials/catalog/page-0664b722acd302f4.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/not-found-ae6280cb17016492.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/offline/page-ee253043b6237a62.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/owner/page-ff7cae4126ba7daa.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/page-4f79376999109dd1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/people/vendors/page-73ecc37c0a860593.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/procurement/purchase-orders/page-0cc13822520fcd35.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/edit/page-903b527946e65bd5.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/%5BcoId%5D/page-87479f4de88abc88.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/change-orders/new/page-f21ea486758f52b6.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/edit/page-361b8021f96578fd.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/labor/page-a13058344064e67b.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/page-1da2bf3d27c4f8ca.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/profit/page-31d732589b7b8a67.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/bills/page-24dc6ea87e6ba1c9.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/%5BsubId%5D/page-63a2218d2f4c0fa4.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/%5Bid%5D/subcontracts/page-13290388a7b443ce.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/daily-logs/page-d4b6febb6b350c39.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/documents/page-1398f8474098d890.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/new/page-174a1803cad562c8.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/page-bd5f4f6837575ceb.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/projects/schedule/page-549db7a8ad19d748.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/punch-list/new/page-bfff3953372cf5b4.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/punch-list/page-49093163bd3305a6.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/receipt/page-83422a4658c770e6.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/receipt/print/%5Bid%5D/page-48efff9801b1b185.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/receipt/print/layout-62bc2fe4f5452e1c.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/schedule/page-0596c9e11a579c9c.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/account/page-f93611617e9ca9aa.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/categories/page-3cbec771de06338b.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/company/page-32cd10ab6eb0d5b4.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/lists/page-76ae0844095eb08d.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/page-579817977914966a.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/permissions/page-75d2736e774f093d.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/subcontractors/page-4f87258f7aa6102f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/settings/users/page-6f195910c3ef6b72.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/site-photos/page-84c56ac7ca17a858.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/site-photos/upload/page-688ed79017bf7268.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/%5Bid%5D/page-5db2347b36fbadb1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/subcontractors/page-b7d3cfc35f9a6ae1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/system-health/page-578cf4c4dc0d8976.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/system-logs/page-48575cb01bd622b8.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/system-metrics/page-f4dc57e5856df5e1.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/system-tests/page-d905382cdd181a20.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/system-tests/ui/page-b5b0509146f183f3.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/system/backups/page-6983926c4013f4ce.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/tasks/new/page-c914df16a07d7b78.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/tasks/page-e3491026d25cfc5f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/upload-receipt/page-e91fc5130d967722.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/vendors/page-6aec4565d4982d1f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/edit/page-e1223ade59ef8ff3.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/page-1fb5be4af94e2870.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/statement/page-689f4a4151b7509b.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/workers/%5Bid%5D/statement/print/page-473f00065bbba05e.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/workers/page-4407d79d5162487a.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/app/workers/summary/page-889b5e458a19544f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        { url: "/_next/static/chunks/b645e135.7db7a52a2f989500.js", revision: "7db7a52a2f989500" },
        { url: "/_next/static/chunks/bc98253f.5b0f4fe717c5b99c.js", revision: "5b0f4fe717c5b99c" },
        {
          url: "/_next/static/chunks/fd9d1056-992d4b20aac13be7.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/framework-8e0e0f4a6b83a956.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        { url: "/_next/static/chunks/main-484ca26bb44cdf16.js", revision: "OJwi6TCKpZByzZXLowZt4" },
        {
          url: "/_next/static/chunks/main-app-7691ad3584d91f8b.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/pages/_app-3c9ca398d360b709.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/pages/_error-cf5ca766ac8f493f.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        {
          url: "/_next/static/chunks/polyfills-42372ed130431b0a.js",
          revision: "846118c33b2c0e922d7b3a7676f81f6f",
        },
        {
          url: "/_next/static/chunks/webpack-8043da01ae89a3fb.js",
          revision: "OJwi6TCKpZByzZXLowZt4",
        },
        { url: "/_next/static/css/296f67076b2e0c55.css", revision: "296f67076b2e0c55" },
        { url: "/_next/static/css/46fbf19b428030c7.css", revision: "46fbf19b428030c7" },
        { url: "/_next/static/css/61cbd544b26a5ed9.css", revision: "61cbd544b26a5ed9" },
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
        { url: "/fallback-ce627215c0e4a9af.js", revision: "4f20e76600cac989810927f2e95e5b79" },
        { url: "/favicon.png", revision: "6630b11844e57e2428939b20f3ad57a9" },
        { url: "/icons/icon-192.png", revision: "3afc847bfceaae90fdf247b86a50b79a" },
        { url: "/icons/icon-512.png", revision: "1a9bde0e31159e0df005e4e9f882bfce" },
        { url: "/logo.png", revision: "6d85f36f8b880b57837c9476c436d53e" },
        { url: "/manifest.json", revision: "1ed948487cd83d4233132473a4d46e82" },
        { url: "/offline", revision: "OJwi6TCKpZByzZXLowZt4" },
        { url: "/sw 10.js", revision: "145677663506f5a9a1da603bf1a3bf31" },
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
