
package com.example.ecommercemanagementsystem.adapter;

import org.springframework.stereotype.Component;

@Component
public class SmsAdapter implements SmsService {

    private final ExternalSmsProvider externalSmsProvider;

    public SmsAdapter(ExternalSmsProvider externalSmsProvider) {
        this.externalSmsProvider = externalSmsProvider;
    }

    @Override
    public boolean sendSms(String phoneNumber, String message) {
        return externalSmsProvider.deliverMessage(phoneNumber, message);
    }
}
