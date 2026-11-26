# Pedagogy library sample (v0.1, as delivered)

Sam shared this on 12 Nov 2026 as `pedagogy_library_sample.zip` with `HANDOFF.md`. The files are
as delivered, unchanged: read `HANDOFF.md` first (purpose, the five layers, the rules on
citations, copyright and privacy, open questions), then `pedagogy_library_schema.yaml`.

- `pedagogy_library_sample.yaml`: the merged library (115 sources, 377 passages, 116 entries,
  437 claims), all `status: draft`, nothing reviewed by an educator yet.
- `parts/*.yaml`: the five research agents' outputs; `validate.py parts out.yaml` merges and
  checks them (0 errors, 26 warnings for unconfirmed locators on 12 Nov 2026).
- `build_page.py`: a stand-alone HTML browser of the library, a reference for the "i" citations.
- `BRIEF.md`: the brief the research agents were given; the template for new curriculum cells.

Nothing loads this folder: the library server serves only `library/collections/`. How it is
brought into the app is the next piece of work (see `docs/HANDOVER.md`).
