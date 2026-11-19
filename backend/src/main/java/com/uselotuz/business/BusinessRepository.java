package com.uselotuz.business;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface BusinessRepository extends JpaRepository<Business, UUID> {
    @Query("select b.id as id, b.name as name, m.role as role from business b join business_membership m on m.id.businessId = b.id where m.id.userId = :userId and m.active = true order by b.name, b.id")
    List<BusinessMembershipView> findForUser(UUID userId);

    interface BusinessMembershipView {
        UUID getId();
        String getName();
        String getRole();
    }
}
