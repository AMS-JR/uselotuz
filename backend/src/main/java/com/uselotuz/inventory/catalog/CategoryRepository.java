package com.uselotuz.inventory.catalog;

import java.util.*;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.*;
import org.springframework.data.repository.query.Param;

interface CategoryRepository extends JpaRepository<Category, UUID> {
    long countByBusinessIdAndArchivedFalse(UUID businessId);
    Optional<Category> findByBusinessIdAndId(UUID businessId, UUID id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Category e where e.businessId=:business and e.id=:id")
    Optional<Category> lock(@Param("business") UUID business, @Param("id") UUID id);
    List<Category> findByBusinessIdOrderByNameAsc(UUID businessId);
    boolean existsByBusinessIdAndNameKeyAndIdNot(UUID business, String key, UUID id);
}
