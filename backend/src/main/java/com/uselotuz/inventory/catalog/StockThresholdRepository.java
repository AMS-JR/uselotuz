package com.uselotuz.inventory.catalog;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

interface StockThresholdRepository extends JpaRepository<StockThreshold,UUID> {
    Optional<StockThreshold> findByBusinessIdAndItemIdAndLocationId(UUID business, UUID item, UUID location);
    List<StockThreshold> findByBusinessIdAndLocationIdAndItemIdIn(UUID business, UUID location, Collection<UUID> ids);
    boolean existsByBusinessIdAndItemId(UUID business, UUID item);
}
