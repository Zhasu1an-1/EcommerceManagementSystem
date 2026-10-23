
package com.example.ecommercemanagementsystem.strategy;

import com.example.ecommercemanagementsystem.enums.PaymentMethod;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class KaspiPaymentStrategy implements PaymentStrategy {

    @Override
    public PaymentMethod getPaymentMethod() {
        return PaymentMethod.KASPI;
    }

    @Override
    public boolean pay(BigDecimal amount) {
        if (amount == null || amount.signum() < 0) {
            throw new IllegalArgumentException(
                    "Payment amount cannot be null or negative"
            );
        }

        System.out.println("Processing Kaspi payment: " + amount + " KZT");

        return true;
    }
}
