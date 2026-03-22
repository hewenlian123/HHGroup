import Link from "next/link";
import { PageLayout, PageHeader, Divider } from "@/components/base";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageLayout
      header={
        <PageHeader
          title="Not found"
          description="The page you’re looking for doesn’t exist or was moved."
          actions={
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          }
        />
      }
    >
      <Divider />
      <div className="py-6 text-sm text-muted-foreground">
        If you followed a link, double-check the URL or return to a main module from the sidebar.
      </div>
    </PageLayout>
  );
}
