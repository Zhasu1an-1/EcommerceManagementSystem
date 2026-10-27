package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.enums.PaymentMethod;
import com.example.ecommercemanagementsystem.strategy.CardPaymentStrategy;
import com.example.ecommercemanagementsystem.strategy.KaspiPaymentStrategy;
import com.example.ecommercemanagementsystem.strategy.PayPalPaymentStrategy;
import com.example.ecommercemanagementsystem.strategy.PaymentStrategy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Strategy pattern tests: every concrete strategy is used only through the
 * {@link PaymentStrategy} interface.
 */
class PaymentStrategyTest {

    private final List<PaymentStrategy> strategies = List.of(
            new CardPaymentStrategy(),
            new KaspiPaymentStrategy(),
            new PayPalPaymentStrategy()
    );

    @Test
    @DisplayName("Each concrete strategy reports its own payment method")
    void eachStrategyReportsItsMethod() {
        assertEquals(PaymentMethod.CARD, new CardPaymentStrategy().getPaymentMethod());
        assertEquals(PaymentMethod.KASPI, new KaspiPaymentStrategy().getPaymentMethod());
        assertEquals(PaymentMethod.PAYPAL, new PayPalPaymentStrategy().getPaymentMethod());
    }

    @Test
    @DisplayName("All strategies are interchangeable and accept a valid amount")
    void allStrategiesAcceptValidAmount() {
        for (PaymentStrategy strategy : strategies) {
            assertTrue(strategy.pay(new BigDecimal("15000.00")),
                    strategy.getPaymentMethod() + " should succeed");
        }
    }

    @Test
    @DisplayName("Zero amount is allowed")
    void zeroAmountIsAllowed() {
        for (PaymentStrategy strategy : strategies) {
            assertTrue(strategy.pay(BigDecimal.ZERO));
        }
    }

    @Test
    @DisplayName("Negative amount is rejected by every strategy")
    void negativeAmountIsRejected() {
        for (PaymentStrategy strategy : strategies) {
            assertThrows(IllegalArgumentException.class,
                    () -> strategy.pay(new BigDecimal("-1")));
        }
    }

    @Test
    @DisplayName("Null amount is rejected by every strategy")
    void nullAmountIsRejected() {
        for (PaymentStrategy strategy : strategies) {
            assertThrows(IllegalArgumentException.class, () -> strategy.pay(null));
        }
    }

    @Test
    @DisplayName("Strategy is selected at runtime by payment method")
    void strategyIsSelectedAtRuntime() {
        Map<PaymentMethod, PaymentStrategy> registry = new EnumMap<>(PaymentMethod.class);
        strategies.forEach(s -> registry.put(s.getPaymentMethod(), s));

        for (PaymentMethod method : PaymentMethod.values()) {
            PaymentStrategy chosen = registry.get(method);
            assertEquals(method, chosen.getPaymentMethod());
            assertTrue(chosen.pay(BigDecimal.TEN));
        }
    }

    @Test
    @DisplayName("A new strategy can replace an old one without changing the client code")
    void newStrategyNeedsNoClientChanges() {
        // client code: knows only the interface
        PaymentStrategy declining = new PaymentStrategy() {
            @Override
            public PaymentMethod getPaymentMethod() {
                return PaymentMethod.CARD;
            }

            @Override
            public boolean pay(BigDecimal amount) {
                return false;
            }
        };

        assertEquals(PaymentMethod.CARD, declining.getPaymentMethod());
        assertEquals(false, declining.pay(BigDecimal.ONE));
    }
}
