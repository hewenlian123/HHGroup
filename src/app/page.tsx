import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="mx-auto max-w-[1200px] flex flex-col items-center justify-center gap-6 p-12">
      <h1 className="text-2xl font-semibold text-foreground">HH Group</h1>
      <p className="text-muted-foreground">Construction project management.</p>
      <Button asChild>
        <Link href="/dashboard">Go to Dashboard</Link>
      </Button>
    </div>
  );
}
