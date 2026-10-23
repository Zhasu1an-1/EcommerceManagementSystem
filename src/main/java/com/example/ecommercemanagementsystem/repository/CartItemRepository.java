
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    List<CartItem> findByCartId(Long cartId);

    Optional<CartItem> findByCartIdAndProductId(Long cartId, Long productId);

    Optional<CartItem> findByIdAndCartUserId(Long itemId, Long userId);

    boolean existsByCartIdAndProductId(Long cartId, Long productId);

    void deleteByCartId(Long cartId);
}
