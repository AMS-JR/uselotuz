CREATE TABLE inventory_stock_count (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    location_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED')),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_by UUID NOT NULL REFERENCES platform_user(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_by UUID REFERENCES platform_user(id),
    completed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (business_id, location_id) REFERENCES inventory_location(business_id, id),
    UNIQUE (business_id, id),
    CHECK ((status = 'COMPLETED' AND completed_by IS NOT NULL AND completed_at IS NOT NULL)
        OR (status <> 'COMPLETED' AND completed_by IS NULL AND completed_at IS NULL))
);
CREATE INDEX inventory_stock_count_business_created_idx ON inventory_stock_count(business_id, created_at DESC, id DESC);
CREATE TABLE inventory_stock_count_item (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    count_id UUID NOT NULL,
    item_id UUID NOT NULL,
    unit VARCHAR(16) NOT NULL CHECK (unit IN ('PIECE','GRAM','KILOGRAM','MILLILITER','LITER')),
    recorded_quantity NUMERIC(20,6) NOT NULL CHECK (recorded_quantity >= 0),
    counted_quantity NUMERIC(20,6) CHECK (counted_quantity >= 0),
    movement_count BIGINT NOT NULL CHECK (movement_count > 0),
    FOREIGN KEY (business_id, count_id) REFERENCES inventory_stock_count(business_id, id),
    FOREIGN KEY (business_id, item_id) REFERENCES inventory_item(business_id, id),
    UNIQUE (business_id, count_id, item_id),
    CHECK (unit <> 'PIECE' OR (recorded_quantity = trunc(recorded_quantity) AND (counted_quantity IS NULL OR counted_quantity = trunc(counted_quantity))))
);
