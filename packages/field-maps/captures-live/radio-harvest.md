# Live radio/checkbox option-id harvest (stable #option_ques_* selectors)
# Captured from logged-in apply.commonapp.org via Claude-in-Chrome. Read-only.

## /common/3/17 — Birthplace & citizenship
- text: text_ques_218 (birth country), text_ques_219 (city of birth), text_ques_236 (countries of citizenship)
- RADIO citizenshipStatus (anchor option_ques_234_*):
  - "U.S. citizen or U.S. national" -> #option_ques_234_2098-input
  - "U.S. dual citizen"             -> #option_ques_234_2099-input
  - "U.S. permanent resident"       -> #option_ques_234_2789-input
  - "Citizen of non-U.S. country"   -> #option_ques_234_2101-input
  - "U.S. resident"                 -> #option_ques_234_5918-input

## /common/3/14 — Demographics: legal sex
- RADIO legalSex (option_ques_180_*):
  - "Female"                 -> #option_ques_180_1795-input
  - "Male"                   -> #option_ques_180_1794-input
  - "X or another legal sex" -> #option_ques_180_5465-input

## /common/4/23 — Education GPA/rank (CONFIRMS v10 radio-maps)
- text: text_ques_304 (cumulative GPA), text_ques_305 (GPA scale), text_ques_303 (class size), text_ques_299 (decile rank)
- R0 classRankReporting: Exact #option_ques_297_817-input, Decile _818, Quintile _819, Quartile _820, None _821
- R3 rankWeighting: Weighted #option_ques_302_841-input, Unweighted _842
- R4 gpaWeighting: Weighted #option_ques_306_841-input, Unweighted _842

## /common/2/2 — Testing: self-report
- RADIO selfReportScores: Yes #option_ques_925_2371-input, No #option_ques_925_2372-input
