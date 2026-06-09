# Common App questions → write them here for me to add

Instead of scraping, list the questions and I'll (1) add the matching fields to
the intake form + database, and (2) map them to the page selectors I already
captured. This is the reliable way to get full coverage.

## How to write each question

For every question, give me these on one line (use `|` between parts):

```
Section | Question text (exact) | type | options (if any) | notes
```

- **type** = one of: `text`, `longtext`, `date`, `number`, `yesno`, `dropdown`,
  `radio`, `checkbox`
- **options** = for dropdown/radio/checkbox, the EXACT choices separated by `;`
- **notes** = anything (e.g. "I provide this", "leave blank", "same as profile")

You don't need selectors — I have those from your captures. Just the questions.

## Example (this is the format — copy it)

```
Profile | Legal first/given name | text | | already have
Profile | Suffix | dropdown | None; Jr.; Sr.; II; III; IV |
Contact | Preferred phone | radio | Home; Mobile |
Education | Class rank reporting | dropdown | Exact; Decile; Quintile; Quartile; None |
Education | Graduating class size | number | |
Testing | Highest SAT Math | number | |
Family | Parent 1 occupation | text | |
Family | Number of siblings | number | |
Activities | Activity type | dropdown | Academic; Art; Athletics: Club; Community Service; ... |
```

## Tips
- Do one section at a time (Profile, then Education, etc.) — easier to verify.
- For dropdowns/radios, the exact option text matters most (so the AI/engine can
  pick the right one). If a list is long (like Country), just say "long list —
  free text is fine" and I'll handle it.
- Mark anything sensitive (race, disability, etc.) — those stay optional and
  require your explicit confirmation before filling.

Paste your list straight into the chat, or add it to this file — either works.
