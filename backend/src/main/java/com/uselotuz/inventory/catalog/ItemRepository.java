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
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from StockItem e where e.businessId=:business and e.id=:id")
    Optional<StockItem> lock(@Param("business") UUID business, @Param("id") UUID id);
    List<StockItem> findByBusinessIdOrderByNameAsc(UUID businessId);

    @Query("select i from StockItem i where i.businessId=:business and (:archived is null or i.archived=:archived) and (:type is null or i.itemType=:type) and (:category is null or i.categoryId=:category) and (:q='' or locate(:q,lower(i.name))>0 or locate(:q,lower(coalesce(i.sku,'')))>0 or locate(:q,lower(coalesce(i.barcode,'')))>0)")
    Page<StockItem> search(@Param("business") UUID business, @Param("archived") Boolean archived, @Param("type") String type, @Param("category") UUID category, @Param("q") String q, Pageable pageable);
    boolean existsByBusinessIdAndSkuKeyAndIdNot(UUID business, String key, UUID id);
    boolean existsByBusinessIdAndBarcodeAndIdNot(UUID business, String barcode, UUID id);
}
