#!/usr/bin/env python3
"""
Make 20260325075614_remote_schema.sql safe for `supabase db reset --local` when some
tables/policies/indexes only exist on full production dumps.

Transforms (idempotent enough for re-run on same file):
  - drop policy on public.* -> DROP POLICY IF EXISTS
  - alter table "public".* -> ALTER TABLE IF EXISTS "public".*
  - guard optional btree indexes (inspection_log + batch)
  - wrap each public-table policy group in DO $$ IF to_regclass(...) $$
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "supabase/migrations/20260325075614_remote_schema.sql"

INDEX_BLOCK_OLD = """CREATE INDEX idx_inspection_log_date ON public.inspection_log USING btree (inspection_date);

CREATE INDEX idx_inspection_log_project ON public.inspection_log USING btree (project_id);

CREATE INDEX idx_invoices_project ON public.invoices USING btree (project_id);

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);

CREATE INDEX idx_labor_worker ON public.labor_entries USING btree (worker_id);

CREATE INDEX idx_project_schedule_dates ON public.project_schedule USING btree (start_date, end_date);

CREATE INDEX idx_project_schedule_project ON public.project_schedule USING btree (project_id);

CREATE INDEX idx_project_tasks_due ON public.project_tasks USING btree (due_date);

CREATE INDEX idx_project_tasks_project ON public.project_tasks USING btree (project_id);

CREATE INDEX idx_projects_created ON public.projects USING btree (created_at DESC);

CREATE INDEX idx_punch_list_project ON public.punch_list USING btree (project_id);

CREATE INDEX idx_worker_receipts_date ON public.worker_receipts USING btree (receipt_date);

CREATE INDEX idx_worker_receipts_reimbursement_id ON public.worker_receipts USING btree (reimbursement_id);
"""

INDEX_BLOCK_NEW = """do $$
begin
  if to_regclass('public.inspection_log') is not null then
    create index if not exists idx_inspection_log_date on public.inspection_log using btree (inspection_date);
    create index if not exists idx_inspection_log_project on public.inspection_log using btree (project_id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.invoices') is not null then
    create index if not exists idx_invoices_project on public.invoices using btree (project_id);
    create index if not exists idx_invoices_status on public.invoices using btree (status);
  end if;
  if to_regclass('public.labor_entries') is not null then
    create index if not exists idx_labor_worker on public.labor_entries using btree (worker_id);
  end if;
  if to_regclass('public.project_schedule') is not null then
    create index if not exists idx_project_schedule_dates on public.project_schedule using btree (start_date, end_date);
    create index if not exists idx_project_schedule_project on public.project_schedule using btree (project_id);
  end if;
  if to_regclass('public.project_tasks') is not null then
    create index if not exists idx_project_tasks_due on public.project_tasks using btree (due_date);
    create index if not exists idx_project_tasks_project on public.project_tasks using btree (project_id);
  end if;
  if to_regclass('public.projects') is not null then
    create index if not exists idx_projects_created on public.projects using btree (created_at desc);
  end if;
  if to_regclass('public.punch_list') is not null then
    create index if not exists idx_punch_list_project on public.punch_list using btree (project_id);
  end if;
  if to_regclass('public.worker_receipts') is not null then
    create index if not exists idx_worker_receipts_date on public.worker_receipts using btree (receipt_date);
    create index if not exists idx_worker_receipts_reimbursement_id on public.worker_receipts using btree (reimbursement_id);
  end if;
end $$;
"""


def apply_line_fixes(text: str) -> str:
    out_lines: list[str] = []
    for line in text.splitlines(keepends=True):
        raw = line.rstrip("\n")
        s = raw
        if re.match(r'^drop policy "[^"]+" on "public"\.', s) and "if exists" not in s.lower():
            s = re.sub(r"^drop policy ", "drop policy if exists ", s, count=1, flags=re.I)
        elif re.match(r'^alter table "public"\.', s) and not re.match(
            r"^alter table if exists", s, re.I
        ):
            s = re.sub(r"^alter table ", "alter table if exists ", s, count=1, flags=re.I)
        if s != raw:
            line = s + ("\n" if line.endswith("\n") else "")
        out_lines.append(line)
    return "".join(out_lines)


def wrap_public_policies(text: str) -> str:
    m = re.search(
        r"(\n\n+  create policy \"allow authenticated delete\"\n  on \"public\"\.\"accounting_periods\")"
        r"([\s\S]*?)(\n\nCREATE TRIGGER accounts_set_user_id)",
        text,
    )
    if not m:
        raise RuntimeError("policy section marker not found — migration format changed")

    head = text[: m.start(1)]
    tail = text[m.start(3) :]
    section = m.group(1) + m.group(2)

    if "if to_regclass('public.accounting_periods')" in section:
        print("Policies already wrapped; skipping policy wrap.")
        return text

    chunks = re.split(r"(?=\n\n+  create policy )", section)
    out: list[str] = []
    i = 0
    while i < len(chunks):
        c = chunks[i]
        if not c.strip():
            i += 1
            continue
        m2 = re.search(r'on "public"\."([^"]+)"', c)
        if not m2:
            out.append(c)
            i += 1
            continue
        table = m2.group(1)
        group = [c]
        j = i + 1
        while j < len(chunks):
            nxt = chunks[j]
            if not nxt.strip():
                j += 1
                continue
            m3 = re.search(r'on "public"\."([^"]+)"', nxt)
            if m3 and m3.group(1) == table:
                group.append(nxt)
                j += 1
            else:
                break
        combined = "".join(group).strip("\n")
        inner = "\n".join(("    " + ln if ln.strip() else ln) for ln in combined.splitlines())
        out.append(
            f"\n\ndo $$\n"
            f"begin\n"
            f"  if to_regclass('public.{table}') is not null then\n"
            f"{inner}\n"
            f"  end if;\n"
            f"end $$;\n"
        )
        i = j

    return head + "".join(out) + tail


def main() -> None:
    text = MIGRATION.read_text()
    text = apply_line_fixes(text)
    if INDEX_BLOCK_OLD in text:
        text = text.replace(INDEX_BLOCK_OLD, INDEX_BLOCK_NEW)
    else:
        print("Note: INDEX_BLOCK_OLD not found (already replaced?)")
    text = wrap_public_policies(text)
    MIGRATION.write_text(text)
    print("Updated", MIGRATION)


if __name__ == "__main__":
    main()
