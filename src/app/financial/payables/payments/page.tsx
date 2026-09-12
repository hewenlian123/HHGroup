import OutgoingPaymentsContent from "./outgoing-payments-content";
export const dynamic = "force-dynamic";
export default function OutgoingPaymentsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <OutgoingPaymentsContent {...props} />;
}
