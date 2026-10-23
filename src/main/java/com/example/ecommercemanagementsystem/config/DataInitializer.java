
package com.example.ecommercemanagementsystem.config;

import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.Role;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Locale;

@Configuration
public class DataInitializer {

    @Bean
    public CommandLineRunner initializeAdmin(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            Environment environment
    ) {
        return args -> {
            String email = environment.getProperty("ADMIN_EMAIL");
            String password = environment.getProperty("ADMIN_PASSWORD");

            if (email == null && password == null) {
                return;
            }

            if (email == null || email.isBlank()
                    || password == null || password.isBlank()) {
                throw new IllegalStateException(
                        "Both ADMIN_EMAIL and ADMIN_PASSWORD are required"
                );
            }

            email = email.trim().toLowerCase(Locale.ROOT);

            if (password.length() < 8 || password.length() > 72) {
                throw new IllegalStateException(
                        "Admin password must contain between 8 and 72 characters"
                );
            }

            User existingUser = userRepository.findByEmail(email)
                    .orElse(null);

            if (existingUser != null) {
                if (existingUser.getRole() != Role.ADMIN) {
                    throw new IllegalStateException(
                            "Admin email is already registered as a customer"
                    );
                }

                return;
            }

            User admin = new User();
            admin.setName("Administrator");
            admin.setEmail(email);
            admin.setPasswordHash(passwordEncoder.encode(password));
            admin.setRole(Role.ADMIN);

            userRepository.save(admin);
        };
    }
}
