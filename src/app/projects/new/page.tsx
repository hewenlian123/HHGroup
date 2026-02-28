"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createProject } from "@/lib/data";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "pending" | "completed">("pending");
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const budgetValue = Number(budget);
    if (!cleanName) {
      setError("Project name is required.");
      return;
    }
    if (!Number.isFinite(budgetValue) || budgetValue <= 0) {
      setError("Budget must be greater than 0.");
      return;
    }

    const project = createProject({ name: cleanName, budget: budgetValue, status });
    router.push(`/projects/${project.id}`);
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="New Project" subtitle="Create a project with basic baseline fields." />
      <Card className="max-w-[640px] p-5">
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Project Name</p>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Luxury Villa E" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Budget (USD)</p>
            <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} min="1" step="1" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <select
              className="h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
              value={status}
              onChange={(e) => setStatus((e.target.value as "active" | "pending" | "completed") ?? "pending")}
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          {error ? <p className="text-sm text-red-600/80">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2 border-t border-zinc-200/60 pt-3 dark:border-border">
            <Button type="button" variant="outline" onClick={() => router.push("/projects")}>
              Cancel
            </Button>
            <Button type="submit">Create Project</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

