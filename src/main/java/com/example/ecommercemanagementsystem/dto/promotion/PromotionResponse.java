
package com.example.ecommercemanagementsystem.dto.promotion;

import com.example.ecommercemanagementsystem.entity.Promotion;
import com.example.ecommercemanagementsystem.enums.DiscountType;

import java.math.BigDecimal;

public record PromotionResponse(
        Long id,
        String code,
        DiscountType discountType,
        BigDecimal value,
        boolean active
) {

    public static PromotionResponse fromEntity(Promotion promotion) {
        return new PromotionResponse(
                promotion.getId(),
                promotion.getCode(),
                promotion.getDiscountType(),
                promotion.getValue(),
                promotion.isActive()
        );
    }
}
