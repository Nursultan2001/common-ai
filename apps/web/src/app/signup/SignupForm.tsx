"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signupAction, type ActionState } from "@/lib/actions/auth";

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
    <main style={{ maxWidth: 460 }}>
      <h1>Create your account</h1>
      <p className="muted">You’re invited 🎉 Finish setting up your account below.</p>
      <form action={action} className="card">
        <input type="hidden" name="token" value={token} />
        <label>Full name</label>
        <input name="name" required />
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
    </main>
  );
}
