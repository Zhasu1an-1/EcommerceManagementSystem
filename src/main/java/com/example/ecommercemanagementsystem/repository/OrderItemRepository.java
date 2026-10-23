
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    List<OrderItem> findByOrderId(Long orderId);

    List<OrderItem> findByOrderIdAndOrderUserId(Long orderId, Long userId);

    List<OrderItem> findByProductId(Long productId);

    boolean existsByOrderIdAndProductId(Long orderId, Long productId);

    long countByOrderId(Long orderId);
}
