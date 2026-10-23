
package com.example.ecommercemanagementsystem.decorator;

import java.math.BigDecimal;
import java.util.List;

public interface OrderComponent {

    BigDecimal getTotalPrice();

    List<Extra> getExtras();

    record Extra(String name, BigDecimal price) {

        public Extra {
            if (name == null || name.isBlank()) {
                throw new IllegalArgumentException(
                        "Extra name cannot be empty"
                );
            }

            if (price == null || price.signum() <= 0) {
                throw new IllegalArgumentException(
                        "Extra price must be greater than zero"
                );
            }

            name = name.trim();
        }
    }
}
