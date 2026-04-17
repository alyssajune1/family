"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  email: string;
  userId: string;
};

export function OnboardingForm({ email, userId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [householdName, setHouseholdName] = useState("Helm / June Family");
  const [tagline, setTagline] = useState("A practical home base for spending, saving, and staying on top of the month together.");
  const [displayName, setDisplayName] = useState(email.split("@")[0] || "");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error: profileError } = await supabase.from("profiles").upsert({
        user_id: userId,
        full_name: displayName,
        email
      });
      if (profileError) throw profileError;

      if (mode === "create") {
        const { error } = await supabase.rpc("create_household_with_owner", {
          household_name: householdName,
          household_tagline: tagline,
          member_display_name: displayName || "Owner"
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("join_household_with_code", {
          invite_code_input: joinCode.trim().toUpperCase(),
          member_display_name: displayName || "Member"
        });
        if (error) throw error;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to finish setup.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="eyebrow">Household setup</div>
        <h1>Connect this account to the family dashboard</h1>
        <p className="hero-sub">Create the shared Helm / June Family household once, then let the second user join with the invite code.</p>

        <div className="mode-toggle">
          <button className={`pill ${mode === "create" ? "active" : ""}`} type="button" onClick={() => setMode("create")}>
            Create household
          </button>
          <button className={`pill ${mode === "join" ? "active" : ""}`} type="button" onClick={() => setMode("join")}>
            Join with code
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Your display name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>

          {mode === "create" ? (
            <>
              <label className="field">
                <span>Household name</span>
                <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} required />
              </label>
              <label className="field">
                <span>Tagline</span>
                <textarea value={tagline} onChange={(event) => setTagline(event.target.value)} />
              </label>
            </>
          ) : (
            <label className="field">
              <span>Invite code</span>
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="HELM-ABC123" required />
            </label>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving..." : mode === "create" ? "Create shared household" : "Join household"}
          </button>
        </form>

        {message ? <p className="helper">{message}</p> : null}
      </section>
    </main>
  );
}
