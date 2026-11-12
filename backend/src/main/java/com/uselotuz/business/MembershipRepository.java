package com.uselotuz.business;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface MembershipRepository extends JpaRepository<Membership, Membership.Key> {
    List<Membership> findByIdBusinessIdAndActiveTrueOrderByIdUserId(UUID businessId);
}
