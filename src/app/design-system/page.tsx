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
    swatchClass: "bg-brand-primary",
    name: "brand.primary",
    hex: "#2563eb",
    tailwind: "bg-brand-primary, text-brand-primary",
    usage: "Brand actions and secondary solid buttons; links and focus accents.",
  },
  {
    swatchClass: "bg-page",
    name: "page",
    hex: "#f5f5f7",
    tailwind: "bg-page",
    usage: "App canvas and main column background behind content.",
  },
  {
    swatchClass: "bg-white ring-1 ring-inset ring-gray-300",
    name: "card",
    hex: "#ffffff",
    tailwind: "bg-card (shadcn HSL; light mode ≈ white)",
    usage: "Panels, modals, inputs, and elevated surfaces on the page background.",
  },
  {
    swatchClass: "bg-text-primary",
    name: "text.primary",
    hex: "#111827",
    tailwind: "text-text-primary",
    usage: "Headings, primary body copy, and high-emphasis UI labels.",
  },
  {
    swatchClass: "bg-text-secondary",
    name: "text.secondary",
    hex: "#6b7280",
    tailwind: "text-text-secondary",
    usage: "Supporting labels, captions, meta lines, and de-emphasized text.",
  },
  {
    swatchClass: "bg-status-error",
    name: "status.error",
    hex: "#dc2626",
    tailwind: "text-status-error, bg-status-error",
    usage: "Errors, validation failures, and destructive emphasis.",
  },
  {
    swatchClass: "bg-status-warning",
    name: "status.warning",
    hex: "#f59e0b",
    tailwind: "text-status-warning, bg-status-warning",
    usage: "Needs attention, cautions, and non-blocking issues.",
  },
  {
    swatchClass: "bg-status-success",
    name: "status.success",
    hex: "#16a34a",
    tailwind: "text-status-success, bg-status-success",
    usage: "Completed, paid, reconciled, and positive process outcomes.",
  },
  {
    swatchClass: "bg-status-pending",
    name: "status.pending",
    hex: "#6b7280",
    tailwind: "text-status-pending, bg-status-pending",
    usage: "Neutral / in-progress states and idle queue items.",
  },
  {
    swatchClass: "bg-money-expense",
    name: "money.expense",
    hex: "#d92d20",
    tailwind: "text-money-expense",
    usage: "Negative amounts, money out, and expense line totals.",
  },
  {
    swatchClass: "bg-money-income",
    name: "money.income",
    hex: "#16a34a",
    tailwind: "text-money-income",
    usage: "Positive inflows, income, and favorable money values.",
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
 * Phase 1 showcase: design system + app shell + core components.
 * Not a business page — for reviewing the new layout and component system.
 */
export default function DesignSystemShowcasePage() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="page-container page-stack">
      <PageHeader
        title="Design system"
        description="Phase 1: global design system, app shell, and core components. Dark luxury SaaS — Linear + Vercel inspired."
      />

      <Card>
        <CardHeader>
          <CardTitle>Button usage</CardTitle>
          <CardDescription>
            Three core variants in <code className="text-xs">button.tsx</code>, plus outline
            companions from <code className="text-xs">globals.css</code> for ghost and destructive
            patterns.
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
              <p className="text-sm font-medium text-text-primary">
                4. outline + btn-outline-ghost
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Label: </span>Ghost / Icon
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Usage: </span>Toolbar icons, subtle controls
              </p>
              <CodeSnippet>{`<Button variant="outline" className="btn-outline-ghost">Icon</Button>`}</CodeSnippet>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <Button variant="outline" className="btn-outline-ghost">
                Icon
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-text-primary">
                5. outline + btn-outline-destructive
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Label: </span>Destructive
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-primary/90">Usage: </span>Delete, Remove, irreversible
                actions
              </p>
              <CodeSnippet>{`<Button variant="outline" className="btn-outline-destructive">Delete</Button>`}</CodeSnippet>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <Button variant="outline" className="btn-outline-destructive">
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Color tokens</CardTitle>
          <CardDescription>
            Semantic colors from <code className="text-xs">tailwind.config.ts</code> — use Tailwind
            utilities (e.g. <code className="text-xs">text-text-primary</code>) instead of raw hex
            in components.
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
            <Button variant="outline" className="btn-outline-ghost">
              Ghost
            </Button>
            <Button variant="outline" className="btn-outline-destructive">
              Destructive
            </Button>
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
              <Badge variant="default">Success</Badge>
              <Badge variant="outline">Warning</Badge>
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
          <CardDescription>Premium dark modal with overlay</CardDescription>
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
                  This is the new dialog style. Dark surface, subtle border, accent focus ring.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 text-sm text-[var(--text-secondary)]">
                Content area. Forms and actions go in the footer.
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="btn-outline-ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={() => setOpen(false)}>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        App shell: sidebar (left), topbar (page title + search + user menu), main content area.
        Navigate via sidebar to see the new layout on any page. Business pages are unchanged; only
        the shell and these core components use the new design system.
      </p>
    </div>
  );
}
