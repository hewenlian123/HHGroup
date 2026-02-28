"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getProjects, createInvoice } from "@/lib/data";

export default function NewInvoicePage() {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const projects = getProjects();
  React.useEffect(() => {
    if (projects.length > 0 && !projectId) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const handleCreate = () => {
    const inv = createInvoice({
      projectId: (projectId || projects[0]?.id) ?? "",
      clientName: clientName.trim() || "Client",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      lineItems: [{ description: "Item", qty: 1, unitPrice: 0, amount: 0 }],
    });
    router.push(`/financial/invoices/${inv.id}`);
  };

  return (
    <div className="mx-auto max-w-[600px] flex flex-col gap-6 p-6">
      <PageHeader title="New Invoice" description="Create a draft invoice for a project and client." />
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Client name</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
              className="mt-1 rounded-lg"
            />
          </div>
          <Button onClick={handleCreate} className="rounded-lg" disabled={!projectId}>
            Create draft invoice
          </Button>
        </div>
      </Card>
    </div>
  );
}
