package com.uselotuz.identity;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface ExternalIdentityRepository extends JpaRepository<ExternalIdentity, UUID> {
    Optional<ExternalIdentity> findByIssuerAndSubject(String issuer, String subject);
}
