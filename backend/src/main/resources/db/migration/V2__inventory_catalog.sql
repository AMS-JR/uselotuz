CREATE TABLE inventory_category (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL, name_key VARCHAR(200) NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_id, id)
);
CREATE INDEX inventory_category_business_name_idx ON inventory_category(business_id, name, id);
CREATE TABLE inventory_supplier (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL, contact_person VARCHAR(200), email VARCHAR(254), phone VARCHAR(50), address VARCHAR(1000), notes VARCHAR(2000),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_id, id)
);
CREATE INDEX inventory_supplier_business_name_idx ON inventory_supplier(business_id, name, id);
CREATE TABLE inventory_item (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL, description VARCHAR(2000), sku VARCHAR(100), sku_key VARCHAR(100), barcode VARCHAR(100),
    item_type VARCHAR(16) NOT NULL CHECK (item_type IN ('PRODUCT','INGREDIENT')),
    unit VARCHAR(16) NOT NULL CHECK (unit IN ('PIECE','GRAM','KILOGRAM','MILLILITER','LITER')),
    category_id UUID, supplier_id UUID,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_id, id)
);
CREATE INDEX inventory_item_business_name_idx ON inventory_item(business_id, name, id);
ALTER TABLE inventory_category ADD CONSTRAINT inventory_category_name_unique UNIQUE (business_id, name_key);
ALTER TABLE inventory_category ADD CONSTRAINT inventory_category_key_check CHECK (name_key = lower(name) AND length(trim(name)) > 0);
ALTER TABLE inventory_item ADD CONSTRAINT inventory_item_sku_unique UNIQUE (business_id, sku_key);
ALTER TABLE inventory_item ADD CONSTRAINT inventory_item_barcode_unique UNIQUE (business_id, barcode);
ALTER TABLE inventory_item ADD CONSTRAINT inventory_item_sku_key_check CHECK ((sku IS NULL AND sku_key IS NULL) OR (sku IS NOT NULL AND sku_key IS NOT NULL AND sku_key = lower(sku)));
ALTER TABLE inventory_item ADD CONSTRAINT inventory_item_category_tenant_fk FOREIGN KEY (business_id, category_id) REFERENCES inventory_category(business_id, id);
ALTER TABLE inventory_item ADD CONSTRAINT inventory_item_supplier_tenant_fk FOREIGN KEY (business_id, supplier_id) REFERENCES inventory_supplier(business_id, id);
CREATE INDEX inventory_item_category_idx ON inventory_item(business_id, category_id);
CREATE INDEX inventory_item_supplier_idx ON inventory_item(business_id, supplier_id);
