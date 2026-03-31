# Chỉnh sửa hoàn thiện Extension chạy trên browser nhân Chromium để quản lý PDF (PDF Manager)

## Trạng thái hiện tại

- [x] Rollback lại tính năng đọc tab browser hiện tại nếu đường dẫn PDF đang mở là local, khi click mở extension thì auto mở PDF đó trong "PDF Manager" (cấp lại quyền `permissions: ["activeTab"]`).
- [x] Triển khai bản OPFS cho luồng mở và xem PDF trước để giảm RAM.
- [x] Chạy đợt tối ưu thứ hai: Chế độ máy yếu + pipeline raster nền bằng Worker cho luồng nặng.

## Đã triển khai cho OPFS (open/view)

1. Chuyển nguồn PDF đang mở sang OPFS (disk-backed) cho `PDFManagerApp`, có fallback về RAM khi OPFS không khả dụng.
2. Luồng render preview (`pdf.js`) ưu tiên đọc từ object URL tạo từ file OPFS thay vì giữ bytes lớn cố định trong RAM.
3. Bổ sung quản lý lifecycle file tạm OPFS: tạo, thay thế, khôi phục từ bản gốc (reset), xóa khi đóng file/đóng tab.
4. Loại bỏ bước đọc kích thước từng trang khi dựng toàn bộ grid placeholder (trước đây gọi `getPage()` cho mọi trang), thay bằng tỉ lệ trang mẫu đã cache.

Mục tiêu đạt được: giảm mạnh peak RAM khi mở PDF dài và cuộn xem nhiều trang (đặc biệt trường hợp 177 trang trở lên).

## Đã triển khai cho đợt tối ưu thứ hai

1. Thêm tùy chọn "Chế độ máy yếu" trong giao diện quản lý PDF để điều chỉnh profile hiệu năng theo thời gian thực.
2. Lưu profile hiệu năng vào localStorage để giữ lại sau khi mở lại extension.
3. Profile low-memory áp dụng đồng thời nhiều tham số:
	- giảm ngưỡng pixel canvas preview/export
	- giảm render concurrency xuống 1
	- thu hẹp rootMargin của lazy loading
	- giảm số canvas được giữ cùng lúc (eviction theo LRU nhẹ)
4. Bổ sung Worker chuyên raster (`pdf-raster-worker.js`) để offload các luồng nặng:
	- unlock fallback raster
	- lưu file encrypted bằng raster pipeline
	- có fallback tự động về main thread khi worker không khả dụng hoặc lỗi runtime
5. Thêm hard-cap theo viewport range cho render queue:
	- chỉ giữ/render trang trong cửa sổ quanh vùng nhìn (visible range + padding)
	- giới hạn số trang trong cửa sổ render bằng `renderWindowHardCapPages`
	- trang ngoài cửa sổ sẽ bị unload để hạ RAM
6. Giảm thêm export scale theo số trang lớn (cả main thread và worker):
	- tài liệu càng nhiều trang thì scale càng thấp
	- mục tiêu giảm peak RAM và CPU khi save/unlock file dài

Mục tiêu đạt được: giảm spike RAM/CPU và giảm hiện tượng đơ UI khi xử lý PDF lớn nhiều trang.

## Đề xuất nâng cao (chưa bật, có thể cân nhắc)

1. Thêm benchmark nội bộ để đo peak RAM/CPU theo từng profile (`normal`, `lowMemory`) với bộ file chuẩn (50, 177, 400 trang).
2. Thêm telemetry nội bộ (không gửi mạng) như thời gian render/trang và peak memory ước lượng để tuning tham số hard-cap/padding.
3. Cân nhắc worker pool 2 tầng (render preview worker riêng và export worker riêng) nếu cần tối ưu thêm trên máy nhiều nhân CPU.