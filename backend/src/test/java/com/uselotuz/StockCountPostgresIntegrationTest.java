package com.uselotuz;

import static com.uselotuz.AccessIntegrationTest.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.nio.charset.StandardCharsets;
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

@SpringBootTest(properties="lotuz.oidc.enabled=true") @AutoConfigureMockMvc @ActiveProfiles("test")
class StockCountPostgresIntegrationTest {
    @Autowired MockMvc mvc; @Autowired JdbcTemplate db;
    @org.springframework.test.context.bean.override.mockito.MockitoBean ClientRegistrationRepository registrations;
    UUID location,first,second,foreignLocation;
    String base() { return "/api/businesses/"+A+"/inventory/counts"; }
    String stock() { return "/api/businesses/"+A+"/inventory/stock"; }
    @BeforeEach void seed() throws Exception {
        try(var c=db.getDataSource().getConnection()) { Assumptions.assumeTrue(c.getMetaData().getDatabaseProductName().equals("PostgreSQL")); }
        for(String t:new String[]{"inventory_stock_count_item","inventory_stock_count","inventory_reorder_plan","inventory_stock_threshold","inventory_stock_movement","inventory_item","inventory_category","inventory_supplier","inventory_location","product_access","product_entitlement","business_membership","business","external_identity","platform_user"}) db.update("delete from "+t);
        db.update("insert into platform_user(id,display_name) values (?,?),(?,?)",ALICE,"Alice",BOB,"Bob");
        db.update("insert into external_identity(id,user_id,issuer,subject) values (?,?,?,?)",UUID.randomUUID(),ALICE,"https://issuer.example","alice");
        db.update("insert into business(id,name) values (?,?),(?,?)",A,"Store",B,"Other");
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'OWNER',true),(?,?,'OWNER',true)",A,ALICE,B,BOB);
        db.update("insert into product_entitlement(business_id,product_code,active) values (?,'inventory',true),(?,'inventory',true)",A,B);
        db.update("insert into product_access(business_id,user_id,product_code,role,active) values (?,?,'inventory','OWNER',true),(?,?,'inventory','OWNER',true)",A,ALICE,B,BOB);
        location=UUID.randomUUID(); foreignLocation=UUID.randomUUID(); first=UUID.randomUUID(); second=UUID.randomUUID();
        db.update("insert into inventory_location(id,business_id,name) values (?,?,?),(?,?,?)",location,A,"Store",foreignLocation,B,"Other");
        db.update("insert into inventory_item(id,business_id,name,item_type,unit,archived,created_at,updated_at) values (?,?,'Apples','PRODUCT','PIECE',false,current_timestamp,current_timestamp),(?,?,'Flour','INGREDIENT','KILOGRAM',false,current_timestamp,current_timestamp)",first,A,second,A);
        open(first,"5"); open(second,"2.5");
    }
    @AfterEach void clean() throws Exception {
        try(var c=db.getDataSource().getConnection()) { if(!c.getMetaData().getDatabaseProductName().equals("PostgreSQL")) return; }
        db.update("delete from inventory_stock_count_item"); db.update("delete from inventory_stock_count");
    }
    void open(UUID id,String quantity) throws Exception { mvc.perform(post(stock()+"/"+id+"/opening").with(alice()).with(csrf()).contentType("application/json").content("{\"locationId\":\""+location+"\",\"quantity\":\""+quantity+"\"}")).andExpect(status().isCreated()); }
    String create() throws Exception { var r=mvc.perform(post(base()).with(alice()).with(csrf()).contentType("application/json").content("{\"locationId\":\""+location+"\",\"itemIds\":[\""+first+"\",\""+second+"\"]}")).andExpect(status().isCreated()).andReturn(); return com.jayway.jsonpath.JsonPath.read(r.getResponse().getContentAsString(),"$.id"); }
    String values(String version,String x,String y) { return "{\"version\":"+version+",\"items\":[{\"itemId\":\""+first+"\",\"quantity\":"+(x==null?"null":"\""+x+"\"")+"},{\"itemId\":\""+second+"\",\"quantity\":"+(y==null?"null":"\""+y+"\"")+"}]}"; }
    void save(String id,String x,String y) throws Exception { mvc.perform(put(base()+"/"+id).with(alice()).with(csrf()).contentType("application/json").content(values("0",x,y))).andExpect(status().isOk()); }
    @Test void savesResumesAndReconcilesOnce() throws Exception {
        String id=create();
        mvc.perform(put(base()+"/"+id).with(alice()).with(csrf()).contentType("application/json").content(values("0","4",null))).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        mvc.perform(get(base()+"/"+id).with(alice())).andExpect(jsonPath("$.items[0].variance").value("-1.000000"));
        mvc.perform(put(base()+"/"+id).with(alice()).with(csrf()).contentType("application/json").content(values("1","4","3.75"))).andExpect(status().isOk());
        mvc.perform(post(base()+"/"+id+"/confirm").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":2}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        assertEquals(0,new java.math.BigDecimal("4").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,first)));
        assertEquals(0,new java.math.BigDecimal("3.75").compareTo(db.queryForObject("select sum(quantity) from inventory_stock_movement where item_id=?",java.math.BigDecimal.class,second)));
        assertEquals(2,db.queryForObject("select count(*) from inventory_stock_movement where movement_type='ADJUSTMENT'",Integer.class));
        mvc.perform(post(base()+"/"+id+"/confirm").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":2}")).andExpect(status().isConflict());
    }
    @Test void detectsOffsettingMovementsAndRequiresRecount() throws Exception {
        String id=create(); save(id,"4","3");
        mvc.perform(post(stock()+"/"+first+"/receipts").with(alice()).with(csrf()).contentType("application/json").content("{\"locationId\":\""+location+"\",\"quantity\":\"1\",\"idempotencyKey\":\""+UUID.randomUUID()+"\"}")).andExpect(status().isCreated());
        mvc.perform(post(stock()+"/"+first+"/consumption").with(alice()).with(csrf()).contentType("application/json").content("{\"locationId\":\""+location+"\",\"quantity\":\"1\",\"reason\":\"Sale\",\"idempotencyKey\":\""+UUID.randomUUID()+"\"}")).andExpect(status().isCreated());
        mvc.perform(post(base()+"/"+id+"/confirm").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":1}")).andExpect(status().isConflict());
        assertEquals(0,db.queryForObject("select count(*) from inventory_stock_movement where movement_type='ADJUSTMENT'",Integer.class));
        mvc.perform(post(base()+"/"+id+"/refresh").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":1}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DRAFT")).andExpect(jsonPath("$.items[0].counted").doesNotExist());
    }
    @Test void validatesPermissionsVersionsAndTenant() throws Exception {
        String id=create();
        mvc.perform(put(base()+"/"+id).with(alice()).with(csrf()).contentType("application/json").content(values("0","1.5","2"))).andExpect(status().isBadRequest());
        mvc.perform(put(base()+"/"+id).with(alice()).with(csrf()).contentType("application/json").content(values("0","4","2.0000001"))).andExpect(status().isBadRequest());
        mvc.perform(get(base()+"/"+id).with(alice())).andExpect(jsonPath("$.items[0].counted").doesNotExist()).andExpect(jsonPath("$.version").value(0));
        mvc.perform(put(base()+"/"+id).with(alice()).with(csrf()).contentType("application/json").content(values("1","1","2"))).andExpect(status().isConflict());
        mvc.perform(get("/api/businesses/"+B+"/inventory/counts/"+id).with(alice())).andExpect(status().isForbidden());
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'OWNER',true)",B,ALICE);
        db.update("insert into product_access(business_id,user_id,product_code,role,active) values (?,?,'inventory','OWNER',true)",B,ALICE);
        mvc.perform(get("/api/businesses/"+B+"/inventory/counts/"+id).with(alice())).andExpect(status().isNotFound());
        mvc.perform(get(base()).param("locationId",location.toString()).param("size","1").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post(base()).with(alice()).with(csrf()).contentType("application/json").content("{\"locationId\":\""+foreignLocation+"\",\"itemIds\":[\""+first+"\"]}")).andExpect(status().isBadRequest());
        mvc.perform(post(base()+"/"+id+"/cancel").with(alice()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isForbidden());
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(get(base()+"/"+id).with(alice())).andExpect(status().isOk());
        mvc.perform(post(base()+"/"+id+"/confirm").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isForbidden());
    }
    @Test void rollsBackEarlierAdjustmentsOnLaterFailure() throws Exception {
        String id=create(); save(id,"4","3");
        UUID other=UUID.randomUUID(); db.update("insert into inventory_item(id,business_id,name,item_type,unit,archived,created_at,updated_at) values (?,?,'Other','PRODUCT','PIECE',false,current_timestamp,current_timestamp)",other,A); open(other,"1");
        UUID collision=UUID.nameUUIDFromBytes(("stock-count:"+id+":"+second).getBytes(StandardCharsets.UTF_8));
        mvc.perform(post(stock()+"/"+other+"/receipts").with(alice()).with(csrf()).contentType("application/json").content("{\"locationId\":\""+location+"\",\"quantity\":\"1\",\"idempotencyKey\":\""+collision+"\"}")).andExpect(status().isCreated());
        mvc.perform(post(base()+"/"+id+"/confirm").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":1}")).andExpect(status().isConflict());
        assertEquals(0,db.queryForObject("select count(*) from inventory_stock_movement where movement_type='ADJUSTMENT'",Integer.class));
        mvc.perform(get(base()+"/"+id).with(alice())).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
    }
    @Test void cancellationClosesTheSessionWithoutChangingStock() throws Exception {
        String id=create();
        mvc.perform(post(base()+"/"+id+"/cancel").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(put(base()+"/"+id).with(alice()).with(csrf()).contentType("application/json").content(values("1","4","3"))).andExpect(status().isConflict());
        assertEquals(0,db.queryForObject("select count(*) from inventory_stock_movement where movement_type='ADJUSTMENT'",Integer.class));
    }
    @Test void concurrentConfirmationCreatesAdjustmentsOnce() throws Exception {
        String id=create(); save(id,"4","3"); var executor=Executors.newFixedThreadPool(2); var start=new CountDownLatch(1);
        try { Callable<Integer> task=()->{start.await();return mvc.perform(post(base()+"/"+id+"/confirm").with(alice()).with(csrf()).contentType("application/json").content("{\"version\":1}")).andReturn().getResponse().getStatus();}; var a=executor.submit(task);var b=executor.submit(task);start.countDown();assertEquals(java.util.Set.of(200,409),java.util.Set.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS)));assertEquals(2,db.queryForObject("select count(*) from inventory_stock_movement where movement_type='ADJUSTMENT'",Integer.class)); }
        finally { executor.shutdownNow(); }
    }
}
