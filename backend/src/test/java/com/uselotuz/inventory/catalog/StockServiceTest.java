package com.uselotuz.inventory.catalog;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class StockServiceTest {
    final CatalogService catalog=mock(CatalogService.class);
    final ItemRepository items=mock(ItemRepository.class);
    final StockMovementRepository movements=mock(StockMovementRepository.class);
    final EntityManager entityManager=mock(EntityManager.class);
    final Query query=mock(Query.class);
    final UUID business=UUID.randomUUID(), user=UUID.randomUUID(), location=UUID.randomUUID(), id=UUID.randomUUID();
    StockItem item;
    StockService service;
    @BeforeEach void setup() {
        service=new StockService(catalog,items,movements,entityManager,mock(SupplierRepository.class),mock(StockThresholdRepository.class));
        item=new StockItem(business); item.id=id; item.unit=MeasurementUnit.PIECE;
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyString(),any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of(location));
        when(items.lock(business,id)).thenReturn(Optional.of(item));
    }
    @Test void openingZeroIsRecordedAndDuplicateRejected() {
        var result=service.open(user,business,id,new StockService.Opening(location,"0"));
        assertEquals("0",result.quantity());
        verify(movements).saveAndFlush(argThat(m -> m.quantity.compareTo(BigDecimal.ZERO)==0 && m.createdBy.equals(user)));
        when(movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,id,location,"OPENING")).thenReturn(Optional.of(new StockMovement(business,id,location,BigDecimal.ZERO,item.unit,user)));
        when(movements.balance(business,id,location)).thenReturn(BigDecimal.ZERO);
        assertEquals(409,assertThrows(ResponseStatusException.class,() -> service.open(user,business,id,new StockService.Opening(location,"1"))).getStatusCode().value());
    }
    @Test void rejectsInvalidQuantitiesAndAcceptsDecimalsForMass() {
        for (String value: List.of("-1","1.5","0.0000001","100000000000000"))
            assertThrows(ResponseStatusException.class,() -> service.open(user,business,id,new StockService.Opening(location,value)));
        verify(movements,never()).saveAndFlush(any());
        item.unit=MeasurementUnit.KILOGRAM;
        assertEquals("1.250001",service.open(user,business,id,new StockService.Opening(location,"1.250001")).quantity());
    }
    @Test void rejectsInvalidLocationAndItem() {
        when(query.getResultList()).thenReturn(List.of());
        assertThrows(ResponseStatusException.class,() -> service.open(user,business,id,new StockService.Opening(location,"1")));
        when(query.getResultList()).thenReturn(List.of(location));
        when(items.lock(business,id)).thenReturn(Optional.empty());
        assertEquals(404,assertThrows(ResponseStatusException.class,() -> service.open(user,business,id,new StockService.Opening(location,"1"))).getStatusCode().value());
        verify(movements,never()).saveAndFlush(any());
    }
    @Test void uninitializedAndEstablishedStatesRemainDistinct() {
        when(items.findByBusinessIdAndId(business,id)).thenReturn(Optional.of(item));
        when(movements.balance(business,id,location)).thenReturn(BigDecimal.ZERO);
        assertNull(service.get(user,business,id,location).quantity());
        when(movements.findByBusinessIdAndItemIdAndLocationIdAndMovementType(business,id,location,"OPENING")).thenReturn(Optional.of(new StockMovement(business,id,location,BigDecimal.ZERO,item.unit,user)));
        assertEquals("0",service.get(user,business,id,location).quantity());
    }
}
