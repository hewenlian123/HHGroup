import { Suspense } from "react";
import { ContactsDirectory } from "@/components/contacts/contacts-directory";
export default function VendorsPage() {
  return (
    <Suspense fallback={null}>
      <ContactsDirectory vendorOnly />
    </Suspense>
  );
}
