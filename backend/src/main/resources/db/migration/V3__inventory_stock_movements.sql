CREATE TABLE inventory_stock_movement (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    item_id UUID NOT NULL,
    location_id UUID NOT NULL,
    movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN ('OPENING')),
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
    unit VARCHAR(16) NOT NULL CHECK (unit IN ('PIECE','GRAM','KILOGRAM','MILLILITER','LITER')),
    created_by UUID NOT NULL REFERENCES platform_user(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY (business_id, item_id) REFERENCES inventory_item(business_id, id),
    FOREIGN KEY (business_id, location_id) REFERENCES inventory_location(business_id, id),
    CONSTRAINT inventory_opening_unique UNIQUE (business_id, item_id, location_id, movement_type),
    CHECK (unit <> 'PIECE' OR quantity = trunc(quantity))
);
