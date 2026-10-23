
package com.example.ecommercemanagementsystem.decorator;

import java.math.BigDecimal;

public final class ExtendedWarrantyDecorator extends OrderDecorator {

    private static final BigDecimal EXTENDED_WARRANTY_PRICE =
            new BigDecimal("5000.00");

    public ExtendedWarrantyDecorator(OrderComponent order) {
        super(order, "Extended Warranty", EXTENDED_WARRANTY_PRICE);
    }
}
