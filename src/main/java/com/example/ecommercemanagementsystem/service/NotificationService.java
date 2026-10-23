
package com.example.ecommercemanagementsystem.service;

import com.example.ecommercemanagementsystem.adapter.SmsService;
import com.example.ecommercemanagementsystem.entity.Notification;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.NotificationStatus;
import com.example.ecommercemanagementsystem.repository.NotificationRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final SmsService smsService;

    public NotificationService(
            NotificationRepository notificationRepository,
            UserRepository userRepository,
            SmsService smsService
    ) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.smsService = smsService;
    }

    @Transactional
    public Notification createNotification(Long userId, String message) {
        if (message == null || message.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Notification message cannot be empty"
            );
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "User not found"
                ));

        Notification notification = new Notification();
        notification.setUser(user);
        notification.setMessage(message.trim());
        notification.setStatus(NotificationStatus.PENDING);

        return notificationRepository.save(notification);
    }

    @Transactional
    public Notification sendSmsNotification(
            Long userId,
            String phoneNumber,
            String message
    ) {
        if (phoneNumber == null || phoneNumber.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Phone number is required"
            );
        }

        Notification notification = createNotification(userId, message);

        try {
            boolean successful = smsService.sendSms(
                    phoneNumber.trim(),
                    notification.getMessage()
            );

            if (successful) {
                notification.markAsSent();
            } else {
                notification.markAsFailed();
            }

        } catch (RuntimeException exception) {
            notification.markAsFailed();
        }

        return notificationRepository.save(notification);
    }

    @Transactional(readOnly = true)
    public Page<Notification> getUserNotifications(
            Long userId,
            Pageable pageable
    ) {
        return notificationRepository.findByUserId(userId, pageable);
    }

    @Transactional(readOnly = true)
    public Notification getNotificationById(Long id, Long userId) {
        return notificationRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Notification not found"
                ));
    }

    @Transactional(readOnly = true)
    public List<Notification> getPendingNotifications() {
        return notificationRepository.findByStatus(
                NotificationStatus.PENDING
        );
    }

    @Transactional
    public Notification markAsSent(Long notificationId) {
        Notification notification = findNotificationById(notificationId);

        if (notification.getStatus() != NotificationStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only pending notifications can be marked as sent"
            );
        }

        notification.markAsSent();

        return notificationRepository.save(notification);
    }

    @Transactional
    public Notification markAsFailed(Long notificationId) {
        Notification notification = findNotificationById(notificationId);

        if (notification.getStatus() != NotificationStatus.PENDING) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Only pending notifications can be marked as failed"
            );
        }

        notification.markAsFailed();

        return notificationRepository.save(notification);
    }

    @Transactional(readOnly = true)
    public long countFailedNotifications(Long userId) {
        return notificationRepository.countByUserIdAndStatus(
                userId,
                NotificationStatus.FAILED
        );
    }

    private Notification findNotificationById(Long id) {
        return notificationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Notification not found"
                ));
    }
}
