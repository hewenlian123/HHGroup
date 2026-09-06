"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/system-state";

const SecurityClient = dynamic(
  () => import("./security-client").then((module) => module.SecurityClient),
  {
    ssr: false,
    loading: () => <LoadingState text="Loading security settings" className="min-h-[260px]" />,
  }
);

export function SecurityClientBoundary() {
  return <SecurityClient />;
}
