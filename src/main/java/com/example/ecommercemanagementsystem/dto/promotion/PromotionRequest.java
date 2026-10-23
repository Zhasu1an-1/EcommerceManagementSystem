
package com.example.ecommercemanagementsystem.dto.promotion;

import com.example.ecommercemanagementsystem.enums.DiscountType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record PromotionRequest(

        @NotBlank(message = "Promotion code is required")
        @Size(min = 3, max = 50, message = "Promotion code must contain between 3 and 50 characters")
        String code,

        @NotNull(message = "Discount type is required")
        DiscountType discountType,

        @NotNull(message = "Discount value is required")
        @DecimalMin(value = "0.01", message = "Discount value must be greater than zero")
        BigDecimal value,

        boolean active

) {
}
