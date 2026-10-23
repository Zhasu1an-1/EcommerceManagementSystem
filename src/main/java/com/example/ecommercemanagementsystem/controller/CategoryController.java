
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.product.CategoryRequest;
import com.example.ecommercemanagementsystem.entity.Category;
import com.example.ecommercemanagementsystem.service.CategoryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public ResponseEntity<List<CategoryResponse>> getAllCategories() {
        List<CategoryResponse> categories = categoryService
                .getAllCategories()
                .stream()
                .map(CategoryResponse::fromEntity)
                .toList();

        return ResponseEntity.ok(categories);
    }

    @GetMapping("/{id}")
    public ResponseEntity<CategoryResponse> getCategoryById(
            @PathVariable Long id
    ) {
        Category category = categoryService.getCategoryById(id);

        return ResponseEntity.ok(
                CategoryResponse.fromEntity(category)
        );
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<CategoryResponse> createCategory(
            @Valid @RequestBody CategoryRequest request
    ) {
        Category category = categoryService.createCategory(request);

        CategoryResponse response = CategoryResponse.fromEntity(category);

        URI location = URI.create("/api/categories/" + response.id());

        return ResponseEntity
                .created(location)
                .body(response);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<CategoryResponse> updateCategory(
            @PathVariable Long id,
            @Valid @RequestBody CategoryRequest request
    ) {
        Category category = categoryService.updateCategory(id, request);

        return ResponseEntity.ok(
                CategoryResponse.fromEntity(category)
        );
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteCategory(
            @PathVariable Long id
    ) {
        categoryService.deleteCategory(id);

        return ResponseEntity.noContent().build();
    }

    public record CategoryResponse(
            Long id,
            String name
    ) {
        public static CategoryResponse fromEntity(Category category) {
            return new CategoryResponse(
                    category.getId(),
                    category.getName()
            );
        }
    }
}
