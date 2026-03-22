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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>Primary, outline, secondary, ghost, destructive</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
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
        App shell: sidebar (left), topbar (page title + search + user menu), main content area.
        Navigate via sidebar to see the new layout on any page. Business pages are unchanged; only
        the shell and these core components use the new design system.
      </p>
    </div>
  );
}
