"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Section = { label: string; content: ReactNode };
export function ContactSections({ sections }: { sections: Section[] }) {
  return (
    <Suspense fallback={<p role="status">Loading contact sections…</p>}>
      <Sections sections={sections} />
    </Suspense>
  );
}
function Sections({ sections }: { sections: Section[] }) {
  const path = usePathname();
  const search = useSearchParams();
  const active =
    sections.find((section) => section.label.toLowerCase() === search.get("tab")) ?? sections[0];
  const href = (label: string) => {
    const next = new URLSearchParams(search.toString());
    next.set("tab", label.toLowerCase());
    return `${path}?${next}`;
  };
  const primary = sections.slice(0, 3);
  const more = sections.slice(3);
  return (
    <div className="min-w-0 space-y-4" data-contact-detail>
      <nav
        aria-label="Contact detail sections"
        className="flex flex-wrap gap-1 border-b border-[var(--hh-border-subtle)] pb-2"
      >
        {sections.map((section) => (
          <Button
            key={section.label}
            asChild
            variant="ghost"
            className={`min-h-11 ${primary.includes(section) ? "" : "hidden md:inline-flex"} ${section === active ? "bg-[var(--hh-l3-selected)] forced-colors:underline" : ""}`}
          >
            <Link
              href={href(section.label)}
              scroll={false}
              prefetch={false}
              aria-current={section === active ? "page" : undefined}
            >
              {section.label}
            </Link>
          </Button>
        ))}
        {more.length > 0 && (
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="min-h-11" aria-label="More contact sections">
                  {more.includes(active) ? active.label : "More"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {more.map((section) => (
                  <DropdownMenuItem key={section.label} asChild className="min-h-11">
                    <Link
                      href={href(section.label)}
                      scroll={false}
                      prefetch={false}
                      aria-current={section === active ? "page" : undefined}
                    >
                      {section.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </nav>
      <section aria-label={active.label} className="min-w-0 space-y-4">
        {active.content}
      </section>
    </div>
  );
}

export function ContactChannels({
  phone,
  email,
}: {
  phone?: string | null;
  email?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
      {phone && (
        <a
          className="inline-flex min-h-11 min-w-11 items-center break-all text-sm underline"
          href={`tel:${phone}`}
        >
          {phone}
        </a>
      )}
      {email && (
        <a
          className="inline-flex min-h-11 min-w-11 items-center break-all text-sm underline"
          href={`mailto:${email}`}
        >
          {email}
        </a>
      )}
      {!phone && !email && (
        <p className="text-sm text-[var(--hh-text-secondary)]">No phone or email recorded.</p>
      )}
    </div>
  );
}
