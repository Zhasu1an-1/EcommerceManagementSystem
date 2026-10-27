package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.dto.product.ProductRequest;
import com.example.ecommercemanagementsystem.dto.product.ProductResponse;
import com.example.ecommercemanagementsystem.entity.Category;
import com.example.ecommercemanagementsystem.entity.Product;
import com.example.ecommercemanagementsystem.repository.CategoryRepository;
import com.example.ecommercemanagementsystem.repository.ProductRepository;
import com.example.ecommercemanagementsystem.service.ProductService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private CategoryRepository categoryRepository;

    private ProductService newService() {
        return new ProductService(productRepository, categoryRepository);
    }

    private Category category() {
        Category category = new Category("Phones");
        category.setId(2L);
        return category;
    }

    @Test
    @DisplayName("Creating a product trims the name and saves it")
    void createProductSavesProduct() {
        ProductRequest request = new ProductRequest(
                "  Phone X ", "desc", new BigDecimal("999.99"), 10, null, 2L);
        when(productRepository.existsByNameIgnoreCase("Phone X")).thenReturn(false);
        when(categoryRepository.findById(2L)).thenReturn(Optional.of(category()));
        when(productRepository.save(any(Product.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = newService().createProduct(request);

        assertEquals("Phone X", response.name());
        assertEquals(10, response.stock());
        assertEquals("Phones", response.categoryName());
    }

    @Test
    @DisplayName("Duplicate product name is rejected with 409")
    void duplicateNameIsRejected() {
        ProductRequest request = new ProductRequest(
                "Phone X", "desc", BigDecimal.TEN, 1, null, 2L);
        when(productRepository.existsByNameIgnoreCase("Phone X")).thenReturn(true);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> newService().createProduct(request));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(productRepository, never()).save(any());
    }

    @Test
    @DisplayName("Unknown category is rejected")
    void unknownCategoryIsRejected() {
        ProductRequest request = new ProductRequest(
                "Phone X", "desc", BigDecimal.TEN, 1, null, 99L);
        when(productRepository.existsByNameIgnoreCase("Phone X")).thenReturn(false);
        when(categoryRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> newService().createProduct(request));
    }

    @Test
    @DisplayName("Unknown product id gives 404")
    void unknownProductGives404() {
        when(productRepository.findById(404L)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> newService().getProductById(404L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    @DisplayName("Search with min price greater than max price is rejected")
    void invalidPriceRangeIsRejected() {
        Pageable pageable = PageRequest.of(0, 10);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> newService().getAllProducts(
                        null, null, new BigDecimal("500"), new BigDecimal("100"), null, pageable));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    @DisplayName("Negative price filter is rejected")
    void negativePriceFilterIsRejected() {
        Pageable pageable = PageRequest.of(0, 10);

        assertThrows(ResponseStatusException.class,
                () -> newService().getAllProducts(
                        null, null, new BigDecimal("-1"), null, null, pageable));
    }

    @Test
    @DisplayName("Blank search keyword is normalized to null")
    void blankKeywordIsNormalized() {
        Pageable pageable = PageRequest.of(0, 10);
        Product product = new Product("Phone", "d", BigDecimal.TEN, 3, null, category());
        product.setId(1L);
        when(productRepository.searchProducts(isNull(), isNull(), isNull(), isNull(), isNull(), any()))
                .thenReturn(new PageImpl<>(List.of(product)));

        var page = newService().getAllProducts("   ", null, null, null, null, pageable);

        assertEquals(1, page.getTotalElements());
    }
}
