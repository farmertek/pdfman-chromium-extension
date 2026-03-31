# Chỉnh sửa hoàn thiện Extension chạy trên browser nhân Chromium để quản lý PDF (PDF Manager)
- Kế hoạch khởi tạo dự án đã triển khai: `plan_pdfman_extension_init.md`
- Hiện tại đang test để tinh chỉnh và vá lỗi

## tinh chỉnh lại và vá lỗi (bugfix):
- tìm cách fix lỗi qpdf không hoạt động trong việc Lock PDF và không có nguyên nhân: (đã fix nhiều lần nhưng không đạt yêu cầu)
    + rà soát kiểm tra lại tất cả hàm liên quan đến qpdf sử dụng để lock PDF
    + xem loại toàn  bộ luồng logic của Lock PDF
    + lỗi thông báo khi test:
        ```text
        Không thể khóa file PDF:
        Không thể khởi tạo QPDF Worker: Worker script failed to load or parse (script never started) [event.type=error]
        ```