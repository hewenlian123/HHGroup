import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { StatusBadge, type StatusBadgeVariant } from "@/components/base/status-badge";
import { TableShell } from "@/components/ui/table";
import { amountClass, OS, TYPO, type AmountTone } from "@/lib/typography";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "positive" | "negative" | "warning";

const kpiToneClass: Record<Tone, string> = {
  neutral: "text-[var(--neo-text-primary)]",
  positive: OS.emeraldAccent,
  negative: OS.dangerAmount,
  warning: "text-[var(--neo-gold)] dark:text-[var(--neo-gold-soft)]",
};

export function NeoPanel({
  children,
  className,
  bodyClassName,
  eyebrow,
  title,
  description,
  action,
}: {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  const hasHeader = eyebrow || title || description || action;

  return (
    <section className={cn(OS.card, "min-w-0 overflow-hidden", className)}>
      {hasHeader ? (
        <div className="flex flex-col gap-2 border-b border-[var(--neo-border)] px-4 py-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            {eyebrow ? <p className={TYPO.sectionLabel}>{eyebrow}</p> : null}
            {title ? <h2 className={cn(TYPO.primaryName, "text-[16px]")}>{title}</h2> : null}
            {description ? (
              <p className={cn(TYPO.mutedText, "mt-0.5 text-[13px] leading-snug")}>{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function KpiTile({
  label,
  value,
  meta,
  tone = "neutral",
  className,
  valueClassName,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        OS.card,
        "relative flex min-h-[108px] min-w-0 flex-col overflow-hidden px-3 py-3 md:px-3.5 md:py-3.5",
        "transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:border-[var(--hh-border-strong)]",
        className
      )}
    >
      <p className={TYPO.kpiLabel}>{label}</p>
      <p
        className={cn(
          TYPO.kpiValue,
          "mt-2 break-words text-[18px] leading-tight tabular-nums",
          kpiToneClass[tone],
          valueClassName
        )}
      >
        {value}
      </p>
      {meta ? (
        <p className={cn(TYPO.kpiSubtitle, "mt-auto pt-2 text-[12px] leading-snug")}>{meta}</p>
      ) : null}
    </div>
  );
}

export function FilterToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <NeoToolbar className={className}>{children}</NeoToolbar>;
}

export function NeoToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-neo-toolbar="true"
      className={cn(
        OS.filterSurface,
        "flex flex-col gap-3 p-3 md:flex-row md:items-center",
        className
      )}
    >
      {children}
    </div>
  );
}

export function NeoTable({
  children,
  className,
  scrollClassName,
  tableClassName,
  busy,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  tableClassName?: string;
  busy?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "children">) {
  return (
    <TableShell data-neo-table="true" aria-busy={busy || undefined} className={className} {...rest}>
      <div className={cn("airtable-table-scroll", scrollClassName)}>
        <table
          className={cn(
            "w-full min-w-[880px] border-collapse text-[13px] text-[var(--neo-text-primary)]",
            tableClassName
          )}
        >
          {children}
        </table>
      </div>
    </TableShell>
  );
}

export function MobileListRow({
  children,
  className,
  asChild = false,
}: {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      className={cn(
        "group flex min-h-[56px] min-w-0 items-center gap-3 px-3 py-3",
        "transition-colors duration-150 ease-out hover:bg-[var(--hh-l3-hover)] active:scale-[0.99] active:bg-[var(--hh-l3-pressed)] active:duration-100",
        className
      )}
    >
      {children}
    </Comp>
  );
}

type NeoMobileCardProps = {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
  selected?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "children">;

export const NeoMobileCard = forwardRef<HTMLDivElement, NeoMobileCardProps>(function NeoMobileCard(
  { children, className, asChild = false, selected = false, ...rest },
  ref
) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      ref={ref}
      data-neo-mobile-card="true"
      data-state={selected ? "selected" : undefined}
      aria-selected={selected || undefined}
      className={cn(
        OS.card,
        "group min-w-0 transition-colors duration-150 ease-out hover:bg-[var(--hh-l3-hover)] active:scale-[0.99] active:bg-[var(--hh-l3-pressed)] active:duration-100",
        selected && "border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)]",
        className
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
});

export function NeoAmount({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: AmountTone;
  className?: string;
}) {
  return <span className={cn(amountClass(tone), className)}>{children}</span>;
}

export function AmountCell(props: { children: ReactNode; tone?: AmountTone; className?: string }) {
  return <NeoAmount {...props} />;
}

export function NeoStatus({
  label,
  variant = "default",
  className,
  showDot = true,
}: {
  label: string;
  variant?: StatusBadgeVariant;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <StatusBadge
      label={label}
      variant={variant}
      showDot={showDot}
      className={cn("shrink-0", className)}
    />
  );
}

export function NeoBulkActions({
  count,
  children,
  className,
  ...rest
}: {
  count: number;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "children">) {
  if (count <= 0) return null;

  return (
    <div
      data-neo-bulk-actions="true"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)] px-3 py-2 text-[var(--neo-text-primary)] shadow-[var(--hh-shadow-operational)]",
        "sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      role="status"
      {...rest}
    >
      <p className="text-[13px] font-medium tabular-nums">
        {count.toLocaleString("en-US")} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
