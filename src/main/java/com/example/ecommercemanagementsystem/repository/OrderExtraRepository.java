
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.OrderExtra;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OrderExtraRepository extends JpaRepository<OrderExtra, Long> {

    List<OrderExtra> findByOrderId(Long orderId);

    List<OrderExtra> findByOrderIdAndOrderUserId(Long orderId, Long userId);

    boolean existsByOrderIdAndNameIgnoreCase(Long orderId, String name);

    long countByOrderId(Long orderId);
}
