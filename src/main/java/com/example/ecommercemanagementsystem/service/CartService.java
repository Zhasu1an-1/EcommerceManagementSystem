
package com.example.ecommercemanagementsystem.service;

import com.example.ecommercemanagementsystem.dto.cart.AddCartItemRequest;
import com.example.ecommercemanagementsystem.dto.cart.CartResponse;
import com.example.ecommercemanagementsystem.dto.cart.UpdateCartItemRequest;
import com.example.ecommercemanagementsystem.entity.Cart;
import com.example.ecommercemanagementsystem.entity.CartItem;
import com.example.ecommercemanagementsystem.entity.Product;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.repository.CartRepository;
import com.example.ecommercemanagementsystem.repository.ProductRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CartService {

    private final CartRepository cartRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    public CartService(
            CartRepository cartRepository,
            ProductRepository productRepository,
            UserRepository userRepository
    ) {
        this.cartRepository = cartRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public CartResponse getCart(Long userId) {
        return CartResponse.fromEntity(findOrCreateCart(userId));
    }

    @Transactional
    public CartResponse addItem(Long userId, AddCartItemRequest request) {
        Cart cart = findOrCreateCart(userId);

        Product product = productRepository.findById(request.productId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Product not found"
                ));

        CartItem existingItem = cart.getItems()
                .stream()
                .filter(item -> item.getProduct().getId().equals(product.getId()))
                .findFirst()
                .orElse(null);

        long newQuantity = request.quantity();

        if (existingItem != null) {
            newQuantity += existingItem.getQuantity();
        }

        if (newQuantity > product.getStock()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Not enough product stock"
            );
        }

        if (newQuantity > Integer.MAX_VALUE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Quantity is too large"
            );
        }

        if (existingItem != null) {
            existingItem.setQuantity((int) newQuantity);
        } else {
            CartItem item = new CartItem();
            item.setProduct(product);
            item.setQuantity((int) newQuantity);
            cart.addItem(item);
        }

        cartRepository.save(cart);

        return CartResponse.fromEntity(cart);
    }

    @Transactional
    public CartResponse updateItem(
            Long userId,
            Long itemId,
            UpdateCartItemRequest request
    ) {
        Cart cart = findCartByUserId(userId);
        CartItem item = findCartItem(cart, itemId);

        if (request.quantity() > item.getProduct().getStock()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Not enough product stock"
            );
        }

        item.setQuantity(request.quantity());
        cartRepository.save(cart);

        return CartResponse.fromEntity(cart);
    }

    @Transactional
    public CartResponse removeItem(Long userId, Long itemId) {
        Cart cart = findCartByUserId(userId);
        CartItem item = findCartItem(cart, itemId);

        cart.removeItem(item);
        cartRepository.save(cart);

        return CartResponse.fromEntity(cart);
    }

    @Transactional
    public void clearCart(Long userId) {
        Cart cart = findCartByUserId(userId);

        for (CartItem item : cart.getItems()) {
            item.setCart(null);
        }

        cart.getItems().clear();
        cartRepository.save(cart);
    }

    @Transactional
    public CartResponse createCartIfNotExists(Long userId) {
        return CartResponse.fromEntity(findOrCreateCart(userId));
    }

    private Cart findOrCreateCart(Long userId) {
        return cartRepository.findWithItemsByUserId(userId)
                .orElseGet(() -> {
                    User user = userRepository.findById(userId)
                            .orElseThrow(() -> new ResponseStatusException(
                                    HttpStatus.NOT_FOUND,
                                    "User not found"
                            ));

                    Cart cart = new Cart();
                    cart.setUser(user);

                    return cartRepository.saveAndFlush(cart);
                });
    }

    private Cart findCartByUserId(Long userId) {
        return cartRepository.findWithItemsByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Cart not found"
                ));
    }

    private CartItem findCartItem(Cart cart, Long itemId) {
        return cart.getItems()
                .stream()
                .filter(item -> item.getId().equals(itemId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Cart item not found"
                ));
    }
}
