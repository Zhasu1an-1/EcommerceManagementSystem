
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.dto.auth.LoginRequest;
import com.example.ecommercemanagementsystem.dto.auth.RegisterRequest;
import com.example.ecommercemanagementsystem.dto.auth.UserResponse;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(
            AuthService authService,
            UserRepository userRepository,
            AuthenticationManager authenticationManager,
            SecurityContextRepository securityContextRepository
    ) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(
            @Valid @RequestBody RegisterRequest request
    ) {
        UserResponse user = authService.register(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(user);
    }

    @PostMapping("/login")
    public ResponseEntity<UserResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        String email = request.email()
                .trim()
                .toLowerCase(Locale.ROOT);

        Authentication authentication;

        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(
                            email,
                            request.password()
                    )
            );
        } catch (AuthenticationException exception) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid email or password"
            );
        }

        UserResponse user = findUserByEmail(authentication.getName());

        HttpSession session = httpRequest.getSession(false);

        if (session != null) {
            httpRequest.changeSessionId();
        }

        SecurityContext securityContext =
                SecurityContextHolder.createEmptyContext();

        securityContext.setAuthentication(authentication);

        SecurityContextHolder.setContext(securityContext);

        securityContextRepository.saveContext(
                securityContext,
                httpRequest,
                httpResponse
        );

        return ResponseEntity.ok(user);
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(
            Authentication authentication
    ) {
        return ResponseEntity.ok(
                findCurrentUser(authentication)
        );
    }

    @PatchMapping("/me/name")
    @PreAuthorize("isAuthenticated()")
    @Transactional
    public ResponseEntity<UserResponse> updateMyName(
            Authentication authentication,
            @Valid @RequestBody UpdateNameRequest request
    ) {
        String email = getAuthenticatedEmail(authentication);

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "User account not found"
                ));

        String newName = request.name().trim();

        if (newName.length() < 2 || newName.length() > 100) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Name must be between 2 and 100 characters"
            );
        }

        user.setName(newName);

        User savedUser = userRepository.save(user);

        return ResponseEntity.ok(
                UserResponse.fromEntity(savedUser)
        );
    }

    @GetMapping("/csrf")
    public ResponseEntity<Map<String, String>> getCsrfToken(
            @RequestAttribute("_csrf") CsrfToken csrfToken
    ) {
        return ResponseEntity.ok(
                Map.of(
                        "headerName", csrfToken.getHeaderName(),
                        "parameterName", csrfToken.getParameterName(),
                        "token", csrfToken.getToken()
                )
        );
    }

    private UserResponse findCurrentUser(
            Authentication authentication
    ) {
        return findUserByEmail(
                getAuthenticatedEmail(authentication)
        );
    }

    private String getAuthenticatedEmail(
            Authentication authentication
    ) {
        if (
                authentication == null ||
                        !authentication.isAuthenticated()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authentication is required"
            );
        }

        return authentication.getName()
                .trim()
                .toLowerCase(Locale.ROOT);
    }

    private UserResponse findUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .map(UserResponse::fromEntity)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "User account not found"
                ));
    }

    public record UpdateNameRequest(
            @NotBlank(message = "Name is required")
            @Size(min = 2, max = 100)
            String name
    ) {
    }
}
