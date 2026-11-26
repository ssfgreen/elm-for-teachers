"""Merge library parts and validate integrity.

Usage: python3 validate.py parts_dir out_file
"""
import sys, glob, os, re, yaml, json

parts_dir, out_file = sys.argv[1], sys.argv[2]
lib = {"sources": [], "passages": [], "entries": [], "claims": []}
for f in sorted(glob.glob(os.path.join(parts_dir, "*.yaml"))):
    data = yaml.safe_load(open(f)) or {}
    for k in lib:
        for rec in data.get(k) or []:
            rec["_part"] = os.path.basename(f)
            lib[k].append(rec)

errors, warnings = [], []
ids = {}
for k, recs in lib.items():
    for r in recs:
        i = r.get("id")
        if not i:
            errors.append(f"{k} record without id in {r['_part']}")
            continue
        if i in ids:
            errors.append(f"duplicate id {i}")
        ids[i] = k

def exists(i, kind=None):
    return i in ids and (kind is None or ids[i] == kind)

DASHES = re.compile("[–—]|--")
quotes_per_source = {}
for p in lib["passages"]:
    if not exists(p.get("source_id"), "sources"):
        errors.append(f"passage {p['id']} -> missing source {p.get('source_id')}")
    if p.get("excerpt_type") == "quote":
        n = len(str(p.get("text", "")).split())
        if n > 15:
            errors.append(f"quote too long ({n} words): {p['id']}")
        quotes_per_source[p.get("source_id")] = quotes_per_source.get(p.get("source_id"), 0) + 1
    if not p.get("verified_by_fetch"):
        warnings.append(f"passage not verified by fetch: {p['id']}")
    if "UNCONFIRMED" in str(p.get("locator", "")) or "TODO" in str(p.get("locator", "")):
        warnings.append(f"locator unconfirmed: {p['id']}")
for s, n in quotes_per_source.items():
    if n > 1:
        errors.append(f"source {s} has {n} verbatim quotes (max 1)")

for c in lib["claims"]:
    sb = c.get("supported_by") or []
    if not sb:
        errors.append(f"claim {c['id']} has no supporting passage")
    for p in sb:
        if not exists(p, "passages"):
            errors.append(f"claim {c['id']} -> missing passage {p}")
    if not exists(c.get("entry_id"), "entries"):
        errors.append(f"claim {c['id']} -> missing entry {c.get('entry_id')}")

for e in lib["entries"]:
    for cid in e.get("claims") or []:
        if not exists(cid, "claims"):
            errors.append(f"entry {e['id']} -> missing claim {cid}")
    if not e.get("claims"):
        warnings.append(f"entry without claims: {e['id']}")
    for rel, targets in (e.get("relations") or {}).items():
        for t in targets or []:
            if not exists(t, "entries"):
                warnings.append(f"entry {e['id']} {rel} -> unknown {t} (dropped)")
        e["relations"][rel] = [t for t in (targets or []) if exists(t, "entries")]

# dash check on all text
blob = json.dumps(lib, ensure_ascii=False, default=str)
n_dash = len(DASHES.findall(blob))
if n_dash:
    warnings.append(f"{n_dash} dash characters found (will be normalised)")

for k in lib:
    for r in lib[k]:
        r.pop("_part", None)

yaml.safe_dump(lib, open(out_file, "w"), allow_unicode=True, sort_keys=False, width=100)
print("counts:", {k: len(v) for k, v in lib.items()})
print("entry types:", {t: sum(1 for e in lib['entries'] if e.get('type') == t) for t in sorted({e.get('type') for e in lib['entries']})})
print(f"ERRORS ({len(errors)}):"); [print("  ", e) for e in errors]
print(f"WARNINGS ({len(warnings)}):"); [print("  ", w) for w in warnings[:80]]
