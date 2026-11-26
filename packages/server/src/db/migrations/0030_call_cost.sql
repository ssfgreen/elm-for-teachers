-- A model call's cost in pounds (issue #41), worked out when the call is saved, at the prices of
-- the config in force then. A later price change applies to later calls only; nothing is
-- re-priced. Calls saved before this have none (null), and the budget counts them as nothing.
-- NULL also when the call's model has no price in the config.
ALTER TABLE gateway_calls ADD COLUMN cost_gbp REAL;
-- The spend query runs before every agent step.
CREATE INDEX idx_gateway_calls_session_cost ON gateway_calls(session_id, cost_gbp);
