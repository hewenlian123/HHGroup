import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default function nextConfig(phase) {
  return {
    // Prevent `next dev` and `next build` from clobbering each other.
    // Dev server writes to `.next-dev`; production build stays in `.next`.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
}
