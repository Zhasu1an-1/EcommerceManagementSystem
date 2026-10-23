
package com.example.ecommercemanagementsystem.decorator;

import java.math.BigDecimal;

public final class GiftWrappingDecorator extends OrderDecorator {

    private static final BigDecimal GIFT_WRAPPING_PRICE =
            new BigDecimal("1500.00");

    public GiftWrappingDecorator(OrderComponent order) {
        super(order, "Gift Wrapping", GIFT_WRAPPING_PRICE);
    }
}
