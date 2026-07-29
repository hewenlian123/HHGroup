import "server-only";

import type { Session, User } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

import { createRecoverySessionToken, setRecoverySessionCookie } from "@/lib/auth-recovery-session";
import { authorizedAppRole } from "@/lib/auth-role";
import { sessionIdFromAccessToken } from "@/lib/device-unlock-token";

export async function authorizeRecoverySession(
  response: NextResponse,
  input: {
    session: Session | null;
    user: User | null;
  }
): Promise<boolean> {
  const user = input.user ?? input.session?.user ?? null;
  const sessionId = input.session?.access_token
    ? sessionIdFromAccessToken(input.session.access_token)
    : null;
  if (!user || !authorizedAppRole(user) || !sessionId) return false;

  const recoveryToken = await createRecoverySessionToken({
    sessionId,
    userId: user.id,
  });
  if (!recoveryToken) return false;

  setRecoverySessionCookie(response, recoveryToken);
  return true;
}
