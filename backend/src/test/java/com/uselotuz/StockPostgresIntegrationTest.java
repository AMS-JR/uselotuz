package com.uselotuz;

import static com.uselotuz.AccessIntegrationTest.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties="lotuz.oidc.enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StockPostgresIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired TransactionTemplate transactions;
    @org.springframework.test.context.bean.override.mockito.MockitoBean ClientRegistrationRepository registrations;
    UUID location, foreignLocation, item, decimalItem;
    String base() { return "/api/businesses/"+A+"/inventory/stock"; }
    String payload(UUID loc, String quantity) { return "{\"locationId\":\""+loc+"\",\"quantity\":\""+quantity+"\"}"; }
    String receipt(UUID loc, String quantity, UUID key) { return "{\"locationId\":\""+loc+"\",\"quantity\":\""+quantity+"\",\"idempotencyKey\":\""+key+"\"}"; }
    String adjustment(UUID loc, String quantity, String reason, UUID key) { return "{\"locationId\":\""+loc+"\",\"quantity\":\""+quantity+"\",\"reason\":\""+reason+"\",\"idempotencyKey\":\""+key+"\"}"; }
    String consumption(UUID loc, String quantity, String reason, UUID key) { return adjustment(loc,quantity,reason,key); }
    String threshold(UUID loc, String quantity) { return "{\"locationId\":\""+loc+"\",\"quantity\":"+(quantity==null ? "null" : "\""+quantity+"\"")+"}"; }
    String plan(UUID loc, String quantity) { return threshold(loc,quantity); }
    @BeforeEach void seed() throws Exception {
        try(var c=db.getDataSource().getConnection()) { Assumptions.assumeTrue(c.getMetaData().getDatabaseProductName().equals("PostgreSQL")); }
        for(String t:new String[]{"inventory_reorder_plan","inventory_stock_threshold","inventory_stock_movement","inventory_item","inventory_category","inventory_supplier","inventory_location","product_access","product_entitlement","business_membership","business","external_identity","platform_user"}) db.update("delete from "+t);
        db.update("insert into platform_user(id,display_name) values (?,?),(?,?)",ALICE,"Alice",BOB,"Bob");
        db.update("insert into external_identity(id,user_id,issuer,subject) values (?,?,?,?)",UUID.randomUUID(),ALICE,"https://issuer.example","alice");
        db.update("insert into business(id,name) values (?,?),(?,?)",A,"Store",B,"Other");
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'OWNER',true),(?,?,'OWNER',true)",A,ALICE,B,BOB);
        db.update("insert into product_entitlement(business_id,product_code,active) values (?,'inventory',true),(?,'inventory',true)",A,B);
        db.update("insert into product_access(business_id,user_id,product_code,role,active) values (?,?,'inventory','OWNER',true),(?,?,'inventory','OWNER',true)",A,ALICE,B,BOB);
        location=UUID.randomUUID(); foreignLocation=UUID.randomUUID(); item=UUID.randomUUID(); decimalItem=UUID.randomUUID();
        db.update("insert into inventory_location(id,business_id,name) values (?,?,?),(?,?,?)",location,A,"Store",foreignLocation,B,"Other");
        db.update("insert into inventory_item(id,business_id,name,item_type,unit,archived,created_at,updated_at) values (?,?,'Rice','PRODUCT','PIECE',false,current_timestamp,current_timestamp),(?,?,'Flour','INGREDIENT','KILOGRAM',false,current_timestamp,current_timestamp)",item,A,decimalItem,A);
    }
    @Test void rolesValidationAndBalances() throws Exception {
        mvc.perform(get(base()).param("itemId",item.toString()).param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.quantity").doesNotExist());
        mvc.perform(post(base()+"/"+UUID.randomUUID()+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"1"))).andExpect(status().isNotFound());
        db.update("update product_entitlement set active=false where business_id=?",A);
        mvc.perform(get(base()).param("itemId",item.toString()).param("locationId",location.toString()).with(alice())).andExpect(status().isForbidden());
        db.update("update product_entitlement set active=true where business_id=?",A);
        for(String invalid:new String[]{"-1","1.5","0.0000001"}) mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,invalid))).andExpect(status().isBadRequest());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(foreignLocation,"1"))).andExpect(status().isBadRequest());
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isForbidden());
        mvc.perform(get(base()).param("itemId",item.toString()).param("locationId",location.toString()).with(alice())).andExpect(status().isOk());
        db.update("update product_access set role='ADMIN' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isCreated());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"1"))).andExpect(status().isConflict());
        mvc.perform(post(base()+"/"+decimalItem+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"1.250001"))).andExpect(status().isCreated());
        mvc.perform(get(base()).param("itemId",decimalItem.toString()).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.quantity").value("1.250001"));
        mvc.perform(get("/api/businesses/"+B+"/inventory/stock").param("itemId",item.toString()).param("locationId",foreignLocation.toString()).with(alice())).andExpect(status().isForbidden());
    }
    @Test void concurrentOpeningCreatesExactlyOneMovement() throws Exception {
        var executor=Executors.newFixedThreadPool(2); var start=new CountDownLatch(1);
        try {
            Callable<Integer> action=() -> { start.await(); return mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"3"))).andReturn().getResponse().getStatus(); };
            var one=executor.submit(action); var two=executor.submit(action); start.countDown();
            assertEquals(java.util.Set.of(201,409),java.util.Set.of(one.get(15,TimeUnit.SECONDS),two.get(15,TimeUnit.SECONDS)));
            assertEquals(1,db.queryForObject("select count(*) from inventory_stock_movement where item_id=?",Integer.class,item));
            assertEquals(0,new java.math.BigDecimal("3").compareTo(db.queryForObject("select quantity from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,item)));
        } finally { executor.shutdownNow(); }
    }
    @Test void constraintsAndRollbackProtectData() {
        String sql="insert into inventory_stock_movement(id,business_id,item_id,location_id,movement_type,quantity,unit,created_by,created_at) values (?,?,?,?,'OPENING',cast(? as numeric), ?,?,current_timestamp)";
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update(sql,UUID.randomUUID(),A,item,foreignLocation,"1","PIECE",ALICE));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update(sql,UUID.randomUUID(),A,item,location,"-1","PIECE",ALICE));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update(sql,UUID.randomUUID(),A,item,location,"1.5","PIECE",ALICE));
        assertThrows(IllegalStateException.class,() -> transactions.executeWithoutResult(status -> { db.update(sql,UUID.randomUUID(),A,item,location,"2","PIECE",ALICE); throw new IllegalStateException("rollback"); }));
        assertEquals(0,db.queryForObject("select count(*) from inventory_stock_movement",Integer.class));
        db.update(sql,UUID.randomUUID(),A,item,location,"2","PIECE",ALICE);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update(sql,UUID.randomUUID(),A,item,location,"3","PIECE",ALICE));
        String adjustmentSql="insert into inventory_stock_movement(id,business_id,item_id,location_id,movement_type,quantity,unit,created_by,created_at,adjustment_reason,idempotency_key) values (?,?,?,?,'ADJUSTMENT',?,'PIECE',?,current_timestamp,'Count',?)";
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update(adjustmentSql,UUID.randomUUID(),A,item,location,new java.math.BigDecimal("-1"),ALICE,null));
        UUID key=UUID.randomUUID();
        db.update(adjustmentSql,UUID.randomUUID(),A,item,location,new java.math.BigDecimal("-1"),ALICE,key);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update(adjustmentSql,UUID.randomUUID(),A,item,location,new java.math.BigDecimal("-1"),ALICE,key));
        assertEquals(0,new java.math.BigDecimal("1").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,item)));
    }
    @Test void openingServiceRollsBackWithItsTransaction() throws Exception {
        assertThrows(IllegalStateException.class,() -> transactions.executeWithoutResult(status -> {
            try {
                mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"2"))).andExpect(status().isCreated());
            } catch (Exception error) { throw new AssertionError(error); }
            throw new IllegalStateException("force rollback");
        }));
        assertEquals(0,db.queryForObject("select count(*) from inventory_stock_movement where item_id=?",Integer.class,item));
        mvc.perform(get(base()).param("itemId",item.toString()).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.quantity").doesNotExist());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"2"))).andExpect(status().isCreated());
    }
    @Test void adjustmentsAndHistoryRespectBalanceAndPermissions() throws Exception {
        String path=base()+"/"+item+"/adjustments"; UUID key=UUID.randomUUID();
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"1","Count",key))).andExpect(status().isConflict());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"5"))).andExpect(status().isCreated());
        for(String invalid:java.util.List.of("0","1.5","0.0000001")) mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,invalid,"Count",UUID.randomUUID()))).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"1"," ",UUID.randomUUID()))).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"-6","Count",UUID.randomUUID()))).andExpect(status().isConflict());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"-2","Count",key))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("3.000000"));
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"-2","Count",key))).andExpect(status().isCreated());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"-1","Count",key))).andExpect(status().isConflict());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"4","Correction",UUID.randomUUID()))).andExpect(status().isCreated());
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"1","Count",UUID.randomUUID()))).andExpect(status().isForbidden());
        mvc.perform(get(base()+"/"+item+"/movements").param("locationId",location.toString()).param("size","2").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(3)).andExpect(jsonPath("$.movements.length()").value(2));
        mvc.perform(get(base()+"/"+item+"/movements").param("locationId",foreignLocation.toString()).with(alice())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/businesses/"+B+"/inventory/stock/"+item+"/movements").param("locationId",foreignLocation.toString()).with(alice())).andExpect(status().isForbidden());
    }
    @Test void concurrentReductionsCannotMakeStockNegative() throws Exception {
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"5"))).andExpect(status().isCreated());
        var executor=Executors.newFixedThreadPool(2); var gate=new CountDownLatch(1);
        try {
            Callable<Integer> action=() -> { gate.await(); return mvc.perform(post(base()+"/"+item+"/adjustments").with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"-4","Count",UUID.randomUUID()))).andReturn().getResponse().getStatus(); };
            var a=executor.submit(action); var b=executor.submit(action); gate.countDown(); assertEquals(java.util.Set.of(201,409),java.util.Set.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS)));
        } finally { executor.shutdownNow(); }
        assertEquals(0,new java.math.BigDecimal("1").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,item)));
    }
    @Test void decimalAdjustmentsRequireCsrfAndAllowAdmin() throws Exception {
        mvc.perform(post(base()+"/"+decimalItem+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"1.5"))).andExpect(status().isCreated());
        String path=base()+"/"+decimalItem+"/adjustments";
        db.update("update product_access set role='ADMIN' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(post(path).with(alice()).contentType("application/json").content(adjustment(location,"-0.25","Count",UUID.randomUUID()))).andExpect(status().isForbidden());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(adjustment(location,"-0.25","Count",UUID.randomUUID()))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("1.250000"));
        mvc.perform(get(base()+"/"+decimalItem+"/movements").param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.movements[0].reason").value("Count")).andExpect(jsonPath("$.movements[0].createdBy").value(ALICE.toString()));
    }
    @Test void consumptionValidatesAndRecordsHistory() throws Exception {
        String path=base()+"/"+item+"/consumption"; UUID key=UUID.randomUUID();
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"1","Sale",key))).andExpect(status().isConflict());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"5"))).andExpect(status().isCreated());
        for(String invalid:java.util.List.of("0","-1","1.5","0.0000001")) mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,invalid,"Sale",UUID.randomUUID()))).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"1"," ",UUID.randomUUID()))).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(foreignLocation,"1","Sale",UUID.randomUUID()))).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(alice()).contentType("application/json").content(consumption(location,"1","Sale",UUID.randomUUID()))).andExpect(status().isForbidden());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"6","Sale",UUID.randomUUID()))).andExpect(status().isConflict());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"2","Sale",key))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("3.000000"));
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"2","Sale",key))).andExpect(status().isCreated());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"1","Sale",key))).andExpect(status().isConflict());
        mvc.perform(get(base()+"/"+item+"/movements").param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.movements[0].type").value("CONSUMPTION")).andExpect(jsonPath("$.movements[0].reason").value("Sale"));
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"1","Sale",UUID.randomUUID()))).andExpect(status().isForbidden());
        assertEquals(1,db.queryForObject("select count(*) from inventory_stock_movement where item_id=? and movement_type='CONSUMPTION'",Integer.class,item));
    }
    @Test void concurrentConsumptionCannotOverdraw() throws Exception {
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"5"))).andExpect(status().isCreated());
        var executor=Executors.newFixedThreadPool(2); var gate=new CountDownLatch(1);
        try {
            Callable<Integer> action=() -> { gate.await(); return mvc.perform(post(base()+"/"+item+"/consumption").with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"4","Sale",UUID.randomUUID()))).andReturn().getResponse().getStatus(); };
            var a=executor.submit(action); var b=executor.submit(action); gate.countDown(); assertEquals(java.util.Set.of(201,409),java.util.Set.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS)));
        } finally { executor.shutdownNow(); }
        assertEquals(0,new java.math.BigDecimal("1").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,item)));
    }
    @Test void decimalConsumptionAdminAndRollback() throws Exception {
        mvc.perform(post(base()+"/"+decimalItem+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"1.5"))).andExpect(status().isCreated());
        db.update("update product_access set role='ADMIN' where business_id=? and user_id=?",A,ALICE);
        String path=base()+"/"+decimalItem+"/consumption";
        assertThrows(IllegalStateException.class,() -> transactions.executeWithoutResult(status -> { try { mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"0.25","Waste",UUID.randomUUID()))).andExpect(status().isCreated()); } catch(Exception e) { throw new AssertionError(e); } throw new IllegalStateException("rollback"); }));
        assertEquals(0,db.queryForObject("select count(*) from inventory_stock_movement where item_id=? and movement_type='CONSUMPTION'",Integer.class,decimalItem));
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"0.25","Waste",UUID.randomUUID()))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("1.250000"));
        mvc.perform(post("/api/businesses/"+B+"/inventory/stock/"+decimalItem+"/consumption").with(alice()).with(csrf()).contentType("application/json").content(consumption(foreignLocation,"1","Sale",UUID.randomUUID()))).andExpect(status().isForbidden());
    }
    @Test void concurrentConsumptionRetriesAreIdempotent() throws Exception {
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"5"))).andExpect(status().isCreated());
        UUID key=UUID.randomUUID(); var executor=Executors.newFixedThreadPool(2); var gate=new CountDownLatch(1);
        try {
            Callable<Integer> action=() -> { gate.await(); return mvc.perform(post(base()+"/"+item+"/consumption").with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"4","Sale",key))).andReturn().getResponse().getStatus(); };
            var a=executor.submit(action); var b=executor.submit(action); gate.countDown(); assertEquals(201,a.get(15,TimeUnit.SECONDS)); assertEquals(201,b.get(15,TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
        assertEquals(1,db.queryForObject("select count(*) from inventory_stock_movement where item_id=? and movement_type='CONSUMPTION'",Integer.class,item));
        assertEquals(0,new java.math.BigDecimal("1").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,item)));
    }
    @Test void thresholdsAlertsFilteringAndRoles() throws Exception {
        String path=base()+"/"+item+"/threshold";
        mvc.perform(put(path).with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"1.5"))).andExpect(status().isBadRequest());
        mvc.perform(put(path).with(alice()).with(csrf()).contentType("application/json").content(threshold(foreignLocation,"5"))).andExpect(status().isBadRequest());
        mvc.perform(put(path).with(alice()).contentType("application/json").content(threshold(location,"5"))).andExpect(status().isForbidden());
        mvc.perform(put(path).with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"5"))).andExpect(status().isOk()).andExpect(jsonPath("$.stockStatus").value("NOT_ESTABLISHED"));
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"5"))).andExpect(status().isCreated()).andExpect(jsonPath("$.stockStatus").value("LOW_STOCK"));
        mvc.perform(get(base()+"/alerts").param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.lowStock").value(1)).andExpect(jsonPath("$.outOfStock").value(0));
        mvc.perform(get("/api/businesses/"+A+"/inventory/catalog/items").param("stockStatus","low").param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(put(path).with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"4"))).andExpect(jsonPath("$.stockStatus").value("IN_STOCK"));
        mvc.perform(put(path).with(alice()).with(csrf()).contentType("application/json").content(threshold(location,null))).andExpect(jsonPath("$.stockStatus").value("NO_THRESHOLD"));
        mvc.perform(post(base()+"/"+item+"/consumption").with(alice()).with(csrf()).contentType("application/json").content(consumption(location,"5","Sale",UUID.randomUUID()))).andExpect(status().isCreated());
        mvc.perform(get(base()).param("itemId",item.toString()).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.stockStatus").value("OUT_OF_STOCK"));
        mvc.perform(get("/api/businesses/"+A+"/inventory/catalog/items").param("stockStatus","out").param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.total").value(1));
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(put(path).with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"1"))).andExpect(status().isForbidden());
        mvc.perform(get(base()+"/alerts").param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.outOfStock").value(1));
    }
    @Test void reorderUsesInitializedBalancesAndProtectsPlans() throws Exception {
        String reorder="/api/businesses/"+A+"/inventory/reorder";
        mvc.perform(put(base()+"/"+decimalItem+"/threshold").with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"1.250001"))).andExpect(status().isOk());
        mvc.perform(put(base()+"/"+item+"/threshold").with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"5"))).andExpect(status().isOk());
        mvc.perform(get(reorder).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.total").value(0));
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"5"))).andExpect(status().isCreated());
        mvc.perform(post(base()+"/"+decimalItem+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0.250000"))).andExpect(status().isCreated());
        mvc.perform(get(reorder).param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].suggested").value("1.000001"));
        mvc.perform(get(reorder).param("locationId",location.toString()).param("q","missing").with(alice())).andExpect(jsonPath("$.total").value(0));
        mvc.perform(put(reorder+"/"+decimalItem+"/plan").with(alice()).with(csrf()).contentType("application/json").content(plan(location,"2.500001"))).andExpect(status().isNoContent());
        mvc.perform(get(reorder).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.items[0].planned").value("2.500001")).andExpect(jsonPath("$.items[0].suggested").value("1.000001"));
        mvc.perform(get(reorder+"/export").param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("Flour")));
        mvc.perform(get("/api/businesses/"+B+"/inventory/reorder").param("locationId",foreignLocation.toString()).with(alice())).andExpect(status().isForbidden());
        mvc.perform(get(reorder).param("locationId",foreignLocation.toString()).with(alice())).andExpect(status().isBadRequest());
        mvc.perform(put(reorder+"/"+decimalItem+"/plan").with(alice()).contentType("application/json").content(plan(location,"1"))).andExpect(status().isForbidden());
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(put(reorder+"/"+decimalItem+"/plan").with(alice()).with(csrf()).contentType("application/json").content(plan(location,"1"))).andExpect(status().isForbidden());
        mvc.perform(get(reorder+"/export").param("locationId",location.toString()).with(alice())).andExpect(status().isOk());
        assertEquals(0,new java.math.BigDecimal("0.25").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,decimalItem)));
    }
    @Test void reorderExportFormatsNumbersAndProtectsText() throws Exception {
        String reorder="/api/businesses/"+A+"/inventory/reorder";
        db.update("update inventory_item set name='=Rice',sku='000123',sku_key='000123' where id=?",item);
        mvc.perform(put(base()+"/"+item+"/threshold").with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"5"))).andExpect(status().isOk());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isCreated());
        mvc.perform(put(reorder+"/"+item+"/plan").with(alice()).with(csrf()).contentType("application/json").content(plan(location,"3"))).andExpect(status().isNoContent());
        String csv=mvc.perform(get(reorder+"/export").param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(csv.startsWith("item,sku,current_stock,minimum,suggested,planned,unit,supplier\r\n"));
        assertTrue(csv.contains("\"'=Rice\",\"'000123\",0,5,5,3,\"PIECE\",\"\""));
        assertFalse(csv.contains(".000000"));
    }
    @Test void reorderFiltersAndPieceValidation() throws Exception {
        String reorder="/api/businesses/"+A+"/inventory/reorder"; UUID supplier=UUID.randomUUID();
        db.update("insert into inventory_supplier(id,business_id,name,archived,created_at,updated_at) values (?,?,'Local',false,current_timestamp,current_timestamp)",supplier,A);
        db.update("update inventory_item set supplier_id=? where id=?",supplier,item);
        mvc.perform(put(base()+"/"+item+"/threshold").with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"5"))).andExpect(status().isOk());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isCreated());
        mvc.perform(get(reorder).param("locationId",location.toString()).param("type","PRODUCT").param("supplierId",supplier.toString()).param("size","1").with(alice())).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].supplier").value("Local")).andExpect(jsonPath("$.items[0].suggested").value("5.000000"));
        mvc.perform(get(reorder).param("locationId",location.toString()).param("type","INGREDIENT").with(alice())).andExpect(jsonPath("$.total").value(0));
        mvc.perform(put(reorder+"/"+item+"/plan").with(alice()).with(csrf()).contentType("application/json").content(plan(location,"1.5"))).andExpect(status().isBadRequest());
        mvc.perform(put(reorder+"/"+item+"/plan").with(alice()).with(csrf()).contentType("application/json").content(plan(location,"3"))).andExpect(status().isNoContent());
        mvc.perform(put(reorder+"/"+item+"/plan").with(alice()).with(csrf()).contentType("application/json").content(plan(location,null))).andExpect(status().isNoContent());
        mvc.perform(get(reorder).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.items[0].planned").doesNotExist());
        db.update("update inventory_item set archived=true where id=?",item);
        mvc.perform(get(reorder).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.total").value(0));
    }
    @Test void reorderPaginationAndForeignPlanAreScoped() throws Exception {
        String reorder="/api/businesses/"+A+"/inventory/reorder";
        for(UUID id:java.util.List.of(item,decimalItem)) {
            mvc.perform(put(base()+"/"+id+"/threshold").with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"2"))).andExpect(status().isOk());
            mvc.perform(post(base()+"/"+id+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isCreated());
        }
        mvc.perform(get(reorder).param("locationId",location.toString()).param("size","1").param("page","0").with(alice())).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.items[0].name").value("Flour"));
        mvc.perform(get(reorder).param("locationId",location.toString()).param("size","1").param("page","1").with(alice())).andExpect(jsonPath("$.items[0].name").value("Rice"));
        UUID foreign=UUID.randomUUID();
        db.update("insert into inventory_item(id,business_id,name,item_type,unit,archived,created_at,updated_at) values (?,?,'Other','PRODUCT','PIECE',false,current_timestamp,current_timestamp)",foreign,B);
        mvc.perform(put(reorder+"/"+foreign+"/plan").with(alice()).with(csrf()).contentType("application/json").content(plan(location,"1"))).andExpect(status().isNotFound());
        mvc.perform(get(reorder).param("locationId",location.toString()).param("supplierId",UUID.randomUUID().toString()).with(alice())).andExpect(jsonPath("$.total").value(0));
    }
    @Test void decimalThresholdIsolationAndPagination() throws Exception {
        String decimalPath=base()+"/"+decimalItem+"/threshold";
        mvc.perform(put(decimalPath).with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"1.250001"))).andExpect(status().isOk());
        mvc.perform(post(base()+"/"+decimalItem+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"1.25"))).andExpect(status().isCreated()).andExpect(jsonPath("$.stockStatus").value("LOW_STOCK"));
        mvc.perform(put(base()+"/"+UUID.randomUUID()+"/threshold").with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"1"))).andExpect(status().isNotFound());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isCreated());
        mvc.perform(put(base()+"/"+item+"/threshold").with(alice()).with(csrf()).contentType("application/json").content(threshold(location,"-1"))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/businesses/"+A+"/inventory/catalog/items").param("stockStatus","low").param("locationId",location.toString()).param("size","1").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].id").value(decimalItem.toString()));
        mvc.perform(get("/api/businesses/"+A+"/inventory/catalog/items").param("stockStatus","out").param("locationId",foreignLocation.toString()).with(alice())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/businesses/"+B+"/inventory/stock/alerts").param("locationId",foreignLocation.toString()).with(alice())).andExpect(status().isForbidden());
        db.update("update inventory_item set archived=true where id=?",decimalItem);
        mvc.perform(get(base()+"/alerts").param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.lowStock").value(0)).andExpect(jsonPath("$.outOfStock").value(1));
    }
    @Test void receiptsAreIdempotentAndMaintainBalances() throws Exception {
        UUID key=UUID.randomUUID(); String path=base()+"/"+item+"/receipts";
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"1",key))).andExpect(status().isConflict());
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"25"))).andExpect(status().isCreated());
        for(String invalid:java.util.List.of("0","-1","1.5")) mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,invalid,UUID.randomUUID()))).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"15",key))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("40.000000"));
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"15",key))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("40.000000"));
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"16",key))).andExpect(status().isConflict());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"10",UUID.randomUUID()))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("50.000000"));
        mvc.perform(get(base()).param("itemId",item.toString()).param("locationId",location.toString()).with(alice())).andExpect(jsonPath("$.quantity").value("50.000000"));
        assertEquals(1,db.queryForObject("select count(*) from inventory_stock_movement where item_id=? and movement_type='OPENING' and quantity=25",Integer.class,item));
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"1",UUID.randomUUID()))).andExpect(status().isForbidden());
    }
    @Test void concurrentReceiptKeysPreserveDistinctAndDuplicateRequests() throws Exception {
        mvc.perform(post(base()+"/"+item+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isCreated());
        UUID key=UUID.randomUUID(); var executor=Executors.newFixedThreadPool(2); var start=new CountDownLatch(1);
        try {
            Callable<Integer> action=() -> { start.await(); return mvc.perform(post(base()+"/"+item+"/receipts").with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"3",key))).andReturn().getResponse().getStatus(); };
            var a=executor.submit(action); var b=executor.submit(action); start.countDown(); assertEquals(201,a.get(15,TimeUnit.SECONDS)); assertEquals(201,b.get(15,TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
        assertEquals(1,db.queryForObject("select count(*) from inventory_stock_movement where item_id=? and movement_type='RECEIPT'",Integer.class,item));
        var pool=Executors.newFixedThreadPool(2); var gate=new CountDownLatch(1);
        try {
            Callable<Integer> first=() -> { gate.await(); return mvc.perform(post(base()+"/"+item+"/receipts").with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"10",UUID.randomUUID()))).andReturn().getResponse().getStatus(); };
            Callable<Integer> second=() -> { gate.await(); return mvc.perform(post(base()+"/"+item+"/receipts").with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"15",UUID.randomUUID()))).andReturn().getResponse().getStatus(); };
            var a=pool.submit(first); var b=pool.submit(second); gate.countDown(); assertEquals(201,a.get(15,TimeUnit.SECONDS)); assertEquals(201,b.get(15,TimeUnit.SECONDS));
        } finally { pool.shutdownNow(); }
        assertEquals(0,new java.math.BigDecimal("28").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,item)));
    }
    @Test void receiptsEnforceTenantSupplierDecimalAndRollback() throws Exception {
        mvc.perform(post(base()+"/"+decimalItem+"/opening").with(alice()).with(csrf()).contentType("application/json").content(payload(location,"0"))).andExpect(status().isCreated());
        String path=base()+"/"+decimalItem+"/receipts"; UUID foreign=UUID.randomUUID();
        db.update("insert into inventory_supplier(id,business_id,name,archived,created_at,updated_at) values (?,?,'Foreign',false,current_timestamp,current_timestamp)",foreign,B);
        String withForeign=receipt(location,"1.25",UUID.randomUUID()).replace("}",",\"supplierId\":\""+foreign+"\"}");
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(withForeign)).andExpect(status().isBadRequest());
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(foreignLocation,"1",UUID.randomUUID()))).andExpect(status().isBadRequest());
        db.update("update product_access set role='ADMIN' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"1.25",UUID.randomUUID()))).andExpect(status().isCreated()).andExpect(jsonPath("$.currentQuantity").value("1.250000"));
        assertThrows(IllegalStateException.class,() -> transactions.executeWithoutResult(status -> { try { mvc.perform(post(path).with(alice()).with(csrf()).contentType("application/json").content(receipt(location,"2",UUID.randomUUID()))).andExpect(status().isCreated()); } catch(Exception e) { throw new AssertionError(e); } throw new IllegalStateException("rollback"); }));
        assertEquals(1,db.queryForObject("select count(*) from inventory_stock_movement where item_id=? and movement_type='RECEIPT'",Integer.class,decimalItem));
    }
    @Test void v3PreservesAnExistingV2Catalog() throws Exception {
        String schema="stock_upgrade_"+UUID.randomUUID().toString().replace("-","");
        var flyway=org.flywaydb.core.Flyway.configure().dataSource(db.getDataSource()).schemas(schema).defaultSchema(schema).target("2").load();
        flyway.migrate();
        UUID existing=UUID.randomUUID(), business=UUID.randomUUID();
        try(var c=db.getDataSource().getConnection()) {
            c.setSchema(schema);
            try(var s=c.createStatement()) {
                s.executeUpdate("insert into business(id,name) values ('"+business+"','Existing store')");
                s.executeUpdate("insert into platform_user(id,display_name) values ('"+ALICE+"','Existing owner')");
                s.executeUpdate("insert into business_membership(business_id,user_id,role) values ('"+business+"','"+ALICE+"','OWNER')");
                s.executeUpdate("insert into inventory_category(id,business_id,name,name_key) values ('"+UUID.randomUUID()+"','"+business+"','Food','food')");
                s.executeUpdate("insert into inventory_supplier(id,business_id,name) values ('"+UUID.randomUUID()+"','"+business+"','Supplier')");
            }
            try(var insert=c.prepareStatement("insert into inventory_item(id,business_id,name,item_type,unit) values (?,?,'Imported rice','PRODUCT','PIECE')")) { insert.setObject(1,existing); insert.setObject(2,business); insert.executeUpdate(); }
            c.setSchema("public");
        }
        org.flywaydb.core.Flyway.configure().dataSource(db.getDataSource()).schemas(schema).defaultSchema(schema).load().migrate();
        try(var c=db.getDataSource().getConnection()) {
            c.setSchema(schema);
            try(var s=c.createStatement(); var rows=s.executeQuery("select name,unit from inventory_item")) { assertTrue(rows.next()); assertEquals("Imported rice",rows.getString(1)); assertEquals("PIECE",rows.getString(2)); assertFalse(rows.next()); }
            try(var s=c.createStatement(); var rows=s.executeQuery("select count(*) from inventory_stock_movement")) { assertTrue(rows.next()); assertEquals(0,rows.getInt(1)); }
            for(String table:java.util.List.of("inventory_category","inventory_supplier","business_membership"))
                try(var s=c.createStatement(); var rows=s.executeQuery("select count(*) from "+table)) { assertTrue(rows.next()); assertEquals(1,rows.getInt(1)); }
            c.setSchema("public");
        }
    }
}
