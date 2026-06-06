// A throwaway target form so you can watch the extension's autofill engine work
// end-to-end locally (the real Common App selectors are placeholders). The input
// IDs here match packages/field-maps/templates/localhost-test.json.
export const metadata = { title: "Autofill test form" };

export default function TestForm() {
  return (
    <main style={{ maxWidth: 640 }}>
      <h1>Autofill test form</h1>
      <p className="muted">
        Empty on purpose. Open the extension popup → <strong>Prepare autofill on
        this page</strong>. The engine should fill these from your profile,
        highlight each field, and show the review-and-submit banner at the bottom.
      </p>

      <form className="card" action="#">
        <label>First name</label>
        <input id="firstName" name="firstName" />
        <label>Last name</label>
        <input id="lastName" name="lastName" />
        <label>Preferred name</label>
        <input id="preferredName" name="preferredName" />
        <label>Date of birth</label>
        <input id="dob" name="dob" type="date" />
        <label>Email</label>
        <input id="email" name="email" type="email" />
        <label>Phone</label>
        <input id="phone" name="phone" type="tel" />
        <label>City</label>
        <input id="city" name="city" />
        <label>High school</label>
        <input id="highSchool" name="highSchool" />

        {/* The content script intercepts this until you click "I reviewed". */}
        <button type="submit" className="primary">
          Submit application
        </button>
      </form>
    </main>
  );
}
