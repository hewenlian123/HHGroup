export type AuthRolloutOptions = {
  runtime?: string;
  requireLogin?: string;
  allowLocal?: string;
  allowAutoLogin?: string;
};

export type AuthRolloutConfig = {
  mode: "strict" | "compatibility";
  runtime: "production" | "preview" | "development" | "test" | "unknown";
  configurationState: "enabled" | "disabled" | "unset" | "invalid";
};

type AuthRolloutLogger = Pick<Console, "info" | "warn">;

function resolvedRuntime(runtime: string | undefined): AuthRolloutConfig["runtime"] {
  const normalized = (runtime ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown")
    .trim()
    .toLowerCase();

  if (
    normalized === "production" ||
    normalized === "preview" ||
    normalized === "development" ||
    normalized === "test"
  ) {
    return normalized;
  }
  return "unknown";
}

export function resolveAuthRolloutConfig(options: AuthRolloutOptions = {}): AuthRolloutConfig {
  const runtime = resolvedRuntime(options.runtime);
  const rawRequireLogin = options.requireLogin ?? process.env.HH_REQUIRE_LOGIN;
  const requireLogin = rawRequireLogin?.trim().toLowerCase();

  // Deployed environments are permanently fail-closed. HH_REQUIRE_LOGIN remains a
  // local rollout control only; an unset, invalid, or stale false value can never
  // reopen Production or Preview without authentication.
  if (runtime === "production" || runtime === "preview") {
    return {
      mode: "strict",
      runtime,
      configurationState:
        requireLogin === "1" || requireLogin === "true"
          ? "enabled"
          : requireLogin === "0" || requireLogin === "false"
            ? "disabled"
            : rawRequireLogin === undefined || requireLogin === ""
              ? "unset"
              : "invalid",
    };
  }

  if (requireLogin === "1" || requireLogin === "true") {
    return {
      mode: "strict",
      runtime,
      configurationState: "enabled",
    };
  }

  if (requireLogin === "0" || requireLogin === "false") {
    return {
      mode: "compatibility",
      runtime,
      configurationState: "disabled",
    };
  }

  return {
    mode: "compatibility",
    runtime,
    configurationState: rawRequireLogin === undefined || requireLogin === "" ? "unset" : "invalid",
  };
}

export function isCompatibilityAccessEnabled(options: AuthRolloutOptions = {}): boolean {
  const config = resolveAuthRolloutConfig(options);
  if (config.mode === "strict") return false;

  const allowLocal = (options.allowLocal ?? process.env.HH_ALLOW_LOCAL_NO_LOGIN ?? "")
    .trim()
    .toLowerCase();
  const allowAutoLogin = (options.allowAutoLogin ?? process.env.HH_ALLOW_LOCAL_AUTO_LOGIN ?? "")
    .trim()
    .toLowerCase();

  // Once real local auto-login is selected, the legacy no-session compatibility
  // path is disabled even if an old HH_ALLOW_LOCAL_NO_LOGIN value remains locally.
  if (allowAutoLogin === "1" || allowAutoLogin === "true") return false;

  return allowLocal === "1" || allowLocal === "true";
}

export function reportAuthRolloutConfig(
  options: AuthRolloutOptions = {},
  logger: AuthRolloutLogger = console
): AuthRolloutConfig {
  const config = resolveAuthRolloutConfig(options);
  const summary = `[auth-rollout] mode=${config.mode} runtime=${config.runtime} configuration=${config.configurationState}`;

  if (config.mode === "strict") {
    logger.info(summary);
  } else {
    logger.warn(
      `${summary} Compatibility mode is temporary and must be removed after the production observation period.`
    );
  }

  return config;
}
