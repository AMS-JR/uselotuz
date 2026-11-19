package com.uselotuz.inventory.catalog;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class InventoryTestDataSafetyTest {
    private final UUID business=UUID.fromString("40000000-0000-4000-8000-000000000001");
    private final UUID location=UUID.fromString("60000000-0000-4000-8000-000000000001");
    private final JdbcTemplate db=mock(JdbcTemplate.class);
    private static final String LOCAL="jdbc:postgresql://127.0.0.1:5433/lotuz";
    @BeforeEach void setup() {
        lenient().when(db.queryForList(anyString(),eq(String.class),eq(business))).thenReturn(List.of("Test Store"));
        lenient().when(db.queryForList(anyString(),eq(UUID.class),eq(business))).thenReturn(List.of(location));
        lenient().when(db.queryForObject(anyString(),eq(Long.class),eq(business))).thenReturn(0L);
    }
    @Test void permitsOnlyConfirmedLocalDevelopmentTarget() {
        assertDoesNotThrow(()->InventoryTestDataSafety.requireLocalTarget(LOCAL,business,business.toString(),"local"));
        assertDoesNotThrow(()->InventoryTestDataSafety.requireLocalTarget("jdbc:postgresql://localhost:5433/lotuz",business,business.toString(),null));
        for(String target:List.of("jdbc:postgresql://example.com:5433/lotuz", "jdbc:postgresql://localhost:5432/lotuz", "jdbc:postgresql://localhost:5433/production", "jdbc:postgresql://localhost:5433/lotuz?sslmode=require", "jdbc:h2:mem:lotuz"))
            assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireLocalTarget(target,business,business.toString(),null));
        assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireLocalTarget(LOCAL,business,"other",null));
        assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireLocalTarget(LOCAL,business,business.toString(),"local,production"));
    }
    @Test void rejectsMissingOrNonTestBusinessesAndExistingInventory() {
        assertEquals(location,InventoryTestDataSafety.requireEmptyTestBusiness(db,business));
        when(db.queryForList(anyString(),eq(String.class),eq(business))).thenReturn(List.of());
        assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireEmptyTestBusiness(db,business));
        when(db.queryForList(anyString(),eq(String.class),eq(business))).thenReturn(List.of("Real Store"));
        assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireEmptyTestBusiness(db,business));
        when(db.queryForList(anyString(),eq(String.class),eq(business))).thenReturn(List.of("Test Store"));
        when(db.queryForObject(contains("inventory_item"),eq(Long.class),eq(business))).thenReturn(1L);
        assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireEmptyTestBusiness(db,business));
        verify(db,never()).update(anyString(),any(Object[].class));
    }
    @Test void rejectsMissingLocation() {
        when(db.queryForList(anyString(),eq(UUID.class),eq(business))).thenReturn(List.of());
        assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireEmptyTestBusiness(db,business));
    }
    @Test void rejectsAnyExistingInventoryType() {
        for(String table:List.of("inventory_item", "inventory_category", "inventory_supplier", "inventory_stock_movement", "inventory_stock_threshold", "inventory_reorder_plan", "inventory_stock_count_item", "inventory_stock_count")) {
            reset(db);
            when(db.queryForList(anyString(),eq(String.class),eq(business))).thenReturn(List.of("Test Store"));
            lenient().when(db.queryForObject(anyString(),eq(Long.class),eq(business))).thenReturn(0L);
            when(db.queryForObject(contains(table),eq(Long.class),eq(business))).thenReturn(1L);
            assertThrows(IllegalStateException.class,()->InventoryTestDataSafety.requireEmptyTestBusiness(db,business),table);
        }
    }
    @Test void requiresAuthorizedInventoryAccessBeforeInspectingBusiness() {
        var catalog=mock(CatalogService.class);
        var stock=mock(StockService.class);
        var user=UUID.randomUUID();
        doThrow(new org.springframework.security.access.AccessDeniedException("denied"))
            .when(catalog).authorize(user,business,true);
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
            ()->InventoryTestDataSafety.authorizeAndRequireEmptyBusiness(catalog,stock,db,business,user));
        verifyNoInteractions(db,stock);
    }
}
