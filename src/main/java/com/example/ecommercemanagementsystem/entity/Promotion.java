
package com.example.ecommercemanagementsystem.entity;

import com.example.ecommercemanagementsystem.enums.DiscountType;
import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "promotions")
public class Promotion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(name = "discount_type", nullable = false, length = 30)
    private DiscountType discountType;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal value;

    @Column(nullable = false)
    private boolean active = true;

    public Promotion() {
    }

    public Promotion(String code, DiscountType discountType, BigDecimal value) {
        setCode(code);
        setDiscountType(discountType);
        setValue(value);
        this.active = true;
    }

    public BigDecimal calculateDiscount(BigDecimal amount) {
        if (amount == null || amount.signum() < 0) {
            throw new IllegalArgumentException("Amount cannot be null or negative");
        }

        if (!active) {
            return BigDecimal.ZERO;
        }

        BigDecimal discount;

        if (discountType == DiscountType.PERCENTAGE) {
            discount = amount.multiply(value)
                    .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        } else {
            discount = value;
        }

        return discount.min(amount);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("Promotion code cannot be empty");
        }

        this.code = code.trim().toUpperCase();
    }

    public DiscountType getDiscountType() {
        return discountType;
    }

    public void setDiscountType(DiscountType discountType) {
        if (discountType == null) {
            throw new IllegalArgumentException("Discount type cannot be null");
        }

        this.discountType = discountType;
    }

    public BigDecimal getValue() {
        return value;
    }

    public void setValue(BigDecimal value) {
        if (value == null || value.signum() <= 0) {
            throw new IllegalArgumentException("Discount value must be positive");
        }

        if (discountType == DiscountType.PERCENTAGE &&
                value.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("Percentage discount cannot exceed 100");
        }

        this.value = value;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
