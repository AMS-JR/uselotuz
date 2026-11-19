CREATE TABLE business_invitation (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES business(id),
    email VARCHAR(254) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
    inventory_access BOOLEAN NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES platform_user(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED')),
    accepted_by UUID REFERENCES platform_user(id),
    accepted_at TIMESTAMP WITH TIME ZONE,
    CHECK ((status = 'ACCEPTED' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
        OR (status <> 'ACCEPTED' AND accepted_by IS NULL AND accepted_at IS NULL))
);
CREATE UNIQUE INDEX business_invitation_pending_email ON business_invitation (business_id, email) WHERE status = 'PENDING';
