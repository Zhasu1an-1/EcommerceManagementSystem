
package com.example.ecommercemanagementsystem.dto.order;

import com.example.ecommercemanagementsystem.entity.Order;
import com.example.ecommercemanagementsystem.entity.OrderItem;
import com.example.ecommercemanagementsystem.entity.OrderExtra;
import com.example.ecommercemanagementsystem.enums.OrderStatus;
import com.example.ecommercemanagementsystem.enums.PaymentStatus;
import com.example.ecommercemanagementsystem.enums.PaymentMethod;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record OrderResponse(
        Long id,
        Long userId,
        String shippingAddress,
        OrderStatus status,
        BigDecimal totalAmount,
        String promotionCode,
        PaymentMethod paymentMethod,
        PaymentStatus paymentStatus,
        LocalDateTime createdAt,
        List<OrderItemResponse> items,
        List<OrderExtraResponse> extras
) {

    public record OrderItemResponse(
            Long id,
            Long productId,
            String productName,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal subtotal
    ) {

        public static OrderItemResponse fromEntity(OrderItem item) {
            return new OrderItemResponse(
                    item.getId(),
                    item.getProduct().getId(),
                    item.getProduct().getName(),
                    item.getQuantity(),
                    item.getUnitPrice(),
                    item.getSubtotal()
            );
        }
    }

    public record OrderExtraResponse(
            Long id,
            String name,
            BigDecimal price
    ) {

        public static OrderExtraResponse fromEntity(OrderExtra extra) {
            return new OrderExtraResponse(
                    extra.getId(),
                    extra.getName(),
                    extra.getPrice()
            );
        }
    }

    public static OrderResponse fromEntity(Order order) {
        List<OrderItemResponse> items = order.getItems()
                .stream()
                .map(OrderItemResponse::fromEntity)
                .toList();

        List<OrderExtraResponse> extras = order.getExtras()
                .stream()
                .map(OrderExtraResponse::fromEntity)
                .toList();

        return new OrderResponse(
                order.getId(),
                order.getUser().getId(),
                order.getShippingAddress(),
                order.getStatus(),
                order.getTotalAmount(),
                order.getPromotion() != null
                        ? order.getPromotion().getCode()
                        : null,
                order.getPayment() != null
                        ? order.getPayment().getMethod()
                        : null,
                order.getPayment() != null
                        ? order.getPayment().getStatus()
                        : null,
                order.getCreatedAt(),
                items,
                extras
        );
    }
}
