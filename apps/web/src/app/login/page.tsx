"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type ActionState } from "@/lib/actions/auth";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="primary" type="submit" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState<ActionState, FormData>(loginAction, undefined);
  return (
    <main style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <form action={action} className="card">
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Password</label>
        <input name="password" type="password" required />
        {state?.error && <p style={{ color: "#ff6b6b" }}>{state.error}</p>}
        <Submit />
      </form>
      <p className="muted">
        No account? <a href="/signup">Create one</a>
      </p>
    </main>
  );
}
