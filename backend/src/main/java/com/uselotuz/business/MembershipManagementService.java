package com.uselotuz.business;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MembershipManagementService {
    private final JdbcTemplate db;
    private final SecureRandom random = new SecureRandom();
    public MembershipManagementService(JdbcTemplate db) { this.db = db; }

    private void lockBusiness(UUID business) {
        if (db.query("select id from business where id=? for update", (rs,n) -> rs.getObject(1), business).isEmpty())
            throw new AccessDeniedException("Business access denied");
    }
    private void owner(UUID user, UUID business) {
        if (db.queryForObject("select count(*) from business_membership where business_id=? and user_id=? and role='OWNER' and active=true", Integer.class, business,user) != 1)
            throw new AccessDeniedException("Owner access required");
    }
    private static String role(String role) {
        if (!"ADMIN".equals(role) && !"STAFF".equals(role)) throw bad("Role must be ADMIN or STAFF");
        return role;
    }
    private static String email(String value) {
        if (value == null) throw bad("Email required");
        String email = value.strip().toLowerCase(Locale.ROOT);
        if (email.length() > 254 || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw bad("Invalid email");
        return email;
    }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
    private static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private void entitlement(UUID business) {
        if (db.queryForObject("select count(*) from product_entitlement where business_id=? and product_code='inventory' and active=true",Integer.class,business) != 1)
            throw conflict("Inventory is not enabled for this business");
    }
    @Transactional(readOnly=true)
    public List<Member> members(UUID user, UUID business) {
        owner(user,business);
        return db.query("select m.user_id,u.display_name,m.role,m.active,case when p.active=true then p.role else null end from business_membership m join platform_user u on u.id=m.user_id left join product_access p on p.business_id=m.business_id and p.user_id=m.user_id and p.product_code='inventory' where m.business_id=? order by u.display_name,m.user_id", (r,n)->new Member(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getBoolean(4),r.getString(5)),business);
    }
    @Transactional(readOnly=true)
    public List<Invitation> invitations(UUID user, UUID business) {
        owner(user,business);
        return db.query("select id,email,role,inventory_access,expires_at from business_invitation where business_id=? and status='PENDING' and expires_at > CURRENT_TIMESTAMP order by created_at desc",(r,n)->new Invitation(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getBoolean(4),r.getTimestamp(5).toInstant()),business);
    }
    @Transactional
    public Created invite(UUID user, UUID business, String address, String employeeRole, boolean inventory) {
        lockBusiness(business); owner(user,business);
        String normalized=email(address); role(employeeRole);
        if (inventory) entitlement(business);
        db.update("update business_invitation set status='REVOKED' where business_id=? and email=? and status='PENDING' and expires_at<=?",business,normalized,Timestamp.from(Instant.now()));
        if (db.queryForObject("select count(*) from business_invitation where business_id=? and email=? and status='PENDING'",Integer.class,business,normalized)>0) throw conflict("An invitation is already pending");
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        UUID id=UUID.randomUUID(); Instant expiry=Instant.now().plus(7,ChronoUnit.DAYS);
        db.update("insert into business_invitation(id,business_id,email,role,inventory_access,token_hash,created_by,expires_at,status) values (?,?,?,?,?,?,?,?, 'PENDING')",id,business,normalized,employeeRole,inventory,hash(token),user,Timestamp.from(expiry));
        return new Created(id,token,expiry);
    }
    @Transactional
    public void revoke(UUID user, UUID business, UUID id) {
        lockBusiness(business); owner(user,business);
        if (db.update("update business_invitation set status='REVOKED' where id=? and business_id=? and status='PENDING'",id,business)!=1) throw conflict("Invitation is no longer pending");
    }
    @Transactional
    public void update(UUID user, UUID business, UUID member, String newRole, boolean active, boolean inventory) {
        lockBusiness(business); owner(user,business); role(newRole);
        var existing=db.query("select role from business_membership where business_id=? and user_id=?",(r,n)->r.getString(1),business,member);
        if (existing.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if ("OWNER".equals(existing.get(0))) throw conflict("Owner memberships cannot be changed here");
        if (active && inventory) entitlement(business);
        db.update("update business_membership set role=?,active=? where business_id=? and user_id=?",newRole,active,business,member);
        if (!active) db.update("update product_access set active=false where business_id=? and user_id=?",business,member);
        else if (inventory) {
            int changed=db.update("update product_access set active=true,role=? where business_id=? and user_id=? and product_code='inventory'",newRole,business,member);
            if (changed==0) db.update("insert into product_access(business_id,user_id,product_code,role,active) values (?,?,'inventory',?,true)",business,member,newRole);
        } else db.update("update product_access set active=false where business_id=? and user_id=? and product_code='inventory'",business,member);
    }
    @Transactional
    public UUID accept(UUID user, String verifiedEmail, boolean verified, String token) {
        if (!verified || verifiedEmail==null || token==null || !token.matches("[A-Za-z0-9_-]{43}")) throw new AccessDeniedException("Invalid invitation or identity");
        String digest=hash(token);
        var businessIds=db.query("select business_id from business_invitation where token_hash=?",(r,n)->r.getObject(1,UUID.class),digest);
        if (businessIds.isEmpty()) throw new AccessDeniedException("Invalid invitation or identity");
        UUID business=businessIds.get(0); lockBusiness(business);
        var invitations=db.query("select id,email,role,inventory_access,expires_at,status from business_invitation where token_hash=? for update",(r,n)->new Pending(r.getObject(1,UUID.class),r.getString(2),r.getString(3),r.getBoolean(4),r.getTimestamp(5).toInstant(),r.getString(6)),digest);
        if (invitations.isEmpty()) throw new AccessDeniedException("Invalid invitation or identity");
        Pending invitation=invitations.get(0);
        if (!"PENDING".equals(invitation.status()) || !invitation.expires().isAfter(Instant.now()) || !invitation.email().equals(email(verifiedEmail))) throw new AccessDeniedException("Invalid invitation or identity");
        if (invitation.inventory()) entitlement(business);
        var current=db.query("select role,active from business_membership where business_id=? and user_id=?",(r,n)->new Existing(r.getString(1),r.getBoolean(2)),business,user);
        if (!current.isEmpty() && (current.get(0).active() || "OWNER".equals(current.get(0).role()))) throw conflict("Account already has a membership");
        if (current.isEmpty()) db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,?,true)",business,user,invitation.role());
        else { db.update("update business_membership set role=?,active=true where business_id=? and user_id=?",invitation.role(),business,user); db.update("update product_access set active=false where business_id=? and user_id=?",business,user); }
        if (invitation.inventory()) {
            int changed=db.update("update product_access set role=?,active=true where business_id=? and user_id=? and product_code='inventory'",invitation.role(),business,user);
            if (changed==0) db.update("insert into product_access(business_id,user_id,product_code,role,active) values (?,?,'inventory',?,true)",business,user,invitation.role());
        }
        db.update("update business_invitation set status='ACCEPTED',accepted_by=?,accepted_at=? where id=?",user,Timestamp.from(Instant.now()),invitation.id());
        return business;
    }
    public record Member(UUID userId,String name,String role,boolean active,String inventoryRole) {}
    public record Invitation(UUID id,String email,String role,boolean inventoryAccess,Instant expiresAt) {}
    public record Created(UUID id,String token,Instant expiresAt) {}
    private record Pending(UUID id,String email,String role,boolean inventory,Instant expires,String status) {}
    private record Existing(String role,boolean active) {}
}
