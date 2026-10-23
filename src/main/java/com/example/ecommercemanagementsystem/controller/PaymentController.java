
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.payment.PaymentRequest;
import com.example.ecommercemanagementsystem.dto.payment.PaymentResponse;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;

@RestController
@RequestMapping("/api/payments")
@PreAuthorize("isAuthenticated()")
public class PaymentController {

    private final PaymentService paymentService;
    private final UserRepository userRepository;

    public PaymentController(
            PaymentService paymentService,
            UserRepository userRepository
    ) {
        this.paymentService = paymentService;
        this.userRepository = userRepository;
    }

    @PostMapping
    public ResponseEntity<PaymentResponse> processPayment(
            Authentication authentication,
            @Valid @RequestBody PaymentRequest request
    ) {
        Long userId = getCurrentUserId(authentication);

        PaymentResponse payment = paymentService.processPayment(
                userId,
                request
        );

        return ResponseEntity.ok(payment);
    }

    @GetMapping("/order/{orderId}")
    public ResponseEntity<PaymentResponse> getPaymentByOrderId(
            Authentication authentication,
            @PathVariable Long orderId
    ) {
        Long userId = getCurrentUserId(authentication);

        if (orderId == null || orderId <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid order ID"
            );
        }

        PaymentResponse payment = paymentService.getPaymentByOrderId(
                orderId,
                userId
        );

        return ResponseEntity.ok(payment);
    }

    @GetMapping("/{paymentId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PaymentResponse> getPaymentById(
            @PathVariable Long paymentId
    ) {
        if (paymentId == null || paymentId <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid payment ID"
            );
        }

        PaymentResponse payment = paymentService.getPaymentById(paymentId);

        return ResponseEntity.ok(payment);
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
