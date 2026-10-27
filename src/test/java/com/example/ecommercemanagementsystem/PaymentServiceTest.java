package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.dto.payment.PaymentRequest;
import com.example.ecommercemanagementsystem.dto.payment.PaymentResponse;
import com.example.ecommercemanagementsystem.entity.Order;
import com.example.ecommercemanagementsystem.entity.Payment;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.OrderStatus;
import com.example.ecommercemanagementsystem.enums.PaymentMethod;
import com.example.ecommercemanagementsystem.enums.PaymentStatus;
import com.example.ecommercemanagementsystem.enums.Role;
import com.example.ecommercemanagementsystem.repository.PaymentRepository;
import com.example.ecommercemanagementsystem.service.PaymentService;
import com.example.ecommercemanagementsystem.strategy.CardPaymentStrategy;
import com.example.ecommercemanagementsystem.strategy.KaspiPaymentStrategy;
import com.example.ecommercemanagementsystem.strategy.PayPalPaymentStrategy;
import com.example.ecommercemanagementsystem.strategy.PaymentStrategy;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    private static final Long USER_ID = 1L;
    private static final Long ORDER_ID = 10L;

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private EntityManager entityManager;

    private Order order;

    @BeforeEach
    void setUp() {
        User user = new User("Test", "test@example.com", "hash", Role.CUSTOMER);
        user.setId(USER_ID);

        order = new Order();
        order.setId(ORDER_ID);
        order.setUser(user);
        order.setStatus(OrderStatus.PENDING);
        order.setTotalAmount(new BigDecimal("25000.00"));

        lenient().when(entityManager.find(Order.class, ORDER_ID, LockModeType.PESSIMISTIC_WRITE))
                .thenReturn(order);
        lenient().when(paymentRepository.findByOrderId(ORDER_ID)).thenReturn(Optional.empty());
        lenient().when(paymentRepository.saveAndFlush(any(Payment.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    private PaymentService defaultService() {
        return new PaymentService(paymentRepository, entityManager, List.of(
                new CardPaymentStrategy(), new KaspiPaymentStrategy(), new PayPalPaymentStrategy()));
    }

    @Test
    @DisplayName("Successful payment marks payment SUCCESS and confirms the order")
    void successfulPaymentConfirmsOrder() {
        PaymentResponse response = defaultService()
                .processPayment(USER_ID, new PaymentRequest(ORDER_ID, PaymentMethod.KASPI));

        assertEquals(PaymentStatus.SUCCESS, response.status());
        assertEquals(PaymentMethod.KASPI, response.method());
        assertEquals(OrderStatus.CONFIRMED, order.getStatus());
    }

    @Test
    @DisplayName("Each payment method is routed to its own strategy")
    void methodIsRoutedToItsStrategy() {
        for (PaymentMethod method : PaymentMethod.values()) {
            order.setStatus(OrderStatus.PENDING);

            PaymentResponse response = defaultService()
                    .processPayment(USER_ID, new PaymentRequest(ORDER_ID, method));

            assertEquals(method, response.method());
            assertEquals(PaymentStatus.SUCCESS, response.status());
        }
    }

    @Test
    @DisplayName("Replacing a strategy changes behaviour without changing PaymentService")
    void replacedStrategyChangesBehaviour() {
        PaymentStrategy declinedCard = new PaymentStrategy() {
            @Override
            public PaymentMethod getPaymentMethod() {
                return PaymentMethod.CARD;
            }

            @Override
            public boolean pay(BigDecimal amount) {
                return false;
            }
        };

        PaymentService service = new PaymentService(paymentRepository, entityManager, List.of(
                declinedCard, new KaspiPaymentStrategy(), new PayPalPaymentStrategy()));

        PaymentResponse response = service
                .processPayment(USER_ID, new PaymentRequest(ORDER_ID, PaymentMethod.CARD));

        assertEquals(PaymentStatus.FAILED, response.status());
        assertEquals(OrderStatus.PENDING, order.getStatus());
    }

    @Test
    @DisplayName("A strategy that throws results in a FAILED payment")
    void throwingStrategyResultsInFailedPayment() {
        PaymentStrategy broken = new PaymentStrategy() {
            @Override
            public PaymentMethod getPaymentMethod() {
                return PaymentMethod.PAYPAL;
            }

            @Override
            public boolean pay(BigDecimal amount) {
                throw new IllegalStateException("gateway down");
            }
        };

        PaymentService service = new PaymentService(paymentRepository, entityManager, List.of(
                new CardPaymentStrategy(), new KaspiPaymentStrategy(), broken));

        PaymentResponse response = service
                .processPayment(USER_ID, new PaymentRequest(ORDER_ID, PaymentMethod.PAYPAL));

        assertEquals(PaymentStatus.FAILED, response.status());
    }

    @Test
    @DisplayName("Service refuses to start when a strategy is missing")
    void missingStrategyIsRejected() {
        List<PaymentStrategy> incomplete = List.of(
                new CardPaymentStrategy(), new KaspiPaymentStrategy());

        assertThrows(IllegalStateException.class,
                () -> new PaymentService(paymentRepository, entityManager, incomplete));
    }

    @Test
    @DisplayName("Service refuses to start when two strategies share one method")
    void duplicateStrategyIsRejected() {
        List<PaymentStrategy> duplicated = List.of(
                new CardPaymentStrategy(), new CardPaymentStrategy(),
                new KaspiPaymentStrategy(), new PayPalPaymentStrategy());

        assertThrows(IllegalStateException.class,
                () -> new PaymentService(paymentRepository, entityManager, duplicated));
    }

    @Test
    @DisplayName("Missing payment method is rejected with 400")
    void nullMethodIsRejected() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> defaultService().processPayment(USER_ID, new PaymentRequest(ORDER_ID, null)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    @DisplayName("Paying for someone else's order gives 404")
    void foreignOrderGives404() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> defaultService().processPayment(
                        999L, new PaymentRequest(ORDER_ID, PaymentMethod.CARD)));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    @DisplayName("Paying for an unknown order gives 404")
    void unknownOrderGives404() {
        when(entityManager.find(Order.class, 404L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(null);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> defaultService().processPayment(
                        USER_ID, new PaymentRequest(404L, PaymentMethod.CARD)));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    @DisplayName("An already paid order cannot be paid twice")
    void alreadyPaidOrderGives409() {
        Payment paid = new Payment(order, PaymentMethod.CARD, order.getTotalAmount());
        paid.markAsSuccessful();
        when(paymentRepository.findByOrderId(ORDER_ID)).thenReturn(Optional.of(paid));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> defaultService().processPayment(
                        USER_ID, new PaymentRequest(ORDER_ID, PaymentMethod.CARD)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
    }

    @Test
    @DisplayName("Only pending orders can be paid")
    void nonPendingOrderIsRejected() {
        order.setStatus(OrderStatus.CANCELLED);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> defaultService().processPayment(
                        USER_ID, new PaymentRequest(ORDER_ID, PaymentMethod.CARD)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }
}
