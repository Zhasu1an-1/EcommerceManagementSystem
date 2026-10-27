package com.example.ecommercemanagementsystem;

import com.example.ecommercemanagementsystem.adapter.ExternalSmsProvider;
import com.example.ecommercemanagementsystem.adapter.SmsAdapter;
import com.example.ecommercemanagementsystem.adapter.SmsService;
import com.example.ecommercemanagementsystem.entity.Notification;
import com.example.ecommercemanagementsystem.entity.User;
import com.example.ecommercemanagementsystem.enums.NotificationStatus;
import com.example.ecommercemanagementsystem.enums.Role;
import com.example.ecommercemanagementsystem.repository.NotificationRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import com.example.ecommercemanagementsystem.service.NotificationService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Adapter pattern tests: {@link ExternalSmsProvider} has an incompatible
 * interface ({@code deliverMessage}) and is used via {@link SmsService}.
 */
@ExtendWith(MockitoExtension.class)
class SmsNotificationAdapterTest {

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SmsService smsService;

    @Test
    @DisplayName("Adapter implements the application's SmsService interface")
    void adapterImplementsTargetInterface() {
        SmsService service = new SmsAdapter(new ExternalSmsProvider());

        assertInstanceOf(SmsService.class, service);
    }

    @Test
    @DisplayName("Adapter delegates sendSms to the external provider's deliverMessage")
    void adapterDelegatesToExternalProvider() {
        ExternalSmsProvider provider = org.mockito.Mockito.mock(ExternalSmsProvider.class);
        when(provider.deliverMessage("+77011234567", "Hello")).thenReturn(true);

        SmsService service = new SmsAdapter(provider);

        assertTrue(service.sendSms("+77011234567", "Hello"));
        verify(provider).deliverMessage("+77011234567", "Hello");
    }

    @Test
    @DisplayName("Adapter works end-to-end with the real simulated provider")
    void adapterWorksWithSimulatedProvider() {
        SmsService service = new SmsAdapter(new ExternalSmsProvider());

        assertTrue(service.sendSms("+77011234567", "Your order is confirmed"));
    }

    @Test
    @DisplayName("Blank phone number is rejected")
    void blankPhoneIsRejected() {
        SmsService service = new SmsAdapter(new ExternalSmsProvider());

        assertThrows(IllegalArgumentException.class, () -> service.sendSms(" ", "Hello"));
        assertThrows(IllegalArgumentException.class, () -> service.sendSms(null, "Hello"));
    }

    @Test
    @DisplayName("Blank message is rejected")
    void blankMessageIsRejected() {
        SmsService service = new SmsAdapter(new ExternalSmsProvider());

        assertThrows(IllegalArgumentException.class, () -> service.sendSms("+77011234567", ""));
        assertThrows(IllegalArgumentException.class, () -> service.sendSms("+77011234567", null));
    }

    @Test
    @DisplayName("NotificationService marks notification SENT when SMS succeeds")
    void notificationServiceMarksSent() {
        NotificationService notificationService = newNotificationService();
        stubUserAndSave();
        when(smsService.sendSms("+77011234567", "Order shipped")).thenReturn(true);

        Notification result = notificationService.sendSmsNotification(
                1L, " +77011234567 ", "Order shipped");

        assertEquals(NotificationStatus.SENT, result.getStatus());
        verify(smsService).sendSms("+77011234567", "Order shipped");
    }

    @Test
    @DisplayName("NotificationService marks notification FAILED when the provider throws")
    void notificationServiceMarksFailedOnException() {
        NotificationService notificationService = newNotificationService();
        stubUserAndSave();
        when(smsService.sendSms(anyString(), anyString()))
                .thenThrow(new IllegalArgumentException("provider error"));

        Notification result = notificationService.sendSmsNotification(
                1L, "+77011234567", "Order shipped");

        assertEquals(NotificationStatus.FAILED, result.getStatus());
    }

    @Test
    @DisplayName("NotificationService rejects empty phone number before sending")
    void notificationServiceRejectsEmptyPhone() {
        NotificationService notificationService = newNotificationService();

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> notificationService.sendSmsNotification(1L, " ", "Hello"));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        verify(smsService, never()).sendSms(anyString(), anyString());
    }

    private NotificationService newNotificationService() {
        return new NotificationService(notificationRepository, userRepository, smsService);
    }

    private void stubUserAndSave() {
        User user = new User("Test", "test@example.com", "hash", Role.CUSTOMER);
        user.setId(1L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(notificationRepository.save(any(Notification.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }
}
