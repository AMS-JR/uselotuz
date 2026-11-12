CREATE TABLE platform_user (
    id UUID PRIMARY KEY,
    display_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE external_identity (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES platform_user(id),
    issuer VARCHAR(512) NOT NULL,
    subject VARCHAR(512) NOT NULL,
    UNIQUE (issuer, subject)
);
CREATE TABLE business (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL
);
CREATE TABLE business_membership (
    business_id UUID NOT NULL REFERENCES business(id),
    user_id UUID NOT NULL REFERENCES platform_user(id),
    role VARCHAR(16) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'STAFF')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (business_id, user_id)
);
CREATE INDEX membership_user_idx ON business_membership(user_id);
CREATE TABLE product_entitlement (
    business_id UUID NOT NULL REFERENCES business(id),
    product_code VARCHAR(64) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (business_id, product_code)
);
CREATE TABLE product_access (
    business_id UUID NOT NULL,
    user_id UUID NOT NULL,
    product_code VARCHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'STAFF')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (business_id, user_id, product_code),
    FOREIGN KEY (business_id, user_id) REFERENCES business_membership(business_id, user_id),
    FOREIGN KEY (business_id, product_code) REFERENCES product_entitlement(business_id, product_code)
);
CREATE TABLE inventory_location (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    UNIQUE (business_id, id)
);
