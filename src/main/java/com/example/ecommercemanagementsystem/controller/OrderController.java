
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.order.CheckoutRequest;
import com.example.ecommercemanagementsystem.dto.order.OrderResponse;
import com.example.ecommercemanagementsystem.dto.order.UpdateOrderStatusRequest;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.Locale;

@RestController
@RequestMapping("/api/orders")
@PreAuthorize("isAuthenticated()")
public class OrderController {

    private final OrderService orderService;
    private final UserRepository userRepository;

    public OrderController(
            OrderService orderService,
            UserRepository userRepository
    ) {
        this.orderService = orderService;
        this.userRepository = userRepository;
    }

    @PostMapping("/checkout")
    public ResponseEntity<OrderResponse> checkout(
            Authentication authentication,
            @Valid @RequestBody CheckoutRequest request
    ) {
        Long userId = getCurrentUserId(authentication);

        OrderResponse order = orderService.checkout(userId, request);

        URI location = URI.create("/api/orders/" + order.id());

        return ResponseEntity
                .created(location)
                .body(order);
    }

    @GetMapping("/my")
    public ResponseEntity<Page<OrderResponse>> getMyOrders(
            Authentication authentication,
            @PageableDefault(
                    size = 10,
                    sort = "createdAt",
                    direction = Sort.Direction.DESC
            ) Pageable pageable
    ) {
        Long userId = getCurrentUserId(authentication);

        Page<OrderResponse> orders = orderService.getUserOrders(
                userId,
                pageable
        );

        return ResponseEntity.ok(orders);
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<OrderResponse> getOrderById(
            Authentication authentication,
            @PathVariable Long orderId
    ) {
        Long userId = getCurrentUserId(authentication);

        OrderResponse order = orderService.getOrderById(
                orderId,
                userId
        );

        return ResponseEntity.ok(order);
    }

    @PutMapping("/{orderId}/cancel")
    public ResponseEntity<OrderResponse> cancelOrder(
            Authentication authentication,
            @PathVariable Long orderId
    ) {
        Long userId = getCurrentUserId(authentication);

        OrderResponse order = orderService.cancelOrder(
                orderId,
                userId
        );

        return ResponseEntity.ok(order);
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<OrderResponse>> getAllOrders(
            @PageableDefault(
                    size = 20,
                    sort = "createdAt",
                    direction = Sort.Direction.DESC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                orderService.getAllOrders(pageable)
        );
    }

    @PutMapping("/{orderId}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> updateOrderStatus(
            @PathVariable Long orderId,
            @Valid @RequestBody UpdateOrderStatusRequest request
    ) {
        OrderResponse order = orderService.updateOrderStatus(
                orderId,
                request
        );

        return ResponseEntity.ok(order);
    }

    private Long getCurrentUserId(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authentication is required"
            );
        }

        String email = authentication.getName()
                .trim()
                .toLowerCase(Locale.ROOT);

        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Authenticated user not found"
                ))
                .getId();
    }
}
