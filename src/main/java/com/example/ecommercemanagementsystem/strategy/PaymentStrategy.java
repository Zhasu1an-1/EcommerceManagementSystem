
package com.example.ecommercemanagementsystem.strategy;

import com.example.ecommercemanagementsystem.enums.PaymentMethod;

import java.math.BigDecimal;

public interface PaymentStrategy {

    PaymentMethod getPaymentMethod();

    boolean pay(BigDecimal amount);
}
