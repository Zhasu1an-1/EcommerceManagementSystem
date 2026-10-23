
package com.example.ecommercemanagementsystem.decorator;

import java.math.BigDecimal;

public final class ExpressDeliveryDecorator extends OrderDecorator {

    private static final BigDecimal EXPRESS_DELIVERY_PRICE =
            new BigDecimal("3000.00");

    public ExpressDeliveryDecorator(OrderComponent order) {
        super(order, "Express Delivery", EXPRESS_DELIVERY_PRICE);
    }
}
