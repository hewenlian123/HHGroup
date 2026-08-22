"use client";

import * as React from "react";
import {
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";

import {
  LoadingState,
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoPanel,
  NeoStatus,
  neoFormErrorClassName,
  neoFormNoticeClassName,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase";

type AccountResponse = {
  account?: {
    email?: string | null;
    role?: "owner" | "admin";
    status?: string;
  };
  message?: string;
};

type PinResponse = {
  enabled?: boolean;
  message?: string;
};

type SessionResponse = {
  current?: {
    email?: string | null;
    role?: "owner" | "admin";
    signedInAt?: string | null;
  };
  limitation?: string;
  message?: string;
};

type FormStatus = {
  error: string | null;
  message: string | null;
};

const EMPTY_STATUS: FormStatus = { error: null, message: null };

function sixDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

function roleLabel(role: "owner" | "admin" | undefined): string {
  return role === "admin" ? "Admin" : "Owner";
}

export function SecurityClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = React.useMemo(
    () =>
      supabaseUrl && supabaseAnonKey ? createBrowserClient(supabaseUrl, supabaseAnonKey) : null,
    [supabaseAnonKey, supabaseUrl]
  );
  const [loading, setLoading] = React.useState(true);
  const [account, setAccount] = React.useState<AccountResponse["account"] | null>(null);
  const [pinEnabled, setPinEnabled] = React.useState(false);
  const [session, setSession] = React.useState<SessionResponse | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordPending, setPasswordPending] = React.useState(false);
  const [passwordStatus, setPasswordStatus] = React.useState<FormStatus>(EMPTY_STATUS);

  const [pinPassword, setPinPassword] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [pinPending, setPinPending] = React.useState(false);
  const [pinStatus, setPinStatus] = React.useState<FormStatus>(EMPTY_STATUS);

  const [sessionsPending, setSessionsPending] = React.useState(false);
  const [sessionStatus, setSessionStatus] = React.useState<FormStatus>(EMPTY_STATUS);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [accountResponse, pinResponse, sessionResponse] = await Promise.all([
      fetch("/api/settings/security/account", { cache: "no-store" }).catch(() => null),
      fetch("/api/settings/security/pin", { cache: "no-store" }).catch(() => null),
      fetch("/api/settings/security/sessions", { cache: "no-store" }).catch(() => null),
    ]);

    const accountBody = (await accountResponse?.json().catch(() => null)) as AccountResponse | null;
    const pinBody = (await pinResponse?.json().catch(() => null)) as PinResponse | null;
    const sessionBody = (await sessionResponse?.json().catch(() => null)) as SessionResponse | null;
    setLoading(false);

    if (!accountResponse?.ok || !pinResponse?.ok || !sessionResponse?.ok) {
      setLoadError(
        accountBody?.message ||
          pinBody?.message ||
          sessionBody?.message ||
          "Unable to load security settings."
      );
      return;
    }
    setAccount(accountBody?.account ?? null);
    setPinEnabled(Boolean(pinBody?.enabled));
    setSession(sessionBody);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordPending) return;
    setPasswordStatus(EMPTY_STATUS);
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ error: "Password confirmation does not match.", message: null });
      return;
    }
    setPasswordPending(true);
    const response = await fetch("/api/settings/security/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmPassword,
        currentPassword,
        newPassword,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { message?: string } | null;
    setPasswordPending(false);
    if (!response?.ok) {
      setPasswordStatus({
        error: body?.message || "Unable to change password.",
        message: null,
      });
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordStatus({
      error: null,
      message: body?.message || "Password changed.",
    });
  }

  async function savePin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pinPending) return;
    setPinStatus(EMPTY_STATUS);
    if (pin !== confirmPin) {
      setPinStatus({ error: "PIN confirmation does not match.", message: null });
      return;
    }
    setPinPending(true);
    const {
      data: { session: pinSession },
    } = supabase
      ? await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
      : { data: { session: null } };
    const response = await fetch("/api/settings/security/pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(pinSession?.access_token ? { Authorization: `Bearer ${pinSession.access_token}` } : {}),
      },
      body: JSON.stringify({
        confirmPin,
        currentPassword: pinPassword,
        pin,
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as PinResponse | null;
    setPinPending(false);
    if (!response?.ok) {
      setPinStatus({
        error: body?.message || "Unable to save Quick Unlock.",
        message: null,
      });
      return;
    }
    setPinEnabled(true);
    setPinPassword("");
    setPin("");
    setConfirmPin("");
    setPinStatus({
      error: null,
      message: body?.message || "Quick Unlock updated.",
    });
  }

  async function disablePin() {
    if (pinPending) return;
    setPinStatus(EMPTY_STATUS);
    if (!pinPassword) {
      setPinStatus({ error: "Account password is required.", message: null });
      return;
    }
    setPinPending(true);
    const response = await fetch("/api/settings/security/pin", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pinPassword }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as PinResponse | null;
    setPinPending(false);
    if (!response?.ok) {
      setPinStatus({
        error: body?.message || "Unable to disable Quick Unlock.",
        message: null,
      });
      return;
    }
    setPinEnabled(false);
    setPinPassword("");
    setPin("");
    setConfirmPin("");
    setPinStatus({ error: null, message: "Quick Unlock disabled." });
  }

  async function signOutOthers() {
    if (sessionsPending) return;
    setSessionsPending(true);
    setSessionStatus(EMPTY_STATUS);
    const response = await fetch("/api/settings/security/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "others" }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { message?: string } | null;
    setSessionsPending(false);
    setSessionStatus(
      response?.ok
        ? { error: null, message: body?.message || "Other sessions were signed out." }
        : { error: body?.message || "Unable to revoke other sessions.", message: null }
    );
  }

  if (loading) {
    return <LoadingState text="Loading security settings" className="min-h-[260px]" />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {loadError ? (
        <div role="alert" className={`${neoFormErrorClassName} xl:col-span-2`}>
          {loadError}
        </div>
      ) : null}

      <NeoPanel
        title="Account"
        eyebrow="Identity"
        description="Supabase Auth is the canonical account identity."
        className="xl:col-span-2"
        action={<NeoStatus label={account?.status || "Active"} variant="success" />}
        bodyClassName="grid gap-px bg-[var(--hh-border)] sm:grid-cols-2"
      >
        <div className="bg-[var(--hh-l2-operational-surface)] px-4 py-3">
          <p className="text-xs text-[var(--hh-text-tertiary)]">Email</p>
          <p className="mt-1 break-all text-sm font-medium text-[var(--hh-text-primary)]">
            {account?.email || "—"}
          </p>
        </div>
        <div className="bg-[var(--hh-l2-operational-surface)] px-4 py-3">
          <p className="text-xs text-[var(--hh-text-tertiary)]">Role</p>
          <p className="mt-1 text-sm font-medium text-[var(--hh-text-primary)]">
            {roleLabel(account?.role)}
          </p>
        </div>
      </NeoPanel>

      <NeoPanel
        eyebrow="Credential"
        title="Change password"
        description="Current password verification is required. Other sessions are revoked on success."
        bodyClassName="p-4 sm:p-5"
      >
        <form className="space-y-4" onSubmit={changePassword}>
          {passwordStatus.message ? (
            <div role="status" className={neoFormNoticeClassName}>
              {passwordStatus.message}
            </div>
          ) : null}
          {passwordStatus.error ? (
            <div role="alert" className={neoFormErrorClassName}>
              {passwordStatus.error}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <NeoFieldLabel htmlFor="security-current-password">Current password</NeoFieldLabel>
            <NeoInput
              id="security-current-password"
              className="min-h-11 md:min-h-11"
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={passwordPending}
            />
          </div>
          <NeoFormGrid>
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="security-new-password">New password</NeoFieldLabel>
              <NeoInput
                id="security-new-password"
                className="min-h-11 md:min-h-11"
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={passwordPending}
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="security-confirm-password">
                Confirm new password
              </NeoFieldLabel>
              <NeoInput
                id="security-confirm-password"
                className="min-h-11 md:min-h-11"
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={passwordPending}
              />
            </div>
          </NeoFormGrid>
          <p className="text-xs leading-5 text-[var(--hh-text-tertiary)]">
            12–128 characters; include uppercase, lowercase, a number, and a symbol.
          </p>
          <Button type="submit" className="min-h-11" disabled={passwordPending}>
            {passwordPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <LockKeyhole aria-hidden="true" />
            )}
            {passwordPending ? "Changing" : "Change password"}
          </Button>
        </form>
      </NeoPanel>

      <NeoPanel
        eyebrow="Trusted device"
        title="Quick Unlock PIN"
        description="Optional 6-digit convenience lock layered over this valid Supabase session."
        action={
          <NeoStatus
            label={pinEnabled ? "Enabled" : "Disabled"}
            variant={pinEnabled ? "success" : "default"}
          />
        }
        bodyClassName="p-4 sm:p-5"
      >
        <form className="space-y-4" onSubmit={savePin}>
          {pinStatus.message ? (
            <div role="status" className={neoFormNoticeClassName}>
              {pinStatus.message}
            </div>
          ) : null}
          {pinStatus.error ? (
            <div role="alert" className={neoFormErrorClassName}>
              {pinStatus.error}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <NeoFieldLabel htmlFor="pin-account-password">Account password</NeoFieldLabel>
            <NeoInput
              id="pin-account-password"
              className="min-h-11 md:min-h-11"
              autoComplete="current-password"
              type="password"
              value={pinPassword}
              onChange={(event) => setPinPassword(event.target.value)}
              disabled={pinPending}
            />
          </div>
          <NeoFormGrid>
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="security-new-pin">New 6-digit PIN</NeoFieldLabel>
              <NeoInput
                id="security-new-pin"
                className="min-h-11 md:min-h-11"
                autoComplete="new-password"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]*"
                type="password"
                value={pin}
                onChange={(event) => setPin(sixDigits(event.target.value))}
                disabled={pinPending}
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel htmlFor="security-confirm-pin">Confirm 6-digit PIN</NeoFieldLabel>
              <NeoInput
                id="security-confirm-pin"
                className="min-h-11 md:min-h-11"
                autoComplete="new-password"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]*"
                type="password"
                value={confirmPin}
                onChange={(event) => setConfirmPin(sixDigits(event.target.value))}
                disabled={pinPending}
              />
            </div>
          </NeoFormGrid>
          <p className="text-xs leading-5 text-[var(--hh-text-tertiary)]">
            Common and repeating PINs are blocked. Password sign-in always remains available.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-11" disabled={pinPending}>
              {pinPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound aria-hidden="true" />
              )}
              {pinEnabled ? "Change PIN" : "Enable PIN"}
            </Button>
            {pinEnabled ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={disablePin}
                disabled={pinPending}
              >
                Disable PIN
              </Button>
            ) : null}
          </div>
        </form>
      </NeoPanel>

      <NeoPanel
        eyebrow="Session"
        title="Current session"
        description="Review reliable session facts and revoke other refresh sessions."
        className="xl:col-span-2"
        bodyClassName="p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--hh-text-primary)]">
              <MonitorSmartphone
                className="h-4 w-4 text-[var(--hh-text-secondary)]"
                aria-hidden="true"
              />
              This browser
            </div>
            <p className="mt-1 break-all text-xs text-[var(--hh-text-secondary)]">
              {session?.current?.email || account?.email || "Authenticated owner"}
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--hh-text-tertiary)]">
              {session?.limitation}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={signOutOthers}
              disabled={sessionsPending}
            >
              {sessionsPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              Sign out other devices
            </Button>
            <form action="/logout" method="post">
              <Button type="submit" variant="outline" className="min-h-11">
                <LogOut aria-hidden="true" />
                Sign out current device
              </Button>
            </form>
          </div>
        </div>
        {sessionStatus.message ? (
          <div role="status" className={`${neoFormNoticeClassName} mt-4`}>
            {sessionStatus.message}
          </div>
        ) : null}
        {sessionStatus.error ? (
          <div role="alert" className={`${neoFormErrorClassName} mt-4`}>
            {sessionStatus.error}
          </div>
        ) : null}
      </NeoPanel>
    </div>
  );
}
