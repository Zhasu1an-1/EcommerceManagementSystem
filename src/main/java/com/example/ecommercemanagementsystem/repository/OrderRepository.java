
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.Order;
import com.example.ecommercemanagementsystem.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {

    Page<Order> findByUserId(Long userId, Pageable pageable);

    Page<Order> findByStatus(OrderStatus status, Pageable pageable);

    Page<Order> findByUserIdAndStatus(
            Long userId,
            OrderStatus status,
            Pageable pageable
    );

    @EntityGraph(attributePaths = {"items", "items.product", "extras", "promotion"})
    Optional<Order> findWithDetailsById(Long id);

    @EntityGraph(attributePaths = {"items", "items.product", "extras", "promotion"})
    Optional<Order> findWithDetailsByIdAndUserId(Long id, Long userId);

    boolean existsByIdAndUserId(Long id, Long userId);

    long countByStatus(OrderStatus status);
}
