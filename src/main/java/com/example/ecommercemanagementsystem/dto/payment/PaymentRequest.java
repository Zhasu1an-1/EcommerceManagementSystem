
package com.example.ecommercemanagementsystem.dto.payment;

import com.example.ecommercemanagementsystem.enums.PaymentMethod;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record PaymentRequest(

        @NotNull(message = "Order ID is required")
        @Positive(message = "Order ID must be positive")
        Long orderId,

        @NotNull(message = "Payment method is required")
        PaymentMethod method

) {
}
