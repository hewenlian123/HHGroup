"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  CircleDollarSign,
  FileText,
  FileStack,
  FolderKanban,
  Gauge,
  Plus,
  Receipt,
  Search,
  Settings,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { hhNeoFocusRevealCommand, hhNeoFocusRevealOverlay } from "@/lib/motion-system";
import { UPLOAD_RECEIPT_ACTION } from "@/lib/navigation/actions";
import { HH_PROJECT_OS_COMMAND_ITEMS, type HhProjectOsIconKey } from "@/lib/navigation/ia";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { useHhPortalContainer, useHhTheme } from "@/contexts/hh-theme-context";

type CommandGroup = "Navigate" | "Create";

type CommandDefinition = {
  id: string;
  label: string;
  description: string;
  href: string;
  group: CommandGroup;
  keywords: readonly string[];
  icon: LucideIcon;
};

const COMMAND_ICON_MAP: Record<HhProjectOsIconKey, LucideIcon> = {
  accounts: CircleDollarSign,
  activity: Gauge,
  ar: CircleDollarSign,
  backups: FileStack,
  bank: CircleDollarSign,
  bills: Receipt,
  cashflow: CircleDollarSign,
  changeOrders: FolderKanban,
  commission: CircleDollarSign,
  company: Settings,
  customers: Users,
  dashboard: Gauge,
  deposits: CircleDollarSign,
  documents: FileStack,
  estimates: BriefcaseBusiness,
  expenses: Receipt,
  financial: CircleDollarSign,
  inspection: FileStack,
  invoice: FileText,
  logs: FileStack,
  materials: FolderKanban,
  metrics: Gauge,
  payments: CircleDollarSign,
  payroll: CircleDollarSign,
  photos: FileStack,
  preferences: Settings,
  projects: FolderKanban,
  punchList: FolderKanban,
  receipts: Receipt,
  reimbursements: Receipt,
  roles: Users,
  schedule: FolderKanban,
  settings: Settings,
  subcontractors: Users,
  tasks: FolderKanban,
  users: Users,
  vendors: Users,
  workerAdvances: CircleDollarSign,
  workerBalances: CircleDollarSign,
  workerInvoices: FileText,
  workerPayments: CircleDollarSign,
  workerSummary: Users,
  workers: Users,
};

const COMMANDS: CommandDefinition[] = [
  ...HH_PROJECT_OS_COMMAND_ITEMS.map((command) => ({
    ...command,
    group: "Navigate" as const,
    icon: COMMAND_ICON_MAP[command.icon],
  })),
  {
    id: "create-project",
    label: "Create Project",
    description: "Start a new construction project",
    href: "/projects/new",
    group: "Create",
    keywords: ["new project", "job"],
    icon: Plus,
  },
  {
    id: "create-estimate",
    label: "Create Estimate",
    description: "Open the estimate composer shell",
    href: "/estimates/new",
    group: "Create",
    keywords: ["new estimate", "proposal", "quote"],
    icon: BriefcaseBusiness,
  },
  {
    id: "create-invoice",
    label: "Create Invoice",
    description: "Create an invoice draft",
    href: "/financial/invoices/new",
    group: "Create",
    keywords: ["new invoice", "bill customer"],
    icon: FileText,
  },
  {
    ...UPLOAD_RECEIPT_ACTION,
    group: "Create",
    icon: Upload,
  },
  {
    id: "upload-expense",
    label: "Upload Expense",
    description: "Open expense entry for receipt-backed costs",
    href: "/financial/expenses/new",
    group: "Create",
    keywords: ["new expense", "expense entry", "cost"],
    icon: Upload,
  },
];

const GROUP_ORDER: CommandGroup[] = ["Navigate", "Create"];

function commandMatches(command: CommandDefinition, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase().trim();
  return [command.label, command.description, command.group, ...command.keywords]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function flattenGroups(groups: Map<CommandGroup, CommandDefinition[]>): CommandDefinition[] {
  return GROUP_ORDER.flatMap((group) => groups.get(group) ?? []);
}

export function NeoKeyboardHint({ className }: { className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-1.5 leading-none text-[var(--hh-text-secondary)] shadow-none",
        TYPO.tableHeader,
        className
      )}
    >
      ⌘K
    </kbd>
  );
}

function NeoCommandFooter({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-[var(--hh-border)] px-3 py-2 text-[var(--hh-text-tertiary)]",
        TYPO.metadata,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <NeoKeyboardHint className="h-4 min-w-4 px-1" />
        <span>or Ctrl+K to open</span>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <span>Up/Down navigate</span>
        <span>Enter run</span>
        <span>Esc close</span>
      </div>
    </div>
  );
}

function NeoCommandInput({
  value,
  onChange,
  onKeyDown,
  activeId,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  activeId?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--hh-border)] px-3 py-2.5">
      <Search className="h-4 w-4 shrink-0 text-[var(--hh-text-tertiary)]" aria-hidden />
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="neo-command-list"
        aria-activedescendant={activeId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search commands, pages, actions..."
        className={cn(
          "h-8 min-w-0 flex-1 bg-transparent text-[var(--hh-text-primary)] outline-none placeholder:text-[var(--hh-text-tertiary)] max-md:text-base max-md:leading-6",
          TYPO.button
        )}
      />
    </div>
  );
}

function NeoCommandList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      id="neo-command-list"
      role="listbox"
      className={cn(
        "max-h-[min(440px,calc(100dvh-13rem))] overflow-y-auto overscroll-contain p-2 [-webkit-overflow-scrolling:touch]",
        className
      )}
    >
      {children}
    </div>
  );
}

function NeoCommandGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className={cn("px-2 pb-1.5 pt-1", TYPO.tableHeader)}>{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function NeoCommandItem({
  command,
  active,
  onPointerMove,
  onSelect,
}: {
  command: CommandDefinition;
  active: boolean;
  onPointerMove: () => void;
  onSelect: () => void;
}) {
  const Icon = command.icon;

  return (
    <button
      id={`neo-command-${command.id}`}
      type="button"
      role="option"
      aria-selected={active}
      data-active={active ? "true" : "false"}
      className={cn(
        "hh-focus-ring group flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-[background-color,border-color,color] duration-150 ease-out",
        "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)]",
        active &&
          "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)] ring-1 ring-[var(--hh-border-strong)]"
      )}
      onPointerMove={onPointerMove}
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-tertiary)]",
          active && "border-[var(--hh-border-strong)] text-[var(--hh-text-primary)]"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--hh-text-primary)]">
          {command.label}
        </span>
        <span className="block truncate text-xs text-[var(--hh-text-tertiary)]">
          {command.description}
        </span>
      </span>
      <ArrowRight
        className={cn(
          "h-4 w-4 shrink-0 text-[var(--hh-text-tertiary)] opacity-0 transition-opacity",
          active && "opacity-100"
        )}
        aria-hidden
      />
    </button>
  );
}

export function NeoCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const portalContainer = useHhPortalContainer();
  const { context, theme } = useHhTheme();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const filteredGroups = React.useMemo(() => {
    const groups = new Map<CommandGroup, CommandDefinition[]>();
    for (const group of GROUP_ORDER) groups.set(group, []);
    for (const command of COMMANDS) {
      if (!commandMatches(command, query)) continue;
      groups.get(command.group)?.push(command);
    }
    return groups;
  }, [query]);

  const visibleCommands = React.useMemo(() => flattenGroups(filteredGroups), [filteredGroups]);
  const activeCommand = visibleCommands[activeIndex];
  const activeId = activeCommand ? `neo-command-${activeCommand.id}` : undefined;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandKey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isCommandKey) return;
      event.preventDefault();
      onOpenChange(!open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
  }, [open]);

  React.useEffect(() => {
    setActiveIndex((current) => {
      if (visibleCommands.length === 0) return 0;
      return Math.min(current, visibleCommands.length - 1);
    });
  }, [visibleCommands.length]);

  React.useEffect(() => {
    if (!open) return;
    for (const command of COMMANDS) {
      try {
        router.prefetch(command.href);
      } catch {
        // Prefetch is best-effort only.
      }
    }
  }, [open, router]);

  React.useEffect(() => {
    if (open) return;
    setQuery("");
  }, [open, pathname]);

  const runCommand = React.useCallback(
    (command: CommandDefinition | undefined) => {
      if (!command) return;
      onOpenChange(false);
      window.requestAnimationFrame(() => {
        router.push(command.href);
      });
    },
    [onOpenChange, router]
  );

  const handleInputKeyDown = React.useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
    (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) =>
          visibleCommands.length === 0 ? 0 : (current + 1) % visibleCommands.length
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          visibleCommands.length === 0
            ? 0
            : (current - 1 + visibleCommands.length) % visibleCommands.length
        );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        runCommand(activeCommand);
      }
    },
    [activeCommand, runCommand, visibleCommands.length]
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={portalContainer ?? undefined}>
        <DialogPrimitive.Overlay className={cn("fixed inset-0 z-[90]", hhNeoFocusRevealOverlay)} />
        <DialogPrimitive.Content
          data-command-dialog
          data-hh-context={context}
          data-hh-theme={theme}
          className={cn(
            "fixed top-[max(5rem,env(safe-area-inset-top))] z-[91] w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-hh-task border border-[var(--hh-border-strong)] bg-[var(--hh-l5-task-surface)] text-[var(--hh-text-primary)] shadow-task outline-none sm:left-1/2 sm:-translate-x-1/2",
            hhNeoFocusRevealCommand,
            "max-sm:inset-x-2 max-sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] max-sm:top-[max(0.75rem,env(safe-area-inset-top))] max-sm:w-auto max-sm:rounded-hh-task"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search pages and run HH operational commands.
          </DialogPrimitive.Description>
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 h-8 w-8 min-h-8 min-w-8 rounded-md text-[var(--hh-text-tertiary)] hover:text-[var(--hh-text-primary)] max-sm:h-10 max-sm:w-10 max-sm:min-h-10 max-sm:min-w-10"
              aria-label="Close command palette"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogPrimitive.Close>

          <NeoCommandInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            activeId={activeId}
          />

          <NeoCommandList>
            {visibleCommands.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-8 text-center">
                <p className="text-sm font-medium text-[var(--hh-text-primary)]">
                  No commands found
                </p>
                <p className="mt-1 text-xs text-[var(--hh-text-tertiary)]">
                  Try projects, invoices, expenses, labor, or settings.
                </p>
              </div>
            ) : (
              GROUP_ORDER.map((group) => {
                const commands = filteredGroups.get(group) ?? [];
                if (commands.length === 0) return null;
                return (
                  <NeoCommandGroup key={group} label={group}>
                    {commands.map((command) => {
                      const index = visibleCommands.findIndex((item) => item.id === command.id);
                      return (
                        <NeoCommandItem
                          key={command.id}
                          command={command}
                          active={index === activeIndex}
                          onPointerMove={() => setActiveIndex(index)}
                          onSelect={() => runCommand(command)}
                        />
                      );
                    })}
                  </NeoCommandGroup>
                );
              })
            )}
          </NeoCommandList>

          <NeoCommandFooter />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
