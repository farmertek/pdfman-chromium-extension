# Chỉnh sửa hoàn thiện Extension chạy trên browser nhân Chromium để quản lý PDF (PDF Manager)
- Kế hoạch khởi tạo dự án đã triển khai: `plan_pdfman_extension_init.md`
- Hiện tại đang test để tinh chỉnh và vá lỗi

## tinh chỉnh lại và vá lỗi (bugfix):
- tinh chỉnh lại khi di chuyển trang PDF thì bookmark không di chuyển theo thứ tự vị trí của trang đó (bookmark trỏ đúng trang). Vì vậy hãy chỉnh lại:
    + khi di chuyển trang thì vị trí bookmark cũng di chuyển tương ứng
    + cấp bậc cha/con của bookmark khi di chuyển phải được giữ nguyên, không thay đổi đúng cấp bậc gốc