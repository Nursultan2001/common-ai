import { requireUser, mintExtensionToken } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Available to every role: download the Chrome extension + setup steps.
export default async function ExtensionPage() {
  const user = await requireUser();
  const token = await mintExtensionToken({ sub: user.id, role: user.role, orgId: user.orgId });
  const backendUrl = process.env.APP_URL ?? "http://localhost:3000";
  const isAgency = user.role === "COUNSELOR";

  return (
    <main>
      <h1>Browser extension</h1>
      <p className="muted">
        The extension fills the live Common App in your own logged-in browser.
        You review every field and submit yourself — it never submits for you.
      </p>

      <div className="card">
        <h2>1. Download</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Chrome / Edge / Brave. After downloading, unzip the file.
        </p>
        <a className="primary" href="/common-ai-extension.zip" download
          style={{ display: "inline-block", padding: "11px 18px", borderRadius: 10, fontWeight: 700 }}>
          ⬇ Download extension (.zip)
        </a>
      </div>

      <div className="card">
        <h2>2. Install it</h2>
        <ol className="muted" style={{ lineHeight: 1.9, paddingLeft: 18 }}>
          <li>Unzip the downloaded file to a folder you’ll keep.</li>
          <li>Open <code>chrome://extensions</code> in your browser.</li>
          <li>Turn on <strong>Developer mode</strong> (top-right).</li>
          <li>Click <strong>Load unpacked</strong> and choose the unzipped folder.</li>
          <li>Pin the <strong>Common AI</strong> extension so its icon is visible.</li>
        </ol>
      </div>

      <div className="card">
        <h2>3. Connect it</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Open the extension popup and paste these:
        </p>
        <label>Backend URL</label>
        <code className="token">{backendUrl}</code>
        <label style={{ marginTop: 10 }}>Your access token</label>
        <code className="token">{token}</code>
        <p className="muted" style={{ marginTop: 10 }}>
          {isAgency ? (
            <>Then set <strong>Application ID</strong> to a client’s ID — find it on
              that client’s page under <a href="/dashboard/clients">Clients</a>.</>
          ) : (
            <>Then set <strong>Application ID</strong> to one of your applications —
              find it on your <a href="/dashboard">Overview</a>.</>
          )}
        </p>
      </div>

      <div className="card">
        <h2>4. Autofill</h2>
        <ol className="muted" style={{ lineHeight: 1.9, paddingLeft: 18 }}>
          <li>Log in to Common App in the same browser.</li>
          <li>Open the popup → <strong>⚡ Autofill + Save all pages</strong>.</li>
          <li>Review the highlighted fields, then continue/submit yourself.</li>
        </ol>
        <p className="muted">
          Autofill only works for applications that are unlocked.
        </p>
      </div>
    </main>
  );
}
