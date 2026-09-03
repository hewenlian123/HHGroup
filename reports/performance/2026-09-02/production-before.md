# HH Group Production Performance Baseline — BEFORE

Production was probed read-only at `https://hhprojectgroup.com` with GET/HEAD/OPTIONS only. No Production authentication fixture or approved credential was available, so protected core routes redirected to Login and the authenticated matrix is explicitly unavailable.

Across Home, Login, and protected Dashboard redirect at 1440×900, 820×1180, and 390×844:

- DOM: 309.9–506.6 ms; median 359.6 ms.
- First useful Login content: 373.2–642.9 ms; median 509.3 ms.
- Full settle: 1146.7–1776.9 ms; median 1253.2 ms.
- Total requests: 37–43; median 38. RSC: 1–2.
- No duplicate same-origin requests, uncaught page errors, or horizontal overflow.
- The Home redirect emitted one 401 console resource error at each width; tablet/mobile each recorded one aborted Login redirect request.
- Vercel headers showed a `pdx1` execution edge on the sampled redirect. Authenticated function duration, Supabase query/RPC duration, Speed Insights, and cold/warm protected-page evidence were not accessible with existing credentials.

These values measure anonymous redirect/login delivery only. They must not be compared as if they were the authenticated Local page matrix. Production AFTER cannot exist in this no-deploy campaign; deployed-code comparison remains a release-stage gate.
