import { SettingsSubNav } from "@/components/settings/settings-sub-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[var(--hh-l0-canvas)] text-[var(--hh-text)]">
      <div className="hh-list-frame page-stack flex flex-col py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:py-6">
        <SettingsSubNav />
        {children}
      </div>
    </div>
  );
}
