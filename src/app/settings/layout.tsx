import { SettingsSubNav } from "@/components/settings/settings-sub-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark neo-page-on-graphite min-h-full text-[var(--neo-canvas-text-secondary)]">
      <SettingsSubNav />
      {children}
    </div>
  );
}
