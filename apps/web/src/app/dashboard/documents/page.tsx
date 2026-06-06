import { db } from "@/lib/db";
import { requireUser, getOrCreateApplicantForStudent } from "@/lib/server-auth";
import {
  uploadDocumentAction,
  deleteDocumentAction,
} from "@/lib/actions/documents";

export const dynamic = "force-dynamic";

const TYPES = [
  ["TRANSCRIPT", "Transcript"],
  ["TEST_SCORE_REPORT", "Test score report"],
  ["FINANCIAL_AID", "Financial aid document"],
  ["PASSPORT_ID", "Passport / ID"],
  ["RESUME", "Résumé"],
  ["PORTFOLIO", "Portfolio"],
  ["OTHER", "Other"],
] as const;

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DocumentsPage() {
  const user = await requireUser();
  const applicant = await getOrCreateApplicantForStudent(user.id, user.orgId);
  const docs = await db.document.findMany({
    where: { applicantId: applicant.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main>
      <h1>Document vault</h1>
      <p className="muted">
        Files are encrypted at rest (AES-256-GCM) and only ever decrypted for you.
        When a portal asks for a document you’ve stored, the extension can attach
        it automatically.
      </p>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                    {d.fileName}
                  </a>
                </td>
                <td className="muted">{d.type}</td>
                <td className="muted">{fmtSize(d.sizeBytes)}</td>
                <td className="muted">{d.createdAt.toISOString().slice(0, 10)}</td>
                <td>
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="documentId" value={d.id} />
                    <button style={{ marginTop: 0 }}>Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Upload a document</h2>
        <form action={uploadDocumentAction}>
          <label>Type</label>
          <select name="type">
            {TYPES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <label>File (max 10 MB)</label>
          <input name="file" type="file" required />
          <button className="primary" type="submit">Upload &amp; encrypt</button>
        </form>
      </div>
    </main>
  );
}
