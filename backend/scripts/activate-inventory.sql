-- Trusted operator only. Never expose this script or database credentials through a customer API.
-- Required psql variables: business_id and user_id (an ACTIVE business OWNER).
-- Repeated/concurrent calls preserve existing product roles, revocations, location IDs and names.
\set ON_ERROR_STOP on
BEGIN;
-- Serialize activation for this business, including concurrent operator calls.
SELECT id FROM business WHERE id = :'business_id'::uuid FOR UPDATE;
SELECT user_id FROM business_membership
WHERE business_id = :'business_id'::uuid AND user_id = :'user_id'::uuid AND active AND role = 'OWNER'
FOR UPDATE;
-- Abort before making any changes if the supplied business/owner is invalid.
SELECT 1 / count(*) AS validated_owner FROM business_membership
WHERE business_id = :'business_id'::uuid AND user_id = :'user_id'::uuid AND active AND role = 'OWNER';
INSERT INTO product_entitlement(business_id, product_code, active)
VALUES (:'business_id'::uuid, 'inventory', true)
ON CONFLICT (business_id, product_code) DO UPDATE SET active = true;
INSERT INTO product_access(business_id, user_id, product_code, role, active)
VALUES (:'business_id'::uuid, :'user_id'::uuid, 'inventory', 'OWNER', true)
ON CONFLICT (business_id, user_id, product_code) DO NOTHING;
INSERT INTO inventory_location(id, business_id, name)
VALUES (gen_random_uuid(), :'business_id'::uuid, 'Main location')
ON CONFLICT (business_id) DO NOTHING;
COMMIT;
