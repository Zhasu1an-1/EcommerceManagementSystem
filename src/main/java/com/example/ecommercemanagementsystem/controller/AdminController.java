
package com.example.ecommercemanagementsystem.controller;

import com.example.ecommercemanagementsystem.enums.OrderStatus;
import com.example.ecommercemanagementsystem.enums.PaymentStatus;
import com.example.ecommercemanagementsystem.repository.CategoryRepository;
import com.example.ecommercemanagementsystem.repository.OrderRepository;
import com.example.ecommercemanagementsystem.repository.PaymentRepository;
import com.example.ecommercemanagementsystem.repository.ProductRepository;
import com.example.ecommercemanagementsystem.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;

    public AdminController(
            UserRepository userRepository,
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            OrderRepository orderRepository,
            PaymentRepository paymentRepository
    ) {
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.orderRepository = orderRepository;
        this.paymentRepository = paymentRepository;
    }

    @GetMapping("/dashboard")
    public ResponseEntity<DashboardResponse> getDashboard() {
        DashboardResponse response = new DashboardResponse(
                userRepository.count(),
                productRepository.count(),
                categoryRepository.count(),
                orderRepository.count(),
                orderRepository.countByStatus(OrderStatus.PENDING),
                orderRepository.countByStatus(OrderStatus.CONFIRMED),
                orderRepository.countByStatus(OrderStatus.SHIPPED),
                orderRepository.countByStatus(OrderStatus.DELIVERED),
                orderRepository.countByStatus(OrderStatus.CANCELLED),
                paymentRepository.countByStatus(PaymentStatus.SUCCESS),
                paymentRepository.countByStatus(PaymentStatus.FAILED)
        );

        return ResponseEntity.ok(response);
    }

    public record DashboardResponse(
            long totalUsers,
            long totalProducts,
            long totalCategories,
            long totalOrders,
            long pendingOrders,
            long confirmedOrders,
            long shippedOrders,
            long deliveredOrders,
            long cancelledOrders,
            long successfulPayments,
            long failedPayments
    ) {
    }
}
