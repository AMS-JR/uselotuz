package com.uselotuz.inventory.catalog;

import static org.junit.jupiter.api.Assertions.*;
import static com.uselotuz.inventory.catalog.CatalogDtos.*;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

/** Explicitly invoked test-only generator; never part of the application artifact. */
@SpringBootTest(properties={"spring.jpa.hibernate.ddl-auto=validate", "spring.flyway.enabled=false", "logging.level.org.hibernate.SQL=OFF", "logging.level.org.springframework=ERROR"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="LOTUZ_TESTDATA_ENABLED", matches="true")
class InventoryTestDataGeneratorTest {
    @Autowired CatalogService catalog;
    @Autowired StockService stock;
    @Autowired ReorderService reorder;
    @Autowired ReportService reports;
    @Autowired JdbcTemplate db;
    @Autowired DataSource dataSource;
    @Autowired TransactionTemplate transactions;

    private static final String[] CATEGORIES={"Pantry", "Beverages", "Breakfast", "Snacks", "Household", "Personal Care", "Dairy", "Frozen", "Baking", "Canned Goods"};
    private static final String[] PRODUCTS={"Rice", "Pasta", "Coffee", "Tea", "Olive Oil", "Cereal", "Crackers", "Chocolate", "Soap", "Shampoo", "Milk", "Yogurt", "Flour", "Sugar", "Beans", "Tomato Sauce", "Juice", "Sparkling Water", "Oats", "Biscuits"};
    private static final String[] BRANDS={"Meadow", "Harvest", "River", "Sunfield", "Orchard", "Market", "Northstar", "Clover", "Hillside", "Evergreen"};
    private static final MeasurementUnit[] UNITS={MeasurementUnit.PIECE,MeasurementUnit.PIECE,MeasurementUnit.PIECE,MeasurementUnit.KILOGRAM,MeasurementUnit.LITER};
    private static UUID key(long seed,int item,String type,int number) { return UUID.nameUUIDFromBytes((seed+":"+item+":"+type+":"+number).getBytes(StandardCharsets.UTF_8)); }
    private static String required(String key) { String s=System.getenv(key); if(s==null || s.isBlank()) throw new IllegalStateException(key+" is required"); return s; }

    @Test void generateAndVerify() throws Exception {
        UUID business=UUID.fromString(required("LOTUZ_TESTDATA_BUSINESS_ID"));
        UUID user=UUID.fromString(required("LOTUZ_TESTDATA_USER_ID"));
        long seed=Long.parseLong(required("LOTUZ_TESTDATA_SEED"));
        try(Connection connection=dataSource.getConnection()) {
            InventoryTestDataSafety.requireLocalTarget(connection.getMetaData().getURL(), business, System.getenv("LOTUZ_TESTDATA_CONFIRM"), System.getenv("SPRING_PROFILES_ACTIVE"));
        }
        transactions.executeWithoutResult(ignored -> generate(business,user,seed));
        System.out.println("Generated and verified business "+business+": 500 products, 2500 movements; seed "+seed);
    }

    private void generate(UUID business, UUID user, long seed) {
        UUID location=InventoryTestDataSafety.authorizeAndRequireEmptyBusiness(catalog,stock,db,business,user);
        var categories=new ArrayList<UUID>();
        for(String name:CATEGORIES) categories.add(catalog.saveCategory(user,business,null,new CategoryInput(name)).id());
        var suppliers=new ArrayList<UUID>();
        for(int i=0;i<10;i++) suppliers.add(catalog.saveSupplier(user,business,null,new SupplierInput(BRANDS[i]+" Wholesale",null,null,null,null,null)).id());
        Random random=new Random(seed);
        Map<UUID,BigDecimal> expected=new HashMap<>();
        for(int i=0;i<500;i++) {
            MeasurementUnit unit=UNITS[i%UNITS.length];
            UUID supplier=suppliers.get(i%10);
            String name=BRANDS[(i/20)%10]+" "+PRODUCTS[i%20]+" "+(i+1);
            String sku=String.format(Locale.ROOT,"TEST-%04d",i+1);
            UUID item=catalog.saveItem(user,business,null,new ItemInput(name,"Synthetic retail item",sku,null,"PRODUCT",unit,categories.get(i%10),supplier)).id();
            BigDecimal balance=BigDecimal.valueOf(10+random.nextInt(11));
            stock.open(user,business,item,new StockService.Opening(location,balance.toPlainString()));
            int receipts=i<300?2:1;
            for(int n=0;n<receipts;n++) {
                BigDecimal amount=BigDecimal.valueOf(2+random.nextInt(4));
                balance=balance.add(amount);
                stock.receive(user,business,item,new StockService.Receipt(location,amount.toPlainString(),supplier,"TEST-RECEIPT-"+(i+1)+"-"+(n+1),"Synthetic stock receipt",key(seed,i,"receipt",n)));
            }
            int uses=i<200?2:1;
            for(int n=0;n<uses;n++) {
                BigDecimal amount=BigDecimal.valueOf(1+random.nextInt(2));
                balance=balance.subtract(amount);
                stock.consume(user,business,item,new StockService.Consumption(location,amount.toPlainString(),"Retail sale",key(seed,i,"consume",n)));
            }
            BigDecimal adjustment = i%10==0 ? balance.negate() : i%10==1 ? BigDecimal.valueOf(2).subtract(balance) : BigDecimal.valueOf(i%2==0?1:-1);
            balance=balance.add(adjustment);
            stock.adjust(user,business,item,new StockService.Adjustment(location,adjustment.toPlainString(),"Stock count correction",key(seed,i,"adjustment",0)));
            stock.setThreshold(user,business,item,new StockService.ThresholdInput(location,"5"));
            expected.put(item,balance);
        }
        verify(business,user,location,expected);
    }
    private void verify(UUID business,UUID user,UUID location,Map<UUID,BigDecimal> expected) {
        assertEquals(500,expected.size());
        for(var entry:Map.of("OPENING",500,"RECEIPT",800,"CONSUMPTION",700,"ADJUSTMENT",500).entrySet())
            assertEquals(entry.getValue(),db.queryForObject("select count(*) from inventory_stock_movement where business_id=? and movement_type=?",Integer.class,business,entry.getKey()));
        db.query("select item_id,sum(quantity) balance from inventory_stock_movement where business_id=? group by item_id",rs -> {
            UUID item=rs.getObject(1,UUID.class); BigDecimal total=rs.getBigDecimal(2);
            assertTrue(total.signum()>=0); assertEquals(0,total.compareTo(expected.get(item)));
        },business);
        var alerts=stock.alerts(user,business,location);
        assertEquals(50,alerts.lowStock()); assertEquals(50,alerts.outOfStock());
        var plans=reorder.list(user,business,location,"",null,null,0,100);
        assertEquals(100,plans.total());
        for(var row:plans.items()) assertEquals(0,new BigDecimal(row.minimum()).subtract(new BigDecimal(row.currentStock())).compareTo(new BigDecimal(row.suggested())));
        LocalDate now=LocalDate.now(ZoneOffset.UTC);
        var filters=reports.validate(user,business,location,"",null,null,null,now.minusDays(1),now.plusDays(1),null);
        var summary=reports.summary(user,filters);
        assertEquals(500,summary.totalActiveItems()); assertEquals(2500,summary.movementsInPeriod());
        assertEquals(50,summary.lowStockItems()); assertEquals(50,summary.outOfStockItems());
        assertEquals(500,reports.current(filters,0,25).total()); assertEquals(2500,reports.movements(filters,0,25).total());
    }
}
