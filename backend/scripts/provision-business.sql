-- Operator-only pilot setup. Run after the owner has signed in once.
-- Required psql variables: user_id (platform UUID), business_name.
BEGIN;
INSERT INTO business(id, name) VALUES (gen_random_uuid(), :'business_name') RETURNING id AS business_id \gset
INSERT INTO business_membership(business_id, user_id, role)
VALUES (:'business_id'::uuid, :'user_id'::uuid, 'OWNER');
INSERT INTO product_entitlement(business_id, product_code, active)
VALUES (:'business_id'::uuid, 'inventory', true);
INSERT INTO product_access(business_id, user_id, product_code, role)
VALUES (:'business_id'::uuid, :'user_id'::uuid, 'inventory', 'OWNER');
INSERT INTO inventory_location(id, business_id, name)
VALUES (gen_random_uuid(), :'business_id'::uuid, 'Main location');
COMMIT;
