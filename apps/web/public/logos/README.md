# University logos

Drop official logo files here to replace the colored monogram crests on the
landing page. The page auto-detects them — no code change needed.

## How
- File name must match the university `slug` used in
  `apps/web/src/app/LandingClient.tsx`, e.g. `harvard.svg`, `mit.svg`, `cmu.svg`.
- Default expected format is **SVG**. To use PNG instead, change
  `LOGO_EXT = "svg"` to `"png"` in `LandingClient.tsx`.
- Recommended: white/monochrome versions on transparent background (the landing
  is dark). Height renders at ~22px.

Current slugs: harvard, stanford, mit, yale, princeton, columbia, berkeley,
cornell, uchicago, upenn, caltech, duke, jhu, brown, nyu, ucla, cmu, michigan.

If a file is missing, a colored monogram crest is shown automatically.

## ⚠️ Trademark note
University names and logos are trademarks of their respective institutions.
Displaying them may require permission, and you must not imply endorsement or
affiliation. The landing page includes a disclaimer for this reason. Confirm you
have the right to use any logo you add here.
