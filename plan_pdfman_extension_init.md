# Kế hoạch xây dựng dự án Extension chạy trên browser nhân Chromium trên để quản lý PDF (PDF Manager)

- Tạo dự án từ source code của python trong thư mục `/python_src/pdfman.py` với yêu cầu như sau:
    + "copy" tất cả các tính năng, luồng xử lý, logic hoạt động,... để xây dựng thành Extension
    + hợp nhất tính năng trong 2 file `/python_src/pdfman.py` và `/python_src/pdflock.py`
    + khi hoạt động đảm bảo hiệu năng không chiếm dụng nhiều RAM và CPU (càng ít càng tốt)
    + không nạp RAM mà sử dụng file tạm (`temp` của Windows) để xử lý PDF
- Sau khi hoàn thành đóng gói thành Extension để test thử