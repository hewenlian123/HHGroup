import { EmptyState, PageHeader, PageLayout } from "@/components/base";

export default function PurchaseOrdersPage() {
  return (
    <PageLayout
      header={
        <PageHeader
          title="Purchase Orders"
          description="Purchase order workflows are not available in HH Group yet."
        />
      }
    >
      <EmptyState
        data-testid="purchase-orders-placeholder"
        title="Purchase orders are not available yet"
        description="Purchase order workflows are not available yet. No orders, approvals, or procurement actions can be created from this page."
      />
    </PageLayout>
  );
}
