
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.Promotion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PromotionRepository extends JpaRepository<Promotion, Long> {

    Optional<Promotion> findByCodeIgnoreCase(String code);

    Optional<Promotion> findByCodeIgnoreCaseAndActiveTrue(String code);

    boolean existsByCodeIgnoreCase(String code);

    List<Promotion> findByActiveTrue();

    List<Promotion> findByActiveFalse();
}
