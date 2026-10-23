
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.Product;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.domain.Specification;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public interface ProductRepository extends
        JpaRepository<Product, Long>,
        JpaSpecificationExecutor<Product> {

    boolean existsByNameIgnoreCase(String name);

    default Page<Product> searchProducts(
            String keyword,
            Long categoryId,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            Boolean inStock,
            Pageable pageable
    ) {
        Specification<Product> specification = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (keyword != null && !keyword.isBlank()) {
                String pattern = "%" + keyword.trim()
                        .toLowerCase(Locale.ROOT)
                        .replace("\\", "\\\\")
                        .replace("%", "\\%")
                        .replace("_", "\\_") + "%";

                Predicate nameMatch = cb.like(
                        cb.lower(root.get("name")),
                        pattern,
                        '\\'
                );

                Predicate descriptionMatch = cb.like(
                        cb.lower(root.get("description")),
                        pattern,
                        '\\'
                );

                predicates.add(cb.or(nameMatch, descriptionMatch));
            }

            if (categoryId != null) {
                predicates.add(
                        cb.equal(root.get("category").get("id"), categoryId)
                );
            }

            if (minPrice != null) {
                predicates.add(
                        cb.greaterThanOrEqualTo(
                                root.<BigDecimal>get("price"),
                                minPrice
                        )
                );
            }

            if (maxPrice != null) {
                predicates.add(
                        cb.lessThanOrEqualTo(
                                root.<BigDecimal>get("price"),
                                maxPrice
                        )
                );
            }

            if (Boolean.TRUE.equals(inStock)) {
                predicates.add(
                        cb.greaterThan(root.<Integer>get("stock"), 0)
                );
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        return findAll(specification, pageable);
    }
}
