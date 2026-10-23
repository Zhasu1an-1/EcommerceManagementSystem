
package com.example.ecommercemanagementsystem.dto.order;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CheckoutRequest(

        @NotBlank(message = "Shipping address is required")
        @Size(max = 500, message = "Shipping address cannot exceed 500 characters")
        String shippingAddress,

        String promotionCode,

        boolean giftWrapping,

        boolean expressDelivery,

        boolean extendedWarranty

) {
}
