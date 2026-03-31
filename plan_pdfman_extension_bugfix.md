# Chỉnh sửa hoàn thiện Extension chạy trên browser nhân Chromium để quản lý PDF (PDF Manager)
- Kế hoạch khởi tạo dự án đã triển khai: `plan_pdfman_extension_init.md`
- Hiện tại đang test để tinh chỉnh và vá lỗi

## tinh chỉnh lại và vá lỗi (bugfix):
- Khi Browser đang mở PDF (của tab current mà người dùng đang xem), nếu nhấn vào biểu tượng extension thì mặc nhiên mở PDF đó để mở trong extension
- Đưa tính năng Unlock PDF vào luồng xử lý khi mở (open) hoặc thêm (add) PDF bị khóa thì thực hiện mở khóa toàn bộ (unlock PDF toàn bộ, nếu có password thì hỏi nhập password)
- kiểm tra lại khi unlock PDF thì file bị lỗi hỏng file PDF (không mở được hoặc mở được thì toàn trang không có nói dung)
- tinh chỉnh lại tính năng zoom: 25% hiện 6 cột, 50% hiện 4 cột, 80% hiện 3 cột, 120% hiện 2 cột, >= 150% hiện 1 cột
- khi view PDF có ít trang (chỉ có 1 hàng view trang) thì không kéo dài trang xuống (nhìm trang bị cao và dài không đẹp) mà view theo tỷ lệ ngang-dọc của trang nhìn cho cân đối.
