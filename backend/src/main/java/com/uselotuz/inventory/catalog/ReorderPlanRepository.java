package com.uselotuz.inventory.catalog;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
interface ReorderPlanRepository extends JpaRepository<ReorderPlan,UUID> {
    Optional<ReorderPlan> findByBusinessIdAndItemIdAndLocationId(UUID business, UUID item, UUID location);
    boolean existsByBusinessIdAndItemId(UUID business, UUID item);
}
