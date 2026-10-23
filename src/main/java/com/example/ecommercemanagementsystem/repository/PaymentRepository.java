
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.Payment;
import com.example.ecommercemanagementsystem.enums.PaymentMethod;
import com.example.ecommercemanagementsystem.enums.PaymentStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByOrderId(Long orderId);

    Optional<Payment> findByOrderIdAndOrderUserId(Long orderId, Long userId);

    boolean existsByOrderId(Long orderId);

    List<Payment> findByStatus(PaymentStatus status);

    List<Payment> findByMethod(PaymentMethod method);

    long countByStatus(PaymentStatus status);
}
