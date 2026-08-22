import { SettingsSubNav } from "@/components/settings/settings-sub-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-workspace text-[var(--hh-text-secondary)]">
      <SettingsSubNav />
      {children}
    </div>
  );
}
