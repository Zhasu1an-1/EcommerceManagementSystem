
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.promotion.PromotionRequest;
import com.example.ecommercemanagementsystem.dto.promotion.PromotionResponse;
import com.example.ecommercemanagementsystem.service.PromotionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/promotions")
public class PromotionController {

    private final PromotionService promotionService;

    public PromotionController(PromotionService promotionService) {
        this.promotionService = promotionService;
    }

    @GetMapping("/active")
    public ResponseEntity<List<PromotionResponse>> getActivePromotions() {
        return ResponseEntity.ok(
                promotionService.getActivePromotions()
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
        PromotionResponse promotion = promotionService.createPromotion(request);

        URI location = URI.create("/api/promotions/" + promotion.id());

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
