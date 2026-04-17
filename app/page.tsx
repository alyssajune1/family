import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: membership } = await supabase.from("household_members").select("id").eq("user_id", user.id).maybeSingle();

  redirect(membership ? "/dashboard" : "/onboarding");
}
