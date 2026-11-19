package com.uselotuz.inventory.catalog;

import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Guards the opt-in test-data generator before it makes any changes. */
final class InventoryTestDataSafety {
    private static final List<String> INVENTORY_TABLES=List.of("inventory_item", "inventory_category", "inventory_supplier", "inventory_stock_movement", "inventory_stock_threshold", "inventory_reorder_plan", "inventory_stock_count_item", "inventory_stock_count");
    private InventoryTestDataSafety() {}
    static void requireLocalTarget(String url, UUID business, String confirmation, String profiles) {
        if(!business.toString().equals(confirmation)) throw new IllegalStateException("Explicit business confirmation is required");
        if(profiles!=null && List.of(profiles.toLowerCase(Locale.ROOT).split("[,;\\s]+" )).stream().anyMatch(p -> p.equals("prod") || p.equals("production")))
            throw new IllegalStateException("Production profiles are forbidden");
        if(!"jdbc:postgresql://127.0.0.1:5433/lotuz".equals(url) && !"jdbc:postgresql://localhost:5433/lotuz".equals(url))
            throw new IllegalStateException("Only the local Lotuz development database on port 5433 is permitted");
    }
    static UUID authorizeAndRequireEmptyBusiness(CatalogService catalog, StockService stock, JdbcTemplate db, UUID business, UUID user) {
        catalog.authorize(user,business,true);
        UUID location=requireEmptyTestBusiness(db,business);
        stock.validateLocation(user,business,location);
        return location;
    }
    static UUID requireEmptyTestBusiness(JdbcTemplate db, UUID business) {
        List<String> names=db.queryForList("select name from business where id=? for update",String.class,business);
        if(names.size()!=1) throw new IllegalStateException("Business does not exist");
        if(!names.getFirst().matches("(?i).*\\btest\\b.*")) throw new IllegalStateException("Business name must contain the word Test");
        for(String table:INVENTORY_TABLES) {
            Long count=db.queryForObject("select count(*) from "+table+" where business_id=?",Long.class,business);
            if(count==null || count!=0) throw new IllegalStateException("Business inventory must be empty ("+table+")");
        }
        List<UUID> locations=db.queryForList("select id from inventory_location where business_id=?",UUID.class,business);
        if(locations.size()!=1) throw new IllegalStateException("Inventory must be provisioned with one location");
        return locations.getFirst();
    }
}
