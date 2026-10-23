
package com.example.ecommercemanagementsystem.service;

import com.example.ecommercemanagementsystem.dto.promotion.PromotionRequest;
import com.example.ecommercemanagementsystem.dto.promotion.PromotionResponse;
import com.example.ecommercemanagementsystem.entity.Promotion;
import com.example.ecommercemanagementsystem.enums.DiscountType;
import com.example.ecommercemanagementsystem.repository.PromotionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;

@Service
public class PromotionService {

    private final PromotionRepository promotionRepository;

    public PromotionService(PromotionRepository promotionRepository) {
        this.promotionRepository = promotionRepository;
    }

    @Transactional(readOnly = true)
    public List<PromotionResponse> getAllPromotions() {
        return promotionRepository.findAll()
                .stream()
                .map(PromotionResponse::fromEntity)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PromotionResponse> getActivePromotions() {
        return promotionRepository.findByActiveTrue()
                .stream()
                .map(PromotionResponse::fromEntity)
                .toList();
    }

    @Transactional(readOnly = true)
    public PromotionResponse getPromotionById(Long id) {
        return PromotionResponse.fromEntity(findPromotionById(id));
    }

    @Transactional(readOnly = true)
    public PromotionResponse getPromotionByCode(String code) {
        Promotion promotion = promotionRepository.findByCodeIgnoreCase(code.trim())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Promotion not found"
                ));

        return PromotionResponse.fromEntity(promotion);
    }

    @Transactional
    public PromotionResponse createPromotion(PromotionRequest request) {
        String code = request.code().trim().toUpperCase();

        if (promotionRepository.existsByCodeIgnoreCase(code)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Promotion code already exists"
            );
        }

        validateDiscount(request.discountType(), request.value());

        Promotion promotion = new Promotion();
        promotion.setCode(code);
        promotion.setDiscountType(request.discountType());
        promotion.setValue(request.value());
        promotion.setActive(request.active());

        return PromotionResponse.fromEntity(
                promotionRepository.save(promotion)
        );
    }

    @Transactional
    public PromotionResponse updatePromotion(Long id, PromotionRequest request) {
        Promotion promotion = findPromotionById(id);
        String code = request.code().trim().toUpperCase();

        promotionRepository.findByCodeIgnoreCase(code)
                .ifPresent(existing -> {
                    if (!existing.getId().equals(id)) {
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT,
                                "Promotion code already exists"
                        );
                    }
                });

        validateDiscount(request.discountType(), request.value());

        promotion.setCode(code);
        promotion.setDiscountType(request.discountType());
        promotion.setValue(request.value());
        promotion.setActive(request.active());

        return PromotionResponse.fromEntity(
                promotionRepository.save(promotion)
        );
    }

    @Transactional
    public PromotionResponse changePromotionStatus(Long id, boolean active) {
        Promotion promotion = findPromotionById(id);
        promotion.setActive(active);

        return PromotionResponse.fromEntity(
                promotionRepository.save(promotion)
        );
    }

    @Transactional(readOnly = true)
    public BigDecimal calculateDiscount(String code, BigDecimal orderAmount) {
        if (orderAmount == null || orderAmount.signum() < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid order amount"
            );
        }

        if (code == null || code.isBlank()) {
            return BigDecimal.ZERO;
        }

        Promotion promotion = promotionRepository
                .findByCodeIgnoreCaseAndActiveTrue(code.trim())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Invalid or inactive promotion code"
                ));

        return promotion.calculateDiscount(orderAmount);
    }

    @Transactional
    public void deletePromotion(Long id) {
        Promotion promotion = findPromotionById(id);
        promotionRepository.delete(promotion);
    }

    private Promotion findPromotionById(Long id) {
        return promotionRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Promotion not found"
                ));
    }

    private void validateDiscount(DiscountType type, BigDecimal value) {
        if (type == null || value == null || value.signum() <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid discount configuration"
            );
        }

        if (type == DiscountType.PERCENTAGE
                && value.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Percentage discount cannot exceed 100%"
            );
        }
    }
}
