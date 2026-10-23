
package com.example.ecommercemanagementsystem.entity;

import com.example.ecommercemanagementsystem.enums.OrderStatus;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "shipping_address", nullable = false, length = 500)
    private String shippingAddress;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private OrderStatus status = OrderStatus.PENDING;

    @Column(name = "total_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @OneToMany(
            mappedBy = "order",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    private List<OrderItem> items = new ArrayList<>();

    @OneToMany(
            mappedBy = "order",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    private List<OrderExtra> extras = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "promotion_id")
    private Promotion promotion;

    @OneToOne(mappedBy = "order", fetch = FetchType.LAZY)
    private Payment payment;

    public Order() {
    }

    @PrePersist
    public void prePersist() {
        validateOrder();

        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    @PreUpdate
    public void preUpdate() {
        validateOrder();
    }

    private void validateOrder() {
        if (user == null) {
            throw new IllegalStateException("Order user is required");
        }

        if (shippingAddress == null || shippingAddress.isBlank()) {
            throw new IllegalStateException("Shipping address is required");
        }

        if (totalAmount == null || totalAmount.signum() < 0) {
            throw new IllegalStateException("Invalid order total amount");
        }

        if (status == null) {
            throw new IllegalStateException("Order status is required");
        }
    }

    public void addItem(OrderItem item) {
        if (item == null) {
            throw new IllegalArgumentException("Order item cannot be null");
        }

        if (!items.contains(item)) {
            items.add(item);
        }

        item.setOrder(this);
    }

    public void removeItem(OrderItem item) {
        if (items.remove(item)) {
            item.setOrder(null);
        }
    }

    public void setItems(List<OrderItem> newItems) {
        if (newItems == null) {
            throw new IllegalArgumentException("Order items cannot be null");
        }

        List<OrderItem> copy = new ArrayList<>(newItems);

        for (OrderItem item : new ArrayList<>(items)) {
            removeItem(item);
        }

        for (OrderItem item : copy) {
            addItem(item);
        }
    }

    public void addExtra(OrderExtra extra) {
        if (extra == null) {
            throw new IllegalArgumentException("Order extra cannot be null");
        }

        if (!extras.contains(extra)) {
            extras.add(extra);
        }

        extra.setOrder(this);
    }

    public void removeExtra(OrderExtra extra) {
        if (extras.remove(extra)) {
            extra.setOrder(null);
        }
    }

    public void setExtras(List<OrderExtra> newExtras) {
        if (newExtras == null) {
            throw new IllegalArgumentException("Order extras cannot be null");
        }

        List<OrderExtra> copy = new ArrayList<>(newExtras);

        for (OrderExtra extra : new ArrayList<>(extras)) {
            removeExtra(extra);
        }

        for (OrderExtra extra : copy) {
            addExtra(extra);
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        if (user == null) {
            throw new IllegalArgumentException("Order user cannot be null");
        }

        this.user = user;
    }

    public String getShippingAddress() {
        return shippingAddress;
    }

    public void setShippingAddress(String shippingAddress) {
        if (shippingAddress == null || shippingAddress.isBlank()) {
            throw new IllegalArgumentException(
                    "Shipping address cannot be empty"
            );
        }

        String normalizedAddress = shippingAddress.trim();

        if (normalizedAddress.length() > 500) {
            throw new IllegalArgumentException(
                    "Shipping address cannot exceed 500 characters"
            );
        }

        this.shippingAddress = normalizedAddress;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public void setStatus(OrderStatus status) {
        if (status == null) {
            throw new IllegalArgumentException(
                    "Order status cannot be null"
            );
        }

        this.status = status;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        if (totalAmount == null || totalAmount.signum() < 0) {
            throw new IllegalArgumentException(
                    "Total amount cannot be null or negative"
            );
        }

        this.totalAmount = totalAmount;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public List<OrderItem> getItems() {
        return items;
    }

    public List<OrderExtra> getExtras() {
        return extras;
    }

    public Promotion getPromotion() {
        return promotion;
    }

    public void setPromotion(Promotion promotion) {
        this.promotion = promotion;
    }

    public Payment getPayment() {
        return payment;
    }

    public void setPayment(Payment payment) {
        this.payment = payment;

        if (payment != null && payment.getOrder() != this) {
            payment.setOrder(this);
        }
    }
}
