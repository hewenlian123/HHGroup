"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildEstimateDetailReturnHref,
  readEstimateBuilderReturnContext,
} from "@/app/estimates/_components/estimate-workflow-continuity";

export default function EstimatePreviewError({ reset }: { reset: () => void }) {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const estimateId = typeof params?.id === "string" ? params.id : "";
  const returnHref = estimateId
    ? buildEstimateDetailReturnHref(estimateId, readEstimateBuilderReturnContext(searchParams))
    : "/estimates";

  return (
    <div className="estimate-preview-error-shell page-container flex min-h-[55vh] items-center justify-center py-10">
      <section
        className="estimate-preview-error-card w-full max-w-lg rounded-xl p-6 text-center"
        role="alert"
      >
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-700" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-white">Preview could not load</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          The persisted Estimate was not changed. Try loading the document again or return to the
          Estimate workspace.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" className="estimate-preview-tool-button min-h-11" asChild>
            <Link href={returnHref}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back to estimate
            </Link>
          </Button>
          <Button
            type="button"
            className="estimate-preview-tool-button estimate-preview-tool-button--primary min-h-11"
            onClick={reset}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Try again
          </Button>
        </div>
      </section>
    </div>
  );
}
