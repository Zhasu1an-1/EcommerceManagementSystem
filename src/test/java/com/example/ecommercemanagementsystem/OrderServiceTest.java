package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.dto.order.CheckoutRequest;
import com.example.ecommercemanagementsystem.dto.order.OrderResponse;
import com.example.ecommercemanagementsystem.dto.order.UpdateOrderStatusRequest;
import com.example.ecommercemanagementsystem.entity.Cart;
import com.example.ecommercemanagementsystem.entity.CartItem;
import com.example.ecommercemanagementsystem.entity.Category;
import com.example.ecommercemanagementsystem.entity.Order;
import com.example.ecommercemanagementsystem.entity.Product;
import com.example.ecommercemanagementsystem.entity.Promotion;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.DiscountType;
import com.example.ecommercemanagementsystem.enums.OrderStatus;
import com.example.ecommercemanagementsystem.enums.Role;
import com.example.ecommercemanagementsystem.repository.CartRepository;
import com.example.ecommercemanagementsystem.repository.OrderRepository;
import com.example.ecommercemanagementsystem.repository.PromotionRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.OrderService;
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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    private static final Long USER_ID = 1L;

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private CartRepository cartRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private PromotionRepository promotionRepository;

    @Mock
    private EntityManager entityManager;

    private OrderService orderService;
    private User user;
    private Cart cart;
    private Product product;

    @BeforeEach
    void setUp() {
        orderService = new OrderService(
                orderRepository, cartRepository, userRepository, promotionRepository, entityManager);

        user = new User("Test", "test@example.com", "hash", Role.CUSTOMER);
        user.setId(USER_ID);

        cart = new Cart(user);
        cart.setId(10L);

        Category category = new Category("Phones");
        category.setId(2L);

        product = new Product("Phone", "desc", new BigDecimal("10000.00"), 5, null, category);
        product.setId(7L);

        lenient().when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        lenient().when(cartRepository.findWithItemsByUserId(USER_ID)).thenReturn(Optional.of(cart));
        lenient().when(entityManager.find(Product.class, 7L, LockModeType.PESSIMISTIC_WRITE))
                .thenReturn(product);
        lenient().when(orderRepository.saveAndFlush(any(Order.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    private void putInCart(int quantity) {
        cart.addItem(new CartItem(cart, product, quantity));
    }

    @Test
    @DisplayName("Checkout creates a PENDING order, reduces stock and empties the cart")
    void checkoutCreatesOrder() {
        putInCart(2);

        OrderResponse response = orderService.checkout(
                USER_ID, new CheckoutRequest("Almaty, Abay 1", null, false, false, false));

        assertEquals(OrderStatus.PENDING, response.status());
        assertEquals(0, new BigDecimal("20000.00").compareTo(response.totalAmount()));
        assertEquals(3, product.getStock());
        assertTrue(cart.getItems().isEmpty());
        assertTrue(response.extras().isEmpty());
    }

    @Test
    @DisplayName("Checkout applies promotion and decorator extras to the total")
    void checkoutAppliesPromotionAndExtras() {
        putInCart(2);
        Promotion promotion = new Promotion("SALE10", DiscountType.PERCENTAGE, new BigDecimal("10"));
        when(promotionRepository.findByCodeIgnoreCaseAndActiveTrue("SALE10"))
                .thenReturn(Optional.of(promotion));

        OrderResponse response = orderService.checkout(
                USER_ID, new CheckoutRequest("Almaty, Abay 1", "SALE10", true, true, true));

        // 20000 - 10% = 18000, + 1500 gift + 3000 express + 5000 warranty = 27500
        assertEquals(0, new BigDecimal("27500.00").compareTo(response.totalAmount()));
        assertEquals(3, response.extras().size());
        assertEquals("SALE10", response.promotionCode());
    }

    @Test
    @DisplayName("Checkout with an empty cart is rejected")
    void emptyCartIsRejected() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> orderService.checkout(
                        USER_ID, new CheckoutRequest("Almaty", null, false, false, false)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        verify(orderRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("Checkout without shipping address is rejected")
    void blankAddressIsRejected() {
        putInCart(1);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> orderService.checkout(
                        USER_ID, new CheckoutRequest("  ", null, false, false, false)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    @DisplayName("Checkout fails when the stock became insufficient")
    void insufficientStockIsRejected() {
        putInCart(2);
        product.setStock(1);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> orderService.checkout(
                        USER_ID, new CheckoutRequest("Almaty", null, false, false, false)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        assertEquals(1, product.getStock());
    }

    @Test
    @DisplayName("Invalid promotion code is rejected")
    void invalidPromotionIsRejected() {
        putInCart(1);
        when(promotionRepository.findByCodeIgnoreCaseAndActiveTrue("NOPE"))
                .thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> orderService.checkout(
                        USER_ID, new CheckoutRequest("Almaty", "NOPE", false, false, false)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    @DisplayName("PENDING order cannot jump directly to DELIVERED")
    void invalidStatusTransitionIsRejected() {
        Order order = new Order();
        order.setId(50L);
        order.setUser(user);
        order.setStatus(OrderStatus.PENDING);
        when(entityManager.find(Order.class, 50L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(order);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> orderService.updateOrderStatus(
                        50L, new UpdateOrderStatusRequest(OrderStatus.DELIVERED)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    @DisplayName("Cancelling a pending order restores the stock")
    void cancelRestoresStock() {
        Order order = new Order();
        order.setId(51L);
        order.setUser(user);
        order.setStatus(OrderStatus.PENDING);
        com.example.ecommercemanagementsystem.entity.OrderItem item =
                new com.example.ecommercemanagementsystem.entity.OrderItem();
        item.setProduct(product);
        item.setQuantity(2);
        item.setUnitPrice(product.getPrice());
        order.addItem(item);

        when(entityManager.find(Order.class, 51L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(order);
        when(orderRepository.save(any(Order.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        OrderResponse response = orderService.cancelOrder(51L, USER_ID);

        assertEquals(OrderStatus.CANCELLED, response.status());
        assertEquals(7, product.getStock());
    }

    @Test
    @DisplayName("A user cannot cancel someone else's order")
    void cannotCancelForeignOrder() {
        Order order = new Order();
        order.setId(52L);
        order.setUser(user);
        when(entityManager.find(Order.class, 52L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(order);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> orderService.cancelOrder(52L, 999L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }
}
