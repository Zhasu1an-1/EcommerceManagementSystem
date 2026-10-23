
package com.example.ecommercemanagementsystem.dto.order;

import com.example.ecommercemanagementsystem.enums.OrderStatus;
import jakarta.validation.constraints.NotNull;

public record UpdateOrderStatusRequest(

        @NotNull(message = "Order status is required")
        OrderStatus status

) {
}
