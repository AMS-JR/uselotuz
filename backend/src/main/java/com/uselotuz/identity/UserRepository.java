package com.uselotuz.identity;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface UserRepository extends JpaRepository<PlatformUser, UUID> {}
