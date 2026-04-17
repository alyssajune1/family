import { redirect } from "next/navigation";
import { DashboardApp } from "@/components/dashboard-app";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    redirect("/onboarding");
  }

  const { data: household } = await supabase.from("households").select("*").eq("id", membership.household_id).single();
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("household_id", membership.household_id)
    .order("kind")
    .order("name");
  const { data: members } = await supabase.from("household_members").select("*").eq("household_id", membership.household_id).order("created_at");
  const { data: transactions } = await supabase
    .from("transactions")
    .select("*, categories(*), entered_by_profile:profiles!transactions_entered_by_fkey(user_id, full_name)")
    .eq("household_id", membership.household_id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  const { data: bills } = await supabase.from("bills").select("*, categories(*)").eq("household_id", membership.household_id).order("due_date");
  const { data: savingsGoals } = await supabase.from("savings_goals").select("*").eq("household_id", membership.household_id).order("created_at");
  const { data: subscriptions } = await supabase.from("subscriptions").select("*").eq("household_id", membership.household_id).order("name");
  const { data: cashAccounts } = await supabase.from("cash_accounts").select("*").eq("household_id", membership.household_id).order("name");
  const { data: netWorthAccounts } = await supabase.from("net_worth_accounts").select("*").eq("household_id", membership.household_id).order("account_type");
  const { data: debts } = await supabase.from("debts").select("*").eq("household_id", membership.household_id).order("name");
  const { data: sinkingFunds } = await supabase.from("sinking_funds").select("*").eq("household_id", membership.household_id).order("name");

  return (
    <DashboardApp
      initialData={{
        household,
        membership,
        categories: categories ?? [],
        members: members ?? [],
        transactions: transactions ?? [],
        bills: bills ?? [],
        savingsGoals: savingsGoals ?? [],
        subscriptions: subscriptions ?? [],
        cashAccounts: cashAccounts ?? [],
        netWorthAccounts: netWorthAccounts ?? [],
        debts: debts ?? [],
        sinkingFunds: sinkingFunds ?? []
      }}
      userEmail={user.email ?? ""}
    />
  );
}
