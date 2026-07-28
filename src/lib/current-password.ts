import { createTransientSupabaseClient } from "@/lib/supabase-server";

export async function verifyCurrentPassword(input: {
  email: string;
  password: string;
  userId: string;
}): Promise<boolean> {
  if (!input.email || !input.password || input.password.length > 1024 || !input.userId) {
    return false;
  }

  const supabase = createTransientSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  const matches = !error && data.user?.id === input.userId;
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return matches;
}
