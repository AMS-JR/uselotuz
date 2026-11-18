package com.uselotuz.inventory.catalog;

import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.*;
import org.springframework.data.repository.query.Param;

interface SupplierRepository extends JpaRepository<Supplier, UUID> {
    long countByBusinessIdAndArchivedFalse(UUID businessId);
    Optional<Supplier> findByBusinessIdAndId(UUID businessId, UUID id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Supplier e where e.businessId=:business and e.id=:id")
    Optional<Supplier> lock(@Param("business") UUID business, @Param("id") UUID id);
    List<Supplier> findByBusinessIdOrderByNameAsc(UUID businessId);
}
