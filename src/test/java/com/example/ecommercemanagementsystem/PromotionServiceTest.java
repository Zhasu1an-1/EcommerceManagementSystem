package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.dto.promotion.PromotionRequest;
import com.example.ecommercemanagementsystem.dto.promotion.PromotionResponse;
import com.example.ecommercemanagementsystem.entity.Promotion;
import com.example.ecommercemanagementsystem.enums.DiscountType;
import com.example.ecommercemanagementsystem.repository.PromotionRepository;
import com.example.ecommercemanagementsystem.service.PromotionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PromotionServiceTest {

    @Mock
    private PromotionRepository promotionRepository;

    @InjectMocks
    private PromotionService promotionService;

    @Test
    @DisplayName("Percentage promotion gives the correct discount")
    void percentageDiscount() {
        Promotion promotion = new Promotion("SALE10", DiscountType.PERCENTAGE, new BigDecimal("10"));
        when(promotionRepository.findByCodeIgnoreCaseAndActiveTrue("sale10"))
                .thenReturn(Optional.of(promotion));

        BigDecimal discount = promotionService.calculateDiscount("sale10", new BigDecimal("20000"));

        assertEquals(0, new BigDecimal("2000.00").compareTo(discount));
    }

    @Test
    @DisplayName("Fixed promotion is capped by the order amount")
    void fixedDiscountIsCapped() {
        Promotion promotion = new Promotion("BIG", DiscountType.FIXED, new BigDecimal("5000"));
        when(promotionRepository.findByCodeIgnoreCaseAndActiveTrue("BIG"))
                .thenReturn(Optional.of(promotion));

        BigDecimal discount = promotionService.calculateDiscount("BIG", new BigDecimal("3000"));

        assertEquals(0, new BigDecimal("3000").compareTo(discount));
    }

    @Test
    @DisplayName("Empty promotion code means no discount")
    void emptyCodeGivesZero() {
        BigDecimal discount = promotionService.calculateDiscount(" ", new BigDecimal("1000"));

        assertEquals(0, BigDecimal.ZERO.compareTo(discount));
    }

    @Test
    @DisplayName("Unknown or inactive code is rejected")
    void invalidCodeIsRejected() {
        when(promotionRepository.findByCodeIgnoreCaseAndActiveTrue("BAD"))
                .thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> promotionService.calculateDiscount("BAD", new BigDecimal("1000")));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    @DisplayName("Negative order amount is rejected")
    void negativeAmountIsRejected() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> promotionService.calculateDiscount("SALE10", new BigDecimal("-5")));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    @DisplayName("Creating a promotion normalizes the code to upper case")
    void createPromotionNormalizesCode() {
        PromotionRequest request = new PromotionRequest(
                " spring ", DiscountType.PERCENTAGE, new BigDecimal("15"), true);
        when(promotionRepository.existsByCodeIgnoreCase("SPRING")).thenReturn(false);
        when(promotionRepository.save(any(Promotion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        PromotionResponse response = promotionService.createPromotion(request);

        assertEquals("SPRING", response.code());
    }

    @Test
    @DisplayName("Duplicate promotion code is rejected with 409")
    void duplicateCodeIsRejected() {
        PromotionRequest request = new PromotionRequest(
                "SPRING", DiscountType.FIXED, new BigDecimal("500"), true);
        when(promotionRepository.existsByCodeIgnoreCase("SPRING")).thenReturn(true);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> promotionService.createPromotion(request));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(promotionRepository, never()).save(any());
    }

    @Test
    @DisplayName("Percentage discount above 100 is rejected")
    void percentageAbove100IsRejected() {
        PromotionRequest request = new PromotionRequest(
                "TOOMUCH", DiscountType.PERCENTAGE, new BigDecimal("150"), true);
        when(promotionRepository.existsByCodeIgnoreCase("TOOMUCH")).thenReturn(false);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> promotionService.createPromotion(request));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }
}
