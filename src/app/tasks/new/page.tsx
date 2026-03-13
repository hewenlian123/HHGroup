import { redirect } from "next/navigation";

/** FAB link: New Task → redirect to tasks page (use + New Task there). */
export default function TasksNewPage() {
  redirect("/tasks");
}
