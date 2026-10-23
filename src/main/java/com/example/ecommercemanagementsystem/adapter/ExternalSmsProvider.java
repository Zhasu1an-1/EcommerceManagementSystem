
package com.example.ecommercemanagementsystem.adapter;

import org.springframework.stereotype.Component;

@Component
public class ExternalSmsProvider {

    public boolean deliverMessage(String recipient, String content) {
        if (recipient == null || recipient.isBlank()) {
            throw new IllegalArgumentException(
                    "Recipient phone number cannot be empty"
            );
        }

        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException(
                    "SMS content cannot be empty"
            );
        }

        System.out.println("External SMS Provider");
        System.out.println("Recipient: " + recipient);
        System.out.println("Message: " + content);
        System.out.println("SMS delivered successfully");

        return true;
    }
}
