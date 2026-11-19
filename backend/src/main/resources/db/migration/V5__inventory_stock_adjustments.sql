ALTER TABLE inventory_stock_movement DROP CONSTRAINT inventory_movement_type_check;
ALTER TABLE inventory_stock_movement DROP CONSTRAINT inventory_stock_movement_quantity_check;
ALTER TABLE inventory_stock_movement DROP CONSTRAINT inventory_receipt_fields_check;
ALTER TABLE inventory_stock_movement ADD COLUMN adjustment_reason VARCHAR(500);
ALTER TABLE inventory_stock_movement ADD CONSTRAINT inventory_movement_type_check CHECK (movement_type IN ('OPENING','RECEIPT','ADJUSTMENT'));
ALTER TABLE inventory_stock_movement ADD CONSTRAINT inventory_movement_fields_check CHECK (
  (movement_type = 'OPENING' AND quantity >= 0 AND idempotency_key IS NULL AND supplier_id IS NULL AND receipt_reference IS NULL AND notes IS NULL AND adjustment_reason IS NULL)
  OR (movement_type = 'RECEIPT' AND quantity > 0 AND idempotency_key IS NOT NULL AND adjustment_reason IS NULL)
  OR (movement_type = 'ADJUSTMENT' AND quantity <> 0 AND idempotency_key IS NOT NULL AND supplier_id IS NULL AND receipt_reference IS NULL AND notes IS NULL AND adjustment_reason IS NOT NULL AND length(trim(adjustment_reason)) > 0)
);
DROP INDEX inventory_receipt_idempotency_unique;
CREATE UNIQUE INDEX inventory_movement_idempotency_unique ON inventory_stock_movement(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX inventory_movement_history_idx ON inventory_stock_movement(business_id, item_id, location_id, created_at DESC, id DESC);
