
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.promotion.PromotionRequest;
import com.example.ecommercemanagementsystem.dto.promotion.PromotionResponse;
import com.example.ecommercemanagementsystem.entity.Cart;
import com.example.ecommercemanagementsystem.repository.CartRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.PromotionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/promotions")
public class PromotionController {

    private final PromotionService promotionService;
    private final CartRepository cartRepository;
    private final UserRepository userRepository;

    public PromotionController(
            PromotionService promotionService,
            CartRepository cartRepository,
            UserRepository userRepository
    ) {
        this.promotionService = promotionService;
        this.cartRepository = cartRepository;
        this.userRepository = userRepository;
    }

    @GetMapping("/active")
    public ResponseEntity<List<PromotionResponse>> getActivePromotions() {
        return ResponseEntity.ok(
                promotionService.getActivePromotions()
        );
    }

    @GetMapping("/preview")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public ResponseEntity<DiscountPreviewResponse> previewDiscount(
            Authentication authentication,
            @RequestParam String code
    ) {
        Long userId = getCurrentUserId(authentication);

        Cart cart = cartRepository.findWithItemsByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Cart not found"
                ));

        BigDecimal subtotal = BigDecimal.ZERO;

        for (var item : cart.getItems()) {
            if (item.getQuantity() <= 0
                    || item.getProduct().getPrice() == null
                    || item.getProduct().getPrice().signum() < 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Invalid cart item"
                );
            }

            BigDecimal itemTotal = item.getProduct().getPrice()
                    .multiply(BigDecimal.valueOf(item.getQuantity()));

            subtotal = subtotal.add(itemTotal);
        }

        if (subtotal.signum() <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Cart is empty"
            );
        }

        if (code == null || code.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Promotion code is required"
            );
        }

        String normalizedCode = code.trim().toUpperCase(Locale.ROOT);

        BigDecimal discount = promotionService.calculateDiscount(
                normalizedCode,
                subtotal
        );

        return ResponseEntity.ok(
                new DiscountPreviewResponse(
                        normalizedCode,
                        subtotal,
                        discount,
                        subtotal.subtract(discount)
                )
        );
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<PromotionResponse>> getAllPromotions() {
        return ResponseEntity.ok(
                promotionService.getAllPromotions()
        );
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PromotionResponse> getPromotionById(
            @PathVariable Long id
    ) {
        return ResponseEntity.ok(
                promotionService.getPromotionById(id)
        );
    }

    @GetMapping("/code/{code}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PromotionResponse> getPromotionByCode(
            @PathVariable String code
    ) {
        return ResponseEntity.ok(
                promotionService.getPromotionByCode(code)
        );
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PromotionResponse> createPromotion(
            @Valid @RequestBody PromotionRequest request
    ) {
        PromotionResponse promotion =
                promotionService.createPromotion(request);

        URI location = URI.create(
                "/api/promotions/" + promotion.id()
        );

        return ResponseEntity
                .created(location)
                .body(promotion);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PromotionResponse> updatePromotion(
            @PathVariable Long id,
            @Valid @RequestBody PromotionRequest request
    ) {
        return ResponseEntity.ok(
                promotionService.updatePromotion(id, request)
        );
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<PromotionResponse> changePromotionStatus(
            @PathVariable Long id,
            @Valid @RequestBody PromotionStatusRequest request
    ) {
        return ResponseEntity.ok(
                promotionService.changePromotionStatus(
                        id,
                        request.active()
                )
        );
    }

    @GetMapping("/calculate")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DiscountPreviewResponse> calculateDiscount(
            @RequestParam String code,
            @RequestParam BigDecimal orderAmount
    ) {
        BigDecimal discount = promotionService.calculateDiscount(
                code,
                orderAmount
        );

        return ResponseEntity.ok(
                new DiscountPreviewResponse(
                        code.trim(),
                        orderAmount,
                        discount,
                        orderAmount.subtract(discount)
                )
        );
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deletePromotion(
            @PathVariable Long id
    ) {
        promotionService.deletePromotion(id);
        return ResponseEntity.noContent().build();
    }

    private Long getCurrentUserId(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication.getName() == null) {
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

    public record PromotionStatusRequest(
            @NotNull(message = "Active status is required")
            Boolean active
    ) {
    }

    public record DiscountPreviewResponse(
            String code,
            BigDecimal originalAmount,
            BigDecimal discountAmount,
            BigDecimal finalAmount
    ) {
    }
}
