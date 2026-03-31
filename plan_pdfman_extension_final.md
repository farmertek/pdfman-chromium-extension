# Chỉnh sửa hoàn thiện Extension chạy trên browser nhân Chromium để quản lý PDF (PDF Manager)

## Trạng thái triển khai

- [x] Loại bỏ code thừa, code không cần thiết sau nhiều lần chỉnh sửa.
- [x] Rà soát và siết lại luồng tài nguyên PDF tạm trong RAM (`Uint8Array`, canvas, object URL).
- [x] Giảm quyền extension về mức tối thiểu để thuận lợi khi publish.
- [x] Tối ưu các luồng nặng RAM/CPU khi render và export PDF.

## Các thay đổi đã áp dụng trong code

### 1) Giảm quyền extension tối đa

- Đã xóa các quyền không còn cần:
    - `permissions: ["activeTab"]`
    - `host_permissions: ["<all_urls>"]`
- Điều chỉnh `background.js` để chỉ mở `manager.html`, không còn đọc URL tab hiện tại.

Kết quả: extension tập trung xử lý file PDF local do người dùng mở, giảm rủi ro bị đánh giá đòi quyền rộng.

### 2) Dọn tài nguyên tạm khi đóng file / đóng tab

- Bổ sung cơ chế theo dõi object URL tải file (`blob:`) và thu hồi an toàn (`revoke`) sau khi tải.
- Bổ sung `dispose()` cho cả `PDFManagerApp` và `PDFLockTool`, gọi khi `pagehide`.
- Khi đóng file (`Close PDF`), toàn bộ trạng thái in-memory được reset (`pdfBytes`, `originalPdfBytes`, `pdfDoc`, selection, outline...).

Ghi chú: extension web không tạo file temp trên ổ đĩa. Tài nguyên tạm chủ yếu nằm trong RAM và object URL của browser.

### 3) Tối ưu RAM/CPU khi render xem trước và export

- Thêm giới hạn số pixel canvas khi render preview (`MAX_VIEW_CANVAS_PIXELS`) để tránh vọt RAM.
- Thêm hàng đợi render với giới hạn đồng thời (`MAX_RENDER_CONCURRENCY = 2`) để giảm spike CPU.
- Giảm `rootMargin` lazy loading từ `400px` xuống `250px` để giảm số trang render sớm.
- Khi trang ra khỏi viewport, hủy `renderTask` và giải phóng canvas ngay.
- Luồng raster fallback (unlock/save encrypted) dùng scale thích nghi theo số trang (`getAdaptiveExportScale`) và giới hạn pixel canvas (`MAX_EXPORT_CANVAS_PIXELS`).

### 4) Làm sạch code và tăng an toàn logic

- Xóa luồng auto-open theo `pdfUrl` query (không còn phù hợp với policy quyền tối thiểu).
- Gỡ các biến trung gian không dùng trong `moveSelectedPages`.
- `readOutlineFromBytes` dùng `try/finally` để đảm bảo `pdfDoc.destroy()` luôn được gọi.

## Đề xuất nâng cao (chưa bật, có thể cân nhắc)

1. Chuyển các tác vụ raster nặng (unlock/export encrypted file nhiều trang) sang Web Worker để tránh block UI.
2. Thêm tùy chọn "Chế độ máy yếu": giảm `MAX_VIEW_CANVAS_PIXELS`, giảm chất lượng JPEG, giảm render concurrency xuống 1.
3. Thêm telemetry nội bộ (không gửi mạng) như thời gian render/trang và peak memory ước lượng để tuning theo dữ liệu thực tế.
