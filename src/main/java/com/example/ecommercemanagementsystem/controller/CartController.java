
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.cart.AddCartItemRequest;
import com.example.ecommercemanagementsystem.dto.cart.CartResponse;
import com.example.ecommercemanagementsystem.dto.cart.UpdateCartItemRequest;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.CartService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;

@RestController
@RequestMapping("/api/cart")
@PreAuthorize("isAuthenticated()")
public class CartController {

    private final CartService cartService;
    private final UserRepository userRepository;

    public CartController(
            CartService cartService,
            UserRepository userRepository
    ) {
        this.cartService = cartService;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<CartResponse> getCart(
            Authentication authentication
    ) {
        Long userId = getCurrentUserId(authentication);

        return ResponseEntity.ok(
                cartService.getCart(userId)
        );
    }

    @PostMapping("/items")
    public ResponseEntity<CartResponse> addItem(
            Authentication authentication,
            @Valid @RequestBody AddCartItemRequest request
    ) {
        Long userId = getCurrentUserId(authentication);

        CartResponse cart = cartService.addItem(userId, request);

        return ResponseEntity.ok(cart);
    }

    @PutMapping("/items/{itemId}")
    public ResponseEntity<CartResponse> updateItem(
            Authentication authentication,
            @PathVariable Long itemId,
            @Valid @RequestBody UpdateCartItemRequest request
    ) {
        Long userId = getCurrentUserId(authentication);

        CartResponse cart = cartService.updateItem(
                userId,
                itemId,
                request
        );

        return ResponseEntity.ok(cart);
    }

    @DeleteMapping("/items/{itemId}")
    public ResponseEntity<CartResponse> removeItem(
            Authentication authentication,
            @PathVariable Long itemId
    ) {
        Long userId = getCurrentUserId(authentication);

        CartResponse cart = cartService.removeItem(userId, itemId);

        return ResponseEntity.ok(cart);
    }

    @DeleteMapping
    public ResponseEntity<Void> clearCart(
            Authentication authentication
    ) {
        Long userId = getCurrentUserId(authentication);

        cartService.clearCart(userId);

        return ResponseEntity.noContent().build();
    }

    @PostMapping("/initialize")
    public ResponseEntity<CartResponse> initializeCart(
            Authentication authentication
    ) {
        Long userId = getCurrentUserId(authentication);

        CartResponse cart = cartService.createCartIfNotExists(userId);

        return ResponseEntity.ok(cart);
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
