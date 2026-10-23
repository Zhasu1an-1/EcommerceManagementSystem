
package com.example.ecommercemanagementsystem.dto.auth;

import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.Role;

public record UserResponse(
        Long id,
        String name,
        String email,
        Role role
) {

    public static UserResponse fromEntity(User user) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole()
        );
    }
}
