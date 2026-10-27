package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.dto.cart.AddCartItemRequest;
import com.example.ecommercemanagementsystem.dto.cart.CartResponse;
import com.example.ecommercemanagementsystem.dto.cart.UpdateCartItemRequest;
import com.example.ecommercemanagementsystem.entity.Cart;
import com.example.ecommercemanagementsystem.entity.CartItem;
import com.example.ecommercemanagementsystem.entity.Category;
import com.example.ecommercemanagementsystem.entity.Product;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.Role;
import com.example.ecommercemanagementsystem.repository.CartRepository;
import com.example.ecommercemanagementsystem.repository.ProductRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.CartService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CartServiceTest {

    private static final Long USER_ID = 1L;
    private static final Long PRODUCT_ID = 5L;

    @Mock
    private CartRepository cartRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private UserRepository userRepository;

    private CartService cartService;
    private Cart cart;
    private Product product;

    @BeforeEach
    void setUp() {
        cartService = new CartService(cartRepository, productRepository, userRepository);

        User user = new User("Test", "test@example.com", "hash", Role.CUSTOMER);
        user.setId(USER_ID);

        cart = new Cart(user);
        cart.setId(10L);

        Category category = new Category("Phones");
        category.setId(2L);

        product = new Product("Phone", "A phone", new BigDecimal("1000.00"), 5, null, category);
        product.setId(PRODUCT_ID);

        lenient().when(cartRepository.findWithItemsByUserId(USER_ID)).thenReturn(Optional.of(cart));
        lenient().when(productRepository.findById(PRODUCT_ID)).thenReturn(Optional.of(product));
        lenient().when(cartRepository.save(cart)).thenReturn(cart);
    }

    @Test
    @DisplayName("Adding a product creates a cart item with correct totals")
    void addItemCreatesCartItem() {
        CartResponse response = cartService.addItem(USER_ID, new AddCartItemRequest(PRODUCT_ID, 2));

        assertEquals(1, response.items().size());
        assertEquals(2, response.totalItems());
        assertEquals(0, new BigDecimal("2000.00").compareTo(response.totalAmount()));
    }

    @Test
    @DisplayName("Adding the same product again merges the quantity")
    void addingSameProductMergesQuantity() {
        cartService.addItem(USER_ID, new AddCartItemRequest(PRODUCT_ID, 2));
        CartResponse response = cartService.addItem(USER_ID, new AddCartItemRequest(PRODUCT_ID, 1));

        assertEquals(1, response.items().size());
        assertEquals(3, response.totalItems());
    }

    @Test
    @DisplayName("Adding more than the available stock is rejected")
    void addingMoreThanStockIsRejected() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> cartService.addItem(USER_ID, new AddCartItemRequest(PRODUCT_ID, 6)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        assertTrue(cart.getItems().isEmpty());
    }

    @Test
    @DisplayName("Merged quantity cannot exceed stock either")
    void mergedQuantityCannotExceedStock() {
        cartService.addItem(USER_ID, new AddCartItemRequest(PRODUCT_ID, 4));

        assertThrows(
                ResponseStatusException.class,
                () -> cartService.addItem(USER_ID, new AddCartItemRequest(PRODUCT_ID, 2)));
    }

    @Test
    @DisplayName("Unknown product gives 404")
    void unknownProductIsRejected() {
        when(productRepository.findById(99L)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> cartService.addItem(USER_ID, new AddCartItemRequest(99L, 1)));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    @DisplayName("Updating an item changes its quantity")
    void updateItemChangesQuantity() {
        CartItem item = new CartItem(cart, product, 1);
        item.setId(100L);
        cart.addItem(item);

        CartResponse response = cartService.updateItem(USER_ID, 100L, new UpdateCartItemRequest(4));

        assertEquals(4, response.totalItems());
    }

    @Test
    @DisplayName("Removing an item empties the cart")
    void removeItemEmptiesCart() {
        CartItem item = new CartItem(cart, product, 1);
        item.setId(100L);
        cart.addItem(item);

        CartResponse response = cartService.removeItem(USER_ID, 100L);

        assertTrue(response.items().isEmpty());
        assertEquals(0, response.totalItems());
    }

    @Test
    @DisplayName("Removing a non-existent item gives 404")
    void removeUnknownItemIsRejected() {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> cartService.removeItem(USER_ID, 12345L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    @DisplayName("Cart for an unknown user gives 404")
    void unknownUserIsRejected() {
        when(cartRepository.findWithItemsByUserId(77L)).thenReturn(Optional.empty());
        when(userRepository.findById(77L)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> cartService.getCart(77L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }
}
