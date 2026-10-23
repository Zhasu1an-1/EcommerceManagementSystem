
package com.example.ecommercemanagementsystem.repository;

import com.example.ecommercemanagementsystem.entity.Notification;
import com.example.ecommercemanagementsystem.enums.NotificationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByUserId(Long userId, Pageable pageable);

    Optional<Notification> findByIdAndUserId(Long id, Long userId);

    List<Notification> findByStatus(NotificationStatus status);

    List<Notification> findByUserIdAndStatus(
            Long userId,
            NotificationStatus status
    );

    long countByUserIdAndStatus(Long userId, NotificationStatus status);
}
