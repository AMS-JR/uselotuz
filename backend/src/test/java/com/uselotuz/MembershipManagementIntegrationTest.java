package com.uselotuz;

import static org.junit.jupiter.api.Assertions.*;
import com.uselotuz.business.MembershipManagementService;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = "lotuz.oidc.enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class MembershipManagementIntegrationTest {
    @Autowired JdbcTemplate db;
    @Autowired MockMvc mvc;
    @org.springframework.test.context.bean.override.mockito.MockitoBean ClientRegistrationRepository registrations;
    @Autowired MembershipManagementService service;
    UUID business=UUID.randomUUID(), other=UUID.randomUUID(), owner=UUID.randomUUID(), employee=UUID.randomUUID();
    @BeforeEach void setup() {
        db.execute("create table if not exists business_invitation(id uuid primary key,business_id uuid not null,email varchar(254) not null,role varchar(16) not null,inventory_access boolean not null,token_hash char(64) not null unique,created_by uuid not null,created_at timestamp with time zone not null default current_timestamp,expires_at timestamp with time zone not null,status varchar(16) not null,accepted_by uuid,accepted_at timestamp with time zone)");
        db.update("insert into platform_user(id,display_name) values (?, 'Owner'), (?, 'Employee')",owner,employee);
        db.update("insert into external_identity(id,user_id,issuer,subject) values (?, ?, 'https://issuer.example', 'owner'), (?, ?, 'https://issuer.example', 'employee')",UUID.randomUUID(),owner,UUID.randomUUID(),employee);
        db.update("insert into business(id,name) values (?, 'Test'), (?, 'Other')",business,other);
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'OWNER',true)",business,owner);
        db.update("insert into product_entitlement(business_id,product_code,active) values (?,'inventory',true)",business);
    }
    @Test void inviteAcceptChangeAndDeactivate() {
        var invitation=service.invite(owner,business,"  STAFF@example.com ","STAFF",true);
        assertFalse(service.invitations(owner,business).toString().contains(invitation.token()));
        assertThrows(RuntimeException.class,()->service.accept(employee,"staff@example.com",false,invitation.token()));
        assertThrows(RuntimeException.class,()->service.accept(employee,"wrong@example.com",true,invitation.token()));
        assertEquals(business,service.accept(employee,"staff@example.com",true,invitation.token()));
        assertThrows(RuntimeException.class,()->service.accept(employee,"staff@example.com",true,invitation.token()));
        assertEquals("STAFF",db.queryForObject("select role from product_access where business_id=? and user_id=? and product_code='inventory'",String.class,business,employee));
        service.update(owner,business,employee,"ADMIN",true,true);
        assertEquals("ADMIN",db.queryForObject("select role from product_access where business_id=? and user_id=? and product_code='inventory'",String.class,business,employee));
        service.update(owner,business,employee,"ADMIN",false,false);
        assertFalse(db.queryForObject("select active from business_membership where business_id=? and user_id=?",Boolean.class,business,employee));
        assertFalse(db.queryForObject("select active from product_access where business_id=? and user_id=? and product_code='inventory'",Boolean.class,business,employee));
    }
    @Test void ownerAndTenantBoundariesAndRevocation() {
        var invitation=service.invite(owner,business,"person@example.com","ADMIN",false);
        assertThrows(RuntimeException.class,()->service.invite(employee,business,"a@example.com","ADMIN",true));
        assertThrows(RuntimeException.class,()->service.invitations(owner,other));
        assertThrows(RuntimeException.class,()->service.update(owner,business,owner,"STAFF",false,false));
        service.revoke(owner,business,invitation.id());
        assertThrows(RuntimeException.class,()->service.accept(employee,"person@example.com",true,invitation.token()));
        assertTrue(db.queryForObject("select active from business_membership where business_id=? and user_id=?",Boolean.class,business,owner));
    }
    @Test void expiredDuplicateAndInvalidInvitationsAreRejected() {
        var invitation=service.invite(owner,business,"person@example.com","STAFF",false);
        assertThrows(RuntimeException.class,()->service.invite(owner,business,"PERSON@example.com","ADMIN",false));
        assertThrows(RuntimeException.class,()->service.invite(owner,business,"x@example.com","OWNER",false));
        db.update("update business_invitation set expires_at=? where id=?",java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(1)),invitation.id());
        assertThrows(RuntimeException.class,()->service.accept(employee,"person@example.com",true,invitation.token()));
        assertNotNull(service.invite(owner,business,"person@example.com","ADMIN",false));
    }
    @Test void ownerCanGrantAndRevokeInventoryWithoutOtherProductGrants() {
        var invitation=service.invite(owner,business,"person@example.com","STAFF",false);
        service.accept(employee,"person@example.com",true,invitation.token());
        service.update(owner,business,employee,"STAFF",true,true);
        assertTrue(db.queryForObject("select active from product_access where business_id=? and user_id=? and product_code='inventory'",Boolean.class,business,employee));
        service.update(owner,business,employee,"STAFF",true,false);
        assertFalse(db.queryForObject("select active from product_access where business_id=? and user_id=? and product_code='inventory'",Boolean.class,business,employee));
        assertEquals(0,db.queryForObject("select count(*) from product_access where business_id=? and user_id=? and product_code<>'inventory'",Integer.class,business,employee));
    }
    @Test void httpRequiresCsrfOwnerAndVerifiedEmail() throws Exception {
        var ownerLogin=oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("owner"));
        var employeeLogin=oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","person@example.com").claim("email_verified",true));
        String url="/api/businesses/"+business+"/membership/invitations";
        String request="{\"email\":\"person@example.com\",\"role\":\"STAFF\",\"inventoryAccess\":true}";
        mvc.perform(post(url).with(ownerLogin).contentType("application/json").content(request)).andExpect(status().isForbidden());
        mvc.perform(post(url).with(employeeLogin).with(csrf()).contentType("application/json").content(request)).andExpect(status().isForbidden());
        var created=mvc.perform(post(url).with(ownerLogin).with(csrf()).contentType("application/json").content(request)).andExpect(status().isCreated()).andReturn();
        String token=com.jayway.jsonpath.JsonPath.read(created.getResponse().getContentAsString(),"$.token");
        mvc.perform(get(url).with(employeeLogin)).andExpect(status().isForbidden());
        mvc.perform(post("/api/invitations/accept").with(employeeLogin).with(csrf()).contentType("application/json").content("{\"token\":\""+token+"\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.businessId").value(business.toString()));
    }
    @Test void newMemberCanAcceptWithActualSessionCsrfAndUserInfoEmail() throws Exception {
        var invitation=service.invite(owner,business,"person@example.com","STAFF",true);
        var idToken=new org.springframework.security.oauth2.core.oidc.OidcIdToken("id",java.time.Instant.now(),java.time.Instant.now().plusSeconds(60),java.util.Map.of("iss","https://issuer.example","sub","employee"));
        var info=new org.springframework.security.oauth2.core.oidc.OidcUserInfo(java.util.Map.of("sub","employee","email","person@example.com","email_verified",true));
        var principal=new org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser(java.util.List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_USER")),idToken,info);
        var login=oidcLogin().oidcUser(principal);
        assertEquals(0,db.queryForObject("select count(*) from business_membership where user_id=?",Integer.class,employee));
        var response=mvc.perform(get("/api/auth/csrf").with(login)).andExpect(status().isOk()).andReturn();
        var session=(org.springframework.mock.web.MockHttpSession) response.getRequest().getSession(false);
        String header=com.jayway.jsonpath.JsonPath.read(response.getResponse().getContentAsString(),"$.headerName");
        String csrfToken=com.jayway.jsonpath.JsonPath.read(response.getResponse().getContentAsString(),"$.token");
        String body="{\"token\":\""+invitation.token()+"\"}";
        mvc.perform(post("/api/invitations/accept").session(session).with(login).contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/invitations/accept").session(session).with(login).header(header,csrfToken+"invalid").contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/invitations/accept").session(session).with(login).header(header,csrfToken).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.businessId").value(business.toString()));
        assertEquals("STAFF",db.queryForObject("select role from business_membership where business_id=? and user_id=?",String.class,business,employee));
        assertEquals(1,db.queryForObject("select count(*) from product_access where business_id=? and user_id=? and product_code='inventory' and role='STAFF' and active=true",Integer.class,business,employee));
        mvc.perform(post("/api/invitations/accept").session(session).with(login).header(header,csrfToken).contentType("application/json").content(body))
                .andExpect(status().isForbidden());
    }
    @Test void currentSessionShowsVerifiedEmailClaimWithoutRequiringMembership() throws Exception {
        var verified=oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","person@example.com").claim("email_verified",true));
        var unverified=oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","person@example.com").claim("email_verified",false));
        var missing=oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","person@example.com"));
        mvc.perform(get("/api/me").with(verified)).andExpect(status().isOk()).andExpect(jsonPath("$.emailVerified").value(true));
        mvc.perform(get("/api/me").with(unverified)).andExpect(status().isOk()).andExpect(jsonPath("$.emailVerified").value(false));
        mvc.perform(get("/api/me").with(missing)).andExpect(status().isOk()).andExpect(jsonPath("$.emailVerified").value(false));
    }
    @Test void acceptanceRejectsAnonymousUnverifiedAndMismatchedAccounts() throws Exception {
        var invitation=service.invite(owner,business,"person@example.com","STAFF",false);
        String body="{\"token\":\""+invitation.token()+"\"}";
        mvc.perform(post("/api/invitations/accept").with(csrf()).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
        for (var login : java.util.List.of(
                oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","person@example.com").claim("email_verified",false)),
                oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","other@example.com").claim("email_verified",true)),
                oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","person@example.com")))) {
            mvc.perform(post("/api/invitations/accept").with(login).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
        }
        assertEquals(0,db.queryForObject("select count(*) from business_membership where user_id=?",Integer.class,employee));
    }
    @Test void acceptanceRejectsExpiredRevokedAndInvalidTokens() throws Exception {
        var login=oidcLogin().idToken(t->t.claim("iss","https://issuer.example").subject("employee").claim("email","person@example.com").claim("email_verified",true));
        var revoked=service.invite(owner,business,"person@example.com","STAFF",false);
        service.revoke(owner,business,revoked.id());
        var expired=service.invite(owner,business,"person@example.com","STAFF",false);
        db.update("update business_invitation set expires_at=? where id=?",java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(1)),expired.id());
        for (String token : java.util.List.of(revoked.token(),expired.token(),"invalid")) {
            mvc.perform(post("/api/invitations/accept").with(login).with(csrf()).contentType("application/json").content("{\"token\":\""+token+"\"}"))
                    .andExpect(status().isForbidden());
        }
        assertEquals(0,db.queryForObject("select count(*) from business_membership where user_id=?",Integer.class,employee));
    }
    @Test void membershipDoesNotAutomaticallyGrantProducts() {
        var invitation=service.invite(owner,business,"person@example.com","STAFF",false);
        service.accept(employee,"person@example.com",true,invitation.token());
        assertEquals(0,db.queryForObject("select count(*) from product_access where business_id=? and user_id=?",Integer.class,business,employee));
    }
}
