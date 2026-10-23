
package com.example.ecommercemanagementsystem.decorator;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public abstract class OrderDecorator implements OrderComponent {

    private final OrderComponent wrappedOrder;
    private final Extra extra;

    protected OrderDecorator(
            OrderComponent wrappedOrder,
            String extraName,
            BigDecimal extraPrice
    ) {
        this.wrappedOrder = Objects.requireNonNull(
                wrappedOrder,
                "Wrapped order cannot be null"
        );

        this.extra = new Extra(extraName, extraPrice);
    }

    @Override
    public final BigDecimal getTotalPrice() {
        return wrappedOrder.getTotalPrice().add(extra.price());
    }

    @Override
    public final List<Extra> getExtras() {
        List<Extra> extras = new ArrayList<>(wrappedOrder.getExtras());
        extras.add(extra);

        return List.copyOf(extras);
    }
}
