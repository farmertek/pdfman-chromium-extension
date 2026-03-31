# Chỉnh sửa hoàn thiện Extension chạy trên browser nhân Chromium để quản lý PDF (PDF Manager)
- Kế hoạch khởi tạo dự án đã triển khai: `plan_pdfman_extension_init.md`
- Hiện tại đang test để tinh chỉnh và vá lỗi

## tinh chỉnh lại và vá lỗi (bugfix):
- tìm cách fix lỗi qpdf không hoạt động trong việc Lock PDF và không có nguyên nhân:
    + rà soát kiểm tra lại tất cả hàm liên quan đến qpdf sử dụng để lock PDF