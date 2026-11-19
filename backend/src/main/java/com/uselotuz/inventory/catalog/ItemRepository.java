package com.uselotuz.inventory.catalog;

import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.*;
import org.springframework.data.repository.query.Param;

interface ItemRepository extends JpaRepository<StockItem, UUID> {
    interface Counts { long getTotal(); long getProducts(); long getIngredients(); }
    @Query("select count(i) as total, coalesce(sum(case when i.itemType='PRODUCT' then 1 else 0 end),0) as products, coalesce(sum(case when i.itemType='INGREDIENT' then 1 else 0 end),0) as ingredients from StockItem i where i.businessId=:business and i.archived=false")
    Counts counts(@Param("business") UUID business);
    List<StockItem> findTop6ByBusinessIdAndArchivedFalseOrderByUpdatedAtDescIdAsc(UUID businessId);
    Optional<StockItem> findByBusinessIdAndId(UUID businessId, UUID id);
    List<StockItem> findByBusinessIdAndIdIn(UUID businessId, Collection<UUID> ids);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from StockItem e where e.businessId=:business and e.id=:id")
    Optional<StockItem> lock(@Param("business") UUID business, @Param("id") UUID id);
    List<StockItem> findByBusinessIdOrderByNameAsc(UUID businessId);

    @Query("select i from StockItem i where i.businessId=:business and (:archived is null or i.archived=:archived) and (:type is null or i.itemType=:type) and (:category is null or i.categoryId=:category) and (:q='' or locate(:q,lower(i.name))>0 or locate(:q,lower(coalesce(i.sku,'')))>0 or locate(:q,lower(coalesce(i.barcode,'')))>0)")
    Page<StockItem> search(@Param("business") UUID business, @Param("archived") Boolean archived, @Param("type") String type, @Param("category") UUID category, @Param("q") String q, Pageable pageable);
    @Query("select i from StockItem i where i.businessId=:business and (:archived is null or i.archived=:archived) and (:type is null or i.itemType=:type) and (:category is null or i.categoryId=:category) and (:q='' or locate(:q,lower(i.name))>0 or locate(:q,lower(coalesce(i.sku,'')))>0 or locate(:q,lower(coalesce(i.barcode,'')))>0) and exists (select m.id from StockMovement m where m.businessId=:business and m.itemId=i.id and m.locationId=:location and m.movementType='OPENING') and ((:alert='out' and (select sum(m.quantity) from StockMovement m where m.businessId=:business and m.itemId=i.id and m.locationId=:location)=0) or (:alert='low' and (select sum(m.quantity) from StockMovement m where m.businessId=:business and m.itemId=i.id and m.locationId=:location)>0 and exists (select t.id from StockThreshold t where t.businessId=:business and t.itemId=i.id and t.locationId=:location and t.quantity >= (select sum(m.quantity) from StockMovement m where m.businessId=:business and m.itemId=i.id and m.locationId=:location))))")
    Page<StockItem> searchAlerts(@Param("business") UUID business, @Param("archived") Boolean archived, @Param("type") String type, @Param("category") UUID category, @Param("q") String q, @Param("location") UUID location, @Param("alert") String alert, Pageable pageable);
    boolean existsByBusinessIdAndSkuKeyAndIdNot(UUID business, String key, UUID id);
    boolean existsByBusinessIdAndBarcodeAndIdNot(UUID business, String barcode, UUID id);
}
