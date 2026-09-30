"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const COLOR_TOKENS: {
  swatchClass: string;
  name: string;
  hex: string;
  tailwind: string;
  usage: string;
}[] = [
  {
    swatchClass: "bg-hh-canvas",
    name: "L0 Canvas",
    hex: "#F7F7F8",
    tailwind: "bg-hh-canvas",
    usage: "Outer application environment.",
  },
  {
    swatchClass: "bg-hh-workspace",
    name: "L1 Workspace",
    hex: "#FFFFFF",
    tailwind: "bg-hh-workspace",
    usage: "Primary operational working region.",
  },
  {
    swatchClass: "bg-hh-surface ring-1 ring-inset ring-[var(--hh-border)]",
    name: "L2 Operational Surface",
    hex: "#FAFAFB",
    tailwind: "bg-hh-surface",
    usage: "Cards, panels, controls, and operational surfaces.",
  },
  {
    swatchClass: "bg-hh-text-primary",
    name: "Text Primary",
    hex: "#181A1E",
    tailwind: "text-hh-text-primary",
    usage: "Headings, primary body copy, and high-emphasis UI labels.",
  },
  {
    swatchClass: "bg-hh-text-secondary",
    name: "Text Secondary",
    hex: "#4B525C",
    tailwind: "text-hh-text-secondary",
    usage: "Supporting labels, captions, meta lines, and de-emphasized text.",
  },
  {
    swatchClass: "bg-hh-danger",
    name: "Danger",
    hex: "#B91C1C",
    tailwind: "text-hh-danger, bg-hh-danger",
    usage: "Errors, validation failures, and destructive emphasis.",
  },
  {
    swatchClass: "bg-hh-warning",
    name: "Warning",
    hex: "#B45309",
    tailwind: "text-hh-warning, bg-hh-warning",
    usage: "Needs attention, cautions, and non-blocking issues.",
  },
  {
    swatchClass: "bg-hh-success",
    name: "Success",
    hex: "#15803D",
    tailwind: "text-hh-success, bg-hh-success",
    usage: "Paid, reconciled, and positive process outcomes.",
  },
  {
    swatchClass: "bg-hh-information",
    name: "Information",
    hex: "#1D4ED8",
    tailwind: "text-hh-information, bg-hh-information",
    usage: "Neutral information and operational guidance.",
  },
  {
    swatchClass: "bg-hh-danger",
    name: "Finance Negative",
    hex: "#B91C1C",
    tailwind: "text-hh-danger",
    usage: "Authority-backed negative financial state where color is semantically required.",
  },
  {
    swatchClass: "bg-hh-success",
    name: "Finance Positive",
    hex: "#15803D",
    tailwind: "text-hh-success",
    usage: "Authority-backed positive financial state where color is semantically required.",
  },
];

function CodeSnippet({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-sm border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-text-primary dark:bg-muted/20">
      <code>{children}</code>
    </pre>
  );
}

/**
 * Showcase of the current HH foundation and canonical component APIs.
 * Figma and the frozen HH baseline own visual intent; this page demonstrates them.
 */
export default function DesignSystemShowcasePage() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="hh-list-frame page-stack flex flex-col bg-[var(--hh-l0-canvas)] py-3 md:py-6">
      <PageHeader
        variant="workspace"
        title="Design system"
        description="Live navy and brass workspace chrome, with the shared type, card, and status specimens below."
      />

      <Card>
        <CardHeader>
          <CardTitle>Button usage</CardTitle>
          <CardDescription>
            Canonical variants from <code className="text-xs">button.tsx</code>: default/primary,
            secondary/outline, quiet/ghost, and destructive. Existing aliases remain supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border/60 px-6">
          <div className="flex flex-col gap-3 py-5 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text-primary">1. default</p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Label: </span>Primary Action
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Usage: </span>Main actions — Save, Submit,
                Confirm
              </p>
              <CodeSnippet>{`<Button variant="default">Save</Button>`}</CodeSnippet>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <Button variant="default">Primary Action</Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text-primary">2. secondary</p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Label: </span>Secondary Action
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Usage: </span>Supporting actions — View,
                Export, Filter
              </p>
              <CodeSnippet>{`<Button variant="secondary">Export</Button>`}</CodeSnippet>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <Button variant="secondary">Secondary Action</Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text-primary">3. outline</p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Label: </span>Outline / Cancel
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Usage: </span>Cancel, Close, neutral toolbar
                actions
              </p>
              <CodeSnippet>{`<Button variant="outline">Cancel</Button>`}</CodeSnippet>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <Button variant="outline">Outline / Cancel</Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text-primary">4. ghost / quiet</p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Label: </span>Ghost / Icon
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Usage: </span>Toolbar icons, subtle controls
              </p>
              <CodeSnippet>{`<Button variant="ghost">Icon</Button>`}</CodeSnippet>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <Button variant="ghost">Icon</Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text-primary">5. destructive</p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Label: </span>Destructive
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Usage: </span>Delete, Remove, irreversible
                actions
              </p>
              <CodeSnippet>{`<Button variant="destructive">Delete</Button>`}</CodeSnippet>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <Button variant="destructive">Delete</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Color tokens</CardTitle>
          <CardDescription>
            Values come from <code className="text-xs">hh-design-system-v2.css</code>; Tailwind maps
            utilities to those tokens. Hex labels describe the current implementation, not a
            separate palette. Use semantic utilities in components.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border/60">
            {COLOR_TOKENS.map((t) => (
              <li key={t.name} className="flex gap-4 px-6 py-4">
                <div
                  className={`mt-0.5 h-10 w-10 shrink-0 rounded-sm ${t.swatchClass}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-text-primary">{t.name}</p>
                  <p className="font-mono text-xs text-text-secondary">{t.hex}</p>
                  <p className="text-xs text-text-secondary">
                    <span className="text-text-primary/80">Classes: </span>
                    {t.tailwind}
                  </p>
                  <p className="text-sm text-text-secondary">{t.usage}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>
              Quick preview — see <strong className="font-medium">Button usage</strong> for labels,
              code, and when to use each variant.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="default">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="default" size="sm">
              Small
            </Button>
            <Button variant="default" size="lg">
              Large
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Input & Badges</CardTitle>
            <CardDescription>Form field and status pills</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="Placeholder text..." className="max-w-xs" />
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Table</CardTitle>
          <CardDescription>
            Enterprise table — sticky header, row hover, subtle borders
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Project Alpha</TableCell>
                <TableCell>
                  <Badge variant="default">Active</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">$12,500</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Project Beta</TableCell>
                <TableCell>
                  <Badge variant="secondary">Draft</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">$8,200</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Project Gamma</TableCell>
                <TableCell>
                  <Badge variant="outline">Pending</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">$0</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modal (Dialog)</CardTitle>
          <CardDescription>HH semantic task surface with overlay</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Open modal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Modal title</DialogTitle>
                <DialogDescription>
                  The shared HH task surface preserves the current border, focus, and reduced-motion
                  contracts.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 text-sm text-[var(--text-secondary)]">
                Content area. Forms and actions go in the footer.
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setOpen(false)}>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        Visual authority: Figma mapping → frozen HH baseline → canonical HH tokens and components.
        AppShell owns global navigation; page components compose its content. Production code owns
        business behavior. Compatibility adapters remain supported; this showcase does not authorize
        a new palette or an Estimate workspace redesign.
      </p>
    </div>
  );
}
