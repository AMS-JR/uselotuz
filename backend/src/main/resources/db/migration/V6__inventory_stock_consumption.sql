ALTER TABLE inventory_stock_movement DROP CONSTRAINT inventory_movement_type_check;
ALTER TABLE inventory_stock_movement DROP CONSTRAINT inventory_movement_fields_check;
ALTER TABLE inventory_stock_movement ADD COLUMN consumption_reason VARCHAR(500);
ALTER TABLE inventory_stock_movement ADD CONSTRAINT inventory_movement_type_check CHECK (movement_type IN ('OPENING','RECEIPT','ADJUSTMENT','CONSUMPTION'));
ALTER TABLE inventory_stock_movement ADD CONSTRAINT inventory_movement_fields_check CHECK (
  (movement_type = 'OPENING' AND quantity >= 0 AND idempotency_key IS NULL AND supplier_id IS NULL AND receipt_reference IS NULL AND notes IS NULL AND adjustment_reason IS NULL AND consumption_reason IS NULL)
  OR (movement_type = 'RECEIPT' AND quantity > 0 AND idempotency_key IS NOT NULL AND adjustment_reason IS NULL AND consumption_reason IS NULL)
  OR (movement_type = 'ADJUSTMENT' AND quantity <> 0 AND idempotency_key IS NOT NULL AND supplier_id IS NULL AND receipt_reference IS NULL AND notes IS NULL AND adjustment_reason IS NOT NULL AND length(trim(adjustment_reason)) > 0 AND consumption_reason IS NULL)
  OR (movement_type = 'CONSUMPTION' AND quantity < 0 AND idempotency_key IS NOT NULL AND supplier_id IS NULL AND receipt_reference IS NULL AND notes IS NULL AND adjustment_reason IS NULL AND consumption_reason IS NOT NULL AND length(trim(consumption_reason)) > 0)
);
