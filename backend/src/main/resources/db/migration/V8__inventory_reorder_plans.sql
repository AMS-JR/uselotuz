CREATE TABLE inventory_reorder_plan (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    item_id UUID NOT NULL,
    location_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
    updated_by UUID NOT NULL REFERENCES platform_user(id),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (business_id, item_id, location_id),
    FOREIGN KEY (business_id, item_id) REFERENCES inventory_item(business_id, id),
    FOREIGN KEY (business_id, location_id) REFERENCES inventory_location(business_id, id)
);
