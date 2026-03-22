import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const anon = createClient(URL, ANON);
const admin = createClient(URL, SERVICE);

async function main() {
  console.log("URL:", URL);
  console.log("SERVICE KEY prefix:", SERVICE?.substring(0, 20));

  const { data: anonRows } = await anon.from("project_tasks").select("id, title").limit(5);
  console.log("ANON sees:", anonRows);

  const { data: adminRows } = await admin.from("project_tasks").select("id, title").limit(5);
  console.log("ADMIN sees:", adminRows);

  if (anonRows?.[0]) {
    const id = anonRows[0].id;
    const { data: check } = await admin.from("project_tasks").select("id").eq("id", id);
    console.log("ADMIN can find anon row by ID:", check);
    const { error, count } = await admin
      .from("project_tasks")
      .delete({ count: "exact" })
      .eq("id", id);
    console.log("ADMIN delete result - count:", count, "error:", error?.message);
  }
}

main();
