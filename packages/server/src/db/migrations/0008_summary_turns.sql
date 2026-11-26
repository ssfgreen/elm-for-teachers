-- How many of a thread's oldest chat turns its running summary covers. Older turns are folded
-- into the summary a batch at a time, so this can no longer be worked out from the history
-- length. NULL on threads summarised before this column (one turn folded per call).
ALTER TABLE threads ADD COLUMN summary_turns INTEGER;
