type OwnerNoLoginOptions = {
  runtime?: string;
  allowLocal?: string;
};

export function isOwnerInternalNoLoginEnabled(options: OwnerNoLoginOptions = {}): boolean {
  const runtime = (options.runtime ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const allowLocal = (options.allowLocal ?? process.env.HH_ALLOW_LOCAL_NO_LOGIN ?? "")
    .trim()
    .toLowerCase();

  if (runtime === "production") return false;
  return allowLocal === "1" || allowLocal === "true";
}
