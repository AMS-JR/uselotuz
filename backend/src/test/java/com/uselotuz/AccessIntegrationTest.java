package com.uselotuz;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest(properties = "lotuz.oidc.enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccessIntegrationTest {
    static final UUID ALICE = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID BOB = UUID.fromString("00000000-0000-0000-0000-000000000002");
    static final UUID A = UUID.fromString("10000000-0000-0000-0000-000000000001");
    static final UUID B = UUID.fromString("10000000-0000-0000-0000-000000000002");
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired com.uselotuz.identity.IdentityService identities;
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    ClientRegistrationRepository registrations;
    static RequestPostProcessor alice() {
        return oidcLogin().idToken(t -> t.claim("iss", "https://issuer.example").subject("alice"));
    }
    @BeforeEach void seed() {
        for (String table : new String[]{"inventory_location", "product_access", "product_entitlement", "business_membership", "business", "external_identity", "platform_user"})
            db.update("delete from " + table);
        db.update("insert into platform_user(id,display_name) values (?,?),(?,?)", ALICE, "Alice", BOB, "Bob");
        db.update("insert into external_identity(id,user_id,issuer,subject) values (?,?,?,?)", UUID.randomUUID(), ALICE, "https://issuer.example", "alice");
        db.update("insert into business(id,name) values (?,?),(?,?)", A, "Alice store", B, "Bob restaurant");
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'OWNER',true),(?,?,'OWNER',true)", A, ALICE, B, BOB);
        db.update("insert into product_entitlement(business_id,product_code,active) values (?,'inventory',true),(?,'inventory',true)", A, B);
        db.update("insert into product_access(business_id,user_id,product_code,role,active) values (?,?,'inventory','STAFF',true),(?,?,'inventory','OWNER',true)", A, ALICE, B, BOB);
        db.update("insert into inventory_location(id,business_id,name) values (?,?,?),(?,?,?)", UUID.randomUUID(), A, "Store", UUID.randomUUID(), B, "Kitchen");
    }
    @Test void anonymousCannotReadBusinessesOrInventory() throws Exception {
        mvc.perform(get("/api/businesses")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/businesses/" + A + "/inventory")).andExpect(status().isUnauthorized());
    }
    @Test void businessesAreScopedAndForgedBusinessIdsDenied() throws Exception {
        mvc.perform(get("/api/businesses").with(alice())).andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(A.toString()));
        mvc.perform(get("/api/businesses/" + B + "/inventory").with(alice())).andExpect(status().isForbidden());
        mvc.perform(patch("/api/businesses/" + B + "/inventory/location").with(alice()).with(csrf())
            .contentType("application/json").content("{\"name\":\"Stolen\"}")).andExpect(status().isForbidden());
    }
    @Test void staffCanReadTheirOwnLocation() throws Exception {
        mvc.perform(get("/api/businesses/" + A + "/inventory").with(alice())).andExpect(status().isOk())
            .andExpect(jsonPath("$.location.name").value("Store")).andExpect(jsonPath("$.role").value("STAFF"));
    }
    @Test void absentProductGrantDenied() throws Exception {
        db.update("delete from product_access where user_id=?", ALICE);
        mvc.perform(get("/api/businesses/" + A + "/inventory").with(alice())).andExpect(status().isForbidden());
    }
    @Test void missingEntitlementDenied() throws Exception {
        db.update("delete from product_access where business_id=?", A);
        db.update("delete from product_entitlement where business_id=?", A);
        mvc.perform(get("/api/businesses/" + A + "/inventory").with(alice())).andExpect(status().isForbidden());
    }
    @Test void inactiveEntitlementDeniedEvenForOwners() throws Exception {
        db.update("update product_access set role='OWNER' where user_id=?", ALICE);
        db.update("update product_entitlement set active=false where business_id=?", A);
        mvc.perform(get("/api/businesses/" + A + "/inventory").with(alice())).andExpect(status().isForbidden());
    }
    @Test void revokedMembershipAndGrantTakeEffectOnNextRequest() throws Exception {
        db.update("update business_membership set active=false where user_id=?", ALICE);
        mvc.perform(get("/api/businesses/" + A + "/inventory").with(alice())).andExpect(status().isForbidden());
        db.update("update business_membership set active=true where user_id=?", ALICE);
        db.update("update product_access set active=false where user_id=?", ALICE);
        mvc.perform(get("/api/businesses/" + A + "/inventory").with(alice())).andExpect(status().isForbidden());
    }
    @Test void businessOwnerWithStaffProductAccessCannotManage() throws Exception {
        mvc.perform(patch("/api/businesses/" + A + "/inventory/location").with(alice()).with(csrf())
            .contentType("application/json").content("{\"name\":\"Changed\"}")).andExpect(status().isForbidden());
    }
    @ParameterizedTest @ValueSource(strings = {"OWNER", "ADMIN"})
    void ownerAndAdminCanRenameOnlyTheirLocation(String role) throws Exception {
        db.update("update product_access set role=? where user_id=?", role, ALICE);
        mvc.perform(patch("/api/businesses/" + A + "/inventory/location").with(alice()).with(csrf())
            .contentType("application/json").content("{\"name\":\"Main location\"}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/businesses/" + A + "/inventory").with(alice()))
            .andExpect(jsonPath("$.location.name").value("Main location"));
        org.junit.jupiter.api.Assertions.assertEquals("Kitchen", db.queryForObject("select name from inventory_location where business_id=?", String.class, B));
    }
    @Test void mutationsAndLogoutRequireCsrf() throws Exception {
        db.update("update product_access set role='OWNER' where user_id=?", ALICE);
        mvc.perform(patch("/api/businesses/" + A + "/inventory/location").with(alice())
            .contentType("application/json").content("{\"name\":\"Changed\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").with(alice())).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").with(alice()).with(csrf())).andExpect(status().isNoContent());
    }
    @Test void browserCanUseSessionBoundCsrfTokenForLogout() throws Exception {
        var response = mvc.perform(get("/api/auth/csrf").with(alice())).andExpect(status().isOk()).andReturn();
        var session = (org.springframework.mock.web.MockHttpSession) response.getRequest().getSession(false);
        String token = com.jayway.jsonpath.JsonPath.read(response.getResponse().getContentAsString(), "$.token");
        mvc.perform(post("/api/auth/logout").session(session).with(alice()).header("X-CSRF-TOKEN", token))
            .andExpect(status().isNoContent());
    }
    @Test void sameSubjectAtDifferentIssuerDoesNotImpersonateUser() throws Exception {
        mvc.perform(get("/api/me").with(oidcLogin().idToken(t -> t.claim("iss", "https://other.example").subject("alice"))))
            .andExpect(status().isForbidden());
    }
    @Test void newIdentityGetsNoBusinessMembershipOrEntitlement() {
        var token = new org.springframework.security.oauth2.core.oidc.OidcIdToken("test", java.time.Instant.now(),
            java.time.Instant.now().plusSeconds(60), java.util.Map.of("iss", "https://issuer.example", "sub", "new-user"));
        var user = new org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser(
            java.util.List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_USER")), token);
        UUID id = identities.register(user);
        org.junit.jupiter.api.Assertions.assertEquals(id, identities.register(user));
        org.junit.jupiter.api.Assertions.assertEquals(0, db.queryForObject("select count(*) from business_membership where user_id=?", Integer.class, id));
        org.junit.jupiter.api.Assertions.assertEquals(0, db.queryForObject("select count(*) from product_access where user_id=?", Integer.class, id));
    }
    @Test void corsAllowsInventoryButNotMarketingOrigin() throws Exception {
        mvc.perform(options("/api/businesses").header("Origin", "http://localhost:3001")
            .header("Access-Control-Request-Method", "GET")).andExpect(status().isOk())
            .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3001"));
        mvc.perform(options("/api/businesses").header("Origin", "https://uselotuz.io")
            .header("Access-Control-Request-Method", "GET")).andExpect(status().isForbidden());
    }

    @Autowired com.uselotuz.business.BusinessService businessService;

    @Test void businessCreationUsesSessionOwnerAndDoesNotActivateProducts() throws Exception {
        var response = mvc.perform(post("/api/businesses").with(alice()).with(csrf())
                .contentType("application/json")
                .content("{\"name\":\"  New store  \",\"ownerId\":\"" + BOB + "\",\"role\":\"ADMIN\",\"inventory\":true}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("New store")).andReturn();
        UUID created = UUID.fromString(com.jayway.jsonpath.JsonPath.read(response.getResponse().getContentAsString(), "$.id"));
        org.junit.jupiter.api.Assertions.assertEquals("OWNER", db.queryForObject(
                "select role from business_membership where business_id=? and user_id=?", String.class, created, ALICE));
        for (String table : new String[]{"product_entitlement", "product_access", "inventory_location"}) {
            org.junit.jupiter.api.Assertions.assertEquals(0, db.queryForObject(
                    "select count(*) from " + table + " where business_id=?", Integer.class, created));
        }
        mvc.perform(get("/api/businesses/" + created + "/products").with(alice()))
                .andExpect(jsonPath("$[0].activated").value(false)).andExpect(jsonPath("$[0].accessible").value(false));
    }

    @Test void businessCreationRequiresAuthenticationCsrfAndValidInput() throws Exception {
        mvc.perform(post("/api/businesses").with(csrf()).contentType("application/json").content("{\"name\":\"Store\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/businesses").with(alice()).contentType("application/json").content("{\"name\":\"Store\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/businesses").with(alice()).with(csrf()).contentType("application/json").content("{\"name\":\"  \"}"))
                .andExpect(status().isBadRequest());
        org.junit.jupiter.api.Assertions.assertEquals(2, db.queryForObject("select count(*) from business", Integer.class));
    }

    @Test void failedMembershipCreationRollsBackTheBusiness() throws Exception {
        requirePostgres();
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> businessService.create(UUID.randomUUID(), "Must roll back"));
        org.junit.jupiter.api.Assertions.assertEquals(2, db.queryForObject("select count(*) from business", Integer.class));
    }

    @Test void workspaceDetailsProductsAndMembersAreBusinessScoped() throws Exception {
        for (String suffix : new String[]{"", "/members", "/products"}) {
            mvc.perform(get("/api/businesses/" + B + suffix).with(alice())).andExpect(status().isForbidden());
        }
        mvc.perform(patch("/api/businesses/" + B).with(alice()).with(csrf())
                .contentType("application/json").content("{\"name\":\"Stolen\"}")).andExpect(status().isForbidden());
        db.update("update business_membership set active=false where user_id=?", ALICE);
        mvc.perform(get("/api/businesses/" + A + "/products").with(alice())).andExpect(status().isForbidden());
    }

    @Test void staffSeesOnlyOwnMembershipAndCannotEditBusinessEvenWithProductOwnerRole() throws Exception {
        db.update("update business_membership set role='STAFF' where user_id=?", ALICE);
        db.update("update product_access set role='OWNER' where user_id=?", ALICE);
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'OWNER',true)", A, BOB);
        mvc.perform(get("/api/businesses/" + A + "/members").with(alice()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].userId").value(ALICE.toString()));
        mvc.perform(get("/api/businesses/" + A).with(alice())).andExpect(jsonPath("$.canManage").value(false));
        mvc.perform(patch("/api/businesses/" + A).with(alice()).with(csrf())
                .contentType("application/json").content("{\"name\":\"Changed\"}")).andExpect(status().isForbidden());
    }

    @ParameterizedTest @ValueSource(strings = {"OWNER", "ADMIN"})
    void businessAdministratorsCanManageWithoutInventoryEntitlement(String role) throws Exception {
        db.update("update business_membership set role=? where user_id=?", role, ALICE);
        db.update("update product_entitlement set active=false where business_id=?", A);
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'STAFF',true)", A, BOB);
        mvc.perform(patch("/api/businesses/" + A).with(alice()).with(csrf())
                .contentType("application/json").content("{\"name\":\"Renamed business\"}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/businesses/" + A).with(alice())).andExpect(jsonPath("$.name").value("Renamed business"));
        mvc.perform(get("/api/businesses/" + A + "/members").with(alice())).andExpect(jsonPath("$.length()").value(2));
        org.junit.jupiter.api.Assertions.assertEquals("Bob restaurant", db.queryForObject("select name from business where id=?", String.class, B));
    }

    @Test void productCardsDoNotGrantAccessAndCustomersCannotActivateEntitlements() throws Exception {
        mvc.perform(get("/api/businesses/" + A + "/products").with(alice()))
                .andExpect(jsonPath("$[0].accessible").value(true))
                .andExpect(jsonPath("$[0].url").value("http://localhost:3001/?businessId=" + A));
        db.update("update product_access set active=false where user_id=?", ALICE);
        mvc.perform(get("/api/businesses/" + A + "/products").with(alice()))
                .andExpect(jsonPath("$[0].activated").value(true)).andExpect(jsonPath("$[0].accessible").value(false))
                .andExpect(jsonPath("$[0].url").isEmpty());
        db.update("update product_entitlement set active=false where business_id=?", A);
        mvc.perform(post("/api/businesses/" + A + "/products/inventory/activate").with(alice()).with(csrf()))
                .andExpect(status().isNotFound());
        org.junit.jupiter.api.Assertions.assertEquals(false, db.queryForObject(
                "select active from product_entitlement where business_id=?", Boolean.class, A));
    }

    @Test void workspaceCorsIsExactAndExposesLogoutNavigationOnly() throws Exception {
        mvc.perform(options("/api/businesses").header("Origin", "http://localhost:3002")
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "X-CSRF-TOKEN,Content-Type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3002"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options("/api/businesses").header("Origin", "http://localhost:3002.evil.example")
                .header("Access-Control-Request-Method", "GET")).andExpect(status().isForbidden());
    }

    @Autowired javax.sql.DataSource dataSource;

    private void requirePostgres() throws Exception {
        try (var connection = dataSource.getConnection()) {
            org.junit.jupiter.api.Assumptions.assumeTrue(connection.getMetaData().getDatabaseProductName().equals("PostgreSQL"));
        }
    }

    private void activateInventory(UUID businessId, UUID ownerId) throws Exception {
        var path = java.nio.file.Path.of("scripts/activate-inventory.sql");
        if (!java.nio.file.Files.exists(path)) path = java.nio.file.Path.of("backend/scripts/activate-inventory.sql");
        String script = java.nio.file.Files.readString(path).lines().filter(line -> !line.startsWith("\\set"))
                .collect(java.util.stream.Collectors.joining("\n"))
                .replace(":'business_id'", "'" + businessId + "'")
                .replace(":'user_id'", "'" + ownerId + "'");
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,
                    new org.springframework.core.io.ByteArrayResource(script.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        }
    }

    @Test void operatorActivationIsIdempotentAndPreservesRolesAndLocations() throws Exception {
        requirePostgres();
        UUID id = businessService.create(ALICE, "Activation pilot").id();
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { activateInventory(id, ALICE); return true; });
            var second = executor.submit(() -> { activateInventory(id, ALICE); return true; });
            first.get(20, java.util.concurrent.TimeUnit.SECONDS);
            second.get(20, java.util.concurrent.TimeUnit.SECONDS);
        }
        UUID location = db.queryForObject("select id from inventory_location where business_id=?", UUID.class, id);
        org.junit.jupiter.api.Assertions.assertEquals("OWNER", db.queryForObject(
                "select role from product_access where business_id=? and user_id=?", String.class, id, ALICE));
        db.update("update inventory_location set name='Custom location' where business_id=?", id);
        db.update("update product_access set role='STAFF',active=false where business_id=?", id);
        activateInventory(id, ALICE);
        org.junit.jupiter.api.Assertions.assertEquals(location, db.queryForObject(
                "select id from inventory_location where business_id=?", UUID.class, id));
        org.junit.jupiter.api.Assertions.assertEquals("Custom location", db.queryForObject(
                "select name from inventory_location where business_id=?", String.class, id));
        org.junit.jupiter.api.Assertions.assertEquals("STAFF", db.queryForObject(
                "select role from product_access where business_id=?", String.class, id));
        org.junit.jupiter.api.Assertions.assertEquals(false, db.queryForObject(
                "select active from product_access where business_id=?", Boolean.class, id));
        org.junit.jupiter.api.Assertions.assertEquals(1, db.queryForObject(
                "select count(*) from product_entitlement where business_id=?", Integer.class, id));
    }

    @Test void operatorActivationRejectsAnUnrelatedOwnerWithoutPartialWrites() throws Exception {
        requirePostgres();
        UUID id = businessService.create(ALICE, "Unapproved pilot").id();
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.jdbc.datasource.init.ScriptException.class,
                () -> activateInventory(id, BOB));
        for (String table : new String[]{"product_entitlement", "product_access", "inventory_location"}) {
            org.junit.jupiter.api.Assertions.assertEquals(0, db.queryForObject(
                    "select count(*) from " + table + " where business_id=?", Integer.class, id));
        }
    }

    @Test void failedLocationProvisioningRollsBackAllActivationChanges() throws Exception {
        requirePostgres();
        UUID id = businessService.create(ALICE, "Rollback pilot").id();
        db.execute("alter table inventory_location add constraint lotuz_test_reject_location check (business_id <> '" + id + "')");
        try {
            org.junit.jupiter.api.Assertions.assertThrows(org.springframework.jdbc.datasource.init.ScriptException.class,
                    () -> activateInventory(id, ALICE));
            for (String table : new String[]{"product_entitlement", "product_access", "inventory_location"}) {
                org.junit.jupiter.api.Assertions.assertEquals(0, db.queryForObject(
                        "select count(*) from " + table + " where business_id=?", Integer.class, id));
            }
        } finally {
            db.execute("alter table inventory_location drop constraint lotuz_test_reject_location");
        }
    }
}
