
package com.example.ecommercemanagementsystem.service;

import com.example.ecommercemanagementsystem.decorator.BasicOrder;
import com.example.ecommercemanagementsystem.decorator.ExpressDeliveryDecorator;
import com.example.ecommercemanagementsystem.decorator.ExtendedWarrantyDecorator;
import com.example.ecommercemanagementsystem.decorator.GiftWrappingDecorator;
import com.example.ecommercemanagementsystem.decorator.OrderComponent;
import com.example.ecommercemanagementsystem.dto.order.CheckoutRequest;
import com.example.ecommercemanagementsystem.dto.order.OrderResponse;
import com.example.ecommercemanagementsystem.dto.order.UpdateOrderStatusRequest;
import com.example.ecommercemanagementsystem.entity.Cart;
import com.example.ecommercemanagementsystem.entity.CartItem;
import com.example.ecommercemanagementsystem.entity.Order;
import com.example.ecommercemanagementsystem.entity.OrderExtra;
import com.example.ecommercemanagementsystem.entity.OrderItem;
import com.example.ecommercemanagementsystem.entity.Product;
import com.example.ecommercemanagementsystem.entity.Promotion;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.OrderStatus;
import com.example.ecommercemanagementsystem.enums.PaymentStatus;
import com.example.ecommercemanagementsystem.repository.CartRepository;
import com.example.ecommercemanagementsystem.repository.OrderRepository;
import com.example.ecommercemanagementsystem.repository.PromotionRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final CartRepository cartRepository;
    private final UserRepository userRepository;
    private final PromotionRepository promotionRepository;
    private final EntityManager entityManager;

    public OrderService(
            OrderRepository orderRepository,
            CartRepository cartRepository,
            UserRepository userRepository,
            PromotionRepository promotionRepository,
            EntityManager entityManager
    ) {
        this.orderRepository = orderRepository;
        this.cartRepository = cartRepository;
        this.userRepository = userRepository;
        this.promotionRepository = promotionRepository;
        this.entityManager = entityManager;
    }

    @Transactional
    public OrderResponse checkout(Long userId, CheckoutRequest request) {
        if (request == null
                || request.shippingAddress() == null
                || request.shippingAddress().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Shipping address is required"
            );
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User not found"
                ));

        Cart cart = cartRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Cart not found"
                ));

        entityManager.lock(cart, LockModeType.PESSIMISTIC_WRITE);

        List<CartItem> cartItems = new ArrayList<>(cart.getItems());

        if (cartItems.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cannot checkout an empty cart"
            );
        }

        cartItems.sort(
                Comparator.comparing(
                        item -> item.getProduct().getId()
                )
        );


        Order order = new Order();
        order.setUser(user);
        order.setShippingAddress(request.shippingAddress());
        order.setStatus(OrderStatus.PENDING);


        BigDecimal subtotal = BigDecimal.ZERO;

        for (CartItem cartItem : cartItems) {
            Long productId = cartItem.getProduct().getId();

            Product product = entityManager.find(
                    Product.class,
                    productId,
                    LockModeType.PESSIMISTIC_WRITE
            );

            if (product == null) {
                throw new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Product not found"
                );
            }

            int quantity = cartItem.getQuantity();

            if (quantity <= 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Invalid product quantity"
                );
            }

            if (product.getStock() < quantity) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Not enough stock for product: " + product.getName()
                );
            }

            BigDecimal unitPrice = product.getPrice();

            if (unitPrice == null || unitPrice.signum() < 0) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Invalid product price"
                );
            }

            OrderItem orderItem = new OrderItem();
            orderItem.setProduct(product);
            orderItem.setQuantity(quantity);
            orderItem.setUnitPrice(unitPrice);

            order.addItem(orderItem);

            BigDecimal itemSubtotal = unitPrice.multiply(
                    BigDecimal.valueOf(quantity)
            );

            subtotal = subtotal.add(itemSubtotal);

            product.setStock(product.getStock() - quantity);
        }

        BigDecimal discount = BigDecimal.ZERO;

        if (request.promotionCode() != null
                && !request.promotionCode().isBlank()) {

            Promotion promotion = promotionRepository
                    .findByCodeIgnoreCaseAndActiveTrue(
                            request.promotionCode().trim()
                    )
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Invalid or inactive promotion code"
                    ));

            discount = promotion.calculateDiscount(subtotal);

            if (discount == null
                    || discount.signum() < 0
                    || discount.compareTo(subtotal) > 0) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Invalid promotion discount"
                );
            }

            order.setPromotion(promotion);
        }

        OrderComponent decoratedOrder = new BasicOrder(
                subtotal.subtract(discount)
        );

        if (request.giftWrapping()) {
            decoratedOrder = new GiftWrappingDecorator(decoratedOrder);
        }

        if (request.expressDelivery()) {
            decoratedOrder = new ExpressDeliveryDecorator(decoratedOrder);
        }

        if (request.extendedWarranty()) {
            decoratedOrder = new ExtendedWarrantyDecorator(decoratedOrder);
        }

        for (OrderComponent.Extra extra : decoratedOrder.getExtras()) {
            OrderExtra orderExtra = new OrderExtra();
            orderExtra.setName(extra.name());
            orderExtra.setPrice(extra.price());

            order.addExtra(orderExtra);
        }

        order.setTotalAmount(decoratedOrder.getTotalPrice());

        Order savedOrder = orderRepository.saveAndFlush(order);

        for (CartItem item : cartItems) {
            cart.removeItem(item);
        }

        entityManager.flush();

        return OrderResponse.fromEntity(savedOrder);
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrderById(Long orderId, Long userId) {
        Order order = findOrderById(orderId);

        validateOwnership(order, userId);

        return OrderResponse.fromEntity(order);
    }

    @Transactional(readOnly = true)
    public Page<OrderResponse> getUserOrders(
            Long userId,
            Pageable pageable
    ) {
        return orderRepository.findByUserId(userId, pageable)
                .map(OrderResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public Page<OrderResponse> getAllOrders(Pageable pageable) {
        return orderRepository.findAll(pageable)
                .map(OrderResponse::fromEntity);
    }

    @Transactional
    public OrderResponse updateOrderStatus(
            Long orderId,
            UpdateOrderStatusRequest request
    ) {
        if (request == null || request.status() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Order status is required"
            );
        }

        Order order = findOrderByIdForUpdate(orderId);

        OrderStatus currentStatus = order.getStatus();
        OrderStatus newStatus = request.status();

        if (!isValidTransition(currentStatus, newStatus)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid order status transition"
            );
        }

        if (newStatus == OrderStatus.CONFIRMED
                && !isPaymentSuccessful(order)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Order cannot be confirmed before successful payment"
            );
        }

        if (newStatus == OrderStatus.CANCELLED) {
            validateCancellation(order);
            restoreStock(order);
        }

        order.setStatus(newStatus);

        return OrderResponse.fromEntity(orderRepository.save(order));
    }

    @Transactional
    public OrderResponse cancelOrder(Long orderId, Long userId) {
        Order order = findOrderByIdForUpdate(orderId);

        validateOwnership(order, userId);
        validateCancellation(order);

        restoreStock(order);

        order.setStatus(OrderStatus.CANCELLED);

        return OrderResponse.fromEntity(orderRepository.save(order));
    }

    private Order findOrderById(Long id) {
        return orderRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Order not found"
                ));
    }

    private Order findOrderByIdForUpdate(Long id) {
        Order order = entityManager.find(
                Order.class,
                id,
                LockModeType.PESSIMISTIC_WRITE
        );

        if (order == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Order not found"
            );
        }

        return order;
    }

    private void validateOwnership(Order order, Long userId) {
        if (!order.getUser().getId().equals(userId)) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Order not found"
            );
        }
    }

    private boolean isPaymentSuccessful(Order order) {
        return order.getPayment() != null
                && order.getPayment().getStatus() == PaymentStatus.SUCCESS;
    }

    private void validateCancellation(Order order) {
        if (order.getStatus() != OrderStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only pending orders can be cancelled"
            );
        }

        if (isPaymentSuccessful(order)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Paid orders cannot be cancelled without a refund"
            );
        }
    }

    private void restoreStock(Order order) {
        List<OrderItem> items = new ArrayList<>(order.getItems());

        items.sort(
                Comparator.comparing(
                        item -> item.getProduct().getId()
                )
        );

        for (OrderItem item : items) {
            Product product = entityManager.find(
                    Product.class,
                    item.getProduct().getId(),
                    LockModeType.PESSIMISTIC_WRITE
            );

            if (product == null) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Cannot restore stock for a missing product"
                );
            }

            int restoredStock;

            try {
                restoredStock = Math.addExact(
                        product.getStock(),
                        item.getQuantity()
                );
            } catch (ArithmeticException exception) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Stock quantity exceeds the allowed limit"
                );
            }

            product.setStock(restoredStock);
        }
    }

    private boolean isValidTransition(
            OrderStatus current,
            OrderStatus next
    ) {
        return switch (current) {
            case PENDING -> next == OrderStatus.CONFIRMED
                    || next == OrderStatus.CANCELLED;

            case CONFIRMED -> next == OrderStatus.SHIPPED;

            case SHIPPED -> next == OrderStatus.DELIVERED;

            case DELIVERED, CANCELLED -> false;
        };
    }
}
