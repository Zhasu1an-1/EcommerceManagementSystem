package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.decorator.BasicOrder;
import com.example.ecommercemanagementsystem.decorator.ExpressDeliveryDecorator;
import com.example.ecommercemanagementsystem.decorator.ExtendedWarrantyDecorator;
import com.example.ecommercemanagementsystem.decorator.GiftWrappingDecorator;
import com.example.ecommercemanagementsystem.decorator.OrderComponent;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Decorator pattern tests: every decorator wraps an {@link OrderComponent}
 * and adds a priced extra without modifying {@link BasicOrder}.
 */
class OrderDecoratorTest {

    private static final BigDecimal BASE = new BigDecimal("10000.00");

    @Test
    @DisplayName("Basic order has its base price and no extras")
    void basicOrderHasNoExtras() {
        OrderComponent order = new BasicOrder(BASE);

        assertEquals(0, BASE.compareTo(order.getTotalPrice()));
        assertTrue(order.getExtras().isEmpty());
    }

    @Test
    @DisplayName("Gift wrapping adds 1500 and one extra")
    void giftWrappingAddsPrice() {
        OrderComponent order = new GiftWrappingDecorator(new BasicOrder(BASE));

        assertEquals(0, new BigDecimal("11500.00").compareTo(order.getTotalPrice()));
        assertEquals(1, order.getExtras().size());
        assertEquals("Gift Wrapping", order.getExtras().get(0).name());
    }

    @Test
    @DisplayName("Express delivery adds 3000")
    void expressDeliveryAddsPrice() {
        OrderComponent order = new ExpressDeliveryDecorator(new BasicOrder(BASE));

        assertEquals(0, new BigDecimal("13000.00").compareTo(order.getTotalPrice()));
        assertEquals("Express Delivery", order.getExtras().get(0).name());
    }

    @Test
    @DisplayName("Extended warranty adds 5000")
    void extendedWarrantyAddsPrice() {
        OrderComponent order = new ExtendedWarrantyDecorator(new BasicOrder(BASE));

        assertEquals(0, new BigDecimal("15000.00").compareTo(order.getTotalPrice()));
        assertEquals("Extended Warranty", order.getExtras().get(0).name());
    }

    @Test
    @DisplayName("Several decorators can be combined and prices accumulate")
    void decoratorsCanBeCombined() {
        OrderComponent order = new ExtendedWarrantyDecorator(
                new ExpressDeliveryDecorator(
                        new GiftWrappingDecorator(
                                new BasicOrder(BASE))));

        assertEquals(0, new BigDecimal("19500.00").compareTo(order.getTotalPrice()));

        List<String> names = order.getExtras().stream()
                .map(OrderComponent.Extra::name)
                .toList();
        assertEquals(List.of("Gift Wrapping", "Express Delivery", "Extended Warranty"), names);
    }

    @Test
    @DisplayName("Combination order does not change the total")
    void combinationOrderDoesNotChangeTotal() {
        OrderComponent a = new GiftWrappingDecorator(
                new ExpressDeliveryDecorator(new BasicOrder(BASE)));
        OrderComponent b = new ExpressDeliveryDecorator(
                new GiftWrappingDecorator(new BasicOrder(BASE)));

        assertEquals(0, a.getTotalPrice().compareTo(b.getTotalPrice()));
    }

    @Test
    @DisplayName("Decorating does not modify the original component")
    void originalComponentIsNotModified() {
        OrderComponent original = new BasicOrder(BASE);

        new GiftWrappingDecorator(new ExpressDeliveryDecorator(original));

        assertEquals(0, BASE.compareTo(original.getTotalPrice()));
        assertTrue(original.getExtras().isEmpty());
    }

    @Test
    @DisplayName("Returned extras list is immutable")
    void extrasListIsImmutable() {
        OrderComponent order = new GiftWrappingDecorator(new BasicOrder(BASE));

        assertThrows(UnsupportedOperationException.class,
                () -> order.getExtras().clear());
    }

    @Test
    @DisplayName("Decorator cannot wrap null")
    void decoratorRejectsNull() {
        assertThrows(NullPointerException.class, () -> new GiftWrappingDecorator(null));
        assertThrows(NullPointerException.class, () -> new ExpressDeliveryDecorator(null));
        assertThrows(NullPointerException.class, () -> new ExtendedWarrantyDecorator(null));
    }

    @Test
    @DisplayName("Basic order rejects null and negative base price")
    void basicOrderRejectsInvalidPrice() {
        assertThrows(IllegalArgumentException.class, () -> new BasicOrder(null));
        assertThrows(IllegalArgumentException.class,
                () -> new BasicOrder(new BigDecimal("-1")));
    }

    @Test
    @DisplayName("Extra record validates name and price")
    void extraRejectsInvalidData() {
        assertThrows(IllegalArgumentException.class,
                () -> new OrderComponent.Extra(" ", BigDecimal.ONE));
        assertThrows(IllegalArgumentException.class,
                () -> new OrderComponent.Extra("Bag", BigDecimal.ZERO));
        assertThrows(IllegalArgumentException.class,
                () -> new OrderComponent.Extra("Bag", null));
    }

    @Test
    @DisplayName("A new custom decorator works without changing existing classes")
    void customDecoratorWorksWithoutChangingOthers() {
        OrderComponent custom = new OrderComponent() {
            private final OrderComponent inner = new BasicOrder(BASE);

            @Override
            public BigDecimal getTotalPrice() {
                return inner.getTotalPrice().add(new BigDecimal("700.00"));
            }

            @Override
            public List<Extra> getExtras() {
                return List.of(new Extra("Insurance", new BigDecimal("700.00")));
            }
        };

        OrderComponent combined = new GiftWrappingDecorator(custom);

        assertEquals(0, new BigDecimal("12200.00").compareTo(combined.getTotalPrice()));
        assertEquals(2, combined.getExtras().size());
    }
}
