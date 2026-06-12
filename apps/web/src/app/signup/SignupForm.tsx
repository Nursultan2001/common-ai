"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signupAction, type ActionState } from "@/lib/actions/auth";
import AppBackground from "../AppBackground";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="primary" type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create account"}
    </button>
  );
}

export default function SignupForm({
  token,
  defaultEmail,
}: {
  token: string;
  defaultEmail: string;
}) {
  const [state, action] = useFormState<ActionState, FormData>(signupAction, undefined);
  const [role, setRole] = useState("STUDENT");
  return (
    <main className="auth-page">
      <AppBackground />
      <div className="auth-card" style={{ maxWidth: 440 }}>
        <div className="auth-brand">
          <span className="dot">◆</span> Common AI
        </div>
        <div className="card">
          <h1>Create your account</h1>
          <p className="muted" style={{ marginTop: 0 }}>You’re invited — finish setting up below.</p>
          <form action={action}>
            <input type="hidden" name="token" value={token} />
            <label>Full name</label>
            <input name="name" required autoFocus />
            <label>Email</label>
            <input name="email" type="email" defaultValue={defaultEmail} readOnly />
            <label>Password</label>
            <input name="password" type="password" minLength={8} required />
            <label>I am a…</label>
            <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="STUDENT">Student</option>
              <option value="COUNSELOR">Counselor / Agency</option>
            </select>
            {role === "COUNSELOR" && (
              <>
                <label>Agency name (gets discounted pricing)</label>
                <input name="orgName" placeholder="e.g. Bright Futures Admissions" />
              </>
            )}
            {state?.error && <p style={{ color: "#ff6b6b" }}>{state.error}</p>}
            <Submit />
          </form>
        </div>
      </div>
    </main>
  );
}
