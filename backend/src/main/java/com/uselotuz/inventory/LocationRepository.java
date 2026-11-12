package com.uselotuz.inventory;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface LocationRepository extends JpaRepository<StockLocation, UUID> {
    Optional<StockLocation> findByBusinessId(UUID businessId);
}
