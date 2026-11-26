#!/usr/bin/env python3
"""Keep prompts.jsonl and prompts.csv in sync.

Edit either file, then run this script with no arguments: it compares the
two files' modification times and regenerates the older one from the newer
one. Run `python3 sync.py to-csv` or `python3 sync.py to-jsonl` to force a
direction (e.g. the first time, when only one of the two files exists).

Nested fields (must_contain, must_not, literature_metadata) are stored in
the CSV as compact JSON strings, so round-tripping is lossless. Missing
fields come back as null/empty rather than being omitted, so every record
ends up with the same set of columns.
"""
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
JSONL_PATH = HERE / "prompts.jsonl"
CSV_PATH = HERE / "prompts.csv"

# Canonical column order. Any field present in the data but not listed here
# is appended at the end (alphabetically), so nothing is ever silently dropped.
FIELD_ORDER = [
    "id", "section", "section_title", "task", "task_mapping_note", "status",
    "stage", "subject", "region", "prompt", "attachment",
    "must_contain", "must_not", "rubric_status", "expected_behaviour",
    "source", "date", "note", "literature_metadata",
]


def load_jsonl(path):
    records = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def field_order(records):
    fields = list(FIELD_ORDER)
    seen = set(fields)
    extra = sorted({k for r in records for k in r} - seen)
    return fields + extra


def to_csv(records, path):
    fields = field_order(records)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in records:
            row = {}
            for k in fields:
                v = r.get(k)
                if isinstance(v, (list, dict)):
                    row[k] = json.dumps(v, ensure_ascii=False)
                elif v is None:
                    row[k] = ""
                else:
                    row[k] = v
            w.writerow(row)


def from_csv(path):
    with path.open(newline="") as f:
        rows = list(csv.DictReader(f))
    records = []
    for row in rows:
        rec = {}
        for k, v in row.items():
            if v == "":
                rec[k] = None
            elif v and v[0] in "[{":
                rec[k] = json.loads(v)
            else:
                rec[k] = v
        records.append(rec)
    return records


def to_jsonl(records, path):
    fields = field_order(records)
    with path.open("w") as f:
        for r in records:
            ordered = {k: r.get(k) for k in fields}
            f.write(json.dumps(ordered, ensure_ascii=False) + "\n")


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None

    if arg == "to-csv":
        direction = "jsonl-to-csv"
    elif arg == "to-jsonl":
        direction = "csv-to-jsonl"
    elif arg is None:
        jsonl_exists = JSONL_PATH.exists()
        csv_exists = CSV_PATH.exists()
        if jsonl_exists and not csv_exists:
            direction = "jsonl-to-csv"
        elif csv_exists and not jsonl_exists:
            direction = "csv-to-jsonl"
        elif not jsonl_exists and not csv_exists:
            sys.exit("Neither prompts.jsonl nor prompts.csv exists.")
        else:
            direction = (
                "csv-to-jsonl"
                if CSV_PATH.stat().st_mtime > JSONL_PATH.stat().st_mtime
                else "jsonl-to-csv"
            )
    else:
        sys.exit(f"Unknown argument: {arg!r}. Use 'to-csv', 'to-jsonl', or no argument.")

    if direction == "jsonl-to-csv":
        records = load_jsonl(JSONL_PATH)
        to_csv(records, CSV_PATH)
        print(f"{JSONL_PATH.name} -> {CSV_PATH.name} ({len(records)} records)")
    else:
        records = from_csv(CSV_PATH)
        to_jsonl(records, JSONL_PATH)
        print(f"{CSV_PATH.name} -> {JSONL_PATH.name} ({len(records)} records)")


if __name__ == "__main__":
    main()
