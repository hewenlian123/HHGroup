export type AuthRolloutOptions = {
  runtime?: string;
  requireLogin?: string;
  allowLocal?: string;
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
  const rawAllowLocal = options.allowLocal ?? process.env.HH_ALLOW_LOCAL_NO_LOGIN;
  const allowLocal = rawAllowLocal?.trim().toLowerCase();
  const configurationState: AuthRolloutConfig["configurationState"] =
    requireLogin === "1" || requireLogin === "true"
      ? "enabled"
      : requireLogin === "0" || requireLogin === "false"
        ? "disabled"
        : rawRequireLogin === undefined || requireLogin === ""
          ? "unset"
          : "invalid";

  // Authentication is the fail-closed default. The only compatibility path is an
  // explicit local-development opt-in, and an explicit strict setting always wins.
  const explicitLocalNoLogin = allowLocal === "1" || allowLocal === "true";
  const localCompatibilityAllowed =
    runtime === "development" &&
    explicitLocalNoLogin &&
    configurationState !== "enabled" &&
    configurationState !== "invalid";

  if (!localCompatibilityAllowed) {
    return {
      mode: "strict",
      runtime,
      configurationState,
    };
  }

  return {
    mode: "compatibility",
    runtime,
    configurationState,
  };
}

export function isCompatibilityAccessEnabled(options: AuthRolloutOptions = {}): boolean {
  return resolveAuthRolloutConfig(options).mode === "compatibility";
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
