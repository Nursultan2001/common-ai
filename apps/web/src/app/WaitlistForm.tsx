"use client";

import { useFormState, useFormStatus } from "react-dom";
import { joinWaitlistAction, type WaitlistState } from "@/lib/actions/waitlist";
import type { Dict } from "@/lib/i18n";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary" type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

export default function WaitlistForm({ t }: { t: Dict["form"] }) {
  const [state, action] = useFormState<WaitlistState, FormData>(
    joinWaitlistAction,
    undefined
  );

  if (state?.ok) {
    return (
      <div className="lp-formcard">
        <h2>{t.successTitle}</h2>
        <p className="muted">{t.successBody}</p>
      </div>
    );
  }

  return (
    <div className="lp-formcard">
      <h2>{t.title}</h2>
      <p className="muted">{t.desc}</p>
      <form action={action}>
        <div className="row">
          <div style={{ flex: "1 1 200px" }}>
            <label>{t.email}</label>
            <input name="email" type="email" required placeholder="you@example.com" />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label>{t.name}</label>
            <input name="name" />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label>{t.iam}</label>
            <select name="audience">
              <option value="STUDENT">{t.student}</option>
              <option value="COUNSELOR">{t.counselor}</option>
            </select>
          </div>
        </div>
        <label>{t.note}</label>
        <textarea name="note" />
        {state?.error && <p style={{ color: "#ff6b6b" }}>{state.error}</p>}
        <Submit label={t.submit} busy={t.submitting} />
      </form>
    </div>
  );
}
