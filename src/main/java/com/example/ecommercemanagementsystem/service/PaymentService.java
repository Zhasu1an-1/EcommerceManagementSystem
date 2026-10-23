
package com.example.ecommercemanagementsystem.service;

import com.example.ecommercemanagementsystem.dto.payment.PaymentRequest;
import com.example.ecommercemanagementsystem.dto.payment.PaymentResponse;
import com.example.ecommercemanagementsystem.entity.Order;
import com.example.ecommercemanagementsystem.entity.Payment;
import com.example.ecommercemanagementsystem.enums.OrderStatus;
import com.example.ecommercemanagementsystem.enums.PaymentMethod;
import com.example.ecommercemanagementsystem.enums.PaymentStatus;
import com.example.ecommercemanagementsystem.repository.PaymentRepository;
import com.example.ecommercemanagementsystem.strategy.PaymentStrategy;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final EntityManager entityManager;
    private final Map<PaymentMethod, PaymentStrategy> paymentStrategies;

    public PaymentService(
            PaymentRepository paymentRepository,
            EntityManager entityManager,
            List<PaymentStrategy> strategies
    ) {
        this.paymentRepository = paymentRepository;
        this.entityManager = entityManager;
        this.paymentStrategies = new EnumMap<>(PaymentMethod.class);

        for (PaymentStrategy strategy : strategies) {
            PaymentStrategy existing = paymentStrategies.putIfAbsent(
                    strategy.getPaymentMethod(),
                    strategy
            );

            if (existing != null) {
                throw new IllegalStateException(
                        "Duplicate payment strategy: "
                                + strategy.getPaymentMethod()
                );
            }
        }

        for (PaymentMethod method : PaymentMethod.values()) {
            if (!paymentStrategies.containsKey(method)) {
                throw new IllegalStateException(
                        "Missing payment strategy: " + method
                );
            }
        }
    }

    @Transactional
    public PaymentResponse processPayment(
            Long userId,
            PaymentRequest request
    ) {
        if (userId == null || request == null
                || request.orderId() == null
                || request.orderId() <= 0
                || request.method() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid payment request"
            );
        }

        Order order = entityManager.find(
                Order.class,
                request.orderId(),
                LockModeType.PESSIMISTIC_WRITE
        );

        if (order == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Order not found"
            );
        }

        if (!order.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Order not found"
            );
        }

        Payment payment = paymentRepository
                .findByOrderId(order.getId())
                .orElse(null);

        if (payment != null
                && payment.getStatus() == PaymentStatus.SUCCESS) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Order has already been paid"
            );
        }

        if (order.getStatus() != OrderStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only pending orders can be paid"
            );
        }

        PaymentStrategy strategy = paymentStrategies.get(request.method());

        if (strategy == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Unsupported payment method"
            );
        }

        if (payment == null) {
            payment = new Payment();
            payment.setOrder(order);
        }

        payment.setMethod(request.method());
        payment.setAmount(order.getTotalAmount());
        payment.setStatus(PaymentStatus.PENDING);

        boolean successful;

        try {
            successful = strategy.pay(payment.getAmount());
        } catch (RuntimeException exception) {
            successful = false;
        }

        if (successful) {
            payment.markAsSuccessful();
            order.setStatus(OrderStatus.CONFIRMED);
        } else {
            payment.markAsFailed();
        }

        Payment savedPayment = paymentRepository.saveAndFlush(payment);

        order.setPayment(savedPayment);

        entityManager.flush();

        return PaymentResponse.fromEntity(savedPayment);
    }

    @Transactional(readOnly = true)
    public PaymentResponse getPaymentByOrderId(
            Long orderId,
            Long userId
    ) {
        Payment payment = paymentRepository
                .findByOrderIdAndOrderUserId(orderId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Payment not found"
                ));

        return PaymentResponse.fromEntity(payment);
    }

    @Transactional(readOnly = true)
    public PaymentResponse getPaymentById(Long paymentId) {
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Payment not found"
                ));

        return PaymentResponse.fromEntity(payment);
    }
}
