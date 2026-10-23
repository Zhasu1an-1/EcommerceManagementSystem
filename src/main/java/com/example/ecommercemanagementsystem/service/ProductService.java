
package com.example.ecommercemanagementsystem.service;

import com.example.ecommercemanagementsystem.dto.product.ProductRequest;
import com.example.ecommercemanagementsystem.dto.product.ProductResponse;
import com.example.ecommercemanagementsystem.entity.Category;
import com.example.ecommercemanagementsystem.entity.Product;
import com.example.ecommercemanagementsystem.repository.CategoryRepository;
import com.example.ecommercemanagementsystem.repository.ProductRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;

@Service
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public ProductService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository
    ) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
    }

    @Transactional(readOnly = true)
    public Page<ProductResponse> getAllProducts(
            String keyword,
            Long categoryId,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            Boolean inStock,
            Pageable pageable
    ) {
        if (minPrice != null && minPrice.signum() < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Minimum price cannot be negative"
            );
        }

        if (maxPrice != null && maxPrice.signum() < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Maximum price cannot be negative"
            );
        }

        if (minPrice != null && maxPrice != null
                && minPrice.compareTo(maxPrice) > 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Minimum price cannot exceed maximum price"
            );
        }

        String normalizedKeyword = keyword == null || keyword.isBlank()
                ? null
                : keyword.trim();

        return productRepository.searchProducts(
                normalizedKeyword,
                categoryId,
                minPrice,
                maxPrice,
                inStock,
                pageable
        ).map(ProductResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id) {
        Product product = findProductById(id);
        return ProductResponse.fromEntity(product);
    }

    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        String name = request.name().trim();

        if (productRepository.existsByNameIgnoreCase(name)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Product already exists"
            );
        }

        Category category = findCategoryById(request.categoryId());

        Product product = new Product();
        product.setName(name);
        product.setDescription(request.description());
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setImageUrl(request.imageUrl());
        product.setCategory(category);

        return ProductResponse.fromEntity(productRepository.save(product));
    }

    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        Product product = findProductById(id);
        String name = request.name().trim();

        if (!product.getName().equalsIgnoreCase(name)
                && productRepository.existsByNameIgnoreCase(name)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Product already exists"
            );
        }

        Category category = findCategoryById(request.categoryId());

        product.setName(name);
        product.setDescription(request.description());
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setImageUrl(request.imageUrl());
        product.setCategory(category);

        return ProductResponse.fromEntity(productRepository.save(product));
    }

    @Transactional
    public void deleteProduct(Long id) {
        Product product = findProductById(id);
        productRepository.delete(product);
    }

    private Product findProductById(Long id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Product not found"
                ));
    }

    private Category findCategoryById(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Category not found"
                ));
    }
}
