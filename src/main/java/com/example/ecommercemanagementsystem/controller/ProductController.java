
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.product.ProductRequest;
import com.example.ecommercemanagementsystem.dto.product.ProductResponse;
import com.example.ecommercemanagementsystem.service.ProductService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.net.URI;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public ResponseEntity<Page<ProductResponse>> getAllProducts(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Boolean inStock,
            @PageableDefault(
                    size = 12,
                    sort = "id",
                    direction = Sort.Direction.DESC
            ) Pageable pageable
    ) {
        Page<ProductResponse> products = productService.getAllProducts(
                keyword,
                categoryId,
                minPrice,
                maxPrice,
                inStock,
                pageable
        );

        return ResponseEntity.ok(products);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getProductById(
            @PathVariable Long id
    ) {
        ProductResponse product = productService.getProductById(id);

        return ResponseEntity.ok(product);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> createProduct(
            @Valid @RequestBody ProductRequest request
    ) {
        ProductResponse product = productService.createProduct(request);

        URI location = URI.create("/api/products/" + product.id());

        return ResponseEntity
                .created(location)
                .body(product);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProductResponse> updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest request
    ) {
        ProductResponse product = productService.updateProduct(id, request);

        return ResponseEntity.ok(product);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteProduct(
            @PathVariable Long id
    ) {
        productService.deleteProduct(id);

        return ResponseEntity.noContent().build();
    }
}
