-- Lists moved to a block per item (PLAN.md section 6). For each old list block and each of its
-- versions (block_revisions), which item block each item of that version went to, and which of
-- the version's lines it held (0-based, line_count lines). The export uses it to write earlier
-- events that name a list against the item they touched. Written once, by scripts/split-lists.mjs.
CREATE TABLE block_splits (
  list_block_id TEXT NOT NULL REFERENCES blocks(id),
  version INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  item_block_id TEXT NOT NULL REFERENCES blocks(id),
  first_line INTEGER NOT NULL,
  line_count INTEGER NOT NULL,
  PRIMARY KEY (list_block_id, version, item_index)
);
CREATE INDEX idx_block_splits_item ON block_splits(item_block_id);
