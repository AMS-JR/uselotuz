package com.uselotuz.access;

import org.springframework.data.jpa.repository.JpaRepository;
interface EntitlementRepository extends JpaRepository<Entitlement, Entitlement.Key> {}
