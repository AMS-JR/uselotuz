package com.uselotuz;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.uselotuz.AccessIntegrationTest.*;

import java.util.UUID;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import com.uselotuz.inventory.catalog.CatalogCsvService;

@SpringBootTest(properties="lotuz.oidc.enabled=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CatalogIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @org.springframework.test.context.bean.override.mockito.MockitoBean ClientRegistrationRepository registrations;
    String base() { return "/api/businesses/"+A+"/inventory/catalog"; }
    @BeforeEach void seed() {
        for (String table : new String[]{"inventory_reorder_plan", "inventory_stock_threshold", "inventory_stock_movement", "inventory_item", "inventory_category", "inventory_supplier", "inventory_location", "product_access", "product_entitlement", "business_membership", "business", "external_identity", "platform_user"})
            db.update("delete from " + table);
        db.update("insert into platform_user(id,display_name) values (?,?),(?,?)", ALICE, "Alice", BOB, "Bob");
        db.update("insert into external_identity(id,user_id,issuer,subject) values (?,?,?,?)", UUID.randomUUID(), ALICE, "https://issuer.example", "alice");
        db.update("insert into business(id,name) values (?,?),(?,?)", A, "Alice store", B, "Bob restaurant");
        db.update("insert into business_membership(business_id,user_id,role,active) values (?,?,'OWNER',true),(?,?,'OWNER',true)", A, ALICE, B, BOB);
        db.update("insert into product_entitlement(business_id,product_code,active) values (?,'inventory',true),(?,'inventory',true)", A, B);
        db.update("insert into product_access(business_id,user_id,product_code,role,active) values (?,?,'inventory','STAFF',true),(?,?,'inventory','OWNER',true)", A, ALICE, B, BOB);
        db.update("insert into inventory_location(id,business_id,name) values (?,?,?),(?,?,?)", UUID.randomUUID(), A, "Store", UUID.randomUUID(), B, "Kitchen");
    }

    void manager() { db.update("update product_access set role='ADMIN' where business_id=? and user_id=?",A,ALICE); }
    String create(String resource, String body) throws Exception {
        var response=mvc.perform(post(base()+"/"+resource).with(alice()).with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isCreated()).andReturn();
        return com.jayway.jsonpath.JsonPath.read(response.getResponse().getContentAsString(),"$.id");
    }
    String item(String name, String sku) { return "{\"name\":\""+name+"\",\"sku\":\""+sku+"\",\"itemType\":\"PRODUCT\",\"unit\":\"PIECE\"}"; }
    MockMultipartFile csv(String rows) { return new MockMultipartFile("file","catalog.csv","text/csv",(CatalogCsvService.HEADER+"\r\n"+rows).getBytes(StandardCharsets.UTF_8)); }
    @Test void reportingUsesLedgerFiltersAndTenantAuthorization() throws Exception {
        manager(); String id=create("items",item("Rice","001")); create("items",item("Uncounted","002"));
        UUID location=db.queryForObject("select id from inventory_location where business_id=?",UUID.class,A);
        db.update("insert into inventory_stock_movement(id,business_id,item_id,location_id,movement_type,quantity,unit,created_by,created_at) values (?,?,?,?,'OPENING',0,'PIECE',?,CURRENT_TIMESTAMP)",UUID.randomUUID(),A,UUID.fromString(id),location,ALICE);
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        String report="/api/businesses/"+A+"/inventory/reports";
        mvc.perform(get(report+"/stock").param("locationId",location.toString()).param("size","1").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].stockStatus").value("OUT_OF_STOCK"));
        mvc.perform(get(report+"/stock").param("locationId",location.toString()).param("status","NOT_ESTABLISHED").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get(report+"/movements").param("locationId",location.toString()).param("movementType","OPENING").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].sku").value("001"));
        mvc.perform(get(report+"/movements").param("locationId",location.toString()).param("from","2026-02-02").param("to","2026-01-01").with(alice())).andExpect(status().isBadRequest());
        mvc.perform(get(report+"/stock").param("locationId",location.toString()).param("size","101").with(alice())).andExpect(status().isBadRequest());
        var export=mvc.perform(get(report+"/stock/export").param("locationId",location.toString()).with(alice())).andExpect(request().asyncStarted()).andReturn();
        String csv=mvc.perform(asyncDispatch(export)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(csv.contains("\"'001\""));
        assertTrue(csv.contains(",0,"));
        mvc.perform(get(report+"/summary").param("locationId",location.toString()).with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.totalActiveItems").value(2)).andExpect(jsonPath("$.outOfStockItems").value(1));
        manager(); String flour=create("items","{\"name\":\"Flour\",\"sku\":\"F01\",\"itemType\":\"INGREDIENT\",\"unit\":\"KILOGRAM\"}");
        db.update("insert into inventory_stock_movement(id,business_id,item_id,location_id,movement_type,quantity,unit,created_by,created_at) values (?,?,?,?,'OPENING',2.5,'KILOGRAM',?,CURRENT_TIMESTAMP)",UUID.randomUUID(),A,UUID.fromString(flour),location,ALICE);
        db.update("insert into inventory_stock_movement(id,business_id,item_id,location_id,movement_type,quantity,unit,created_by,created_at,adjustment_reason,idempotency_key) values (?,?,?,?,'ADJUSTMENT',-1.25,'KILOGRAM',?,CURRENT_TIMESTAMP,'Count',?)",UUID.randomUUID(),A,UUID.fromString(flour),location,ALICE,UUID.randomUUID());
        db.update("insert into inventory_stock_threshold(id,business_id,item_id,location_id,quantity) values (?,?,?,?,1.25)",UUID.randomUUID(),A,UUID.fromString(flour),location);
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(get(report+"/stock").param("locationId",location.toString()).param("status","LOW_STOCK").param("type","INGREDIENT").param("q","f01").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].currentStock").value("1.250000"));
        mvc.perform(get(report+"/movements").param("locationId",location.toString()).param("movementType","ADJUSTMENT").param("q","flour").with(alice())).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].reason").value("Count"));
        mvc.perform(get(report+"/stock").param("locationId",location.toString())).andExpect(status().isUnauthorized());
        mvc.perform(get(report.replace(A.toString(),B.toString())+"/stock").param("locationId",location.toString()).with(alice())).andExpect(status().isForbidden());
    }
    @Test void reportCsvFormatsQuantitiesWithoutChangingPrecisionOrSafety() throws Exception {
        manager();
        String rice=create("items",item("=Rice","001"));
        String flour=create("items","{\"name\":\"Flour\",\"sku\":\"002\",\"itemType\":\"INGREDIENT\",\"unit\":\"KILOGRAM\"}");
        create("items",item("Uncounted","003"));
        UUID location=db.queryForObject("select id from inventory_location where business_id=?",UUID.class,A);
        for (Object[] entry : new Object[][] {{rice,new BigDecimal("15"),"PIECE"},{flour,new BigDecimal("3"),"KILOGRAM"}}) {
            db.update("insert into inventory_stock_movement(id,business_id,item_id,location_id,movement_type,quantity,unit,created_by,created_at) values (?,?,?,?,'OPENING',?,?,?,CURRENT_TIMESTAMP)",UUID.randomUUID(),A,UUID.fromString((String)entry[0]),location,entry[1],entry[2],ALICE);
        }
        db.update("insert into inventory_stock_movement(id,business_id,item_id,location_id,movement_type,quantity,unit,created_by,created_at,adjustment_reason,idempotency_key) values (?,?,?,?,'ADJUSTMENT',-0.5,'KILOGRAM',?,CURRENT_TIMESTAMP,'=Formula',?)",UUID.randomUUID(),A,UUID.fromString(flour),location,ALICE,UUID.randomUUID());
        db.update("insert into inventory_stock_threshold(id,business_id,item_id,location_id,quantity) values (?,?,?,?,?)",UUID.randomUUID(),A,UUID.fromString(rice),location,new BigDecimal("10"));
        db.update("insert into inventory_stock_threshold(id,business_id,item_id,location_id,quantity) values (?,?,?,?,?)",UUID.randomUUID(),A,UUID.fromString(flour),location,new BigDecimal("2.500000"));
        String report="/api/businesses/"+A+"/inventory/reports";
        var request=mvc.perform(get(report+"/stock/export").param("locationId",location.toString()).with(alice())).andExpect(request().asyncStarted()).andReturn();
        String stockCsv=mvc.perform(asyncDispatch(request)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(stockCsv.startsWith("item,sku,category,item_type,unit,current_stock,minimum_stock,stock_status\r\n"));
        assertTrue(stockCsv.contains("\"'=Rice\",\"'001\",\"\",\"PRODUCT\",\"PIECE\",15,10"));
        assertTrue(stockCsv.contains("\"Flour\",\"'002\",\"\",\"INGREDIENT\",\"KILOGRAM\",2.5,2.5"));
        assertTrue(stockCsv.contains("\"Uncounted\",\"'003\",\"\",\"PRODUCT\",\"PIECE\",\"\",\"\""));
        var movements=mvc.perform(get(report+"/movements/export").param("locationId",location.toString()).param("q","flour").with(alice())).andExpect(request().asyncStarted()).andReturn();
        String movementCsv=mvc.perform(asyncDispatch(movements)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(movementCsv.startsWith("date,item,sku,movement_type,quantity_change,unit,reason\r\n"));
        assertTrue(movementCsv.contains("\"Flour\",\"'002\",\"OPENING\",3,"));
        assertTrue(movementCsv.contains("\"Flour\",\"'002\",\"ADJUSTMENT\",-0.5,\"KILOGRAM\",\"'=Formula\""));
        assertFalse(movementCsv.contains("Rice"));
        assertFalse(stockCsv.contains(".000000"));
        assertFalse(movementCsv.contains(".000000"));
    }
    @Test void catalogCrudSearchFilterArchiveAndTimestamps() throws Exception {
        manager(); String id=create("items",item("Rice","001"));
        mvc.perform(get(base()+"/items/"+id).with(alice())).andExpect(jsonPath("$.sku").value("001"))
            .andExpect(jsonPath("$.createdAt").isNotEmpty()).andExpect(jsonPath("$.updatedAt").isNotEmpty());
        mvc.perform(put(base()+"/items/"+id).with(alice()).with(csrf()).contentType("application/json").content(item("Brown rice","001"))).andExpect(status().isOk());
        mvc.perform(get(base()+"/items").param("q","brown").param("type","PRODUCT").with(alice())).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get(base()+"/items").param("q","missing").with(alice())).andExpect(jsonPath("$.total").value(0));
        mvc.perform(post(base()+"/items/"+id+"/archive").with(alice()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(post(base()+"/items/"+id+"/archive").with(alice()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get(base()+"/items").with(alice())).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get(base()+"/items").param("status","archived").with(alice())).andExpect(jsonPath("$.total").value(1));
        mvc.perform(put(base()+"/items/"+id).with(alice()).with(csrf()).contentType("application/json").content(item("Changed","001"))).andExpect(status().isConflict());
        create("items",item("Blank code","")); create("items",item("Other blank code",""));
    }
    @Test void duplicateIdentifiersAreBusinessScopedIncludingArchives() throws Exception {
        manager(); create("items",item("A","CODE"));
        mvc.perform(post(base()+"/items").with(alice()).with(csrf()).contentType("application/json").content(item("B","code"))).andExpect(status().isConflict());
        create("items","{\"name\":\"Barcode\",\"barcode\":\"00001\",\"itemType\":\"INGREDIENT\",\"unit\":\"GRAM\"}");
        mvc.perform(post(base()+"/items").with(alice()).with(csrf()).contentType("application/json").content("{\"name\":\"Dup\",\"barcode\":\"00001\",\"itemType\":\"PRODUCT\",\"unit\":\"PIECE\"}")).andExpect(status().isConflict());
        db.update("insert into inventory_item(id,business_id,name,sku,sku_key,item_type,unit,archived,created_at,updated_at) values (?,?,?,'CODE','code','PRODUCT','PIECE',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",UUID.randomUUID(),B,"Other tenant");
        mvc.perform(get(base()+"/items").with(alice())).andExpect(jsonPath("$.total").value(2));
    }
    @Test void categoriesSuppliersReferencesAndArchiveBehavior() throws Exception {
        manager(); String category=create("categories","{\"name\":\"Food\"}");
        String supplier=create("suppliers","{\"name\":\"Supplier\",\"email\":\"hello@example.com\",\"contactPerson\":\"Sam\",\"phone\":\"0123\",\"address\":\"Main St\",\"notes\":\"Weekly\"}");
        mvc.perform(get(base()+"/suppliers/"+supplier).with(alice())).andExpect(jsonPath("$.contactPerson").value("Sam"));
        String body=item("Flour","F").replace("}",",\"categoryId\":\""+category+"\",\"supplierId\":\""+supplier+"\"}");
        create("items",body);
        mvc.perform(get(base()+"/items").param("categoryId",category).with(alice())).andExpect(jsonPath("$.total").value(1));
        mvc.perform(post(base()+"/categories").with(alice()).with(csrf()).contentType("application/json").content("{\"name\":\" food \"}")).andExpect(status().isConflict());
        mvc.perform(put(base()+"/categories/"+category).with(alice()).with(csrf()).contentType("application/json").content("{\"name\":\"Dry food\"}")).andExpect(status().isOk());
        mvc.perform(put(base()+"/suppliers/"+supplier).with(alice()).with(csrf()).contentType("application/json").content("{\"name\":\"New supplier\"}")).andExpect(status().isOk());
        for(String resource:new String[]{"categories/"+category,"suppliers/"+supplier})
            mvc.perform(post(base()+"/"+resource+"/archive").with(alice()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(post(base()+"/items").with(alice()).with(csrf()).contentType("application/json").content(body.replace("\"F\"","\"F2\""))).andExpect(status().isBadRequest());
        mvc.perform(get(base()+"/items").with(alice())).andExpect(jsonPath("$.items[0].categoryId").value(category));
    }
    @Test void foreignIdsNeverLeakOrAssign() throws Exception {
        manager(); UUID category=UUID.randomUUID(), supplier=UUID.randomUUID(), foreignItem=UUID.randomUUID();
        db.update("insert into inventory_category(id,business_id,name,name_key,archived,created_at,updated_at) values (?,?,'Secret','secret',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",category,B);
        db.update("insert into inventory_supplier(id,business_id,name,archived,created_at,updated_at) values (?,?,'Secret',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",supplier,B);
        db.update("insert into inventory_item(id,business_id,name,item_type,unit,archived,created_at,updated_at) values (?,?,'Secret','PRODUCT','PIECE',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",foreignItem,B);
        for(String field:new String[]{"categoryId","supplierId"}) {
            String body=item("Bad","BAD").replace("}",",\""+field+"\":\""+(field.equals("categoryId") ? category : supplier)+"\"}");
            mvc.perform(post(base()+"/items").with(alice()).with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        mvc.perform(get(base()+"/items/"+foreignItem).with(alice())).andExpect(status().isNotFound());
        mvc.perform(put(base()+"/items/"+foreignItem).with(alice()).with(csrf()).contentType("application/json").content(item("Stolen","S"))).andExpect(status().isNotFound());
        for(String resource:new String[]{"items/"+foreignItem,"categories/"+category,"suppliers/"+supplier})
            mvc.perform(post(base()+"/"+resource+"/archive").with(alice()).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get(base().replace(A.toString(),B.toString())+"/items").with(alice())).andExpect(status().isForbidden());
    }
    @Test void anonymousStaffAndCsrfAreEnforced() throws Exception {
        for(String suffix:new String[]{"/items","/categories","/suppliers","/export","/template","/units","/summary"}) {
            mvc.perform(get(base()+suffix)).andExpect(status().isUnauthorized());
            mvc.perform(get(base()+suffix).with(alice())).andExpect(status().isOk());
        }
        mvc.perform(post(base()+"/items").with(alice()).with(csrf()).contentType("application/json").content(item("No","N"))).andExpect(status().isForbidden());
        mvc.perform(multipart(base()+"/import").file(csv("Rice,,R,,PRODUCT,PIECE,,,active")).with(alice()).with(csrf())).andExpect(status().isForbidden());
        manager(); mvc.perform(post(base()+"/items").with(alice()).contentType("application/json").content(item("No","N"))).andExpect(status().isForbidden());
    }
    @ParameterizedTest @ValueSource(strings={"OWNER","ADMIN"})
    void productManagersCanCreate(String role) throws Exception {
        db.update("update product_access set role=? where business_id=? and user_id=?",role,A,ALICE);
        create("items",item("Allowed",role));
    }
    @Test void revokedEntitlementMembershipAndProductGrantDenyCatalog() throws Exception {
        manager();
        for(String table:new String[]{"product_entitlement","business_membership","product_access"}) {
            db.update("update "+table+" set active=false where business_id=?",A);
            for(String suffix:new String[]{"/items","/categories","/suppliers","/export","/template","/units","/summary"}) mvc.perform(get(base()+suffix).with(alice())).andExpect(status().isForbidden());
            mvc.perform(post(base()+"/items").with(alice()).with(csrf()).contentType("application/json").content(item("Denied","D"))).andExpect(status().isForbidden());
            db.update("update "+table+" set active=true where business_id=?",A);
        }
    }
    @Test void invalidCatalogInputAndPaginationAreRejected() throws Exception {
        manager();
        for(String body:new String[]{item(" ","X"),item("x".repeat(201),"X"),"{\"name\":\"No unit\",\"itemType\":\"PRODUCT\"}",item("X","X").replace("PRODUCT","RECIPE"),item("X","X").replace("PIECE","GALLON")})
            mvc.perform(post(base()+"/items").with(alice()).with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        mvc.perform(post(base()+"/suppliers").with(alice()).with(csrf()).contentType("application/json").content("{\"name\":\"Bad email\",\"email\":\"invalid\"}")).andExpect(status().isBadRequest());
        mvc.perform(get(base()+"/items").param("size","101").with(alice())).andExpect(status().isBadRequest());
        mvc.perform(get(base()+"/items").param("status","other").with(alice())).andExpect(status().isBadRequest());
    }
    @Test void csvImportsAtomicallyAndExportsTextSafely() throws Exception {
        manager();
        mvc.perform(multipart(base()+"/import").file(csv("Rice,,001,00001,PRODUCT,KILOGRAM,,,active\r\n\"=SUM(1,2)\",,002,,INGREDIENT,GRAM,,,active\r\n")).with(alice()).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.imported").value(2));
        var response=mvc.perform(get(base()+"/export").with(alice())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(response.contains("\"'001\"")); assertTrue(response.contains("\"'00001\"")); assertTrue(response.contains("\"'=SUM(1,2)\""));
        mvc.perform(multipart(base()+"/import").file(csv("Valid,,V,,PRODUCT,PIECE,,,active\r\nDuplicate,,001,,PRODUCT,PIECE,,,active")).with(alice()).with(csrf()))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].row").value(3));
        assertEquals(2,db.queryForObject("select count(*) from inventory_item",Integer.class));
    }
    @Test void csvRejectsHeadersDuplicatesReferencesUnitsAndArchiveRows() throws Exception {
        manager();
        for(String data:new String[]{"A,,D,,PRODUCT,PIECE,,,active\nB,,d,,PRODUCT,PIECE,,,active", "A,,,,PRODUCT,GRAM,,,active\nA,,,,PRODUCT,GRAM,,,active", "A,,,,PRODUCT,UNKNOWN,,,active", "A,,,,PRODUCT,GRAM,not-a-uuid,,active", "A,,,,PRODUCT,GRAM,,,archived", "A,,,,PRODUCT,GRAM,,,active,100"}) {
            mvc.perform(multipart(base()+"/import").file(csv(data)).with(alice()).with(csrf())).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors").isArray());
            assertEquals(0,db.queryForObject("select count(*) from inventory_item",Integer.class));
        }
        mvc.perform(multipart(base()+"/import").file(new MockMultipartFile("file","a.csv","text/csv","name,opening_stock\nA,10".getBytes())).with(alice()).with(csrf())).andExpect(status().isBadRequest());
    }
    @Test void csvLimitsAndMalformedInputAreRejected() throws Exception {
        manager();
        for(MockMultipartFile file:new MockMultipartFile[]{new MockMultipartFile("file",new byte[1048577]),csv("A,,,,PRODUCT,PIECE,,,active\n".repeat(1001)),csv("\"unterminated"), new MockMultipartFile("file",new byte[]{(byte)0xff})})
            mvc.perform(multipart(base()+"/import").file(file).with(alice()).with(csrf())).andExpect(status().isBadRequest());
    }
    @Test void databaseRejectsDuplicateAndCrossTenantReferences() throws Exception {
        try(var c=db.getDataSource().getConnection()) { Assumptions.assumeTrue(c.getMetaData().getDatabaseProductName().equals("PostgreSQL")); }
        manager(); String category=create("categories","{\"name\":\"Own\"}"); String id=create("items",item("Own","OWN"));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update("update inventory_item set business_id=?, category_id=? where id=?",B,UUID.fromString(category),UUID.fromString(id)));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> db.update("insert into inventory_category(id,business_id,name,name_key) values (?,?,'OWN','own')",UUID.randomUUID(),A));
    }
    @Test void v2UpgradesAnExistingV1SchemaWithoutChangingBusinessOrLocation() throws Exception {
        try(var c=db.getDataSource().getConnection()) { Assumptions.assumeTrue(c.getMetaData().getDatabaseProductName().equals("PostgreSQL")); }
        String schema="upgrade_"+UUID.randomUUID().toString().replace("-","");
        var v1=org.flywaydb.core.Flyway.configure().dataSource(db.getDataSource()).schemas(schema).defaultSchema(schema).target("1").load();
        v1.migrate();
        UUID business=UUID.randomUUID(), location=UUID.randomUUID();
        try(var c=db.getDataSource().getConnection()) {
            c.setSchema(schema);
            try(var insert=c.prepareStatement("insert into business(id,name) values (?,?)")) { insert.setObject(1,business); insert.setString(2,"Existing pilot"); insert.executeUpdate(); }
            try(var insert=c.prepareStatement("insert into inventory_location(id,business_id,name) values (?,?,?)")) { insert.setObject(1,location); insert.setObject(2,business); insert.setString(3,"Existing room"); insert.executeUpdate(); }
            c.setSchema("public");
        }
        org.flywaydb.core.Flyway.configure().dataSource(db.getDataSource()).schemas(schema).defaultSchema(schema).load().migrate();
        try(var c=db.getDataSource().getConnection()) {
            c.setSchema(schema);
            try(var query=c.createStatement(); var result=query.executeQuery("select id,name from inventory_location")) {
                assertTrue(result.next()); assertEquals(location,result.getObject(1,UUID.class)); assertEquals("Existing room",result.getString(2));
            }
            try(var query=c.createStatement(); var result=query.executeQuery("select count(*) from inventory_item")) { result.next(); assertEquals(0,result.getInt(1)); }
            c.setSchema("public");
        }
    }

    @Test void summaryUsesActiveTenantDataAndRecentUpdatesOnly() throws Exception {
        manager();
        create("categories","{\"name\":\"Food\"}");
        String archivedCategory=create("categories","{\"name\":\"Old\"}");
        create("suppliers","{\"name\":\"Local\"}");
        mvc.perform(post(base()+"/categories/"+archivedCategory+"/archive").with(alice()).with(csrf())).andExpect(status().isNoContent());
        String old=create("items",item("Archived","OLD"));
        mvc.perform(post(base()+"/items/"+old+"/archive").with(alice()).with(csrf())).andExpect(status().isNoContent());
        String product=create("items",item("Product","P"));
        for(int n=0;n<7;n++) create("items",item("Ingredient "+n,"I"+n).replace("PRODUCT","INGREDIENT").replace("PIECE","GRAM"));
        db.update("update inventory_item set updated_at=? where id=?",java.time.OffsetDateTime.parse("2099-01-01T00:00:00Z"),UUID.fromString(product));
        db.update("insert into inventory_item(id,business_id,name,item_type,unit,archived,created_at,updated_at) values (?,?,'Other business','PRODUCT','PIECE',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",UUID.randomUUID(),B);
        db.update("update product_access set role='STAFF' where business_id=? and user_id=?",A,ALICE);
        mvc.perform(get(base()+"/summary").with(alice())).andExpect(status().isOk())
                .andExpect(jsonPath("$.activeItems").value(8)).andExpect(jsonPath("$.products").value(1))
                .andExpect(jsonPath("$.ingredients").value(7)).andExpect(jsonPath("$.categories").value(1))
                .andExpect(jsonPath("$.suppliers").value(1)).andExpect(jsonPath("$.recentItems.length()").value(6))
                .andExpect(jsonPath("$.recentItems[0].id").value(product));
        mvc.perform(get(base().replace(A.toString(),B.toString())+"/summary").with(alice())).andExpect(status().isForbidden());
    }
    @Test void emptySummaryHasRealZeroCounts() throws Exception {
        mvc.perform(get(base()+"/summary").with(alice())).andExpect(status().isOk())
                .andExpect(jsonPath("$.activeItems").value(0)).andExpect(jsonPath("$.products").value(0))
                .andExpect(jsonPath("$.ingredients").value(0)).andExpect(jsonPath("$.categories").value(0))
                .andExpect(jsonPath("$.suppliers").value(0)).andExpect(jsonPath("$.recentItems").isEmpty());
    }

}
