
package com.example.ecommercemanagementsystem.dto.product;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryRequest(

        @NotBlank(message = "Category name is required")
        @Size(min = 2, max = 255, message = "Category name must contain between 2 and 255 characters")
        String name

) {
}
