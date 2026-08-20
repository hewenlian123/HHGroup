export function shouldShowSystemHealthToast(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return pathname !== "/estimates" && !pathname.startsWith("/estimates/");
}
