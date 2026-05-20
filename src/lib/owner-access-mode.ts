export function isOwnerInternalNoLoginEnabled(): boolean {
  const requireLogin = (process.env.HH_REQUIRE_LOGIN ?? "").trim().toLowerCase();
  return requireLogin !== "1" && requireLogin !== "true";
}
