package com.uselotuz.access;

import org.springframework.data.jpa.repository.JpaRepository;
interface ProductAccessRepository extends JpaRepository<ProductAccess, ProductAccess.Key> {}
