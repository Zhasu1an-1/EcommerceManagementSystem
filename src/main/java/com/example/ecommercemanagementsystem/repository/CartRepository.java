
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.Cart;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

import java.util.Optional;

public interface CartRepository extends JpaRepository<Cart, Long> {

    Optional<Cart> findByUserId(Long userId);

    @EntityGraph(attributePaths = {"items", "items.product"})
    Optional<Cart> findWithItemsByUserId(Long userId);

    boolean existsByUserId(Long userId);
}
