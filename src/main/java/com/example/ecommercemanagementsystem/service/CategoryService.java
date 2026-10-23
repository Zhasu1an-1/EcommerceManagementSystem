
package com.example.ecommercemanagementsystem.service;

import com.example.ecommercemanagementsystem.dto.product.CategoryRequest;
import com.example.ecommercemanagementsystem.entity.Category;
import com.example.ecommercemanagementsystem.repository.CategoryRepository;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class CategoryService {

    private final CategoryRepository categoryRepository;

    public CategoryService(CategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    @Transactional(readOnly = true)
    public List<Category> getAllCategories() {
        return categoryRepository.findAll(
                Sort.by(Sort.Direction.ASC, "name")
        );
    }

    @Transactional(readOnly = true)
    public Category getCategoryById(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Category not found"
                ));
    }

    @Transactional
    public Category createCategory(CategoryRequest request) {
        String name = request.name().trim();

        if (categoryRepository.existsByNameIgnoreCase(name)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Category already exists"
            );
        }

        Category category = new Category();
        category.setName(name);

        return categoryRepository.save(category);
    }

    @Transactional
    public Category updateCategory(Long id, CategoryRequest request) {
        Category category = getCategoryById(id);
        String name = request.name().trim();

        categoryRepository.findByNameIgnoreCase(name)
                .ifPresent(existing -> {
                    if (!existing.getId().equals(id)) {
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT,
                                "Category already exists"
                        );
                    }
                });

        category.setName(name);

        return categoryRepository.save(category);
    }

    @Transactional
    public void deleteCategory(Long id) {
        Category category = getCategoryById(id);

        if (!category.getProducts().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Cannot delete a category containing products"
            );
        }

        categoryRepository.delete(category);
    }
}
