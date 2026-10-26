
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.entity.Notification;
import com.example.ecommercemanagementsystem.enums.NotificationStatus;
import com.example.ecommercemanagementsystem.repository.NotificationRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/notifications")
@PreAuthorize("isAuthenticated()")
public class NotificationController {

    private final NotificationService notificationService;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    public NotificationController(
            NotificationService notificationService,
            NotificationRepository notificationRepository,
            UserRepository userRepository
    ) {
        this.notificationService = notificationService;
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
    }

    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional(readOnly = true)
    public ResponseEntity<Page<NotificationResponse>> getAllNotifications(
            @PageableDefault(
                    size = 20,
                    sort = "createdAt",
                    direction = Sort.Direction.DESC
            ) Pageable pageable
    ) {
        Page<NotificationResponse> notifications = notificationRepository
                .findAll(pageable)
                .map(NotificationResponse::fromEntity);

        return ResponseEntity.ok(notifications);
    }

    @GetMapping
    public ResponseEntity<Page<NotificationResponse>> getMyNotifications(
            Authentication authentication,
            @PageableDefault(
                    size = 20,
                    sort = "createdAt",
                    direction = Sort.Direction.DESC
            ) Pageable pageable
    ) {
        Long userId = getCurrentUserId(authentication);

        Page<NotificationResponse> notifications = notificationService
                .getUserNotifications(userId, pageable)
                .map(NotificationResponse::fromEntity);

        return ResponseEntity.ok(notifications);
    }

    @GetMapping("/failed/count")
    public ResponseEntity<FailedNotificationCountResponse> countFailedNotifications(
            Authentication authentication
    ) {
        Long userId = getCurrentUserId(authentication);

        long count = notificationService.countFailedNotifications(userId);

        return ResponseEntity.ok(
                new FailedNotificationCountResponse(count)
        );
    }

    @GetMapping("/pending")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<NotificationResponse>> getPendingNotifications() {
        List<NotificationResponse> notifications = notificationService
                .getPendingNotifications()
                .stream()
                .map(NotificationResponse::fromEntity)
                .toList();

        return ResponseEntity.ok(notifications);
    }

    @GetMapping("/{id}")
    public ResponseEntity<NotificationResponse> getNotificationById(
            Authentication authentication,
            @PathVariable Long id
    ) {
        Long userId = getCurrentUserId(authentication);

        Notification notification = notificationService
                .getNotificationById(id, userId);

        return ResponseEntity.ok(
                NotificationResponse.fromEntity(notification)
        );
    }

    @PostMapping("/sms")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<NotificationResponse> sendSmsNotification(
            @Valid @RequestBody SmsNotificationRequest request
    ) {
        Notification notification = notificationService.sendSmsNotification(
                request.userId(),
                request.phoneNumber(),
                request.message()
        );

        NotificationResponse response =
                NotificationResponse.fromEntity(notification);

        URI location = URI.create(
                "/api/notifications/" + response.id()
        );

        return ResponseEntity
                .created(location)
                .body(response);
    }

    @PatchMapping("/{id}/sent")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<NotificationResponse> markAsSent(
            @PathVariable Long id
    ) {
        Notification notification = notificationService.markAsSent(id);

        return ResponseEntity.ok(
                NotificationResponse.fromEntity(notification)
        );
    }

    @PatchMapping("/{id}/failed")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<NotificationResponse> markAsFailed(
            @PathVariable Long id
    ) {
        Notification notification = notificationService.markAsFailed(id);

        return ResponseEntity.ok(
                NotificationResponse.fromEntity(notification)
        );
    }

    private Long getCurrentUserId(Authentication authentication) {
        if (
                authentication == null ||
                        !authentication.isAuthenticated()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authentication is required"
            );
        }

        String email = authentication.getName()
                .trim()
                .toLowerCase(Locale.ROOT);

        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED,
                        "Authenticated user not found"
                ))
                .getId();
    }

    public record SmsNotificationRequest(
            @NotNull(message = "User ID is required")
            @Positive(message = "User ID must be positive")
            Long userId,

            @NotBlank(message = "Phone number is required")
            @Size(max = 30)
            String phoneNumber,

            @NotBlank(message = "Message is required")
            @Size(max = 1000)
            String message
    ) {
    }

    public record NotificationResponse(
            Long id,
            Long userId,
            String message,
            NotificationStatus status,
            LocalDateTime createdAt,
            LocalDateTime sentAt
    ) {
        public static NotificationResponse fromEntity(
                Notification notification
        ) {
            return new NotificationResponse(
                    notification.getId(),
                    notification.getUser().getId(),
                    notification.getMessage(),
                    notification.getStatus(),
                    notification.getCreatedAt(),
                    notification.getSentAt()
            );
        }
    }

    public record FailedNotificationCountResponse(
            long count
    ) {
    }
}
