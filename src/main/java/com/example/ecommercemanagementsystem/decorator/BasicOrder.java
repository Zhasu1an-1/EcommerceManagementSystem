
package com.example.ecommercemanagementsystem.decorator;

import java.math.BigDecimal;
import java.util.List;

public final class BasicOrder implements OrderComponent {

    private final BigDecimal basePrice;

    public BasicOrder(BigDecimal basePrice) {
        if (basePrice == null || basePrice.signum() < 0) {
            throw new IllegalArgumentException(
                    "Base price cannot be null or negative"
            );
        }

        this.basePrice = basePrice;
    }

    @Override
    public BigDecimal getTotalPrice() {
        return basePrice;
    }

    @Override
    public List<Extra> getExtras() {
        return List.of();
    }
}
