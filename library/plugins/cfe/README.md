# Curriculum for Excellence

Scotland's curriculum, from Education Scotland, as two collections:

- `cfe-curriculum` (structured): every experience and outcome by area, organiser, level and the
  stages each level usually covers, and the benchmarks for Second level (P7) and Third level (S1),
  each tied to the codes of its table row. Tools: `structure`, `outcomes`, `benchmarks`.
- `education-scotland-eo` (documents): the English experiences and outcomes documents, one per
  curriculum area, one experience and outcome per line starting with its code. Tools: `search`,
  `read`.

The assistant uses it in class and year group chats to find the outcomes a worksheet covers and
what achieving them looks like. It has no settings.

Benchmarks cover Second and Third level only, and not every code: `structure` returns the
coverage. Health and wellbeing's wellbeing codes (HWB x-01a to x-19a), most of RERC and a few
others have none, and some Numeracy and Health and wellbeing rows carry a wrong organiser name.
Check those before relying on them.

Served at `/p/elm/cfe` (JSON API and MCP). The collection files are still in
`library/collections/`; the library places them at `collections/<id>` in this plugin when it loads.

## Licence

Reuse is `adapt_with_credit`. Whoever copies or adapts this content must keep this line:

> Contains public sector information licensed under the Open Government Licence v3.0.
> © Crown copyright, Education Scotland.
> https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

Source: https://education.gov.scot/curriculum-for-excellence/ (experiences and outcomes, and
benchmarks). Education Scotland's terms of use (https://education.gov.scot/terms-of-use, last
updated 1 Nov 2025, read 21 Nov 2026) put its text under the Open Government Licence, not
including logos. Images, videos and third-party material are not covered; this plugin holds none
of them, only the text of the experiences and outcomes and the benchmarks.
