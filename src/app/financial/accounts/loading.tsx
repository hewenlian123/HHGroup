import { LoadingState } from "@/components/ui/system-state";

export default function AccountsLoading() {
  return (
    <div className="page-container py-6">
      <LoadingState text="Loading accounts…" />
    </div>
  );
}
