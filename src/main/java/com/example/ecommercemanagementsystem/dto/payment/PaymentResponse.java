
package com.example.ecommercemanagementsystem.dto.payment;

import com.example.ecommercemanagementsystem.entity.Payment;
import com.example.ecommercemanagementsystem.enums.PaymentMethod;
import com.example.ecommercemanagementsystem.enums.PaymentStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PaymentResponse(
        Long id,
        Long orderId,
        PaymentMethod method,
        PaymentStatus status,
        BigDecimal amount,
        LocalDateTime createdAt,
        LocalDateTime paidAt
) {

    public static PaymentResponse fromEntity(Payment payment) {
        return new PaymentResponse(
                payment.getId(),
                payment.getOrder().getId(),
                payment.getMethod(),
                payment.getStatus(),
                payment.getAmount(),
                payment.getCreatedAt(),
                payment.getPaidAt()
        );
    }
}
