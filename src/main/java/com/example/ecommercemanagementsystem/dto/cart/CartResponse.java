
package com.example.ecommercemanagementsystem.dto.cart;

import com.example.ecommercemanagementsystem.entity.Cart;
import com.example.ecommercemanagementsystem.entity.CartItem;

import java.math.BigDecimal;
import java.util.List;

public record CartResponse(
        Long id,
        Long userId,
        List<CartItemResponse> items,
        BigDecimal totalAmount,
        int totalItems
) {

    public record CartItemResponse(
            Long id,
            Long productId,
            String productName,
            String imageUrl,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal subtotal
    ) {

        public static CartItemResponse fromEntity(CartItem item) {
            BigDecimal price = item.getProduct().getPrice();

            return new CartItemResponse(
                    item.getId(),
                    item.getProduct().getId(),
                    item.getProduct().getName(),
                    item.getProduct().getImageUrl(),
                    price,
                    item.getQuantity(),
                    price.multiply(BigDecimal.valueOf(item.getQuantity()))
            );
        }
    }

    public static CartResponse fromEntity(Cart cart) {
        List<CartItemResponse> items = cart.getItems()
                .stream()
                .map(CartItemResponse::fromEntity)
                .toList();

        BigDecimal totalAmount = items.stream()
                .map(CartItemResponse::subtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        int totalItems = items.stream()
                .mapToInt(CartItemResponse::quantity)
                .sum();

        return new CartResponse(
                cart.getId(),
                cart.getUser().getId(),
                items,
                totalAmount,
                totalItems
        );
    }
}
