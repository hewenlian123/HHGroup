import "server-only";

/**
 * Sparticuz only extracts AL2023 shared libs (libnss3, etc.) when
 * AWS_LAMBDA_JS_RUNTIME includes 20.x/22.x. Vercel Node 24 omits that unless set
 * before `@sparticuz/chromium` is first imported.
 */
if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
  const runtime = process.env.AWS_LAMBDA_JS_RUNTIME ?? "";
  if (!runtime.includes("20.x") && !runtime.includes("22.x")) {
    process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
  }
}
