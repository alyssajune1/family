import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: membership } = await supabase.from("household_members").select("id").eq("user_id", user.id).maybeSingle();

  if (membership) {
    redirect("/dashboard");
  }

  return <OnboardingForm email={user.email ?? ""} userId={user.id} />;
}
