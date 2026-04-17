"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              full_name: fullName
            }
          }
        });
        if (error) throw error;
        setMessage("Account created. If email confirmations are enabled in Supabase, confirm your email and then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="eyebrow">Shared household money app</div>
        <h1>Helm / June Family Finance</h1>
        <p className="hero-sub">Secure login for two family members, shared data, recurring bills, budgets, filters, and installable mobile access.</p>

        <div className="mode-toggle">
          <button className={`pill ${mode === "login" ? "active" : ""}`} type="button" onClick={() => setMode("login")}>
            Sign in
          </button>
          <button className={`pill ${mode === "signup" ? "active" : ""}`} type="button" onClick={() => setMode("signup")}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <label className="field">
              <span>Display name</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Helm or June" required />
            </label>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required />
          </label>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Working..." : mode === "login" ? "Sign in securely" : "Create secure account"}
          </button>
        </form>

        {message ? <p className="helper">{message}</p> : null}

        <div className="mini-grid">
          <div className="mini-stat">
            <div className="mini-stat-label">Shared household</div>
            <div className="mini-stat-value">2 users</div>
            <div className="mini-stat-note">Both family members work from the same live data.</div>
          </div>
          <div className="mini-stat">
            <div className="mini-stat-label">Deploy target</div>
            <div className="mini-stat-value">Vercel</div>
            <div className="mini-stat-note">Supabase handles auth, storage, and persistence.</div>
          </div>
        </div>
      </section>
    </main>
  );
}
