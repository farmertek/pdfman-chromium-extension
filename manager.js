/* ====================================================================
   PDF Manager Extension - Main Application Logic
   Ported from Python (pdfman.py + pdflock.py) to browser extension
   Copyright © 2026 by Hailúa
   ==================================================================== */

// =================== Library References ===================
// pdfjsLib  — set by lib/pdf.js (global)
// PDFLib    — set by lib/pdf-lib.min.js (global)

(function () {
  'use strict';

  // Configure pdf.js worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.js';
  }

  // MV3 CSP blocks inline scripts, so set QPDF path from this external script.
  if (typeof QPDF !== 'undefined' && !QPDF.path) {
    QPDF.path = 'lib/qpdf/';
  }

  const DOWNLOAD_REVOKE_DELAY_MS = 1500;
  const AUTOLOAD_URL_PARAM = 'autoloadPdfUrl';
  const AUTOLOAD_TAB_URL_PARAM = 'autoloadSourceTabUrl';
  const AUTOLOAD_TAB_ID_PARAM = 'autoloadSourceTabId';
  const RESOLVE_TAB_PDF_URL_MESSAGE = 'pdfman.resolvePdfUrlFromTab';
  const OPFS_TEMP_DIR = 'pdfman-temp';
  const PERF_MODE_STORAGE_KEY = 'pdfman.performanceMode';
  const RASTER_WORKER_SCRIPT = 'pdf-raster-worker.js';
  const RASTER_WORKER_TIMEOUT_MS = 180000;
  const RUNTIME_MEMORY_SAMPLE_INTERVAL_MS = 2000;
  const AUTO_PURGE_DEBOUNCE_MS = 180;
  const AUTO_PURGE_COOLDOWN_MS = 900;
  const SCROLL_IDLE_REFRESH_DELAY_MS = 90;
  const SCROLL_RELEASE_REFRESH_WINDOW_MS = 450;
  const WASM_HELPER_MODULE = 'lib/pdfman_wasm/pdfman_wasm.js';
  const WASM_HELPER_BINARY = 'lib/pdfman_wasm/pdfman_wasm_bg.wasm';
  const MIN_ZOOM_PERCENT = 40;
  const MAX_ZOOM_PERCENT = 500;
  const ZOOM_STEP_PERCENT = 5;
  const WHEEL_ZOOM_IDLE_RESET_MS = 140;
  const WHEEL_ZOOM_PIXELS_PER_STEP = 85;
  const WHEEL_ZOOM_MAX_STEPS_PER_EVENT = 2;
  const WHEEL_ZOOM_APPLY_DELAY_MS = 180;
  const CARD_WIDTH_PADDING_PX = 28;
  const MIN_THUMB_PREVIEW_WIDTH = 64;
  const MIN_THUMB_PREVIEW_HEIGHT = 40;
  const UI_LANG_STORAGE_KEY = 'pdfman.uiLanguage';
  const UI_THEME_STORAGE_KEY = 'pdfman.uiTheme';
  const SUPPORTED_LANGUAGES = Object.freeze(['vi', 'en']);
  const SUPPORTED_THEME_MODES = Object.freeze(['system', 'light', 'dark']);
  const PERF_PROFILES = Object.freeze({
    normal: {
      viewCanvasPixels: 2000000,
      exportCanvasPixels: 5000000,
      renderConcurrency: 2,
      rootMargin: '250px 0px',
      previewBaseWidth: 180,
      maxRenderedPages: 8,
      renderWindowPaddingPages: 3,
      renderWindowHardCapPages: 14,
      exportJpegQuality: 0.9,
    },
    lowMemory: {
      viewCanvasPixels: 1000000,
      exportCanvasPixels: 2800000,
      renderConcurrency: 1,
      rootMargin: '80px 0px',
      previewBaseWidth: 160,
      maxRenderedPages: 4,
      renderWindowPaddingPages: 1,
      renderWindowHardCapPages: 6,
      exportJpegQuality: 0.65,
    },
  });

  const I18N_TEXT = Object.freeze({
    vi: {
      app: {
        title: 'PDF Manager - Copyright © 2026 by Hailúa',
      },
      tabs: {
        manager: 'PDF Manager',
        lock: '🔒 PDF Lock/Unlock',
      },
      toolbar: {
        languageToggleTitle: 'Chuyển ngôn ngữ EN/VI',
        themeToggleTitle: 'Chọn giao diện Light/Dark/System',
        themeSystem: 'Hệ thống',
        themeLight: 'Sáng',
        themeDark: 'Tối',
      },
      common: {
        ok: 'OK',
        yes: 'Có',
        no: 'Không',
        cancel: 'Hủy',
      },
      dialog: {
        error: 'Lỗi',
        warning: 'Cảnh báo',
        info: 'Thông báo',
        success: 'Thành công',
        saveError: 'Lỗi khi lưu',
        confirm: 'Xác nhận',
        confirmDelete: 'Xác nhận xóa',
        confirmResetAll: 'Xác nhận Reset All',
        addPdfPosition: 'Chọn vị trí thêm PDF',
        unsavedFile: 'File chưa lưu',
        fileLocked: 'File bị khóa',
        autoOpenLanFailed: 'Không thể tự mở PDF từ thư mục mạng LAN',
        autoOpenLocalFailed: 'Không thể tự mở PDF local',
        filePickerFailed: 'Không thể mở hộp thoại chọn file',
        passwordPlaceholder: 'Nhập password...',
      },
      manager: {
        openPdf: '📂 Open PDF',
        openPdfTitle: 'Tìm file PDF để mở và quản lý (hoặc kéo thả PDF vào khung nội dung)',
        closePdf: '✖ Close PDF',
        closePdfTitle: 'Đóng PDF hiện tại',
        saveAsPdf: '💾 SaveAs PDF',
        saveAsPdfTitle: 'Lưu file PDF mới sau khi đã chỉnh sửa',
        addPdf: '➕ Add PDF',
        addPdfTitle: 'Nối file PDF khác vào trước hoặc sau danh sách trang',
        selectAll: '☑ Select All',
        deselectAll: '☐ Deselect All',
        selectAllTitle: 'Chọn hoặc bỏ chọn tất cả các trang (Shift+Click: chọn khoảng)',
        rotateCw: '↻ +90°',
        rotateCwTitle: 'Xoay các trang đã chọn 90° theo chiều kim đồng hồ',
        rotateCcw: '↺ -90°',
        rotateCcwTitle: 'Xoay các trang đã chọn 90° ngược chiều kim đồng hồ',
        rotate180: '⇅ 180°',
        rotate180Title: 'Xoay các trang đã chọn 180°',
        rotateReset: '↺ Reset 0°',
        rotateResetTitle: 'Reset lại các trang đã chọn về 0° (trạng thái ban đầu)',
        moveUp: '⬆ Move Up',
        moveUpTitle: 'Di chuyển các trang đã chọn lên trên',
        moveDown: '⬇ Move Down',
        moveDownTitle: 'Di chuyển các trang đã chọn xuống dưới',
        delete: '🗑 Delete',
        deleteTitle: 'Xóa các trang đã chọn khỏi danh sách',
        resetAll: '⎌ Reset All',
        resetAllTitle: 'Hoàn tác tất cả thay đổi và tải lại file PDF ban đầu',
        emptyTitle: 'Chưa mở file PDF nào',
        emptyHintHtml: 'Nhấn <strong>"Open PDF"</strong> hoặc kéo thả file PDF vào đây',
        lowMemoryMode: 'Chế độ máy yếu',
        lowMemoryTitle: 'Giảm RAM/CPU cho máy yếu (render chậm hơn)',
        perfWidgetTitle: 'Ước lượng tài nguyên đang dùng của PDF Manager',
        ramLabel: 'RAM:',
        cpuLabel: 'CPU:',
        purgeMemory: 'Purge Memory',
        purgingMemory: 'Purging...',
        purgeMemoryTitle: 'Dọn cache render tạm thời để giảm RAM/CPU khi cần',
        zoomLabel: 'Zoom (%):',
        apply: 'Apply',
        pageLabel: 'Trang {page}',
        fileNotSelected: 'Chưa chọn file nào',
        fileOpeningMany: 'Đang mở: {count} file PDF',
        fileOpeningSingle: 'Đang mở: {fileName}',
        pageCount: 'Tổng số trang: {total}',
        pageCountWithVisible: 'Tổng số trang: {total} (sẽ còn {visible} trang)',
        selectedCount: '| Đã chọn: {count}',
        lazyStatus: '| Thumbnail mode: lazy-rendered | {engine} | {columns} columns | Zoom {zoom}% | Storage: {storage}',
        tempPath: '| Temp path: {path}',
        tempPathHintNone: 'Chưa có dữ liệu temp đang hoạt động.',
        storageOpfs: 'OPFS temp',
        storageMemory: 'RAM fallback',
        storageUnknown: '--',
        dropOverlay: 'Thả file PDF tại đây',
        positionStart: 'đầu',
        positionEnd: 'cuối',
        unknownPath: '(không xác định)',
      },
      lock: {
        title: 'Tool Lock/Unlock PDF with Restrictions (AES-256 + AES-128 fallback)',
        openPdfTitle: 'Chọn file PDF để khóa/mở khóa',
        fileNotSelected: 'Chưa chọn file',
        restrictionsLegend: 'Restrictions / Quyền cần khóa',
        resetRestrictions: '🔄 Reset quyền / Reset',
        resetRestrictionsTitle: 'Khôi phục quyền ban đầu của PDF',
        selectAllRestrictions: '☑ Chọn tất cả / Select all',
        deselectAllRestrictions: '☐ Bỏ chọn tất cả / Deselect all',
        toggleRestrictionsTitle: 'Chọn hoặc bỏ chọn tất cả restrictions',
        encryptionInitial: 'Trạng thái mã hóa: chưa chọn file',
        restriction: {
          print: '🚫 Khóa in tài liệu (Print)',
          copy: '🚫 Khóa sao chép văn bản/đồ họa (Copy text/graphics)',
          modify: '🚫 Khóa chỉnh sửa nội dung (Modify contents)',
          annotate: '🚫 Khóa chú thích/annotation (Modify annotations)',
          fill: '🚫 Khóa điền biểu mẫu (Fill forms)',
          extract: '🚫 Khóa trích xuất nội dung (Extract text/images)',
          comment: '🚫 Khóa bình luận/markup (Commenting/markup)',
        },
        restrictionLabel: {
          print: 'Khóa in tài liệu (Print)',
          copy: 'Khóa sao chép văn bản/đồ họa (Copy text/graphics)',
          modify: 'Khóa chỉnh sửa nội dung (Modify contents)',
          annotate: 'Khóa chú thích/annotation (Modify annotations)',
          fill: 'Khóa điền biểu mẫu (Fill forms)',
          extract: 'Khóa trích xuất nội dung (Extract text/images)',
          comment: 'Khóa bình luận/markup (Commenting/markup)',
        },
        passwordLegend: 'Password (tùy chọn) / Optional',
        passwordHint: 'Để trống nếu chỉ muốn khóa restrictions mà không yêu cầu password mở file',
        passwordLabel: 'Password:',
        passwordConfirmLabel: 'Nhập lại Password:',
        lockPdf: '🔒 Lock PDF / Khóa PDF',
        lockPdfTitle: 'Khóa PDF với restrictions và password đã chọn',
        unlockPdf: '🔓 Unlock PDF / Mở khóa PDF',
        unlockPdfTitle: 'Mở khóa PDF',
        profileHint: 'Profile mặc định: AES-256. Nếu môi trường không hỗ trợ, hệ thống tự fallback sang AES-128.',
        encryptedState: 'Trạng thái mã hóa: file đang được bảo vệ (PDF Standard Security)',
        unencryptedState: 'Trạng thái mã hóa: file chưa khóa (PDF Standard Security)',
      },
      runtime: {
        memoryNotAvailable: 'N/A',
        memoryContextTitle: 'Không thể đọc trực tiếp Browser Task Manager. Hiển thị context memory {raw}; tm~ {taskMgr}; scoped {scoped}; canvas {canvas}; buffer {buffer}.',
        memoryEstimateTitle: 'Không thể đọc trực tiếp Browser Task Manager. Đây là số ước lượng tm~ từ heap {heap} + canvas {canvas} + buffer {buffer}.',
        memoryUnsupportedTitle: 'Trình duyệt không hỗ trợ API cần thiết để đọc context memory hoặc ước lượng tm~.',
      },
      about: {
        copyright: 'Copyright © 2026 by Hailúa',
      },
      msg: {
        canvasToJpegFailed: 'Không thể chuyển canvas sang JPEG.',
        fileLockedPrompt: 'File \'{fileName}\' bị khóa bằng password.\nNhập password để mở:',
        invalidPasswordOrOpenFailed: 'Password không đúng hoặc file không thể mở.',
        unlockPdfFailed: 'Không thể mở khóa file PDF:\n{error}',
        noPdfToPurge: 'Chưa có file PDF để dọn cache.',
        purgeMemoryFailed: 'Không thể dọn cache memory:\n{error}',
        selectAddPositionPrompt: 'Mặc định PDF mới sẽ được thêm vào cuối PDF hiện tại.\n\nCó: Thêm vào cuối\nKhông: Thêm vào đầu\nHủy: Không thêm',
        selectAddPositionPromptDefault: 'Mặc định PDF mới sẽ được thêm vào cuối PDF hiện tại.\n\nCó: Thêm vào cuối (mặc định)\nKhông: Thêm vào đầu\nHủy: Không thêm',
        onlyPdfAllowed: 'Chỉ chấp nhận file PDF (.pdf)',
        openMultipleSuccess: 'Đã mở {fileCount} file PDF với tổng {pageCount} trang.',
        openPdfFailed: 'Không thể mở file PDF:\n{error}',
        unsavedFilePrompt: 'File \'{fileName}\' có thay đổi chưa được lưu.\n\nBạn có muốn lưu file trước khi đóng không?',
        rotateNeedSelection: 'Bạn chưa chọn trang nào để xoay.',
        resetRotationNeedSelection: 'Vui lòng chọn ít nhất 1 trang để reset.',
        moveNeedSelection: 'Vui lòng chọn ít nhất 1 trang để di chuyển.',
        moveTopLimit: 'Không thể di chuyển - các trang đã ở vị trí đầu tiên.',
        moveBottomLimit: 'Không thể di chuyển - các trang đã ở vị trí cuối cùng.',
        deleteNeedSelection: 'Vui lòng chọn ít nhất 1 trang để xóa.',
        deleteConfirm: 'Bạn có chắc chắn muốn xóa {count} trang được chọn?\n\n(Trang sẽ bị xóa khi lưu file)',
        selectPdfFirst: 'Vui lòng chọn file PDF trước.',
        readFileFailed: 'Không thể đọc file: {fileName}',
        combinePdfFailed: 'Không thể gộp file PDF:\n{error}',
        readCurrentPdfFailed: 'Không thể đọc dữ liệu PDF hiện tại để gộp file.',
        mergePdfFailed: 'Không thể thêm file PDF:\n{error}',
        mergePdfSuccess: 'Đã thêm {fileCount} file với tổng {pageCount} trang vào {position} file.',
        nothingToSave: 'Chưa có file nào để lưu.',
        saveUnchangedConfirm: 'Bạn chưa thực hiện chỉnh sửa/thay đổi trang nào. Bạn có muốn lưu nguyên bản gốc không?',
        encryptedSaveReadFailed: 'Không thể đọc dữ liệu PDF mã hóa để lưu file.',
        saveReadFailed: 'Không thể đọc dữ liệu PDF để lưu file.',
        saveSuccess: 'Đã lưu file: {fileName}',
        deletedPagesSummary: 'Đã xóa {count} trang.',
        zoomRangeError: 'Tỷ lệ zoom phải nằm trong khoảng {min}% - {max}%',
        resetAllPrompt: 'Bạn có chắc chắn muốn khôi phục toàn bộ những thay đổi?\n\n(Tất cả xoay trang, xóa trang và thêm trang sẽ bị hủy)',
        originalDataMissing: 'Không tìm thấy dữ liệu PDF gốc để reset.',
        resetAllSuccess: 'Đã khôi phục trạng thái gốc của file.',
        lockNeedRestrictionOrPassword: 'Vui lòng chọn ít nhất 1 tính năng cần khóa hoặc nhập password.',
        passwordMismatch: 'Password nhập lại không khớp.',
        qpdfNotLoaded: 'Thư viện QPDF chưa được tải. Vui lòng tải lại extension.',
        lockPdfFailed: 'Không thể khóa file PDF:\n{error}',
        notLockedPdf: 'File PDF này không bị khóa.',
        unlockSuccess: 'PDF đã được mở khóa thành công: {fileName}',
        unlockError: 'Lỗi khi mở khóa PDF: {error}',
        noValidPdfForOpen: 'Không có file PDF hợp lệ để mở.',
        openFileFailed: 'Không thể mở file: {error}',
        invalidPasswordTryAgain: 'Password không đúng. Vui lòng nhập lại hoặc nhấn Hủy.',
        noPdfSourceToDisplay: 'Không có dữ liệu PDF để hiển thị.',
        opfsReadFailed: 'Không thể đọc file PDF trong OPFS.',
        noValidAutoOpenUrl: 'Không có URL file phù hợp để mở tự động.',
        invalidAutoOpenUrl: 'URL PDF tự mở không hợp lệ.',
        lanAutoOpenFailedPrompt: 'Extension đã thử lấy lại đường dẫn PDF thật từ tab browser, nhưng vẫn không thể đọc trực tiếp file mạng LAN (UNC).\n\nĐường dẫn nhận diện:\n{path}\n\nNhấn "Có" để mở hộp thoại chọn file giống nút "Open PDF".\n\nChi tiết: {detail}',
        fileInputNotFound: 'Không tìm thấy thành phần file input.\nHãy nhấn nút "Open PDF" để chọn thủ công.',
        browserBlockedPicker: 'Trình duyệt đã chặn việc mở file picker tự động.\nHãy nhấn nút "Open PDF" để chọn thủ công.',
        autoOpenLocalFailedPrompt: 'Extension không thể đọc file PDF từ tab hiện tại.\n\n1) Bật quyền "Allow access to file URLs" cho extension trong chrome://extensions.\n2) Mở lại file PDF local rồi click lại icon extension.\n\nChi tiết: {detail}',
        encryptionDetailNotSelected: 'chưa chọn file',
        encryptionDetailNeedPassword: 'cần password để đọc quyền hiện tại',
        encryptionDetailOpenedByPassword: 'đã mở bằng owner/user password',
        encryptionDetailOwnerPassword: 'owner/user password',
        encryptionDetailNoOpenPassword: 'không đặt password mở file',
        encryptionDetailPartialMetadata: 'đã phát hiện mã hóa nhưng chưa đọc đủ metadata quyền',
        encryptionDetailMetadataFallback: 'không đọc được metadata quyền, đang hiển thị mặc định không khóa',
        qpdfInitFailed: 'Không thể khởi tạo QPDF Worker: {error}',
        qpdfTimeout: 'QPDF timeout sau 60 giây.',
        qpdfNoLogs: 'Không nhận được log nào từ QPDF Worker (có thể WASM chưa khởi tạo được).',
      },
      lockReport: {
        successTitle: 'PDF đã được khóa thành công!',
        fileLine: 'File: {fileName}',
        profileLine: 'Profile mã hóa đã áp dụng: {profile}',
        passwordSet: 'Password mở file: Đã thiết lập.',
        passwordNotSet: 'Password mở file: Không đặt (chỉ khóa restrictions).',
        restrictionsTitle: 'Danh sách restrictions đã khóa:',
        noRestrictions: '- Không có',
        compatibilityTitle: 'Lưu ý tương thích:',
        compatibilityFallback: '• Môi trường đã dùng fallback AES-128 để tương thích.',
        compatibilityGrouped: '• annotate/fill/comment được áp dụng theo nhóm modify.',
      },
    },
    en: {
      app: {
        title: 'PDF Manager - Copyright © 2026 by Hailúa',
      },
      tabs: {
        manager: 'PDF Manager',
        lock: '🔒 PDF Lock/Unlock',
      },
      toolbar: {
        languageToggleTitle: 'Switch EN/VI language',
        themeToggleTitle: 'Choose Light/Dark/System theme mode',
        themeSystem: 'System',
        themeLight: 'Light',
        themeDark: 'Dark',
      },
      common: {
        ok: 'OK',
        yes: 'Yes',
        no: 'No',
        cancel: 'Cancel',
      },
      dialog: {
        error: 'Error',
        warning: 'Warning',
        info: 'Info',
        success: 'Success',
        saveError: 'Save Error',
        confirm: 'Confirm',
        confirmDelete: 'Confirm Delete',
        confirmResetAll: 'Confirm Reset All',
        addPdfPosition: 'Choose Add Position',
        unsavedFile: 'Unsaved File',
        fileLocked: 'Locked File',
        autoOpenLanFailed: 'Cannot auto-open PDF from LAN share',
        autoOpenLocalFailed: 'Cannot auto-open local PDF',
        filePickerFailed: 'Cannot open file picker',
        passwordPlaceholder: 'Enter password...',
      },
      manager: {
        openPdf: '📂 Open PDF',
        openPdfTitle: 'Choose a PDF to open and manage (or drag and drop into the content area)',
        closePdf: '✖ Close PDF',
        closePdfTitle: 'Close current PDF',
        saveAsPdf: '💾 SaveAs PDF',
        saveAsPdfTitle: 'Save a new PDF after editing',
        addPdf: '➕ Add PDF',
        addPdfTitle: 'Append other PDF files before or after current pages',
        selectAll: '☑ Select All',
        deselectAll: '☐ Deselect All',
        selectAllTitle: 'Select or deselect all pages (Shift+Click to select range)',
        rotateCw: '↻ +90°',
        rotateCwTitle: 'Rotate selected pages 90° clockwise',
        rotateCcw: '↺ -90°',
        rotateCcwTitle: 'Rotate selected pages 90° counter-clockwise',
        rotate180: '⇅ 180°',
        rotate180Title: 'Rotate selected pages 180°',
        rotateReset: '↺ Reset 0°',
        rotateResetTitle: 'Reset selected pages to 0° (original orientation)',
        moveUp: '⬆ Move Up',
        moveUpTitle: 'Move selected pages up',
        moveDown: '⬇ Move Down',
        moveDownTitle: 'Move selected pages down',
        delete: '🗑 Delete',
        deleteTitle: 'Delete selected pages from list',
        resetAll: '⎌ Reset All',
        resetAllTitle: 'Undo all changes and reload the original PDF',
        emptyTitle: 'No PDF opened yet',
        emptyHintHtml: 'Click <strong>"Open PDF"</strong> or drag and drop PDF files here',
        lowMemoryMode: 'Low-memory mode',
        lowMemoryTitle: 'Reduce RAM/CPU usage on low-end devices (slower render)',
        perfWidgetTitle: 'Estimated runtime resource usage of PDF Manager',
        ramLabel: 'RAM:',
        cpuLabel: 'CPU:',
        purgeMemory: 'Purge Memory',
        purgingMemory: 'Purging...',
        purgeMemoryTitle: 'Purge temporary render cache to reduce RAM/CPU usage',
        zoomLabel: 'Zoom (%):',
        apply: 'Apply',
        pageLabel: 'Page {page}',
        fileNotSelected: 'No file selected',
        fileOpeningMany: 'Opening: {count} PDF files',
        fileOpeningSingle: 'Opening: {fileName}',
        pageCount: 'Total pages: {total}',
        pageCountWithVisible: 'Total pages: {total} ({visible} pages after save)',
        selectedCount: '| Selected: {count}',
        lazyStatus: '| Thumbnail mode: lazy-rendered | {engine} | {columns} columns | Zoom {zoom}% | Storage: {storage}',
        tempPath: '| Temp path: {path}',
        tempPathHintNone: 'No active temp data.',
        storageOpfs: 'OPFS temp',
        storageMemory: 'RAM fallback',
        storageUnknown: '--',
        dropOverlay: 'Drop PDF files here',
        positionStart: 'start',
        positionEnd: 'end',
        unknownPath: '(unknown)',
      },
      lock: {
        title: 'Tool Lock/Unlock PDF with Restrictions (AES-256 + AES-128 fallback)',
        openPdfTitle: 'Choose a PDF to lock/unlock',
        fileNotSelected: 'No file selected',
        restrictionsLegend: 'Restrictions to lock',
        resetRestrictions: '🔄 Reset restrictions',
        resetRestrictionsTitle: 'Restore original PDF permissions',
        selectAllRestrictions: '☑ Select all',
        deselectAllRestrictions: '☐ Deselect all',
        toggleRestrictionsTitle: 'Select or deselect all restrictions',
        encryptionInitial: 'Encryption state: no file selected',
        restriction: {
          print: '🚫 Block document printing (Print)',
          copy: '🚫 Block text/graphics copy (Copy text/graphics)',
          modify: '🚫 Block content editing (Modify contents)',
          annotate: '🚫 Block annotations (Modify annotations)',
          fill: '🚫 Block form fill (Fill forms)',
          extract: '🚫 Block content extraction (Extract text/images)',
          comment: '🚫 Block comments/markup (Commenting/markup)',
        },
        restrictionLabel: {
          print: 'Block document printing (Print)',
          copy: 'Block text/graphics copy (Copy text/graphics)',
          modify: 'Block content editing (Modify contents)',
          annotate: 'Block annotations (Modify annotations)',
          fill: 'Block form fill (Fill forms)',
          extract: 'Block content extraction (Extract text/images)',
          comment: 'Block comments/markup (Commenting/markup)',
        },
        passwordLegend: 'Password (optional)',
        passwordHint: 'Leave empty if you only want restrictions without file-open password',
        passwordLabel: 'Password:',
        passwordConfirmLabel: 'Confirm password:',
        lockPdf: '🔒 Lock PDF',
        lockPdfTitle: 'Lock PDF with selected restrictions and password',
        unlockPdf: '🔓 Unlock PDF',
        unlockPdfTitle: 'Unlock PDF',
        profileHint: 'Default profile: AES-256. If unsupported, it will fallback to AES-128 automatically.',
        encryptedState: 'Encryption state: file is protected (PDF Standard Security)',
        unencryptedState: 'Encryption state: file is not locked (PDF Standard Security)',
      },
      runtime: {
        memoryNotAvailable: 'N/A',
        memoryContextTitle: 'Cannot read Browser Task Manager directly. Showing context memory {raw}; tm~ {taskMgr}; scoped {scoped}; canvas {canvas}; buffer {buffer}.',
        memoryEstimateTitle: 'Cannot read Browser Task Manager directly. This is an estimated tm~ from heap {heap} + canvas {canvas} + buffer {buffer}.',
        memoryUnsupportedTitle: 'Browser does not support required APIs for context memory or tm~ estimate.',
      },
      about: {
        copyright: 'Copyright © 2026 by Hailúa',
      },
      msg: {
        canvasToJpegFailed: 'Cannot convert canvas to JPEG.',
        fileLockedPrompt: 'File \'{fileName}\' is password-protected.\nEnter password to open:',
        invalidPasswordOrOpenFailed: 'Invalid password or unable to open file.',
        unlockPdfFailed: 'Cannot unlock PDF:\n{error}',
        noPdfToPurge: 'No PDF available to purge cache.',
        purgeMemoryFailed: 'Cannot purge memory cache:\n{error}',
        selectAddPositionPrompt: 'By default, new PDFs are added to the end.\n\nYes: Add to end\nNo: Add to start\nCancel: Do not add',
        selectAddPositionPromptDefault: 'By default, new PDFs are added to the end.\n\nYes: Add to end (default)\nNo: Add to start\nCancel: Do not add',
        onlyPdfAllowed: 'Only PDF files are accepted (.pdf)',
        openMultipleSuccess: 'Opened {fileCount} PDF files with {pageCount} total pages.',
        openPdfFailed: 'Cannot open PDF file:\n{error}',
        unsavedFilePrompt: 'File \'{fileName}\' has unsaved changes.\n\nDo you want to save before closing?',
        rotateNeedSelection: 'No pages selected to rotate.',
        resetRotationNeedSelection: 'Please select at least 1 page to reset.',
        moveNeedSelection: 'Please select at least 1 page to move.',
        moveTopLimit: 'Cannot move - selected pages are already at the beginning.',
        moveBottomLimit: 'Cannot move - selected pages are already at the end.',
        deleteNeedSelection: 'Please select at least 1 page to delete.',
        deleteConfirm: 'Are you sure you want to delete {count} selected page(s)?\n\n(Pages are removed when saving)',
        selectPdfFirst: 'Please select a PDF file first.',
        readFileFailed: 'Cannot read file: {fileName}',
        combinePdfFailed: 'Cannot combine PDF files:\n{error}',
        readCurrentPdfFailed: 'Cannot read current PDF data to merge files.',
        mergePdfFailed: 'Cannot add PDF files:\n{error}',
        mergePdfSuccess: 'Added {fileCount} file(s) with {pageCount} page(s) to the {position} of current file.',
        nothingToSave: 'No file available to save.',
        saveUnchangedConfirm: 'No page edits were made. Do you want to save the original file anyway?',
        encryptedSaveReadFailed: 'Cannot read encrypted PDF data for saving.',
        saveReadFailed: 'Cannot read PDF data for saving.',
        saveSuccess: 'Saved file: {fileName}',
        deletedPagesSummary: 'Deleted {count} page(s).',
        zoomRangeError: 'Zoom must be between {min}% and {max}%',
        resetAllPrompt: 'Are you sure you want to reset all changes?\n\n(All rotations, deletions, and appended pages will be discarded)',
        originalDataMissing: 'Original PDF data was not found for reset.',
        resetAllSuccess: 'Original file state has been restored.',
        lockNeedRestrictionOrPassword: 'Please select at least one restriction or enter a password.',
        passwordMismatch: 'Password confirmation does not match.',
        qpdfNotLoaded: 'QPDF library is not loaded. Please reload the extension.',
        lockPdfFailed: 'Cannot lock PDF file:\n{error}',
        notLockedPdf: 'This PDF is not locked.',
        unlockSuccess: 'PDF unlocked successfully: {fileName}',
        unlockError: 'Error while unlocking PDF: {error}',
        noValidPdfForOpen: 'No valid PDF file found to open.',
        openFileFailed: 'Cannot open file: {error}',
        invalidPasswordTryAgain: 'Incorrect password. Please try again or click Cancel.',
        noPdfSourceToDisplay: 'No PDF data available to render.',
        opfsReadFailed: 'Cannot read PDF file from OPFS.',
        noValidAutoOpenUrl: 'No suitable file URL for auto-open.',
        invalidAutoOpenUrl: 'Invalid auto-open PDF URL.',
        lanAutoOpenFailedPrompt: 'The extension tried resolving the actual PDF path from the browser tab, but still cannot access the LAN (UNC) file directly.\n\nDetected path:\n{path}\n\nPress "Yes" to open the same file picker as "Open PDF".\n\nDetail: {detail}',
        fileInputNotFound: 'File input component was not found.\nPlease click "Open PDF" and choose manually.',
        browserBlockedPicker: 'Browser blocked automatic file picker.\nPlease click "Open PDF" and choose manually.',
        autoOpenLocalFailedPrompt: 'The extension cannot read the PDF from this tab.\n\n1) Enable "Allow access to file URLs" for this extension in chrome://extensions.\n2) Re-open the local PDF and click the extension icon again.\n\nDetail: {detail}',
        encryptionDetailNotSelected: 'no file selected',
        encryptionDetailNeedPassword: 'password required to inspect current permissions',
        encryptionDetailOpenedByPassword: 'opened with owner/user password',
        encryptionDetailOwnerPassword: 'owner/user password',
        encryptionDetailNoOpenPassword: 'no open password set',
        encryptionDetailPartialMetadata: 'encryption detected, but permission metadata is incomplete',
        encryptionDetailMetadataFallback: 'permission metadata unavailable, showing unlocked defaults',
        qpdfInitFailed: 'Cannot initialize QPDF Worker: {error}',
        qpdfTimeout: 'QPDF timed out after 60 seconds.',
        qpdfNoLogs: 'No logs received from QPDF Worker (WASM may not be initialized).',
      },
      lockReport: {
        successTitle: 'PDF locked successfully!',
        fileLine: 'File: {fileName}',
        profileLine: 'Applied encryption profile: {profile}',
        passwordSet: 'Open password: Set.',
        passwordNotSet: 'Open password: Not set (restrictions only).',
        restrictionsTitle: 'Locked restrictions:',
        noRestrictions: '- None',
        compatibilityTitle: 'Compatibility notes:',
        compatibilityFallback: '• Environment used AES-128 fallback for compatibility.',
        compatibilityGrouped: '• annotate/fill/comment are applied in the modify group.',
      },
    },
  });

  function resolveI18nValue(source, keyPath) {
    if (!source || !keyPath) return undefined;
    return String(keyPath)
      .split('.')
      .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), source);
  }

  function formatText(template, params) {
    if (typeof template !== 'string') return '';
    if (!params) return template;
    return template.replace(/\{([^}]+)\}/g, (_, key) => {
      if (!Object.prototype.hasOwnProperty.call(params, key)) return `{${key}}`;
      const value = params[key];
      return value == null ? '' : String(value);
    });
  }

  function getSystemLanguage() {
    const langList = (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) && navigator.languages.length)
      ? navigator.languages
      : [typeof navigator !== 'undefined' ? navigator.language : 'en'];
    const hasVietnamese = langList.some((lang) => String(lang || '').toLowerCase().startsWith('vi'));
    return hasVietnamese ? 'vi' : 'en';
  }

  function normalizeLanguage(lang) {
    const normalized = String(lang || '').toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(normalized)) return normalized;
    return 'en';
  }

  function normalizeThemeMode(mode) {
    const normalized = String(mode || '').toLowerCase();
    if (SUPPORTED_THEME_MODES.includes(normalized)) return normalized;
    return 'system';
  }

  function readStoredLanguage() {
    try {
      const stored = localStorage.getItem(UI_LANG_STORAGE_KEY);
      if (!stored) return getSystemLanguage();
      return normalizeLanguage(stored);
    } catch {
      return getSystemLanguage();
    }
  }

  function writeStoredLanguage(lang) {
    try {
      localStorage.setItem(UI_LANG_STORAGE_KEY, normalizeLanguage(lang));
    } catch {
      // Ignore storage failures.
    }
  }

  function readStoredThemeMode() {
    try {
      const stored = localStorage.getItem(UI_THEME_STORAGE_KEY);
      return normalizeThemeMode(stored || 'system');
    } catch {
      return 'system';
    }
  }

  function writeStoredThemeMode(mode) {
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, normalizeThemeMode(mode));
    } catch {
      // Ignore storage failures.
    }
  }

  let activeLanguage = readStoredLanguage();
  let activeThemeMode = readStoredThemeMode();

  function t(key, params) {
    const selected = I18N_TEXT[activeLanguage] || I18N_TEXT.en;
    const fallback = I18N_TEXT.en;
    const raw = resolveI18nValue(selected, key) ?? resolveI18nValue(fallback, key) ?? key;
    return formatText(raw, params);
  }

  function applyThemeMode(mode, opts) {
    const persist = !(opts && opts.persist === false);
    activeThemeMode = normalizeThemeMode(mode);
    document.documentElement.dataset.theme = activeThemeMode;
    if (persist) writeStoredThemeMode(activeThemeMode);
    renderThemeToggleState();
    return activeThemeMode;
  }

  function asCssContentString(text) {
    const escaped = String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\A ');
    return `"${escaped}"`;
  }

  function applyI18nToDom(root) {
    const scope = root || document;

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = t(key);
    });

    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      el.innerHTML = t(key);
    });

    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      el.title = t(key);
    });

    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      el.placeholder = t(key);
    });
  }

  function renderLanguageToggleLabel() {
    const btn = document.getElementById('btn-lang-toggle');
    if (!btn) return;
    btn.textContent = activeLanguage === 'vi' ? 'EN' : 'VI';
  }

  function renderThemeToggleState() {
    const buttons = document.querySelectorAll('.tab-util-theme[data-theme-mode]');
    buttons.forEach((btn) => {
      const mode = String(btn.getAttribute('data-theme-mode') || '').toLowerCase();
      const selected = mode === activeThemeMode;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function updateDragOverlayLanguage() {
    const cssValue = asCssContentString(t('manager.dropOverlay'));
    document.documentElement.style.setProperty('--drag-overlay-text', cssValue);
  }

  function applyLanguage(lang, opts) {
    const persist = !(opts && opts.persist === false);
    activeLanguage = normalizeLanguage(lang);
    if (persist) writeStoredLanguage(activeLanguage);

    document.documentElement.lang = activeLanguage;
    document.title = t('app.title');
    applyI18nToDom(document);
    renderLanguageToggleLabel();
    updateDragOverlayLanguage();

    if (window._pdfManager && typeof window._pdfManager.onLanguageChanged === 'function') {
      window._pdfManager.onLanguageChanged();
    }
    if (window._pdfLockTool && typeof window._pdfLockTool.onLanguageChanged === 'function') {
      window._pdfLockTool.onLanguageChanged();
    }

    return activeLanguage;
  }

  function setupLanguageToggleButton() {
    const btn = document.getElementById('btn-lang-toggle');
    if (!btn) return;
    btn.onclick = () => {
      const next = activeLanguage === 'vi' ? 'en' : 'vi';
      applyLanguage(next, { persist: true });
    };
  }

  function setupThemeToggleButtons() {
    const buttons = document.querySelectorAll('.tab-util-theme[data-theme-mode]');
    if (!buttons.length) return;

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = normalizeThemeMode(btn.getAttribute('data-theme-mode'));
        applyThemeMode(mode, { persist: true });
      });
    });

    renderThemeToggleState();
  }

  const LEGACY_TITLE_TO_KEY = Object.freeze({
    'Lỗi': 'dialog.error',
    'Cảnh báo': 'dialog.warning',
    'Thông báo': 'dialog.info',
    'Thành công': 'dialog.success',
    'Lỗi khi lưu': 'dialog.saveError',
    'Xác nhận': 'dialog.confirm',
    'Xác nhận xóa': 'dialog.confirmDelete',
    'Xác nhận Reset All': 'dialog.confirmResetAll',
    'Chọn vị trí thêm PDF': 'dialog.addPdfPosition',
    'File chưa lưu': 'dialog.unsavedFile',
    'File bị khóa': 'dialog.fileLocked',
    'Không thể tự mở PDF từ thư mục mạng LAN': 'dialog.autoOpenLanFailed',
    'Không thể tự mở PDF local': 'dialog.autoOpenLocalFailed',
    'Không thể mở hộp thoại chọn file': 'dialog.filePickerFailed',
  });

  const LEGACY_STATIC_MESSAGE_TO_KEY = Object.freeze({
    'Không thể chuyển canvas sang JPEG.': 'msg.canvasToJpegFailed',
    'Password không đúng hoặc file không thể mở.': 'msg.invalidPasswordOrOpenFailed',
    'Chưa có file PDF để dọn cache.': 'msg.noPdfToPurge',
    'Mặc định PDF mới sẽ được thêm vào cuối PDF hiện tại.\n\nCó: Thêm vào cuối\nKhông: Thêm vào đầu\nHủy: Không thêm': 'msg.selectAddPositionPrompt',
    'Mặc định PDF mới sẽ được thêm vào cuối PDF hiện tại.\n\nCó: Thêm vào cuối (mặc định)\nKhông: Thêm vào đầu\nHủy: Không thêm': 'msg.selectAddPositionPromptDefault',
    'Chỉ chấp nhận file PDF (.pdf)': 'msg.onlyPdfAllowed',
    'Bạn chưa chọn trang nào để xoay.': 'msg.rotateNeedSelection',
    'Vui lòng chọn ít nhất 1 trang để reset.': 'msg.resetRotationNeedSelection',
    'Vui lòng chọn ít nhất 1 trang để di chuyển.': 'msg.moveNeedSelection',
    'Không thể di chuyển - các trang đã ở vị trí đầu tiên.': 'msg.moveTopLimit',
    'Không thể di chuyển - các trang đã ở vị trí cuối cùng.': 'msg.moveBottomLimit',
    'Vui lòng chọn ít nhất 1 trang để xóa.': 'msg.deleteNeedSelection',
    'Vui lòng chọn file PDF trước.': 'msg.selectPdfFirst',
    'Chưa có file nào để lưu.': 'msg.nothingToSave',
    'Bạn chưa thực hiện chỉnh sửa/thay đổi trang nào. Bạn có muốn lưu nguyên bản gốc không?': 'msg.saveUnchangedConfirm',
    'Không thể đọc dữ liệu PDF mã hóa để lưu file.': 'msg.encryptedSaveReadFailed',
    'Không thể đọc dữ liệu PDF để lưu file.': 'msg.saveReadFailed',
    'Bạn có chắc chắn muốn khôi phục toàn bộ những thay đổi?\n\n(Tất cả xoay trang, xóa trang và thêm trang sẽ bị hủy)': 'msg.resetAllPrompt',
    'Không tìm thấy dữ liệu PDF gốc để reset.': 'msg.originalDataMissing',
    'Đã khôi phục trạng thái gốc của file.': 'msg.resetAllSuccess',
    'Vui lòng chọn ít nhất 1 tính năng cần khóa hoặc nhập password.': 'msg.lockNeedRestrictionOrPassword',
    'Password nhập lại không khớp.': 'msg.passwordMismatch',
    'Thư viện QPDF chưa được tải. Vui lòng tải lại extension.': 'msg.qpdfNotLoaded',
    'File PDF này không bị khóa.': 'msg.notLockedPdf',
    'Không có file PDF hợp lệ để mở.': 'msg.noValidPdfForOpen',
    'Password không đúng. Vui lòng nhập lại hoặc nhấn Hủy.': 'msg.invalidPasswordTryAgain',
    'Không có dữ liệu PDF để hiển thị.': 'msg.noPdfSourceToDisplay',
    'Không thể đọc file PDF trong OPFS.': 'msg.opfsReadFailed',
    'Không có URL file phù hợp để mở tự động.': 'msg.noValidAutoOpenUrl',
    'URL PDF tự mở không hợp lệ.': 'msg.invalidAutoOpenUrl',
  });

  const LEGACY_DYNAMIC_TRANSLATORS = Object.freeze([
    {
      regex: /^File '(.+)' bị khóa bằng password\.\nNhập password để mở:$/s,
      toText: (m) => t('msg.fileLockedPrompt', { fileName: m[1] || 'PDF' }),
    },
    {
      regex: /^Không thể mở khóa file PDF:\n([\s\S]+)$/,
      toText: (m) => t('msg.unlockPdfFailed', { error: m[1] }),
    },
    {
      regex: /^Không thể dọn cache memory:\n([\s\S]+)$/,
      toText: (m) => t('msg.purgeMemoryFailed', { error: m[1] }),
    },
    {
      regex: /^Đã mở (\d+) file PDF với tổng (\d+) trang\.$/,
      toText: (m) => t('msg.openMultipleSuccess', { fileCount: m[1], pageCount: m[2] }),
    },
    {
      regex: /^Không thể mở file PDF:\n([\s\S]+)$/,
      toText: (m) => t('msg.openPdfFailed', { error: m[1] }),
    },
    {
      regex: /^File '(.+)' có thay đổi chưa được lưu\.\n\nBạn có muốn lưu file trước khi đóng không\?$/s,
      toText: (m) => t('msg.unsavedFilePrompt', { fileName: m[1] }),
    },
    {
      regex: /^Bạn có chắc chắn muốn xóa (\d+) trang được chọn\?\n\n\(Trang sẽ bị xóa khi lưu file\)$/s,
      toText: (m) => t('msg.deleteConfirm', { count: m[1] }),
    },
    {
      regex: /^Không thể đọc file: (.+)$/,
      toText: (m) => t('msg.readFileFailed', { fileName: m[1] }),
    },
    {
      regex: /^Không thể gộp file PDF:\n([\s\S]+)$/,
      toText: (m) => t('msg.combinePdfFailed', { error: m[1] }),
    },
    {
      regex: /^Không thể thêm file PDF:\n([\s\S]+)$/,
      toText: (m) => t('msg.mergePdfFailed', { error: m[1] }),
    },
    {
      regex: /^Đã thêm (\d+) file với tổng (\d+) trang vào (đầu|cuối) file\.$/,
      toText: (m) => t('msg.mergePdfSuccess', {
        fileCount: m[1],
        pageCount: m[2],
        position: m[3] === 'đầu' ? t('manager.positionStart') : t('manager.positionEnd'),
      }),
    },
    {
      regex: /^Đã lưu file: ([^\n]+)(?:\n\nĐã xóa (\d+) trang\.)?$/s,
      toText: (m) => {
        const base = t('msg.saveSuccess', { fileName: m[1] });
        if (!m[2]) return base;
        return `${base}\n\n${t('msg.deletedPagesSummary', { count: m[2] })}`;
      },
    },
    {
      regex: /^Tỷ lệ zoom phải nằm trong khoảng (\d+)% - (\d+)%$/,
      toText: (m) => t('msg.zoomRangeError', { min: m[1], max: m[2] }),
    },
    {
      regex: /^Không thể mở file: ([\s\S]+)$/,
      toText: (m) => t('msg.openFileFailed', { error: m[1] }),
    },
    {
      regex: /^PDF đã được mở khóa thành công: (.+)$/,
      toText: (m) => t('msg.unlockSuccess', { fileName: m[1] }),
    },
    {
      regex: /^Lỗi khi mở khóa PDF: ([\s\S]+)$/,
      toText: (m) => t('msg.unlockError', { error: m[1] }),
    },
    {
      regex: /^Extension đã thử lấy lại đường dẫn PDF thật từ tab browser, nhưng vẫn không thể đọc trực tiếp file mạng LAN \(UNC\)\.\n\nĐường dẫn nhận diện:\n([\s\S]+?)\n\nNhấn "Có" để mở hộp thoại chọn file giống nút "Open PDF"\.\n\nChi tiết: ([\s\S]+)$/,
      toText: (m) => t('msg.lanAutoOpenFailedPrompt', { path: m[1], detail: m[2] }),
    },
    {
      regex: /^Extension không thể đọc file PDF từ tab hiện tại\.\n\n1\) Bật quyền "Allow access to file URLs" cho extension trong chrome:\/\/extensions\.\n2\) Mở lại file PDF local rồi click lại icon extension\.\n\nChi tiết: ([\s\S]+)$/,
      toText: (m) => t('msg.autoOpenLocalFailedPrompt', { detail: m[1] }),
    },
    {
      regex: /^Không thể khóa file PDF:\n([\s\S]+)$/,
      toText: (m) => t('msg.lockPdfFailed', { error: m[1] }),
    },
    {
      regex: /^Không thể khởi tạo QPDF Worker: ([\s\S]+)$/,
      toText: (m) => t('msg.qpdfInitFailed', { error: m[1] }),
    },
  ]);

  function translateLegacyDialogTitle(inputTitle) {
    if (typeof inputTitle !== 'string' || !inputTitle.length) return inputTitle;
    const key = LEGACY_TITLE_TO_KEY[inputTitle];
    return key ? t(key) : inputTitle;
  }

  function translateLegacyMessageText(inputMessage) {
    if (typeof inputMessage !== 'string' || !inputMessage.length) return inputMessage;

    const staticKey = LEGACY_STATIC_MESSAGE_TO_KEY[inputMessage];
    if (staticKey) return t(staticKey);

    for (const item of LEGACY_DYNAMIC_TRANSLATORS) {
      const match = inputMessage.match(item.regex);
      if (!match) continue;
      try {
        return item.toText(match);
      } catch {
        return inputMessage;
      }
    }

    return inputMessage;
  }

  const TEMP_OBJECT_URLS = new Set();
  let opfsDirPromise = null;
  let opfsTempSeq = 0;
  let rasterTaskSeq = 0;
  let activePerfMode = 'normal';
  const wasmHelperState = {
    module: null,
    initPromise: null,
    disabled: false,
    warnedRenderWindow: false,
    warnedPreviewDims: false,
    lazyRenderEngine: 'js',
  };

  function setLazyRenderEngine(mode) {
    wasmHelperState.lazyRenderEngine = (mode === 'wasm') ? 'wasm' : 'js';
  }

  function getLazyRenderEngine() {
    return wasmHelperState.lazyRenderEngine;
  }

  function getSafePerfMode(mode) {
    return Object.prototype.hasOwnProperty.call(PERF_PROFILES, mode) ? mode : 'normal';
  }

  function readStoredPerfMode() {
    try {
      const mode = localStorage.getItem(PERF_MODE_STORAGE_KEY);
      return getSafePerfMode(mode || 'normal');
    } catch {
      return 'normal';
    }
  }

  function writeStoredPerfMode(mode) {
    try {
      localStorage.setItem(PERF_MODE_STORAGE_KEY, getSafePerfMode(mode));
    } catch {
      // Ignore storage errors.
    }
  }

  function setActivePerfMode(mode, opts) {
    const persist = !(opts && opts.persist === false);
    activePerfMode = getSafePerfMode(mode);
    if (persist) writeStoredPerfMode(activePerfMode);
    return activePerfMode;
  }

  function getActivePerfProfile() {
    return PERF_PROFILES[activePerfMode] || PERF_PROFILES.normal;
  }

  function isLowMemoryMode() {
    return activePerfMode === 'lowMemory';
  }

  setActivePerfMode(readStoredPerfMode(), { persist: false });
  applyThemeMode(activeThemeMode, { persist: false });

  function trackTempObjectUrl(url) {
    TEMP_OBJECT_URLS.add(url);
    return url;
  }

  function revokeTempObjectUrl(url) {
    if (!url) return;
    if (TEMP_OBJECT_URLS.has(url)) TEMP_OBJECT_URLS.delete(url);
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }

  function revokeAllTempObjectUrls() {
    for (const url of TEMP_OBJECT_URLS) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    TEMP_OBJECT_URLS.clear();
  }

  async function getOpfsTempDirHandle() {
    if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
      return null;
    }
    if (!opfsDirPromise) {
      opfsDirPromise = (async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle(OPFS_TEMP_DIR, { create: true });
      })().catch(() => null);
    }
    return opfsDirPromise;
  }

  function createOpfsTempName(prefix) {
    opfsTempSeq += 1;
    return `${prefix}-${Date.now()}-${opfsTempSeq}.pdf`;
  }

  async function writeBytesToOpfs(bytes, prefix) {
    const dir = await getOpfsTempDirHandle();
    if (!dir) return null;

    const fileName = createOpfsTempName(prefix || 'pdf');
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(bytes);
    } finally {
      await writable.close();
    }
    return fileName;
  }

  async function writeFileToOpfs(file, prefix) {
    if (!file || typeof file.arrayBuffer !== 'function') return null;

    const dir = await getOpfsTempDirHandle();
    if (!dir) return null;

    const fileName = createOpfsTempName(prefix || 'pdf');
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    let usedPipeTo = false;

    try {
      if (typeof file.stream === 'function') {
        const stream = file.stream();
        if (stream && typeof stream.pipeTo === 'function') {
          await stream.pipeTo(writable);
          usedPipeTo = true;
          return fileName;
        }
      }

      await writable.write(await file.arrayBuffer());
      return fileName;
    } catch {
      try { await writable.abort(); } catch { /* ignore */ }
      try { await deleteOpfsFile(fileName); } catch { /* ignore */ }
      return null;
    } finally {
      if (!usedPipeTo) {
        try { await writable.close(); } catch { /* ignore */ }
      }
    }
  }

  async function readBytesFromOpfs(fileName) {
    if (!fileName) return null;
    const dir = await getOpfsTempDirHandle();
    if (!dir) return null;
    try {
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  async function createObjectUrlFromOpfs(fileName) {
    if (!fileName) return null;
    const dir = await getOpfsTempDirHandle();
    if (!dir) return null;
    try {
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return trackTempObjectUrl(URL.createObjectURL(file));
    } catch {
      return null;
    }
  }

  async function deleteOpfsFile(fileName) {
    if (!fileName) return;
    const dir = await getOpfsTempDirHandle();
    if (!dir) return;
    try {
      await dir.removeEntry(fileName);
    } catch {
      // Ignore when file does not exist.
    }
  }

  function canUseRasterWorker() {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
  }

  function toTransferableBuffer(bytes) {
    if (!(bytes instanceof Uint8Array)) return null;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  async function runRasterWorkerTask(opts) {
    if (!opts) return null;

    const hasBytes = (opts.bytes instanceof Uint8Array) && opts.bytes.byteLength > 0;
    const hasSourceUrl = typeof opts.sourceUrl === 'string' && opts.sourceUrl.length > 0;
    if (!hasBytes && !hasSourceUrl) return null;
    if (!canUseRasterWorker()) return null;

    const workerUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL(RASTER_WORKER_SCRIPT)
      : RASTER_WORKER_SCRIPT;

    const taskId = ++rasterTaskSeq;
    const transferBuffer = hasBytes ? toTransferableBuffer(opts.bytes) : null;
    if (hasBytes && !transferBuffer) return null;

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId = null;
      let worker = null;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (worker) {
          try { worker.terminate(); } catch { /* ignore */ }
          worker = null;
        }
        resolve(result);
      };

      try {
        worker = new Worker(workerUrl);
      } catch {
        finish(null);
        return;
      }

      const perf = getActivePerfProfile();
      worker.onmessage = (event) => {
        const data = event && event.data ? event.data : null;
        if (!data || data.id !== taskId) return;
        if (data.ok && data.bytes) {
          finish(new Uint8Array(data.bytes));
          return;
        }
        finish(null);
      };

      worker.onerror = () => finish(null);

      timeoutId = setTimeout(() => finish(null), RASTER_WORKER_TIMEOUT_MS);

      const payload = {
        id: taskId,
        type: opts.type || 'rasterize',
        bytes: transferBuffer,
        sourceUrl: hasSourceUrl ? opts.sourceUrl : null,
        password: opts.password || '',
        pageOrder: Array.isArray(opts.pageOrder) ? opts.pageOrder : null,
        rotations: opts.rotations || null,
        quality: typeof opts.quality === 'number' ? opts.quality : perf.exportJpegQuality,
        maxPixels: typeof opts.maxPixels === 'number' ? opts.maxPixels : perf.exportCanvasPixels,
        scaleHint: typeof opts.scaleHint === 'number' ? opts.scaleHint : null,
        lowMemory: isLowMemoryMode(),
      };

      if (transferBuffer) {
        worker.postMessage(payload, [transferBuffer]);
      } else {
        worker.postMessage(payload);
      }
    });
  }

  function clampViewportByPixels(baseScale, getViewport, maxPixels) {
    let viewport = getViewport(baseScale);
    const pixels = viewport.width * viewport.height;
    if (pixels <= maxPixels) return { scale: baseScale, viewport };

    const ratio = Math.sqrt(maxPixels / pixels);
    const clampedScale = baseScale * ratio;
    viewport = getViewport(clampedScale);
    return { scale: clampedScale, viewport };
  }

  function getAdaptiveExportScale(pageCount) {
    if (isLowMemoryMode()) {
      if (pageCount <= 20) return 1.6;
      if (pageCount <= 80) return 1.2;
      if (pageCount <= 160) return 1.0;
      if (pageCount <= 300) return 0.9;
      return 0.8;
    }
    if (pageCount <= 20) return 2.1;
    if (pageCount <= 80) return 1.6;
    if (pageCount <= 160) return 1.3;
    if (pageCount <= 300) return 1.1;
    return 1.0;
  }

  function resolveRuntimeAssetUrl(relativePath) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(relativePath);
      }
    } catch {
      // Ignore runtime URL errors and use relative path fallback.
    }
    return relativePath;
  }

  async function ensureWasmHelpers() {
    if (wasmHelperState.module || wasmHelperState.disabled) {
      return wasmHelperState.module;
    }

    if (!wasmHelperState.initPromise) {
      wasmHelperState.initPromise = (async () => {
        try {
          const moduleUrl = resolveRuntimeAssetUrl(WASM_HELPER_MODULE);
          const binaryUrl = resolveRuntimeAssetUrl(WASM_HELPER_BINARY);
          const wasmModule = await import(moduleUrl);

          if (typeof wasmModule.default === 'function') {
            await wasmModule.default({ module_or_path: binaryUrl });
          }

          wasmHelperState.module = wasmModule;
          if (typeof wasmModule.compute_render_window_indices === 'function') {
            setLazyRenderEngine('wasm');
          }
          return wasmModule;
        } catch (err) {
          wasmHelperState.disabled = true;
          setLazyRenderEngine('js');
          console.warn('WASM helper unavailable. Falling back to JavaScript logic.', err);
          return null;
        }
      })();
    }

    return wasmHelperState.initPromise;
  }

  function getWasmHelpersSync() {
    return wasmHelperState.module;
  }

  function computePreviewDimensionsWithFallback(previewBaseWidth, zoomLevel, defaultAspect, rotation) {
    const safeZoom = (Number.isFinite(zoomLevel) && zoomLevel > 0) ? zoomLevel : 1.0;
    const safeAspect = defaultAspect > 0 ? defaultAspect : Math.sqrt(2);
    const rotated = ((rotation % 180) + 180) % 180 !== 0;
    const aspect = rotated ? (1 / safeAspect) : safeAspect;
    const width = Math.max(MIN_THUMB_PREVIEW_WIDTH, Math.round(previewBaseWidth * safeZoom));
    const height = Math.max(MIN_THUMB_PREVIEW_HEIGHT, Math.round(width * aspect));

    return { width, height };
  }

  function computeRenderWindowWithFallback(totalPages, visibleSet, hardCap, padding) {
    const wasm = getWasmHelpersSync();
    if (!(wasm && typeof wasm.compute_render_window_indices === 'function')) {
      setLazyRenderEngine('js');
      return null;
    }

    try {
      const visible = Array.from(visibleSet)
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < totalPages)
        .sort((a, b) => a - b);

      const result = wasm.compute_render_window_indices(
        totalPages,
        Uint32Array.from(visible),
        hardCap,
        padding
      );
      const indices = Array.from(result || []);
      const allowed = new Set();

      indices.forEach((idx) => {
        const value = Number(idx);
        if (Number.isInteger(value) && value >= 0 && value < totalPages) {
          allowed.add(value);
        }
      });

      if (!allowed.size) {
        setLazyRenderEngine('js');
        return null;
      }

      visible.forEach((idx) => allowed.add(idx));
      setLazyRenderEngine('wasm');
      return allowed;
    } catch (err) {
      setLazyRenderEngine('js');
      if (!wasmHelperState.warnedRenderWindow) {
        wasmHelperState.warnedRenderWindow = true;
        console.warn('WASM render window failed. Falling back to JavaScript logic.', err);
      }
      return null;
    }
  }

  async function renderPageToJpegBytes(page, opts) {
    const rotation = (opts && opts.rotation) || 0;
    const baseScale = (opts && opts.scale) || 2.0;
    const perf = getActivePerfProfile();
    const quality = (opts && opts.quality) || perf.exportJpegQuality;
    const maxPixels = (opts && opts.maxPixels) || perf.exportCanvasPixels;

    const getViewport = (scale) => page.getViewport({ scale, rotation });
    const origVp = getViewport(1.0);
    const { viewport } = clampViewportByPixels(baseScale, getViewport, maxPixels);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    try {
      const ctx = canvas.getContext('2d', { alpha: false });
      const renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error(t('msg.canvasToJpegFailed')));
        }, 'image/jpeg', quality);
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { bytes, width: origVp.width, height: origVp.height };
    } finally {
      try { page.cleanup(); } catch { /* ignore */ }
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  // =================== Modal Dialog System ===================

  function showModal(title, message, buttons, opts) {
    return new Promise(resolve => {
      const overlay = document.getElementById('modal-overlay');
      const resolvedTitle = translateLegacyDialogTitle(title);
      const resolvedMessage = translateLegacyMessageText(message);
      document.getElementById('modal-title').textContent = resolvedTitle;
      document.getElementById('modal-message').textContent = resolvedMessage;
      const btnContainer = document.getElementById('modal-buttons');
      const inputRow = document.getElementById('modal-input-row');
      const inputEl = document.getElementById('modal-input');
      btnContainer.innerHTML = '';

      if (opts && opts.input) {
        inputRow.classList.remove('hidden');
        inputEl.type = opts.inputType || 'text';
        inputEl.placeholder = translateLegacyMessageText(opts.placeholder || '');
        inputEl.value = '';
      } else {
        inputRow.classList.add('hidden');
      }

      buttons.forEach(({ text, value, className }) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = 'btn ' + (className || '');
        btn.onclick = () => {
          overlay.classList.add('hidden');
          if (opts && opts.input) resolve({ action: value, input: inputEl.value });
          else resolve(value);
        };
        btnContainer.appendChild(btn);
      });
      overlay.classList.remove('hidden');

      // Focus first button
      const first = btnContainer.querySelector('button');
      if (first) first.focus();
    });
  }

  async function showAlert(title, msg) {
    return showModal(title, msg, [{ text: t('common.ok'), value: true, className: 'modal-btn-primary' }]);
  }

  async function showConfirm(title, msg) {
    return showModal(title, msg, [
      { text: t('common.no'), value: false, className: '' },
      { text: t('common.yes'), value: true, className: 'modal-btn-primary' },
    ]);
  }

  async function showYesNoCancel(title, msg) {
    return showModal(title, msg, [
      { text: t('common.cancel'), value: null, className: '' },
      { text: t('common.no'), value: false, className: '' },
      { text: t('common.yes'), value: true, className: 'modal-btn-primary' },
    ]);
  }

  async function showPasswordPrompt(title, msg) {
    return showModal(title, msg, [
      { text: t('common.cancel'), value: 'cancel', className: '' },
      { text: t('common.ok'), value: 'ok', className: 'modal-btn-primary' },
    ], { input: true, inputType: 'password', placeholder: t('dialog.passwordPlaceholder') });
  }

  // =================== Unlock PDF Utility ===================

  async function unlockPdfBytes(bytes, fileName) {
    // Returns: unlocked Uint8Array, or null if user cancelled
    let password = '';

    // Step 1: Check if password is needed
    try {
      const task = pdfjsLib.getDocument({ data: bytes.slice() });
      const doc = await task.promise;
      await doc.destroy();
    } catch (e) {
      if (e && e.name === 'PasswordException') {
        const result = await showPasswordPrompt(
          'File bị khóa',
          `File '${fileName || 'PDF'}' bị khóa bằng password.\nNhập password để mở:`
        );
        if (result.action === 'cancel') return null;
        password = result.input;
        try {
          const task2 = pdfjsLib.getDocument({ data: bytes.slice(), password });
          const doc2 = await task2.promise;
          await doc2.destroy();
        } catch {
          await showAlert('Lỗi', 'Password không đúng hoặc file không thể mở.');
          return null;
        }
      } else {
        throw e;
      }
    }

    // Step 2: Check if encrypted
    let isEncrypted = false;
    try {
      const testDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      isEncrypted = testDoc.isEncrypted;
    } catch {
      isEncrypted = true;
    }
    if (!isEncrypted) return bytes;

    // Step 3: Try pdf-lib approach (preserves text/vectors)
    try {
      const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      const cleaned = new Uint8Array(await doc.save());
      // Verify output
      const vTask = pdfjsLib.getDocument({ data: cleaned.slice() });
      const vDoc = await vTask.promise;
      let valid = false;
      if (vDoc.numPages > 0) {
        const p = await vDoc.getPage(1);
        const ops = await p.getOperatorList();
        p.cleanup();
        valid = ops.fnArray.length > 2;
      }
      await vDoc.destroy();
      if (valid) return cleaned;
    } catch { /* fall through */ }

    // Step 4: Fallback - canvas-based reconstruction (always works)
    const workerUnlocked = await runRasterWorkerTask({
      type: 'unlock-rasterize',
      bytes,
      password: password || '',
      quality: getActivePerfProfile().exportJpegQuality,
      maxPixels: getActivePerfProfile().exportCanvasPixels,
    });
    if (workerUnlocked) return workerUnlocked;

    let pdfDoc = null;
    try {
      const task = pdfjsLib.getDocument({ data: bytes.slice(), password: password || undefined });
      pdfDoc = await task.promise;
      const newDoc = await PDFLib.PDFDocument.create();
      const exportScale = getAdaptiveExportScale(pdfDoc.numPages);
      const perf = getActivePerfProfile();
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const rasterized = await renderPageToJpegBytes(page, {
          scale: exportScale,
          quality: perf.exportJpegQuality,
          maxPixels: perf.exportCanvasPixels,
        });
        const img = await newDoc.embedJpg(rasterized.bytes);
        const pdfPage = newDoc.addPage([rasterized.width, rasterized.height]);
        pdfPage.drawImage(img, { x: 0, y: 0, width: rasterized.width, height: rasterized.height });
      }
      return new Uint8Array(await newDoc.save());
    } catch (err) {
      await showAlert('Lỗi', 'Không thể mở khóa file PDF:\n' + err.message);
      return bytes;
    } finally {
      if (pdfDoc) await pdfDoc.destroy();
    }
  }

  // =================== Helper: Download bytes ===================
  function downloadBlob(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = trackTempObjectUrl(URL.createObjectURL(blob));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      revokeTempObjectUrl(url);
    }, DOWNLOAD_REVOKE_DELAY_MS);
  }

  // =================== Bookmark/Outline Helpers ===================

  /**
   * Read the outline (bookmark) tree from a pdf.js PDFDocumentProxy.
   * Returns array of {title, pageIndex, children} or null if no outline.
   * Ported from Python pdfman.py: _build_outline_for_writer / _move_pages_with_fitz.
   */
  async function readOutlineTree(pdfDoc) {
    if (!pdfDoc) return null;
    let outline;
    try { outline = await pdfDoc.getOutline(); } catch { return null; }
    if (!outline || !outline.length) return null;

    async function resolveItems(items) {
      const result = [];
      for (const item of items) {
        let pageIndex = null;
        if (item.dest) {
          try {
            if (typeof item.dest === 'string') {
              // Named destination
              const dest = await pdfDoc.getDestination(item.dest);
              if (dest && dest.length > 0 && dest[0]) {
                pageIndex = await pdfDoc.getPageIndex(dest[0]);
              }
            } else if (Array.isArray(item.dest) && item.dest.length > 0 && item.dest[0]) {
              // Explicit destination: [pageRef, /Fit] or [pageRef, /XYZ, ...]
              pageIndex = await pdfDoc.getPageIndex(item.dest[0]);
            }
          } catch { /* invalid page ref — leave pageIndex null */ }
        }
        const children = (item.items && item.items.length)
          ? await resolveItems(item.items) : [];
        result.push({ title: item.title || '', pageIndex, children });
      }
      return result;
    }
    return resolveItems(outline);
  }

  /**
   * Write an outline (bookmark) tree into a pdf-lib PDFDocument.
   * Strategy: flatten the tree (DFS order, recording depth), sort all
   * bookmarks by their new page position (stable), then reconstruct the
   * tree from depth info.  This ensures bookmarks follow their page when
   * pages are reordered while each bookmark keeps its original depth level.
   *
   * @param {PDFDocument} outDoc     - pdf-lib output document (pages already added)
   * @param {Array|null}  outlineTree - tree from readOutlineTree()
   * @param {Map<number,number>} pageIndexMap - original page index → new page index
   */
  function writeOutlineToDoc(outDoc, outlineTree, pageIndexMap) {
    if (!outlineTree || !outlineTree.length) return;
    const context = outDoc.context;
    const pages = outDoc.getPages();
    if (!pages.length) return;

    // Helper: minimum mapped page index among descendants
    function getMinDescPage(items) {
      let min;
      for (const item of items) {
        const mp = (item.pageIndex != null) ? pageIndexMap.get(item.pageIndex) : undefined;
        if (mp !== undefined && (min === undefined || mp < min)) min = mp;
        const cm = getMinDescPage(item.children || []);
        if (cm !== undefined && (min === undefined || cm < min)) min = cm;
      }
      return min;
    }

    // Step 1: Flatten tree to a DFS-ordered list with depth
    const flat = [];
    function flatten(items, depth) {
      for (const item of items) {
        let newPageIdx = (item.pageIndex != null) ? pageIndexMap.get(item.pageIndex) : undefined;
        const hasDirectPage = (newPageIdx !== undefined);
        if (!hasDirectPage) {
          // Structural bookmark (no direct page): use min descendant page
          newPageIdx = getMinDescPage(item.children || []);
        }
        if (newPageIdx !== undefined) {
          flat.push({ title: item.title, newPageIdx, hasDirectPage, depth, origOrder: flat.length });
        }
        flatten(item.children || [], depth + 1);
      }
    }
    flatten(outlineTree, 0);
    if (!flat.length) return;

    // Step 2: Stable sort by new page index (preserve original order for same page)
    flat.sort((a, b) => a.newPageIdx - b.newPageIdx || a.origOrder - b.origOrder);

    // Step 3: Normalize depths — depth cannot jump more than +1 from previous
    for (let i = 0; i < flat.length; i++) {
      if (i === 0) {
        flat[i].depth = 0;
      } else {
        const maxDepth = flat[i - 1].depth + 1;
        if (flat[i].depth > maxDepth) flat[i].depth = maxDepth;
      }
    }

    // Step 4: Reconstruct tree from flat list using depth info
    function rebuildTree(items) {
      const root = { children: [] };
      const stack = [{ node: root, depth: -1 }];
      for (const item of items) {
        const node = {
          title: item.title,
          newPageIdx: item.hasDirectPage ? item.newPageIdx : null,
          children: []
        };
        // Pop back to find the correct parent (depth < current)
        while (stack.length > 1 && stack[stack.length - 1].depth >= item.depth) {
          stack.pop();
        }
        stack[stack.length - 1].node.children.push(node);
        stack.push({ node, depth: item.depth });
      }
      return root.children;
    }
    const tree = rebuildTree(flat);
    if (!tree.length) return;

    // Step 5: Write outline to PDF
    function countAll(items) {
      let c = 0;
      for (const it of items) c += 1 + countAll(it.children);
      return c;
    }

    function buildLevel(items, parentRef) {
      if (!items.length) return;
      const nodes = items.map(item => {
        const dict = context.obj({});
        const ref = context.register(dict);
        return { ref, dict, item };
      });
      for (let i = 0; i < nodes.length; i++) {
        const { ref, dict, item } = nodes[i];
        dict.set(PDFLib.PDFName.of('Title'), PDFLib.PDFHexString.fromText(item.title || ''));
        dict.set(PDFLib.PDFName.of('Parent'), parentRef);
        if (i > 0) dict.set(PDFLib.PDFName.of('Prev'), nodes[i - 1].ref);
        if (i < nodes.length - 1) dict.set(PDFLib.PDFName.of('Next'), nodes[i + 1].ref);
        if (item.newPageIdx != null && item.newPageIdx < pages.length) {
          const pageRef = pages[item.newPageIdx].ref;
          dict.set(PDFLib.PDFName.of('Dest'), context.obj([pageRef, PDFLib.PDFName.of('Fit')]));
        }
        if (item.children && item.children.length) {
          buildLevel(item.children, ref);
          dict.set(PDFLib.PDFName.of('Count'), PDFLib.PDFNumber.of(countAll(item.children)));
        }
      }
      const pDict = context.lookup(parentRef);
      if (pDict) {
        pDict.set(PDFLib.PDFName.of('First'), nodes[0].ref);
        pDict.set(PDFLib.PDFName.of('Last'), nodes[nodes.length - 1].ref);
      }
    }

    // Create Outlines root dictionary
    const rootDict = context.obj({});
    rootDict.set(PDFLib.PDFName.of('Type'), PDFLib.PDFName.of('Outlines'));
    rootDict.set(PDFLib.PDFName.of('Count'), PDFLib.PDFNumber.of(countAll(tree)));
    const rootRef = context.register(rootDict);
    buildLevel(tree, rootRef);
    outDoc.catalog.set(PDFLib.PDFName.of('Outlines'), rootRef);
  }

  // =================== Outline Helpers (merge/combine) ===================

  /**
   * Read outline tree from raw PDF bytes using pdf.js.
   * Returns array of {title, pageIndex, children} or null.
   */
  async function readOutlineFromBytes(bytes) {
    let pdfDoc;
    try {
      pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    } catch {
      return null;
    }
    try {
      return await readOutlineTree(pdfDoc);
    } finally {
      await pdfDoc.destroy();
    }
  }

  /**
   * Offset all pageIndex values in an outline tree by a given amount.
   */
  function offsetOutlineTree(tree, offset) {
    if (!tree || !offset) return tree;
    return tree.map(item => ({
      title: item.title,
      pageIndex: item.pageIndex != null ? item.pageIndex + offset : null,
      children: item.children && item.children.length
        ? offsetOutlineTree(item.children, offset) : []
    }));
  }

  // =================== PDFManagerApp ===================

  class PDFManagerApp {
    constructor() {
      // --- State ---
      this.pdfBytes = null;          // Current working PDF (Uint8Array)
      this.originalPdfBytes = null;  // Original PDF for full reset
      this._workingPdfOpfsFile = null;
      this._originalPdfOpfsFile = null;
      this._pdfSourceUrl = null;
      this.pdfDoc = null;            // pdf.js PDFDocumentProxy for rendering
      this.fileName = '';            // Current file name
      this.openedFileCount = 0;

      this.pageOrder = [];           // Array of original 0-based page indices in display order
      this.rotationStates = {};      // {originalPageIndex: angle}
      this.initialRotationStates = {};
      this.selectedPages = new Set(); // Set of visual indices
      this.lastClickedIdx = null;    // Anchor for shift-click

      this.zoomLevel = 0.80;
      this.zoomTimer = null;
      this._wheelZoomAccumulatorPx = 0;
      this._lastWheelZoomAt = 0;
      this.hasUnsavedAppend = false;
      this.defaultPageAspect = Math.sqrt(2);
      this.currentColumnCount = 0;
      this.sourceStorageMode = 'none';

      this._pdfPassword = '';       // Password for encrypted PDF (for pdf.js rendering)
      this._isEncrypted = false;    // Whether working PDF is still encrypted

      this.outlineTree = null;          // Current bookmark/outline tree
      this.originalOutlineTree = null;  // Original outline for reset

      // --- Page elements ---
      this.pageElements = [];        // [{container, canvasWrap, canvas, checkbox, origIdx, rendered}, ...]
      this.observer = null;          // IntersectionObserver for lazy loading
      this.renderQueue = [];         // Pending visual indices to render
      this.activeRenderCount = 0;
      this.renderTick = 0;
      this.visibleVisualIndices = new Set();
      this.allowedRenderIndices = new Set();
      this._statsTimer = null;
      this._statsLastTick = 0;
      this._longTaskObserver = null;
      this._longTaskDurationMs = 0;
      this._cpuEstimate = 0;
      this._memorySamplePending = false;
      this._lastMemorySampleAt = 0;
      this._memoryMetric = {
        kind: 'na',
        bytesUsed: 0,
        bytesTotal: 0,
        heapBytes: 0,
        canvasBytes: 0,
        bufferBytes: 0,
        scopedBytes: 0,
        taskMgrEstimateBytes: 0,
      };
      this._purgeInProgress = false;
      this._resizeTimer = null;
      this._scrollIdleTimer = null;
      this._lastScrollAt = 0;
      this._onWrapperScroll = null;
      this._onScrollEnd = null;
      this._onScrollRelease = null;
      this._autoPurgeTimer = null;
      this._lastAutoPurgeAt = 0;

      this._onPageHide = () => {
        this.dispose().catch(() => { /* ignore */ });
      };
      this._onResize = () => this.handleViewportResize();
      window.addEventListener('pagehide', this._onPageHide, true);
      window.addEventListener('resize', this._onResize, true);

      // --- DOM refs ---
      this.dom = {};

      this.init();
    }

    // === Initialization ===
    init() {
      const $ = id => document.getElementById(id);
      this.dom = {
        btnOpen: $('btn-open'),
        btnClose: $('btn-close'),
        btnSave: $('btn-save'),
        btnAdd: $('btn-add'),
        btnSelectAll: $('btn-select-all'),
        btnRotateCW: $('btn-rotate-cw'),
        btnRotateCCW: $('btn-rotate-ccw'),
        btnRotate180: $('btn-rotate-180'),
        btnRotateReset: $('btn-rotate-reset'),
        btnMoveUp: $('btn-move-up'),
        btnMoveDown: $('btn-move-down'),
        btnDelete: $('btn-delete'),
        btnResetAll: $('btn-reset-all'),
        btnZoomApply: $('btn-zoom-apply'),
        zoomInput: $('zoom-input'),
        lowMemToggle: $('low-mem-toggle'),
        perfRam: $('perf-ram'),
        perfCpu: $('perf-cpu'),
        btnPurgeMemory: $('btn-purge-memory'),
        fileInfo: $('file-info'),
        pageCount: $('page-count'),
        selectedCount: $('selected-count'),
        lazyRenderStatus: $('lazy-render-status'),
        tempPathStatus: $('temp-path-status'),
        pagesWrapper: $('pages-wrapper'),
        pagesGrid: $('pages-grid'),
        emptyPlaceholder: $('empty-placeholder'),
        fileInput: $('file-input'),
        fileInputAdd: $('file-input-add'),
      };

      // Button events
      this.dom.btnOpen.onclick = () => this.dom.fileInput.click();
      this.dom.btnClose.onclick = () => this.closeFile();
      this.dom.btnSave.onclick = () => this.savePdf();
      this.dom.btnAdd.onclick = () => this.addPdf();
      this.dom.btnSelectAll.onclick = () => this.toggleSelectAll();
      this.dom.btnRotateCW.onclick = () => this.rotateSelectedPages(90);
      this.dom.btnRotateCCW.onclick = () => this.rotateSelectedPages(-90);
      this.dom.btnRotate180.onclick = () => this.rotateSelectedPages(180);
      this.dom.btnRotateReset.onclick = () => this.resetSelectedRotation();
      this.dom.btnMoveUp.onclick = () => this.moveSelectedPages(-1);
      this.dom.btnMoveDown.onclick = () => this.moveSelectedPages(1);
      this.dom.btnDelete.onclick = () => this.deleteSelectedPages();
      this.dom.btnResetAll.onclick = () => this.resetAll();
      this.dom.btnZoomApply.onclick = () => this.applyZoom();
      if (this.dom.btnPurgeMemory) {
        this.dom.btnPurgeMemory.onclick = () => this.handlePurgeMemoryClick();
      }

      // File input events
      this.dom.fileInput.onchange = (e) => {
        if (e.target.files.length) this.openFiles(Array.from(e.target.files));
        e.target.value = '';
      };
      this.dom.fileInputAdd.onchange = (e) => {
        if (e.target.files.length && this._pendingAddPosition) {
          this.mergeFiles(Array.from(e.target.files), this._pendingAddPosition);
        }
        e.target.value = '';
        this._pendingAddPosition = null;
      };

      // Zoom input enter key
      this.dom.zoomInput.onkeydown = (e) => { if (e.key === 'Enter') this.applyZoom(); };
      this.dom.zoomInput.min = String(MIN_ZOOM_PERCENT);
      this.dom.zoomInput.max = String(MAX_ZOOM_PERCENT);
      this.dom.zoomInput.step = String(ZOOM_STEP_PERCENT);

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.clearSelection();
      });

      // Mouse wheel zoom (Ctrl + scroll)
      this.dom.pagesWrapper.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          this.onMouseWheelZoom(e);
        }
      }, { passive: false });

      this.setupScrollReleaseRefresh();

      // Drag and drop
      this.setupDragDrop();

      // Performance mode toggle
      if (this.dom.lowMemToggle) {
        this.dom.lowMemToggle.onchange = () => this.onPerformanceModeToggle();
      }
      this.applyPerformanceMode(activePerfMode, true);
      this.startRuntimeStatsMonitor();
      this.updateLazyRenderStatus();
      ensureWasmHelpers().then(() => {
        this.refreshRenderWindow();
        this.updateLazyRenderStatus();
      }).catch(() => {
        this.updateLazyRenderStatus();
      });
      this.tryAutoOpenFromLaunchContext().catch(() => { /* ignore */ });
    }

    setupScrollReleaseRefresh() {
      const wrapper = this.dom.pagesWrapper;
      if (!wrapper) return;

      this.teardownScrollReleaseRefresh();

      this._onWrapperScroll = () => {
        this._lastScrollAt = Date.now();
        this.scheduleScrollRefresh();
      };

      this._onScrollEnd = () => {
        this.flushScrollRefresh();
      };

      this._onScrollRelease = () => {
        if (!this.pageElements.length) return;
        const sinceScroll = Date.now() - this._lastScrollAt;
        if (this._scrollIdleTimer || sinceScroll <= SCROLL_RELEASE_REFRESH_WINDOW_MS) {
          this.flushScrollRefresh();
          this.scheduleAutoPurgeMemory('scroll-release', { preserveViewport: true });
        }
      };

      wrapper.addEventListener('scroll', this._onWrapperScroll, { passive: true });
      wrapper.addEventListener('scrollend', this._onScrollEnd, { passive: true });
      document.addEventListener('pointerup', this._onScrollRelease, true);
      document.addEventListener('touchend', this._onScrollRelease, true);
    }

    teardownScrollReleaseRefresh() {
      const wrapper = this.dom.pagesWrapper;

      if (this._scrollIdleTimer) {
        clearTimeout(this._scrollIdleTimer);
        this._scrollIdleTimer = null;
      }

      if (this._autoPurgeTimer) {
        clearTimeout(this._autoPurgeTimer);
        this._autoPurgeTimer = null;
      }

      if (wrapper && this._onWrapperScroll) {
        wrapper.removeEventListener('scroll', this._onWrapperScroll);
      }
      if (wrapper && this._onScrollEnd) {
        wrapper.removeEventListener('scrollend', this._onScrollEnd);
      }
      if (this._onScrollRelease) {
        document.removeEventListener('pointerup', this._onScrollRelease, true);
        document.removeEventListener('touchend', this._onScrollRelease, true);
      }

      this._onWrapperScroll = null;
      this._onScrollEnd = null;
      this._onScrollRelease = null;
      this._lastScrollAt = 0;
    }

    scheduleScrollRefresh() {
      if (!this.pageElements.length || !this.hasPdfSource()) return;

      if (this._scrollIdleTimer) {
        clearTimeout(this._scrollIdleTimer);
      }

      this._scrollIdleTimer = setTimeout(() => {
        this._scrollIdleTimer = null;
        this.flushScrollRefresh();
      }, SCROLL_IDLE_REFRESH_DELAY_MS);
    }

    flushScrollRefresh() {
      if (!this.pageElements.length || !this.hasPdfSource()) return;

      if (this._scrollIdleTimer) {
        clearTimeout(this._scrollIdleTimer);
        this._scrollIdleTimer = null;
      }

      this.syncVisibleIndicesWithViewport();
      this.refreshRenderWindow();
    }

    scheduleAutoPurgeMemory(source, opts) {
      if (!this.hasPdfSource() || !this.pageElements.length) return;
      if (this._purgeInProgress) return;

      const preserveViewport = !(opts && opts.preserveViewport === false);
      const now = Date.now();
      const sinceLast = now - this._lastAutoPurgeAt;
      const cooldownWait = (sinceLast >= AUTO_PURGE_COOLDOWN_MS)
        ? 0
        : (AUTO_PURGE_COOLDOWN_MS - sinceLast);
      const waitMs = Math.max(AUTO_PURGE_DEBOUNCE_MS, cooldownWait);

      if (this._autoPurgeTimer) {
        clearTimeout(this._autoPurgeTimer);
      }

      this._autoPurgeTimer = setTimeout(() => {
        this._autoPurgeTimer = null;
        this.purgeMemory({
          auto: true,
          source,
          preserveViewport,
          showErrorAlert: false,
        }).catch(() => { /* ignore */ });
      }, waitMs);
    }

    captureViewportState() {
      const wrapper = this.dom.pagesWrapper;
      if (!wrapper) return null;

      const maxScroll = Math.max(1, wrapper.scrollHeight - wrapper.clientHeight);
      const ratio = Math.max(0, Math.min(1, wrapper.scrollTop / maxScroll));
      const rootRect = wrapper.getBoundingClientRect();

      let anchorEntry = null;
      for (let i = 0; i < this.pageElements.length; i++) {
        const entry = this.pageElements[i];
        if (!entry || !entry.container) continue;
        const rect = entry.container.getBoundingClientRect();
        if (rect.bottom >= rootRect.top) {
          anchorEntry = entry;
          break;
        }
      }

      let anchorOrigIdx = null;
      let anchorOffsetRatio = 0;
      if (anchorEntry && anchorEntry.container) {
        const height = Math.max(1, anchorEntry.container.offsetHeight || 1);
        anchorOrigIdx = anchorEntry.origIdx;
        anchorOffsetRatio = Math.max(
          0,
          Math.min(1, (wrapper.scrollTop - anchorEntry.container.offsetTop) / height)
        );
      }

      return {
        ratio,
        anchorOrigIdx,
        anchorOffsetRatio,
      };
    }

    restoreViewportState(state) {
      const wrapper = this.dom.pagesWrapper;
      if (!wrapper || !state) return;

      let restoredByAnchor = false;
      if (Number.isInteger(state.anchorOrigIdx)) {
        const anchorEntry = this.pageElements.find((entry) => (
          entry
          && entry.container
          && entry.origIdx === state.anchorOrigIdx
        ));

        if (anchorEntry && anchorEntry.container) {
          const height = Math.max(1, anchorEntry.container.offsetHeight || 1);
          const offsetRatio = Number.isFinite(state.anchorOffsetRatio)
            ? Math.max(0, Math.min(1, state.anchorOffsetRatio))
            : 0;
          const targetTop = anchorEntry.container.offsetTop + (height * offsetRatio);
          wrapper.scrollTop = Math.max(0, targetTop);
          restoredByAnchor = true;
        }
      }

      if (!restoredByAnchor) {
        const maxScroll = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
        const ratio = Number.isFinite(state.ratio)
          ? Math.max(0, Math.min(1, state.ratio))
          : 0;
        wrapper.scrollTop = maxScroll > 0 ? Math.round(maxScroll * ratio) : 0;
      }

      this.syncVisibleIndicesWithViewport();
      this.refreshRenderWindow();
    }

    syncVisibleIndicesWithViewport() {
      const wrapper = this.dom.pagesWrapper;
      if (!wrapper || !this.pageElements.length) return false;

      const rootRect = wrapper.getBoundingClientRect();
      if (!rootRect || rootRect.width <= 0 || rootRect.height <= 0) {
        return false;
      }

      const nextVisible = new Set();
      for (let i = 0; i < this.pageElements.length; i++) {
        const entry = this.pageElements[i];
        if (!entry || !entry.container) continue;

        const rect = entry.container.getBoundingClientRect();
        const intersects = rect.bottom >= rootRect.top
          && rect.top <= rootRect.bottom
          && rect.right >= rootRect.left
          && rect.left <= rootRect.right;

        if (intersects) {
          nextVisible.add(i);
        }
      }

      if (!nextVisible.size && this.pageElements.length) {
        const maxScroll = Math.max(1, wrapper.scrollHeight - wrapper.clientHeight);
        const ratio = Math.max(0, Math.min(1, wrapper.scrollTop / maxScroll));
        const fallbackIdx = Math.max(
          0,
          Math.min(this.pageElements.length - 1, Math.round(ratio * (this.pageElements.length - 1)))
        );
        nextVisible.add(fallbackIdx);
      }

      if (nextVisible.size === this.visibleVisualIndices.size) {
        let unchanged = true;
        for (const idx of nextVisible) {
          if (!this.visibleVisualIndices.has(idx)) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) return false;
      }

      this.visibleVisualIndices = nextVisible;
      return true;
    }

    handleViewportResize() {
      if (!this.hasPdfSource() || !this.pageOrder.length) {
        this.updateLazyRenderStatus();
        return;
      }

      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null;
        this.scheduleAutoPurgeMemory('viewport-resize', { preserveViewport: true });
      }, 140);
    }

    onPerformanceModeToggle() {
      const nextMode = (this.dom.lowMemToggle && this.dom.lowMemToggle.checked)
        ? 'lowMemory'
        : 'normal';
      this.applyPerformanceMode(nextMode, false);
    }

    applyPerformanceMode(mode, isInit) {
      const appliedMode = setActivePerfMode(mode, { persist: !isInit });
      const isLow = appliedMode === 'lowMemory';

      if (this.dom.lowMemToggle) {
        this.dom.lowMemToggle.checked = isLow;
      }
      document.body.classList.toggle('low-memory-mode', isLow);

      if (!isInit && this.hasPdfSource()) {
        const preserveOrig = new Set();
        this.selectedPages.forEach((vi) => {
          if (vi < this.pageOrder.length) preserveOrig.add(this.pageOrder[vi]);
        });
        this.rebuildWithPreservation(preserveOrig).catch(() => { /* ignore */ });
      }

      this.updateLazyRenderStatus();
    }

    getStorageModeLabel() {
      if (this.sourceStorageMode === 'opfs') return t('manager.storageOpfs');
      if (this.sourceStorageMode === 'memory') return t('manager.storageMemory');
      return t('manager.storageUnknown');
    }

    getTempPathLabel() {
      if (this._workingPdfOpfsFile) {
        return `opfs://${OPFS_TEMP_DIR}/${this._workingPdfOpfsFile}`;
      }
      if (this.pdfBytes instanceof Uint8Array) {
        return 'memory://working-pdf-bytes';
      }
      return '--';
    }

    updateTempPathStatus() {
      if (!this.dom.tempPathStatus) return;
      const tempPath = this.getTempPathLabel();
      this.dom.tempPathStatus.textContent = t('manager.tempPath', { path: tempPath });
      this.dom.tempPathStatus.title = tempPath === '--'
        ? t('manager.tempPathHintNone')
        : tempPath;
    }

    getLazyRenderEngineLabel() {
      return getLazyRenderEngine() === 'wasm' ? 'WASM' : 'JS';
    }

    updateLazyRenderStatus() {
      if (!this.dom.lazyRenderStatus) return;

      const zoomPercent = Math.round(this.zoomLevel * 100);
      const columns = this.currentColumnCount > 0
        ? this.currentColumnCount
        : (this.hasPdfSource() ? this.getColumnCount() : 0);
      const engine = this.getLazyRenderEngineLabel();
      const storage = this.getStorageModeLabel();

      this.dom.lazyRenderStatus.textContent = t('manager.lazyStatus', {
        engine,
        columns,
        zoom: zoomPercent,
        storage,
      });
      this.updateTempPathStatus();
    }

    getAutoOpenParamFromQuery(paramName) {
      if (!paramName) return null;
      try {
        const params = new URLSearchParams(window.location.search || '');
        return params.get(paramName);
      } catch {
        return null;
      }
    }

    getAutoOpenPdfUrlFromQuery() {
      return this.getAutoOpenParamFromQuery(AUTOLOAD_URL_PARAM);
    }

    getAutoOpenSourceTabUrlFromQuery() {
      return this.getAutoOpenParamFromQuery(AUTOLOAD_TAB_URL_PARAM);
    }

    getAutoOpenSourceTabIdFromQuery() {
      const rawTabId = this.getAutoOpenParamFromQuery(AUTOLOAD_TAB_ID_PARAM);
      if (rawTabId == null) return null;

      const tabId = Number(rawTabId);
      if (!Number.isInteger(tabId) || tabId < 0) return null;
      return tabId;
    }

    clearAutoOpenPdfUrlFromQuery() {
      try {
        const url = new URL(window.location.href);
        let changed = false;

        [AUTOLOAD_URL_PARAM, AUTOLOAD_TAB_URL_PARAM, AUTOLOAD_TAB_ID_PARAM].forEach((key) => {
          if (!url.searchParams.has(key)) return;
          url.searchParams.delete(key);
          changed = true;
        });

        if (!changed) return;
        const clean = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, document.title, clean);
      } catch {
        // Ignore malformed location URL edge cases.
      }
    }

    getFileNameFromPdfUrl(pdfUrl) {
      if (!pdfUrl) return 'local.pdf';
      try {
        const parsed = new URL(pdfUrl);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const raw = parts.length ? parts[parts.length - 1] : 'local.pdf';
        const decoded = decodeURIComponent(raw);
        return decoded || 'local.pdf';
      } catch {
        return 'local.pdf';
      }
    }

    decodeUrlForLocalFile(value) {
      let current = String(value || '');
      for (let i = 0; i < 2; i++) {
        try {
          const decoded = decodeURIComponent(current);
          if (decoded === current) break;
          current = decoded;
        } catch {
          break;
        }
      }
      return current;
    }

    normalizeAutoOpenPdfUrl(rawUrl) {
      if (!rawUrl || typeof rawUrl !== 'string') return null;

      const decoded = this.decodeUrlForLocalFile(rawUrl.trim());
      if (!decoded) return null;

      const uncMatch = decoded.match(/^\\\\+([^\\\/]+)[\\\/]+(.+)$/);
      if (uncMatch) {
        const host = uncMatch[1];
        const pathPart = uncMatch[2]
          .split(/[\\\/]+/)
          .filter(Boolean)
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        const uncUrl = `file://${host}/${pathPart}`;
        return /\.pdf(?:[?#].*)?$/i.test(uncUrl) ? uncUrl : null;
      }

      if (!/^file:\/\//i.test(decoded)) return null;

      let candidate = decoded.replace(/\\/g, '/');
      const weirdUncMatch = candidate.match(/^file:\/{4,}([^/]+)\/(.+)$/i);
      if (weirdUncMatch) {
        candidate = `file://${weirdUncMatch[1]}/${weirdUncMatch[2]}`;
      }

      try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'file:') return null;

        const pathname = decodeURIComponent((parsed.pathname || '').replace(/\\/g, '/'));
        if (!/\.pdf$/i.test(pathname)) return null;

        return parsed.href;
      } catch {
        return /\.pdf(?:[?#].*)?$/i.test(candidate) ? candidate : null;
      }
    }

    extractAutoOpenPdfUrlFromTabUrl(tabUrl) {
      if (!tabUrl || typeof tabUrl !== 'string') return null;

      const direct = this.normalizeAutoOpenPdfUrl(tabUrl);
      if (direct) return direct;

      try {
        const parsed = new URL(tabUrl);
        const candidateKeys = ['src', 'file', 'url'];

        for (const key of candidateKeys) {
          const value = parsed.searchParams.get(key);
          const normalized = this.normalizeAutoOpenPdfUrl(value);
          if (normalized) return normalized;
        }

        if (parsed.hash && parsed.hash.length > 1) {
          const hashParams = new URLSearchParams(parsed.hash.slice(1));
          for (const key of candidateKeys) {
            const value = hashParams.get(key);
            const normalized = this.normalizeAutoOpenPdfUrl(value);
            if (normalized) return normalized;
          }
        }
      } catch {
        // Ignore malformed URL values.
      }

      const decoded = this.decodeUrlForLocalFile(tabUrl);
      const embedded = decoded.match(/(?:file:(?:\/\/\/|\/\/)[^\s"'<>]+|\\\\+[^\s"'<>]+\.pdf(?:[?#][^\s"'<>]*)?)/i);
      if (embedded) {
        return this.normalizeAutoOpenPdfUrl(embedded[0]);
      }

      return null;
    }

    extractUncPathFromFileUrl(fileUrl) {
      if (!fileUrl || typeof fileUrl !== 'string') return null;

      try {
        const parsed = new URL(fileUrl);
        if (parsed.protocol !== 'file:') return null;

        if (parsed.host) {
          const relPath = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, '')).replace(/\//g, '\\');
          if (!relPath) return null;
          return `\\\\${parsed.host}\\${relPath}`;
        }

        const rawPath = decodeURIComponent(parsed.pathname || '');
        const uncMatch = rawPath.match(/^\/+\\\\+([^\\\/]+)[\\\/]+(.+)$/);
        if (uncMatch) {
          const relPath = uncMatch[2].replace(/\//g, '\\');
          return `\\\\${uncMatch[1]}\\${relPath}`;
        }
      } catch {
        return null;
      }

      return null;
    }

    buildAutoOpenPdfUrlCandidates(fileUrl) {
      const candidates = [];
      const seen = new Set();

      const pushCandidate = (value) => {
        if (!value || typeof value !== 'string') return;
        if (!/^file:\/\//i.test(value)) return;
        if (seen.has(value)) return;
        seen.add(value);
        candidates.push(value);
      };

      pushCandidate(fileUrl);

      const decoded = this.decodeUrlForLocalFile(fileUrl);
      if (decoded !== fileUrl) {
        pushCandidate(decoded);
      }

      const uncPath = this.extractUncPathFromFileUrl(fileUrl);
      if (uncPath) {
        const uncBody = uncPath.replace(/^\\\\+/, '');
        const parts = uncBody.split('\\').filter(Boolean);
        if (parts.length >= 2) {
          const host = parts.shift();
          const encodedPath = parts.map((segment) => encodeURIComponent(segment)).join('/');
          pushCandidate(`file://${host}/${encodedPath}`);
          pushCandidate(`file:////${host}/${encodedPath}`);
        }
      }

      return candidates;
    }

    isNetworkSharePdfUrl(fileUrl) {
      if (!fileUrl || typeof fileUrl !== 'string') return false;

      if (this.extractUncPathFromFileUrl(fileUrl)) {
        return true;
      }

      try {
        const parsed = new URL(fileUrl);
        if (parsed.protocol !== 'file:') return false;
        const host = (parsed.host || '').toLowerCase();
        if (!host) return false;
        return host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]';
      } catch {
        return false;
      }
    }

    getNetworkShareDisplayPath(pdfUrl) {
      const normalized = this.normalizeAutoOpenPdfUrl(pdfUrl);
      const uncPath = this.extractUncPathFromFileUrl(normalized || pdfUrl);
      return uncPath || normalized || pdfUrl || t('manager.unknownPath');
    }

    triggerOpenPdfPicker() {
      if (!(this.dom && this.dom.fileInput)) return false;

      const input = this.dom.fileInput;
      if (typeof input.showPicker === 'function') {
        try {
          input.showPicker();
          return true;
        } catch {
          // Fall through to click() fallback.
        }
      }

      try {
        input.click();
        return true;
      } catch {
        return false;
      }
    }

    async promptManualOpenForNetworkShare(pdfUrl, detail) {
      const displayPath = this.getNetworkShareDisplayPath(pdfUrl);

      const confirmed = await showConfirm(
        t('dialog.autoOpenLanFailed'),
        t('msg.lanAutoOpenFailedPrompt', { path: displayPath, detail })
      );

      if (!confirmed) return false;

      if (!(this.dom && this.dom.fileInput)) {
        await showAlert(
          t('dialog.filePickerFailed'),
          t('msg.fileInputNotFound')
        );
        return false;
      }

      if (this.triggerOpenPdfPicker()) {
        return true;
      }

      await showAlert(
        t('dialog.filePickerFailed'),
        t('msg.browserBlockedPicker')
      );
      return false;
    }

    async fetchPdfBytesFromCandidates(urlCandidates) {
      let lastError = null;

      for (const candidate of urlCandidates) {
        try {
          const response = await fetch(candidate, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          return { bytes, url: candidate };
        } catch (err) {
          lastError = err;
        }
      }

      if (lastError) throw lastError;
      throw new Error(t('msg.noValidAutoOpenUrl'));
    }

    async resolveAutoOpenPdfUrlFromBackground(sourceTabId) {
      if (!Number.isInteger(sourceTabId) || sourceTabId < 0) return null;
      if (!(typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function')) {
        return null;
      }

      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: RESOLVE_TAB_PDF_URL_MESSAGE, tabId: sourceTabId },
            (result) => {
              const runtimeError = chrome.runtime && chrome.runtime.lastError
                ? chrome.runtime.lastError
                : null;
              if (runtimeError) {
                resolve({ ok: false, error: runtimeError.message || 'runtime-send-message-failed' });
                return;
              }
              resolve(result || null);
            }
          );
        });

        if (!response || response.ok !== true) return null;
        return this.normalizeAutoOpenPdfUrl(response.pdfUrl);
      } catch {
        return null;
      }
    }

    async tryAutoOpenFromPdfUrl(pdfUrl) {
      const normalized = this.normalizeAutoOpenPdfUrl(pdfUrl);
      if (!normalized) throw new Error(t('msg.invalidAutoOpenUrl'));

      const candidates = this.buildAutoOpenPdfUrlCandidates(normalized);
      if (!candidates.length) throw new Error(t('msg.noValidAutoOpenUrl'));

      const loaded = await this.fetchPdfBytesFromCandidates(candidates);
      const fileName = this.getFileNameFromPdfUrl(loaded.url || normalized);

      // Keep storage behavior aligned with the Open PDF action by providing a File source.
      const sourceFile = new File([loaded.bytes], fileName, { type: 'application/pdf' });
      await this.loadPdf(loaded.bytes, fileName, true, { sourceFile });
      return normalized;
    }

    async tryAutoOpenFromLaunchContext() {
      const rawPdfUrl = this.getAutoOpenPdfUrlFromQuery();
      const rawSourceTabUrl = this.getAutoOpenSourceTabUrlFromQuery();
      const sourceTabId = this.getAutoOpenSourceTabIdFromQuery();

      const hasLaunchHints = !!rawPdfUrl || !!rawSourceTabUrl || Number.isInteger(sourceTabId);
      if (!hasLaunchHints) return;
      this.clearAutoOpenPdfUrlFromQuery();

      const immediateNetworkCandidate = this.normalizeAutoOpenPdfUrl(rawPdfUrl)
        || this.extractAutoOpenPdfUrlFromTabUrl(rawSourceTabUrl);
      if (this.isNetworkSharePdfUrl(immediateNetworkCandidate)) {
        await this.promptManualOpenForNetworkShare(immediateNetworkCandidate, 'browser-blocked-file-url');
        return;
      }

      const retryUrls = [];
      const seen = new Set();

      const pushRetryUrl = (value) => {
        const normalized = this.normalizeAutoOpenPdfUrl(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        retryUrls.push(normalized);
      };

      pushRetryUrl(rawPdfUrl);
      pushRetryUrl(this.extractAutoOpenPdfUrlFromTabUrl(rawSourceTabUrl));

      if (Number.isInteger(sourceTabId)) {
        const resolved = await this.resolveAutoOpenPdfUrlFromBackground(sourceTabId);
        pushRetryUrl(resolved);
      }

      if (!retryUrls.length) return;

      let attemptedUrl = retryUrls[0];
      let lastError = null;

      for (const candidate of retryUrls) {
        attemptedUrl = candidate;
        try {
          await this.tryAutoOpenFromPdfUrl(candidate);
          return;
        } catch (err) {
          lastError = err;
        }
      }

      if (Number.isInteger(sourceTabId)) {
        const resolvedUrl = await this.resolveAutoOpenPdfUrlFromBackground(sourceTabId);
        if (resolvedUrl && !seen.has(resolvedUrl)) {
          attemptedUrl = resolvedUrl;
          try {
            await this.tryAutoOpenFromPdfUrl(resolvedUrl);
            return;
          } catch (err) {
            lastError = err;
          }
        }
      }

      const detail = (lastError && lastError.message) ? lastError.message : String(lastError || 'unknown error');

      if (this.isNetworkSharePdfUrl(attemptedUrl)) {
        await this.promptManualOpenForNetworkShare(attemptedUrl, detail);
        return;
      }

      await showAlert(
        t('dialog.autoOpenLocalFailed'),
        t('msg.autoOpenLocalFailedPrompt', { detail })
      );
    }

    startRuntimeStatsMonitor() {
      this.stopRuntimeStatsMonitor();
      this._statsLastTick = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      this._longTaskDurationMs = 0;
      this._cpuEstimate = 0;
      this._lastMemorySampleAt = 0;

      if (typeof PerformanceObserver !== 'undefined') {
        try {
          const supported = Array.isArray(PerformanceObserver.supportedEntryTypes)
            && PerformanceObserver.supportedEntryTypes.includes('longtask');
          if (supported) {
            this._longTaskObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              for (const entry of entries) {
                this._longTaskDurationMs += entry.duration || 0;
              }
            });
            this._longTaskObserver.observe({ entryTypes: ['longtask'] });
          }
        } catch {
          this._longTaskObserver = null;
        }
      }

      this.sampleRuntimeMemory(true).finally(() => this.updateMemoryDisplay());
      this.renderRuntimeStats(true);
      this._statsTimer = setInterval(() => this.renderRuntimeStats(false), 1000);
    }

    stopRuntimeStatsMonitor() {
      if (this._statsTimer) {
        clearInterval(this._statsTimer);
        this._statsTimer = null;
      }
      if (this._longTaskObserver) {
        try { this._longTaskObserver.disconnect(); } catch { /* ignore */ }
        this._longTaskObserver = null;
      }
      this._longTaskDurationMs = 0;
      this._memorySamplePending = false;
      this._lastMemorySampleAt = 0;
    }

    estimateCanvasBytes() {
      let total = 0;
      this.pageElements.forEach((el) => {
        if (!el || !el.canvas) return;
        const w = Number(el.canvas.width) || 0;
        const h = Number(el.canvas.height) || 0;
        if (w > 0 && h > 0) total += (w * h * 4);
      });
      return total;
    }

    estimateBufferBytes() {
      let total = 0;
      if (this.pdfBytes instanceof Uint8Array) total += this.pdfBytes.byteLength;
      if (
        this.originalPdfBytes instanceof Uint8Array
        && this.originalPdfBytes !== this.pdfBytes
      ) {
        total += this.originalPdfBytes.byteLength;
      }
      return total;
    }

    getHeapMemoryStats() {
      const mem = (typeof performance !== 'undefined') ? performance.memory : null;
      if (
        mem
        && Number.isFinite(mem.usedJSHeapSize)
        && Number.isFinite(mem.jsHeapSizeLimit)
        && mem.jsHeapSizeLimit > 0
      ) {
        return {
          hasData: true,
          usedBytes: mem.usedJSHeapSize,
          totalBytes: mem.jsHeapSizeLimit,
        };
      }
      return { hasData: false, usedBytes: 0, totalBytes: 0 };
    }

    async sampleRuntimeMemory(force) {
      const now = Date.now();
      if (!force && (now - this._lastMemorySampleAt) < RUNTIME_MEMORY_SAMPLE_INTERVAL_MS) return;
      if (this._memorySamplePending) return;

      this._memorySamplePending = true;
      this._lastMemorySampleAt = now;

      try {
        const canvasBytes = this.estimateCanvasBytes();
        const bufferBytes = this.estimateBufferBytes();

        if (typeof performance !== 'undefined' && typeof performance.measureUserAgentSpecificMemory === 'function') {
          try {
            const result = await performance.measureUserAgentSpecificMemory();
            if (result && Number.isFinite(result.bytes) && result.bytes > 0) {
              let scopedBytes = 0;
              const breakdown = Array.isArray(result.breakdown) ? result.breakdown : [];
              const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';

              breakdown.forEach((item) => {
                if (!item || !Number.isFinite(item.bytes)) return;
                const attributions = Array.isArray(item.attribution) ? item.attribution : [];
                if (!attributions.length) return;
                const belongsToThisExtension = attributions.some((entry) => (
                  entry
                  && typeof entry.url === 'string'
                  && origin
                  && entry.url.startsWith(origin)
                ));
                if (belongsToThisExtension) scopedBytes += item.bytes;
              });

              const contextBytes = Number.isFinite(result.bytes) ? result.bytes : 0;
              const rawBytes = Math.max(contextBytes, scopedBytes);
              const metric = {
                kind: 'context',
                bytesUsed: rawBytes,
                bytesTotal: 0,
                heapBytes: 0,
                canvasBytes,
                bufferBytes,
                scopedBytes,
                taskMgrEstimateBytes: 0,
              };
              metric.taskMgrEstimateBytes = this.estimateTaskManagerBytes(metric);

              this._memoryMetric = metric;
              return;
            }
          } catch {
            // Fall back to heap-based estimate when API is unavailable or blocked.
          }
        }

        const heap = this.getHeapMemoryStats();
        if (heap.hasData) {
          const metric = {
            kind: 'heap-est',
            bytesUsed: heap.usedBytes + canvasBytes + bufferBytes,
            bytesTotal: heap.totalBytes,
            heapBytes: heap.usedBytes,
            canvasBytes,
            bufferBytes,
            scopedBytes: 0,
            taskMgrEstimateBytes: 0,
          };
          metric.taskMgrEstimateBytes = this.estimateTaskManagerBytes(metric);
          this._memoryMetric = metric;
          return;
        }

        this._memoryMetric = {
          kind: 'na',
          bytesUsed: 0,
          bytesTotal: 0,
          heapBytes: 0,
          canvasBytes: 0,
          bufferBytes: 0,
          scopedBytes: 0,
          taskMgrEstimateBytes: 0,
        };
      } finally {
        this._memorySamplePending = false;
      }
    }

    estimateTaskManagerBytes(metric) {
      if (!metric || !Number.isFinite(metric.bytesUsed) || metric.bytesUsed <= 0) return 0;

      const MB = 1024 * 1024;
      const baseFloor = this.hasPdfSource() ? (64 * MB) : (38 * MB);
      const renderPressure = Math.max(0, this.activeRenderCount || 0) * (8 * MB);

      if (metric.kind === 'context') {
        const nativeOverhead = Math.max(24 * MB, metric.bytesUsed * 0.55);
        const gpuOverhead = (metric.canvasBytes || 0) * 0.8;
        const bufferOverhead = (metric.bufferBytes || 0) * 0.4;
        return metric.bytesUsed + nativeOverhead + gpuOverhead + bufferOverhead + baseFloor + renderPressure;
      }

      const heap = Number.isFinite(metric.heapBytes) && metric.heapBytes > 0
        ? metric.heapBytes
        : metric.bytesUsed;
      const canvas = metric.canvasBytes || 0;
      const buffers = metric.bufferBytes || 0;
      const nativeOverhead = Math.max(32 * MB, heap * 1.4);
      const gpuOverhead = canvas * 1.25;
      const bufferOverhead = buffers * 0.5;
      return heap + canvas + buffers + nativeOverhead + gpuOverhead + bufferOverhead + baseFloor + renderPressure;
    }

    formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '--';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unitIdx = 0;
      while (value >= 1024 && unitIdx < units.length - 1) {
        value /= 1024;
        unitIdx += 1;
      }
      const digits = value >= 100 ? 0 : (value >= 10 ? 1 : 2);
      return `${value.toFixed(digits)} ${units[unitIdx]}`;
    }

    updateMemoryDisplay() {
      if (!this.dom.perfRam) return;

      const metric = this._memoryMetric || { kind: 'na' };
      if (metric.kind === 'context') {
        const raw = this.formatBytes(metric.bytesUsed);
        const tmEst = this.formatBytes(metric.taskMgrEstimateBytes || metric.bytesUsed);
        this.dom.perfRam.textContent = `${raw} (ctx)`;
        this.dom.perfRam.title = t('runtime.memoryContextTitle', {
          raw,
          taskMgr: tmEst,
          scoped: this.formatBytes(metric.scopedBytes),
          canvas: this.formatBytes(metric.canvasBytes),
          buffer: this.formatBytes(metric.bufferBytes),
        });
        return;
      }

      if (metric.kind === 'heap-est') {
        const est = this.formatBytes(metric.taskMgrEstimateBytes || metric.bytesUsed);
        this.dom.perfRam.textContent = `${est} (tm~)`;
        this.dom.perfRam.title = t('runtime.memoryEstimateTitle', {
          heap: this.formatBytes(metric.heapBytes),
          canvas: this.formatBytes(metric.canvasBytes),
          buffer: this.formatBytes(metric.bufferBytes),
        });
        return;
      }

      this.dom.perfRam.textContent = t('runtime.memoryNotAvailable');
      this.dom.perfRam.title = t('runtime.memoryUnsupportedTitle');
    }

    renderRuntimeStats(resetWindow) {
      if (!this.dom.perfRam || !this.dom.perfCpu) return;

      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

      if (resetWindow || !this._statsLastTick) this._statsLastTick = now;
      const elapsedMs = Math.max(1, now - this._statsLastTick);
      this._statsLastTick = now;

      const driftMs = Math.max(0, elapsedMs - 1000);
      const busyMs = this._longTaskDurationMs + driftMs;
      this._longTaskDurationMs = 0;

      const rawCpu = Math.max(0, Math.min(100, (busyMs / elapsedMs) * 100));
      this._cpuEstimate = this._cpuEstimate
        ? (this._cpuEstimate * 0.65 + rawCpu * 0.35)
        : rawCpu;

      this.sampleRuntimeMemory(resetWindow).finally(() => this.updateMemoryDisplay());
      this.updateMemoryDisplay();
      this.dom.perfCpu.textContent = `${this._cpuEstimate.toFixed(1)}%`;
    }

    async handlePurgeMemoryClick() {
      if (!this.hasPdfSource()) {
        await showAlert('Thông báo', t('msg.noPdfToPurge'));
        return;
      }

      await this.purgeMemory({
        auto: false,
        source: 'manual-button',
        preserveViewport: false,
        showErrorAlert: true,
      });
    }

    async purgeMemory(opts) {
      if (this._purgeInProgress) return false;
      if (!this.hasPdfSource()) return false;

      const options = opts || {};
      const isAuto = !!options.auto;
      const preserveViewport = !!options.preserveViewport;
      const showErrorAlert = options.showErrorAlert !== false;
      const viewportState = preserveViewport ? this.captureViewportState() : null;

      this._purgeInProgress = true;
      const btn = this.dom.btnPurgeMemory;
      if (btn && !isAuto) {
        btn.disabled = true;
        btn.textContent = t('manager.purgingMemory');
      }

      try {
        const preserveOrig = new Set();
        this.selectedPages.forEach((vi) => {
          if (vi < this.pageOrder.length) preserveOrig.add(this.pageOrder[vi]);
        });

        this.cleanupPageElements();
        if (this.pdfDoc && typeof this.pdfDoc.cleanup === 'function') {
          try { await this.pdfDoc.cleanup(); } catch { /* ignore */ }
        }

        await this.buildPageGrid(preserveOrig);
        this.selectedPages.clear();
        this.pageElements.forEach((el, vi) => {
          if (preserveOrig.has(el.origIdx)) {
            this.selectedPages.add(vi);
          }
        });
        if (viewportState) {
          this.restoreViewportState(viewportState);
        }
        this.updateSelectedCount();

        if (typeof window !== 'undefined' && typeof window.gc === 'function') {
          try { window.gc(); } catch { /* ignore */ }
        }
        await this.sampleRuntimeMemory(true);
        this.updateMemoryDisplay();
        this.renderRuntimeStats(true);
        if (isAuto) {
          this._lastAutoPurgeAt = Date.now();
        }
        return true;
      } catch (err) {
        if (showErrorAlert) {
          await showAlert('Lỗi', t('msg.purgeMemoryFailed', { error: err.message }));
        } else {
          console.warn('Auto purge memory failed:', options.source || 'auto', err);
        }
        return false;
      } finally {
        this._purgeInProgress = false;
        if (btn && !isAuto) {
          btn.textContent = t('manager.purgeMemory');
          btn.disabled = !this.hasPdfSource();
        }
      }
    }

    hasPdfSource() {
      return !!(this.pdfBytes || this._workingPdfOpfsFile || this.pdfDoc);
    }

    async assignWorkingOpfsFile(opfsFile, resetOriginal) {
      if (!opfsFile) return false;

      if (resetOriginal) {
        const prevWorking = this._workingPdfOpfsFile;
        const prevOriginal = this._originalPdfOpfsFile;

        this._workingPdfOpfsFile = opfsFile;
        this._originalPdfOpfsFile = opfsFile;

        if (prevWorking && prevWorking !== opfsFile) {
          await deleteOpfsFile(prevWorking);
        }
        if (prevOriginal && prevOriginal !== prevWorking && prevOriginal !== opfsFile) {
          await deleteOpfsFile(prevOriginal);
        }
      } else {
        if (this._workingPdfOpfsFile && this._workingPdfOpfsFile !== this._originalPdfOpfsFile) {
          await deleteOpfsFile(this._workingPdfOpfsFile);
        }
        this._workingPdfOpfsFile = opfsFile;
        if (!this._originalPdfOpfsFile) this._originalPdfOpfsFile = opfsFile;
      }

      this.pdfBytes = null;
      if (resetOriginal) this.originalPdfBytes = null;
      this.sourceStorageMode = 'opfs';
      this.updateLazyRenderStatus();
      return true;
    }

    async setWorkingSourceFile(file, opts) {
      const resetOriginal = !!(opts && opts.resetOriginal);
      const opfsFile = await writeFileToOpfs(file, 'manager-work');
      if (await this.assignWorkingOpfsFile(opfsFile, resetOriginal)) {
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      await this.setWorkingSourceBytes(bytes, opts);
    }

    async setWorkingSourceBytes(bytes, opts) {
      const resetOriginal = !!(opts && opts.resetOriginal);
      const opfsFile = await writeBytesToOpfs(bytes, 'manager-work');

      if (await this.assignWorkingOpfsFile(opfsFile, resetOriginal)) {
        return;
      }

      // Fallback for environments without OPFS support.
      this.pdfBytes = bytes;
      this._workingPdfOpfsFile = null;
      this.sourceStorageMode = 'memory';

      if (resetOriginal) {
        this.originalPdfBytes = bytes.slice();
        this._originalPdfOpfsFile = null;
      }

      this.updateLazyRenderStatus();
    }

    async readWorkingBytes() {
      if (this._workingPdfOpfsFile) {
        const bytes = await readBytesFromOpfs(this._workingPdfOpfsFile);
        if (bytes) return bytes;
      }
      if (this.pdfBytes) return this.pdfBytes.slice();
      return null;
    }

    async getRasterWorkerSourceInput() {
      if (this._workingPdfOpfsFile) {
        const sourceUrl = await createObjectUrlFromOpfs(this._workingPdfOpfsFile);
        if (sourceUrl) {
          return {
            sourceUrl,
            cleanup: () => revokeTempObjectUrl(sourceUrl),
          };
        }
      }

      const bytes = await this.readWorkingBytes();
      if (!bytes) return null;
      return {
        bytes,
        cleanup: null,
      };
    }

    async readOriginalBytes() {
      if (this._originalPdfOpfsFile) {
        const bytes = await readBytesFromOpfs(this._originalPdfOpfsFile);
        if (bytes) return bytes;
      }
      if (this.originalPdfBytes) return this.originalPdfBytes.slice();
      return null;
    }

    async restoreWorkingFromOriginal() {
      if (this._originalPdfOpfsFile) {
        if (this._workingPdfOpfsFile && this._workingPdfOpfsFile !== this._originalPdfOpfsFile) {
          await deleteOpfsFile(this._workingPdfOpfsFile);
        }
        this._workingPdfOpfsFile = this._originalPdfOpfsFile;
        this.pdfBytes = null;
        this.sourceStorageMode = 'opfs';
        this.updateLazyRenderStatus();
        return true;
      }

      if (this.originalPdfBytes) {
        this.pdfBytes = this.originalPdfBytes.slice();
        this._workingPdfOpfsFile = null;
        this.sourceStorageMode = 'memory';
        this.updateLazyRenderStatus();
        return true;
      }

      return false;
    }

    async loadPdfDocumentFromSource() {
      if (this._pdfSourceUrl) {
        revokeTempObjectUrl(this._pdfSourceUrl);
        this._pdfSourceUrl = null;
      }

      const loadOpts = {};
      if (this._workingPdfOpfsFile) {
        const sourceUrl = await createObjectUrlFromOpfs(this._workingPdfOpfsFile);
        if (sourceUrl) {
          this._pdfSourceUrl = sourceUrl;
          loadOpts.url = sourceUrl;
        } else {
          const bytes = await this.readWorkingBytes();
          if (!bytes) throw new Error('Không thể đọc file PDF trong OPFS.');
          this.pdfBytes = bytes;
          this.sourceStorageMode = 'memory';
          loadOpts.data = bytes.slice();
        }
      } else {
        const bytes = await this.readWorkingBytes();
        if (!bytes) throw new Error('Không có dữ liệu PDF để hiển thị.');
        this.sourceStorageMode = 'memory';
        loadOpts.data = bytes.slice();
      }

      if (this._pdfPassword) loadOpts.password = this._pdfPassword;
      const loadingTask = pdfjsLib.getDocument(loadOpts);
      this.pdfDoc = await loadingTask.promise;
      await this.updateDefaultPageAspect();
      this.updateLazyRenderStatus();
    }

    async updateDefaultPageAspect() {
      if (!this.pdfDoc || this.pdfDoc.numPages < 1) {
        this.defaultPageAspect = Math.sqrt(2);
        return;
      }

      try {
        const page = await this.pdfDoc.getPage(1);
        const vp = page.getViewport({ scale: 1.0 });
        if (vp.width > 0 && vp.height > 0) {
          this.defaultPageAspect = vp.height / vp.width;
        }
        page.cleanup();
      } catch {
        this.defaultPageAspect = Math.sqrt(2);
      }
    }

    async clearPdfSources() {
      const working = this._workingPdfOpfsFile;
      const original = this._originalPdfOpfsFile;

      this._workingPdfOpfsFile = null;
      this._originalPdfOpfsFile = null;
      this.pdfBytes = null;
      this.originalPdfBytes = null;

      if (working) await deleteOpfsFile(working);
      if (original && original !== working) await deleteOpfsFile(original);

      if (this._pdfSourceUrl) {
        revokeTempObjectUrl(this._pdfSourceUrl);
        this._pdfSourceUrl = null;
      }

      this.sourceStorageMode = 'none';
      this.currentColumnCount = 0;
      this.updateLazyRenderStatus();
    }

    // === Drag and Drop ===
    setupDragDrop() {
      const wrapper = this.dom.pagesWrapper;
      let dragCounter = 0;

      wrapper.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        document.body.classList.add('drag-active');
      });
      wrapper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; document.body.classList.remove('drag-active'); }
      });
      wrapper.addEventListener('dragover', (e) => e.preventDefault());
      wrapper.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        document.body.classList.remove('drag-active');
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
        if (!files.length) return;

        if (!this.hasPdfSource()) {
          this.openFiles(files);
        } else {
          const pos = await showYesNoCancel(
            'Chọn vị trí thêm PDF',
            'Mặc định PDF mới sẽ được thêm vào cuối PDF hiện tại.\n\nCó: Thêm vào cuối\nKhông: Thêm vào đầu\nHủy: Không thêm'
          );
          if (pos === true) this.mergeFiles(files, 'end');
          else if (pos === false) this.mergeFiles(files, 'start');
        }
      });
    }

    // === File Operations ===
    async openFiles(files) {
      const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (!pdfFiles.length) { await showAlert('Lỗi', 'Chỉ chấp nhận file PDF (.pdf)'); return; }

      try {
        if (pdfFiles.length === 1) {
          const bytes = new Uint8Array(await pdfFiles[0].arrayBuffer());
          await this.loadPdf(bytes, pdfFiles[0].name, true, { sourceFile: pdfFiles[0] });
        } else {
          // Merge multiple files into one
          const combined = await this.combineFiles(pdfFiles);
          if (combined) {
            await this.loadPdf(combined.bytes, pdfFiles[0].name, true);
            // Override outline with combined outlines from source files
            if (combined.outlineTree) {
              this.outlineTree = combined.outlineTree;
              this.originalOutlineTree = JSON.parse(JSON.stringify(combined.outlineTree));
            }
            this.openedFileCount = pdfFiles.length;
            this.updateFileInfo();
            await showAlert('Thành công', `Đã mở ${pdfFiles.length} file PDF với tổng ${this.pageOrder.length} trang.`);
          }
        }
      } catch (err) {
        await showAlert('Lỗi', 'Không thể mở file PDF:\n' + err.message);
      }
    }

    async loadPdf(bytes, name, isNewOpen, opts) {
      // Unlock encrypted PDF if needed
      this._pdfPassword = '';
      this._isEncrypted = false;
      let safeBytes = bytes;

      try {
        safeBytes = await this.checkAndUnlock(bytes, name);
        if (!safeBytes) return; // user cancelled password entry
      } catch (e) {
        safeBytes = bytes;
      }

      // Close previous
      this.cleanupPageElements();
      await this.destroyPdfDoc();

      if (isNewOpen) {
        await this.clearPdfSources();
      }

      const sourceFile = opts && opts.sourceFile;
      const canReuseSourceFile = !!(sourceFile && safeBytes === bytes && isNewOpen);
      if (canReuseSourceFile) {
        await this.setWorkingSourceFile(sourceFile, { resetOriginal: isNewOpen });
      } else {
        await this.setWorkingSourceBytes(safeBytes, { resetOriginal: isNewOpen });
      }

      if (isNewOpen) {
        this.fileName = name;
        this.openedFileCount = 1;
        this.rotationStates = {};
        this.initialRotationStates = {};
        this.hasUnsavedAppend = false;
        this.selectedPages.clear();
        this.lastClickedIdx = null;
      }

      // Open with pdf.js for rendering from OPFS source (fallback to memory when needed)
      await this.loadPdfDocumentFromSource();

      // Read and store outline tree for bookmark preservation
      if (isNewOpen) {
        try {
          this.outlineTree = await readOutlineTree(this.pdfDoc);
          this.originalOutlineTree = this.outlineTree
            ? JSON.parse(JSON.stringify(this.outlineTree)) : null;
        } catch {
          this.outlineTree = null;
          this.originalOutlineTree = null;
        }
      }

      // Build page order (all pages)
      this.pageOrder = [];
      for (let i = 0; i < this.pdfDoc.numPages; i++) {
        this.pageOrder.push(i);
      }

      this.setUiState(true);
      this.updateFileInfo();
      await this.buildPageGrid();
      this.updatePageCount();
      this.updateSelectedCount();
    }

    async checkAndUnlock(bytes, fileName) {
      // Check if password is needed
      try {
        const task = pdfjsLib.getDocument({ data: bytes.slice() });
        const doc = await task.promise;
        await doc.destroy();
      } catch (e) {
        if (e && e.name === 'PasswordException') {
          const result = await showPasswordPrompt(
            'File bị khóa',
            `File '${fileName || 'PDF'}' bị khóa bằng password.\nNhập password để mở:`
          );
          if (result.action === 'cancel') return null;
          try {
            const task2 = pdfjsLib.getDocument({ data: bytes.slice(), password: result.input });
            const doc2 = await task2.promise;
            await doc2.destroy();
            this._pdfPassword = result.input;
          } catch {
            await showAlert('Lỗi', 'Password không đúng hoặc file không thể mở.');
            return null;
          }
        } else {
          return bytes;
        }
      }

      // Check if encrypted
      let isEncrypted = false;
      try {
        const testDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        isEncrypted = testDoc.isEncrypted;
      } catch {
        isEncrypted = true;
      }
      if (!isEncrypted) return bytes;

      // Try fast pdf-lib unlock with verification
      try {
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const cleaned = new Uint8Array(await doc.save());
        const vTask = pdfjsLib.getDocument({ data: cleaned.slice() });
        const vDoc = await vTask.promise;
        let valid = false;
        if (vDoc.numPages > 0) {
          const p = await vDoc.getPage(1);
          const ops = await p.getOperatorList();
          p.cleanup();
          valid = ops.fnArray.length > 2;
        }
        await vDoc.destroy();
        if (valid) return cleaned;
      } catch { /* fall through */ }

      // pdf-lib produced corrupt output, keep encrypted bytes for viewing
      this._isEncrypted = true;
      return bytes;
    }

    async closeFile() {
      if (this.hasPdfSource() && this.isModified()) {
        const r = await showYesNoCancel(
          'File chưa lưu',
          `File '${this.fileName}' có thay đổi chưa được lưu.\n\nBạn có muốn lưu file trước khi đóng không?`
        );
        if (r === null) return;
        if (r === true) await this.savePdf();
      }
      this.cleanupPageElements();
      await this.destroyPdfDoc();
      if (this.zoomTimer) {
        clearTimeout(this.zoomTimer);
        this.zoomTimer = null;
      }
      this._wheelZoomAccumulatorPx = 0;
      this._lastWheelZoomAt = 0;
      if (this._autoPurgeTimer) {
        clearTimeout(this._autoPurgeTimer);
        this._autoPurgeTimer = null;
      }
      this._lastAutoPurgeAt = 0;
      await this.clearPdfSources();
      revokeAllTempObjectUrls();
      this.fileName = '';
      this.openedFileCount = 0;
      this.pageOrder = [];
      this.rotationStates = {};
      this.initialRotationStates = {};
      this.selectedPages.clear();
      this.lastClickedIdx = null;
      this.hasUnsavedAppend = false;
      this.outlineTree = null;
      this.originalOutlineTree = null;
      this._pdfPassword = '';
      this._isEncrypted = false;
      this.setUiState(false);
      this.updateFileInfo();
      this.updatePageCount();
      this.updateSelectedCount();
      this.showEmptyPlaceholder(true);
      await this.sampleRuntimeMemory(true);
      this.renderRuntimeStats(true);
    }

    async destroyPdfDoc() {
      const currentDoc = this.pdfDoc;
      this.pdfDoc = null;

      if (currentDoc) {
        try {
          if (typeof currentDoc.cleanup === 'function') await currentDoc.cleanup();
        } catch {
          // Ignore cleanup errors before hard destroy.
        }

        try {
          if (typeof currentDoc.destroy === 'function') await currentDoc.destroy();
        } catch {
          // Ignore destroy errors to keep teardown resilient.
        }
      }

      if (this._pdfSourceUrl) {
        revokeTempObjectUrl(this._pdfSourceUrl);
        this._pdfSourceUrl = null;
      }
    }

    async dispose() {
      this.stopRuntimeStatsMonitor();
      this.teardownScrollReleaseRefresh();
      this.cleanupPageElements();
      await this.destroyPdfDoc();
      if (this.zoomTimer) {
        clearTimeout(this.zoomTimer);
        this.zoomTimer = null;
      }
      this._wheelZoomAccumulatorPx = 0;
      this._lastWheelZoomAt = 0;
      if (this._autoPurgeTimer) {
        clearTimeout(this._autoPurgeTimer);
        this._autoPurgeTimer = null;
      }
      this._lastAutoPurgeAt = 0;
      try {
        await this.clearPdfSources();
      } catch {
        // Ignore cleanup failures during disposal.
      }
      this.fileName = '';
      this.openedFileCount = 0;
      this.pageOrder = [];
      this.selectedPages.clear();
      this._pdfPassword = '';
      this._isEncrypted = false;
      revokeAllTempObjectUrls();
      if (this._onPageHide) {
        window.removeEventListener('pagehide', this._onPageHide, true);
        this._onPageHide = null;
      }
      if (this._onResize) {
        window.removeEventListener('resize', this._onResize, true);
        this._onResize = null;
      }
      if (this._resizeTimer) {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = null;
      }
    }

    // === Page Grid ===
    cleanupPageElements() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
      this.renderQueue = [];
      this.activeRenderCount = 0;
      this.renderTick = 0;
      this.visibleVisualIndices.clear();
      this.allowedRenderIndices.clear();
      this.pageElements.forEach(el => {
        if (el.renderTask) {
          try { el.renderTask.cancel(); } catch { /* ignore */ }
          el.renderTask = null;
        }
        el.queuedForRender = false;
        if (el.canvas) {
          const ctx = el.canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
          el.canvas.width = 0;
          el.canvas.height = 0;
        }
      });
      this.pageElements = [];
      this.dom.pagesGrid.innerHTML = '';
    }

    showEmptyPlaceholder(show) {
      if (show) {
        if (!this.dom.pagesGrid.querySelector('.empty-placeholder')) {
          const placeholder = document.createElement('div');
          placeholder.className = 'empty-placeholder';
          placeholder.id = 'empty-placeholder';
          placeholder.innerHTML = `<p class="empty-icon">📄</p><p>${t('manager.emptyTitle')}</p><p class="empty-hint">${t('manager.emptyHintHtml')}</p>`;
          this.dom.pagesGrid.appendChild(placeholder);
        }
      }
    }

    // === Column count based on thumbnail size and available width ===
    getColumnCount() {
      const wrapperWidth = this.dom.pagesWrapper ? this.dom.pagesWrapper.clientWidth : 0;
      const availableWidth = Math.max(0, wrapperWidth - 32); // pages-grid has 16px horizontal padding on each side.
      if (!availableWidth) return 1;

      const safeAspect = this.defaultPageAspect > 0 ? this.defaultPageAspect : Math.sqrt(2);
      const perf = getActivePerfProfile();
      const previewDims = computePreviewDimensionsWithFallback(
        perf.previewBaseWidth,
        this.zoomLevel,
        safeAspect,
        0
      );
      const cardWidth = Math.max(1, previewDims.width + CARD_WIDTH_PADDING_PX);
      return Math.max(1, Math.floor(availableWidth / cardWidth));
    }

    async buildPageGrid(preserveSelection) {
      this.cleanupPageElements();

      if (!this.pdfDoc || !this.pageOrder.length) {
        this.currentColumnCount = 0;
        this.updateLazyRenderStatus();
        this.showEmptyPlaceholder(true);
        return;
      }

      // Set grid columns based on zoom level
      const cols = this.getColumnCount();
      this.currentColumnCount = cols;
      this.dom.pagesGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      this.updateLazyRenderStatus();

      // Detect single-row scenario for height constraint
      const rows = Math.ceil(this.pageOrder.length / cols);
      const isSingleRow = rows === 1 && this.pageOrder.length > 0;
      this.dom.pagesGrid.classList.toggle('single-row', isSingleRow);

      for (let vi = 0; vi < this.pageOrder.length; vi++) {
        const origIdx = this.pageOrder[vi];
        const el = await this.createPageElement(origIdx, vi, preserveSelection);
        this.dom.pagesGrid.appendChild(el.container);
        this.pageElements.push(el);
      }

      this.setupLazyLoading();
    }

    async createPageElement(origIdx, visualIdx, preserveSelection) {
      const rotation = this.rotationStates[origIdx] || 0;

      // Use a cached aspect ratio from page 1 to avoid loading every page just for placeholders.
      const safeAspect = this.defaultPageAspect > 0 ? this.defaultPageAspect : Math.sqrt(2);
      const perf = getActivePerfProfile();
      const previewDims = computePreviewDimensionsWithFallback(
        perf.previewBaseWidth,
        this.zoomLevel,
        safeAspect,
        rotation
      );
      const pageWidth = previewDims.width;
      const pageHeight = previewDims.height;

      // Card container
      const container = document.createElement('div');
      container.className = 'page-card';
      container.dataset.visual = visualIdx;

      // Check if should be selected (from preserveSelection)
      const isSelected = preserveSelection
        ? preserveSelection.has(origIdx)
        : this.selectedPages.has(visualIdx);
      if (isSelected) {
        container.classList.add('selected');
        this.selectedPages.add(visualIdx);
      }

      // Header
      const header = document.createElement('div');
      header.className = 'page-header';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isSelected;

      const label = document.createElement('span');
      label.className = 'page-label';
      label.textContent = t('manager.pageLabel', { page: origIdx + 1 });

      const rotLabel = document.createElement('span');
      rotLabel.className = 'page-rotation';
      rotLabel.textContent = `${rotation}°`;

      header.appendChild(checkbox);
      header.appendChild(label);
      header.appendChild(rotLabel);

      // Canvas wrap (placeholder)
      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'page-canvas-wrap placeholder';
      canvasWrap.style.minHeight = pageHeight + 'px';

      const canvas = document.createElement('canvas');
      canvas.width = 0;
      canvas.height = 0;
      canvasWrap.appendChild(canvas);

      container.appendChild(header);
      container.appendChild(canvasWrap);

      // Click events
      const onClickPage = (e) => {
        e.stopPropagation();
        if (e.target === checkbox) {
          // Checkbox clicked directly - update state from checkbox
          if (e.shiftKey && this.lastClickedIdx !== null) {
            e.preventDefault();
            this.selectRange(this.lastClickedIdx, visualIdx);
          } else {
            const checked = checkbox.checked;
            if (checked) this.selectedPages.add(visualIdx);
            else this.selectedPages.delete(visualIdx);
            container.classList.toggle('selected', checked);
          }
        } else {
          // Clicked on card body
          if (e.shiftKey && this.lastClickedIdx !== null) {
            this.selectRange(this.lastClickedIdx, visualIdx);
          } else {
            const isNowSelected = !this.selectedPages.has(visualIdx);
            checkbox.checked = isNowSelected;
            if (isNowSelected) this.selectedPages.add(visualIdx);
            else this.selectedPages.delete(visualIdx);
            container.classList.toggle('selected', isNowSelected);
          }
        }
        this.lastClickedIdx = visualIdx;
        this.updateSelectedCount();
      };

      container.addEventListener('click', onClickPage);

      return {
        container,
        canvasWrap,
        canvas,
        checkbox,
        label,
        rotLabel,
        origIdx,
        visualIdx,
        rendered: false,
        rendering: false,
        queuedForRender: false,
        renderTask: null,
        lastRenderTick: 0,
        pageWidth,
        pageHeight,
      };
    }

    evictRenderedPages(exemptVisualIdx) {
      const perf = getActivePerfProfile();
      const candidates = [];

      this.pageElements.forEach((entry, idx) => {
        if (!entry || !entry.rendered) return;
        if (idx === exemptVisualIdx) return;
        if (this.visibleVisualIndices.has(idx)) return;
        candidates.push({ idx, tick: entry.lastRenderTick || 0 });
      });

      if (candidates.length <= perf.maxRenderedPages) return;

      candidates.sort((a, b) => a.tick - b.tick);
      const toEvict = candidates.length - perf.maxRenderedPages;
      for (let i = 0; i < toEvict; i++) {
        this.unloadPage(candidates[i].idx);
      }
    }

    computeRenderWindowIndices() {
      const total = this.pageElements.length;
      if (!total) return new Set();

      const perf = getActivePerfProfile();
      const hardCap = Math.max(1, perf.renderWindowHardCapPages || perf.maxRenderedPages || 6);
      const padding = Math.max(0, perf.renderWindowPaddingPages || 0);
      const allowedByWasm = computeRenderWindowWithFallback(
        total,
        this.visibleVisualIndices,
        hardCap,
        padding
      );

      if (allowedByWasm) {
        return allowedByWasm;
      }

      return this.computeRenderWindowIndicesFallback(total, hardCap, padding);
    }

    computeRenderWindowIndicesFallback(total, hardCap, padding) {
      const allowed = new Set();
      const visible = Array.from(this.visibleVisualIndices).sort((a, b) => a - b);

      let start = 0;
      let end = Math.min(total - 1, hardCap - 1);

      if (visible.length) {
        start = Math.max(0, visible[0] - padding);
        end = Math.min(total - 1, visible[visible.length - 1] + padding);
      }

      if ((end - start + 1) > hardCap) {
        const center = visible.length
          ? Math.round((visible[0] + visible[visible.length - 1]) / 2)
          : Math.round((start + end) / 2);
        start = center - Math.floor(hardCap / 2);
        end = start + hardCap - 1;
        if (start < 0) {
          start = 0;
          end = Math.min(total - 1, hardCap - 1);
        }
        if (end > total - 1) {
          end = total - 1;
          start = Math.max(0, end - hardCap + 1);
        }
      }

      for (let i = start; i <= end; i++) allowed.add(i);
      visible.forEach((idx) => allowed.add(idx));
      return allowed;
    }

    refreshRenderWindow() {
      if (!this.pageElements.length) return;

      const perf = getActivePerfProfile();
      const hardCap = Math.max(1, perf.renderWindowHardCapPages || perf.maxRenderedPages || 6);
      if (this.visibleVisualIndices.size > (hardCap * 3)) {
        this.syncVisibleIndicesWithViewport();
      }

      this.allowedRenderIndices = this.computeRenderWindowIndices();
      const allowed = this.allowedRenderIndices;

      this.renderQueue = this.renderQueue.filter((idx) => allowed.has(idx));

      this.pageElements.forEach((el, idx) => {
        if (!el) return;
        if (!allowed.has(idx) && !this.visibleVisualIndices.has(idx)) {
          this.unloadPage(idx);
        }
      });

      const visible = Array.from(this.visibleVisualIndices).sort((a, b) => a - b);
      visible.forEach((idx) => this.queueRenderPage(idx));

      Array.from(allowed)
        .sort((a, b) => a - b)
        .forEach((idx) => {
          if (!this.visibleVisualIndices.has(idx)) this.queueRenderPage(idx);
        });

      this.pumpRenderQueue();
      this.updateLazyRenderStatus();
    }

    selectRange(from, to) {
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      for (let i = start; i <= end; i++) {
        this.selectedPages.add(i);
        const el = this.pageElements[i];
        if (el) {
          el.checkbox.checked = true;
          el.container.classList.add('selected');
        }
      }
      this.updateSelectedCount();
    }

    // === Lazy Loading ===
    setupLazyLoading() {
      if (this.observer) this.observer.disconnect();

      const perf = getActivePerfProfile();
      this.visibleVisualIndices.clear();
      this.allowedRenderIndices.clear();

      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const vi = parseInt(entry.target.dataset.visual, 10);
          if (isNaN(vi)) return;
          if (entry.isIntersecting) {
            this.visibleVisualIndices.add(vi);
          } else {
            this.visibleVisualIndices.delete(vi);
          }
        });
        this.refreshRenderWindow();
      }, {
        root: this.dom.pagesWrapper,
        rootMargin: perf.rootMargin,
      });

      this.pageElements.forEach(el => this.observer.observe(el.container));
      this.syncVisibleIndicesWithViewport();
      this.refreshRenderWindow();
      ensureWasmHelpers().then(() => this.refreshRenderWindow()).catch(() => { /* ignore */ });
    }

    queueRenderPage(visualIdx) {
      const el = this.pageElements[visualIdx];
      if (this.allowedRenderIndices.size) {
        const inWindow = this.allowedRenderIndices.has(visualIdx) || this.visibleVisualIndices.has(visualIdx);
        if (!inWindow) return;
      }
      if (!el || el.rendered || el.rendering || el.queuedForRender || !this.pdfDoc) return;
      el.queuedForRender = true;
      this.renderQueue.push(visualIdx);
      this.pumpRenderQueue();
    }

    pumpRenderQueue() {
      const perf = getActivePerfProfile();
      while (this.activeRenderCount < perf.renderConcurrency && this.renderQueue.length) {
        const visualIdx = this.renderQueue.shift();
        const el = this.pageElements[visualIdx];
        if (!el || !el.queuedForRender || el.rendered || el.rendering || !this.pdfDoc) continue;

        el.queuedForRender = false;
        this.activeRenderCount += 1;
        this.renderPage(visualIdx).finally(() => {
          this.activeRenderCount = Math.max(0, this.activeRenderCount - 1);
          this.pumpRenderQueue();
        });
      }
    }

    async renderPage(visualIdx) {
      const el = this.pageElements[visualIdx];
      if (!el || el.rendered || el.rendering || !this.pdfDoc) return;
      if (this.allowedRenderIndices.size) {
        const inWindow = this.allowedRenderIndices.has(visualIdx) || this.visibleVisualIndices.has(visualIdx);
        if (!inWindow) return;
      }
      el.rendering = true;
      let page = null;

      try {
        const origIdx = el.origIdx;
        const rotation = this.rotationStates[origIdx] || 0;

        // Quality reduction for high zoom to save memory
        let quality = 1.0;
        if (this.zoomLevel > 1.2) quality = 0.75;
        else if (this.zoomLevel > 0.8) quality = 0.9;

        page = await this.pdfDoc.getPage(origIdx + 1);
        const getViewport = (scale) => page.getViewport({ scale, rotation });
        const desiredScale = this.zoomLevel * quality;
        const { viewport } = clampViewportByPixels(
          desiredScale,
          getViewport,
          getActivePerfProfile().viewCanvasPixels
        );

        const canvas = el.canvas;
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));

        const ctx = canvas.getContext('2d', { alpha: false });
        const renderTask = page.render({ canvasContext: ctx, viewport });
        el.renderTask = renderTask;
        await renderTask.promise;

        el.canvasWrap.classList.remove('placeholder');
        el.canvasWrap.style.minHeight = '';
        el.rendered = true;
        el.lastRenderTick = ++this.renderTick;
        this.evictRenderedPages(visualIdx);
      } catch (err) {
        if (!(err && err.name === 'RenderingCancelledException')) {
          console.error(`Error rendering page ${visualIdx}:`, err);
        }
      } finally {
        if (page) {
          try { page.cleanup(); } catch { /* ignore */ }
        }
        el.renderTask = null;
        el.rendering = false;
      }
    }

    unloadPage(visualIdx) {
      const el = this.pageElements[visualIdx];
      if (!el) return;

      el.queuedForRender = false;
      if (el.renderTask) {
        try { el.renderTask.cancel(); } catch { /* ignore */ }
        el.renderTask = null;
      }

      const ctx = el.canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
      el.canvas.width = 0;
      el.canvas.height = 0;

      el.canvasWrap.classList.add('placeholder');
      el.canvasWrap.style.minHeight = el.pageHeight + 'px';
      el.rendered = false;
      el.lastRenderTick = 0;
    }

    // === Selection ===
    toggleSelectAll() {
      if (!this.pageElements.length) return;

      const allSelected = this.selectedPages.size === this.pageElements.length;
      if (allSelected) {
        // Deselect all
        this.selectedPages.clear();
        this.pageElements.forEach(el => {
          el.checkbox.checked = false;
          el.container.classList.remove('selected');
        });
        this.dom.btnSelectAll.textContent = t('manager.selectAll');
      } else {
        // Select all
        this.pageElements.forEach((el, vi) => {
          this.selectedPages.add(vi);
          el.checkbox.checked = true;
          el.container.classList.add('selected');
        });
        this.dom.btnSelectAll.textContent = t('manager.deselectAll');
      }
      this.updateSelectedCount();
    }

    clearSelection() {
      this.selectedPages.clear();
      this.lastClickedIdx = null;
      this.pageElements.forEach(el => {
        el.checkbox.checked = false;
        el.container.classList.remove('selected');
      });
      this.dom.btnSelectAll.textContent = t('manager.selectAll');
      this.updateSelectedCount();
    }

    getSelectedVisualIndices() {
      return Array.from(this.selectedPages).sort((a, b) => a - b);
    }

    // === Rotate ===
    async rotateSelectedPages(angle) {
      const selected = this.getSelectedVisualIndices();
      if (!selected.length) {
        await showAlert('Thông báo', 'Bạn chưa chọn trang nào để xoay.');
        return;
      }

      // Save selection by original indices
      const preserveOrig = new Set(selected.map(vi => this.pageOrder[vi]));

      for (const vi of selected) {
        const origIdx = this.pageOrder[vi];
        const current = this.rotationStates[origIdx] || 0;
        this.rotationStates[origIdx] = (current + angle + 360) % 360;
      }

      this.hasUnsavedAppend = true;
      await this.rebuildWithPreservation(preserveOrig);
    }

    async resetSelectedRotation() {
      const selected = this.getSelectedVisualIndices();
      if (!selected.length) {
        await showAlert('Thông báo', 'Vui lòng chọn ít nhất 1 trang để reset.');
        return;
      }

      const preserveOrig = new Set(selected.map(vi => this.pageOrder[vi]));

      for (const vi of selected) {
        const origIdx = this.pageOrder[vi];
        this.rotationStates[origIdx] = 0;
      }

      this.hasUnsavedAppend = true;
      await this.rebuildWithPreservation(preserveOrig);
    }

    async rebuildWithPreservation(preserveOrigSet) {
      this.selectedPages.clear();
      await this.buildPageGrid(preserveOrigSet);
      // Re-derive selectedPages from preserved original indices
      this.pageElements.forEach((el, vi) => {
        if (preserveOrigSet.has(el.origIdx)) {
          this.selectedPages.add(vi);
        }
      });
      this.updatePageCount();
      this.updateSelectedCount();
    }

    // === Move Pages ===
    async moveSelectedPages(direction) {
      if (!this.hasPdfSource()) return;
      const selected = this.getSelectedVisualIndices();
      if (!selected.length) {
        await showAlert('Thông báo', 'Vui lòng chọn ít nhất 1 trang để di chuyển.');
        return;
      }

      const n = this.pageOrder.length;
      if (direction === -1 && selected[0] === 0) {
        await showAlert('Thông báo', 'Không thể di chuyển - các trang đã ở vị trí đầu tiên.');
        return;
      }
      if (direction === 1 && selected[selected.length - 1] === n - 1) {
        await showAlert('Thông báo', 'Không thể di chuyển - các trang đã ở vị trí cuối cùng.');
        return;
      }

      // Reorder pageOrder
      const newOrder = [...this.pageOrder];
      if (direction === -1) {
        for (const idx of selected) {
          const temp = newOrder[idx - 1];
          newOrder[idx - 1] = newOrder[idx];
          newOrder[idx] = temp;
        }
      } else {
        for (let i = selected.length - 1; i >= 0; i--) {
          const idx = selected[i];
          const temp = newOrder[idx + 1];
          newOrder[idx + 1] = newOrder[idx];
          newOrder[idx] = temp;
        }
      }

      this.pageOrder = newOrder;
      this.hasUnsavedAppend = true;

      // Keep selection on moved pages after re-render.
      const newSelVis = new Set(selected.map(s => s + direction));

      this.selectedPages.clear();
      await this.buildPageGrid();
      newSelVis.forEach(vi => {
        if (vi >= 0 && vi < this.pageElements.length) {
          this.selectedPages.add(vi);
          this.pageElements[vi].checkbox.checked = true;
          this.pageElements[vi].container.classList.add('selected');
        }
      });
      this.updatePageCount();
      this.updateSelectedCount();
    }

    // === Delete Pages ===
    async deleteSelectedPages() {
      const selected = this.getSelectedVisualIndices();
      if (!selected.length) {
        await showAlert('Thông báo', 'Vui lòng chọn ít nhất 1 trang để xóa.');
        return;
      }

      const confirmed = await showConfirm(
        'Xác nhận xóa',
        `Bạn có chắc chắn muốn xóa ${selected.length} trang được chọn?\n\n(Trang sẽ bị xóa khi lưu file)`
      );
      if (!confirmed) return;

      // Remove from pageOrder (in reverse to maintain indices)
      const toRemove = new Set(selected);
      this.pageOrder = this.pageOrder.filter((_, vi) => !toRemove.has(vi));
      this.selectedPages.clear();
      this.lastClickedIdx = null;
      this.hasUnsavedAppend = true;

      await this.buildPageGrid();
      this.updatePageCount();
      this.updateSelectedCount();
    }

    // === Add/Merge PDF ===
    async addPdf() {
      if (!this.hasPdfSource()) {
        await showAlert('Cảnh báo', 'Vui lòng chọn file PDF trước.');
        return;
      }

      const pos = await showYesNoCancel(
        'Chọn vị trí thêm PDF',
        'Mặc định PDF mới sẽ được thêm vào cuối PDF hiện tại.\n\nCó: Thêm vào cuối (mặc định)\nKhông: Thêm vào đầu\nHủy: Không thêm'
      );
      if (pos === null) return;

      this._pendingAddPosition = pos ? 'end' : 'start';
      this.dom.fileInputAdd.click();
    }

    async combineFiles(files) {
      try {
        const newDoc = await PDFLib.PDFDocument.create();
        let totalPages = 0;
        const outlineParts = [];

        for (const file of files) {
          let bytes = new Uint8Array(await file.arrayBuffer());
          // Unlock encrypted files
          const unlocked = await unlockPdfBytes(bytes, file.name);
          if (!unlocked) continue; // user cancelled password
          bytes = unlocked;

          // Read outline from source before pdf-lib processing
          const outline = await readOutlineFromBytes(bytes);
          if (outline) {
            outlineParts.push({ tree: outline, offset: totalPages });
          }

          let srcDoc;
          try {
            srcDoc = await PDFLib.PDFDocument.load(bytes);
          } catch {
            try {
              srcDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
            } catch {
              await showAlert('Lỗi', `Không thể đọc file: ${file.name}`);
              continue;
            }
          }
          const indices = srcDoc.getPageIndices();
          const pages = await newDoc.copyPages(srcDoc, indices);
          pages.forEach(p => newDoc.addPage(p));
          totalPages += indices.length;
        }

        if (totalPages === 0) return null;
        const savedBytes = await newDoc.save();

        // Combine outlines from all source files
        let combinedOutline = null;
        if (outlineParts.length) {
          combinedOutline = [];
          for (const { tree, offset } of outlineParts) {
            const shifted = offset > 0 ? offsetOutlineTree(tree, offset) : tree;
            combinedOutline.push(...shifted);
          }
        }

        return { bytes: new Uint8Array(savedBytes), totalPages, outlineTree: combinedOutline };
      } catch (err) {
        await showAlert('Lỗi', 'Không thể gộp file PDF:\n' + err.message);
        return null;
      }
    }

    async mergeFiles(files, position) {
      if (!this.hasPdfSource() || !files.length) return;

      try {
        const currentBytes = await this.readWorkingBytes();
        if (!currentBytes) {
          await showAlert('Lỗi', 'Không thể đọc dữ liệu PDF hiện tại để gộp file.');
          return;
        }

        const newDoc = await PDFLib.PDFDocument.create();
        const currentDoc = await PDFLib.PDFDocument.load(currentBytes, { ignoreEncryption: true });

        // Read added files
        let addedPages = [];
        let addedCount = 0;
        const addedOutlineParts = [];
        let addedOffset = 0;
        for (const file of files) {
          let bytes = new Uint8Array(await file.arrayBuffer());
          // Unlock encrypted files
          const unlocked = await unlockPdfBytes(bytes, file.name);
          if (!unlocked) continue;
          bytes = unlocked;

          // Read outline from added file
          const outline = await readOutlineFromBytes(bytes);
          if (outline) {
            addedOutlineParts.push({ tree: outline, offset: addedOffset });
          }

          let srcDoc;
          try {
            srcDoc = await PDFLib.PDFDocument.load(bytes);
          } catch {
            try {
              srcDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
            } catch {
              await showAlert('Lỗi', `Không thể đọc file: ${file.name}`);
              continue;
            }
          }
          const indices = srcDoc.getPageIndices();
          const pages = await newDoc.copyPages(srcDoc, indices);
          addedPages.push(...pages);
          addedCount += indices.length;
          addedOffset += indices.length;
        }
        if (!addedCount) return;

        // Build combined outline from added files
        let addedOutline = null;
        if (addedOutlineParts.length) {
          addedOutline = [];
          for (const { tree, offset } of addedOutlineParts) {
            const shifted = offset > 0 ? offsetOutlineTree(tree, offset) : tree;
            addedOutline.push(...shifted);
          }
        }

        // Copy current pages
        const currentIndices = currentDoc.getPageIndices();
        const currentPages = await newDoc.copyPages(currentDoc, currentIndices);

        if (position === 'start') {
          // Added pages first, then current
          addedPages.forEach(p => newDoc.addPage(p));
          currentPages.forEach(p => newDoc.addPage(p));

          // Shift rotation states
          const shifted = {};
          for (const [key, angle] of Object.entries(this.rotationStates)) {
            shifted[parseInt(key) + addedCount] = angle;
          }
          this.rotationStates = shifted;

          // Shift pageOrder
          this.pageOrder = this.pageOrder.map(idx => idx + addedCount);
          // Prepend new page indices
          const newIndices = [];
          for (let i = 0; i < addedCount; i++) newIndices.push(i);
          this.pageOrder = [...newIndices, ...this.pageOrder];

          // Update outlineTree: shift current outline, prepend added outlines
          const shiftedCurrentOutline = this.outlineTree
            ? offsetOutlineTree(this.outlineTree, addedCount) : null;
          const newCombined = [];
          if (addedOutline) newCombined.push(...addedOutline);
          if (shiftedCurrentOutline) newCombined.push(...shiftedCurrentOutline);
          this.outlineTree = newCombined.length ? newCombined : null;
        } else {
          // Current pages first, then added
          currentPages.forEach(p => newDoc.addPage(p));
          addedPages.forEach(p => newDoc.addPage(p));

          // Append new page indices
          const base = currentIndices.length;
          for (let i = 0; i < addedCount; i++) this.pageOrder.push(base + i);

          // Update outlineTree: current outline as-is, append added outlines offset by base
          const shiftedAddedOutline = addedOutline
            ? offsetOutlineTree(addedOutline, base) : null;
          const newCombined = [];
          if (this.outlineTree) newCombined.push(...this.outlineTree);
          if (shiftedAddedOutline) newCombined.push(...shiftedAddedOutline);
          this.outlineTree = newCombined.length ? newCombined : null;
        }

        const mergedBytes = new Uint8Array(await newDoc.save());

        // Reload with merged PDF
        this.hasUnsavedAppend = true;
        await this.destroyPdfDoc();
        await this.setWorkingSourceBytes(mergedBytes, { resetOriginal: false });
        await this.loadPdfDocumentFromSource();

        this.openedFileCount += files.length;
        this.updateFileInfo();
        await this.buildPageGrid();
        this.updatePageCount();
        this.updateSelectedCount();

        const posText = position === 'start' ? 'đầu' : 'cuối';
        await showAlert('Thành công', `Đã thêm ${files.length} file với tổng ${addedCount} trang vào ${posText} file.`);
      } catch (err) {
        await showAlert('Lỗi', 'Không thể thêm file PDF:\n' + err.message);
      }
    }

    // === Save ===
    async savePdf() {
      if (!this.hasPdfSource()) {
        await showAlert('Cảnh báo', 'Chưa có file nào để lưu.');
        return;
      }

      const hasRotation = Object.values(this.rotationStates).some(a => a !== 0);
      const hasDeletion = this.pageOrder.length < (this.pdfDoc ? this.pdfDoc.numPages : 0);
      const hasReorder = this.pageOrder.some((orig, vi) => orig !== vi);

      if (!hasRotation && !hasDeletion && !hasReorder && !this.hasUnsavedAppend) {
        const proceed = await showConfirm(
          'Xác nhận',
          'Bạn chưa thực hiện chỉnh sửa/thay đổi trang nào. Bạn có muốn lưu nguyên bản gốc không?'
        );
        if (!proceed) return;
      }

      try {
        let savedBytes;

        // Use stored outline tree (preserved across merges) for bookmark preservation
        const outlineTree = this.outlineTree;
        // Build page index map: original page index → new position
        const pageIndexMap = new Map();
        this.pageOrder.forEach((origIdx, newIdx) => pageIndexMap.set(origIdx, newIdx));

        if (this._isEncrypted) {
          const sourceInput = await this.getRasterWorkerSourceInput();
          if (!sourceInput) throw new Error('Không thể đọc dữ liệu PDF mã hóa để lưu file.');

          const perf = getActivePerfProfile();
          const exportScale = getAdaptiveExportScale(this.pageOrder.length);
          let workerBytes = null;
          try {
            workerBytes = await runRasterWorkerTask({
              type: 'encrypted-save-rasterize',
              bytes: sourceInput.bytes || null,
              sourceUrl: sourceInput.sourceUrl || null,
              password: this._pdfPassword || '',
              pageOrder: this.pageOrder,
              rotations: this.rotationStates,
              quality: perf.exportJpegQuality,
              maxPixels: perf.exportCanvasPixels,
              scaleHint: exportScale,
            });
          } finally {
            if (typeof sourceInput.cleanup === 'function') {
              sourceInput.cleanup();
            }
          }

          if (workerBytes) {
            const outDoc = await PDFLib.PDFDocument.load(workerBytes, { ignoreEncryption: true });
            try { writeOutlineToDoc(outDoc, outlineTree, pageIndexMap); } catch { /* outline error should not block save */ }
            savedBytes = await outDoc.save();
          } else {
            // Fallback to main-thread raster export.
            const outDoc = await PDFLib.PDFDocument.create();
            for (const origIdx of this.pageOrder) {
              const page = await this.pdfDoc.getPage(origIdx + 1);
              const angle = this.rotationStates[origIdx] || 0;
              const rasterized = await renderPageToJpegBytes(page, {
                rotation: angle,
                scale: exportScale,
                quality: perf.exportJpegQuality,
                maxPixels: perf.exportCanvasPixels,
              });
              const img = await outDoc.embedJpg(rasterized.bytes);
              const pdfPage = outDoc.addPage([rasterized.width, rasterized.height]);
              pdfPage.drawImage(img, { x: 0, y: 0, width: rasterized.width, height: rasterized.height });
            }
            try { writeOutlineToDoc(outDoc, outlineTree, pageIndexMap); } catch { /* outline error should not block save */ }
            savedBytes = await outDoc.save();
          }
        } else {
          // Normal pdf-lib export
          const sourceBytes = await this.readWorkingBytes();
          if (!sourceBytes) throw new Error('Không thể đọc dữ liệu PDF để lưu file.');
          const srcDoc = await PDFLib.PDFDocument.load(sourceBytes, { ignoreEncryption: true });
          const outDoc = await PDFLib.PDFDocument.create();
          for (const origIdx of this.pageOrder) {
            const [page] = await outDoc.copyPages(srcDoc, [origIdx]);
            const angle = this.rotationStates[origIdx] || 0;
            if (angle !== 0) {
              const current = page.getRotation().angle;
              page.setRotation(PDFLib.degrees(current + angle));
            }
            outDoc.addPage(page);
          }
          // Preserve bookmarks/outline
          try { writeOutlineToDoc(outDoc, outlineTree, pageIndexMap); } catch { /* outline error should not block save */ }
          savedBytes = await outDoc.save();
        }
        const deleteCount = (this.pdfDoc ? this.pdfDoc.numPages : 0) - this.pageOrder.length;

        // Generate filename
        let baseName = (this.fileName || 'output.pdf').replace(/\.pdf$/i, '');
        let outputName = `${baseName}_edited-by-pdfman.pdf`;

        downloadBlob(savedBytes, outputName);

        let msg = `Đã lưu file: ${outputName}`;
        if (deleteCount > 0) msg += `\n\nĐã xóa ${deleteCount} trang.`;
        await showAlert('Thành công', msg);

        // Update state after save
        this.initialRotationStates = { ...this.rotationStates };
        this.hasUnsavedAppend = false;

      } catch (err) {
        await showAlert('Lỗi khi lưu', err.message);
      }
    }

    // === Zoom ===
    applyZoom() {
      if (this.zoomTimer) { clearTimeout(this.zoomTimer); this.zoomTimer = null; }
      this._wheelZoomAccumulatorPx = 0;
      this._lastWheelZoomAt = 0;

      const val = parseInt(this.dom.zoomInput.value, 10);
      if (isNaN(val) || val < MIN_ZOOM_PERCENT || val > MAX_ZOOM_PERCENT) {
        showAlert('Lỗi', `Tỷ lệ zoom phải nằm trong khoảng ${MIN_ZOOM_PERCENT}% - ${MAX_ZOOM_PERCENT}%`);
        return;
      }

      // Preserve selection by original indices
      const preserveOrig = new Set();
      this.selectedPages.forEach(vi => {
        if (vi < this.pageOrder.length) preserveOrig.add(this.pageOrder[vi]);
      });

      const nextZoom = Math.round(Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, val)));
      this.zoomLevel = nextZoom / 100;
      this.dom.zoomInput.value = String(nextZoom);
      this.updateLazyRenderStatus();
      if (this.hasPdfSource()) this.rebuildWithPreservation(preserveOrig);
    }

    normalizeWheelDeltaToPixels(e) {
      if (!e) return 0;
      let delta = Number(e.deltaY) || 0;
      if (e.deltaMode === 1) {
        delta *= 16;
      } else if (e.deltaMode === 2) {
        const pageSize = this.dom.pagesWrapper ? this.dom.pagesWrapper.clientHeight : window.innerHeight;
        delta *= Math.max(1, pageSize || 1);
      }
      return delta;
    }

    onMouseWheelZoom(e) {
      if (!this.hasPdfSource()) return;

      const now = Date.now();
      if (!this._lastWheelZoomAt || (now - this._lastWheelZoomAt) > WHEEL_ZOOM_IDLE_RESET_MS) {
        this._wheelZoomAccumulatorPx = 0;
      }
      this._lastWheelZoomAt = now;

      const deltaPx = this.normalizeWheelDeltaToPixels(e);
      if (!Number.isFinite(deltaPx) || Math.abs(deltaPx) < 0.5) return;

      this._wheelZoomAccumulatorPx += -deltaPx;

      let steps = 0;
      while (
        Math.abs(this._wheelZoomAccumulatorPx) >= WHEEL_ZOOM_PIXELS_PER_STEP
        && Math.abs(steps) < WHEEL_ZOOM_MAX_STEPS_PER_EVENT
      ) {
        const direction = this._wheelZoomAccumulatorPx > 0 ? 1 : -1;
        this._wheelZoomAccumulatorPx -= direction * WHEEL_ZOOM_PIXELS_PER_STEP;
        steps += direction;
      }

      if (!steps) return;

      const currentZoomPercent = Math.round(this.zoomLevel * 100);
      const step = steps * ZOOM_STEP_PERCENT;
      const nextZoomPercent = Math.max(
        MIN_ZOOM_PERCENT,
        Math.min(MAX_ZOOM_PERCENT, currentZoomPercent + step)
      );

      if (nextZoomPercent === currentZoomPercent) {
        this._wheelZoomAccumulatorPx = 0;
        return;
      }

      this.zoomLevel = nextZoomPercent / 100;
      this.dom.zoomInput.value = String(nextZoomPercent);
      this.updateLazyRenderStatus();

      if (this.zoomTimer) clearTimeout(this.zoomTimer);
      this.zoomTimer = setTimeout(() => {
        this.zoomTimer = null;
        const preserveOrig = new Set();
        this.selectedPages.forEach(vi => {
          if (vi < this.pageOrder.length) preserveOrig.add(this.pageOrder[vi]);
        });
        this.rebuildWithPreservation(preserveOrig);
      }, WHEEL_ZOOM_APPLY_DELAY_MS);
    }

    // === Reset All ===
    async resetAll() {
      if (!this.hasPdfSource()) {
        await showAlert('Cảnh báo', 'Vui lòng chọn file PDF trước.');
        return;
      }

      const confirmed = await showConfirm(
        'Xác nhận Reset All',
        'Bạn có chắc chắn muốn khôi phục toàn bộ những thay đổi?\n\n(Tất cả xoay trang, xóa trang và thêm trang sẽ bị hủy)'
      );
      if (!confirmed) return;

      this.cleanupPageElements();
      await this.destroyPdfDoc();

      const restored = await this.restoreWorkingFromOriginal();
      if (!restored) {
        await showAlert('Lỗi', 'Không tìm thấy dữ liệu PDF gốc để reset.');
        return;
      }

      this.rotationStates = {};
      this.initialRotationStates = {};
      this.selectedPages.clear();
      this.lastClickedIdx = null;
      this.hasUnsavedAppend = false;
      this.openedFileCount = 1;
      this.outlineTree = this.originalOutlineTree
        ? JSON.parse(JSON.stringify(this.originalOutlineTree)) : null;

      await this.loadPdfDocumentFromSource();

      this.pageOrder = [];
      for (let i = 0; i < this.pdfDoc.numPages; i++) this.pageOrder.push(i);

      this.updateFileInfo();
      await this.buildPageGrid();
      this.updatePageCount();
      this.updateSelectedCount();

      await showAlert('Thành công', 'Đã khôi phục trạng thái gốc của file.');
    }

    // === State Queries ===
    isModified() {
      if (this.hasUnsavedAppend) return true;
      if (Object.values(this.rotationStates).some(a => a !== 0)) return true;
      if (this.pdfDoc && this.pageOrder.length !== this.pdfDoc.numPages) return true;
      if (this.pageOrder.some((orig, vi) => orig !== vi)) return true;
      return false;
    }

    // === UI Updates ===
    updateFileInfo() {
      if (!this.hasPdfSource()) {
        this.dom.fileInfo.textContent = t('manager.fileNotSelected');
      } else if (this.openedFileCount > 1) {
        this.dom.fileInfo.textContent = t('manager.fileOpeningMany', { count: this.openedFileCount });
      } else {
        this.dom.fileInfo.textContent = t('manager.fileOpeningSingle', { fileName: this.fileName });
      }
    }

    updatePageCount() {
      const total = this.pdfDoc ? this.pdfDoc.numPages : 0;
      const visible = this.pageOrder.length;
      const deleted = total - visible;
      let text = t('manager.pageCount', { total });
      if (deleted > 0) text = t('manager.pageCountWithVisible', { total, visible });
      this.dom.pageCount.textContent = text;
    }

    updateSelectedCount() {
      this.dom.selectedCount.textContent = t('manager.selectedCount', { count: this.selectedPages.size });
    }

    onLanguageChanged() {
      this.pageElements.forEach((el) => {
        if (!el || !el.label) return;
        el.label.textContent = t('manager.pageLabel', { page: el.origIdx + 1 });
      });

      if (this.dom.btnSelectAll) {
        const allSelected = this.pageElements.length > 0 && this.selectedPages.size === this.pageElements.length;
        this.dom.btnSelectAll.textContent = allSelected
          ? t('manager.deselectAll')
          : t('manager.selectAll');
      }

      if (this.dom.btnPurgeMemory && !this._purgeInProgress) {
        this.dom.btnPurgeMemory.textContent = t('manager.purgeMemory');
      }

      this.updateFileInfo();
      this.updatePageCount();
      this.updateSelectedCount();
      this.updateLazyRenderStatus();
      if (!this.hasPdfSource()) this.showEmptyPlaceholder(true);
    }

    setUiState(hasPdf) {
      const btns = [
        this.dom.btnClose, this.dom.btnSave, this.dom.btnAdd,
        this.dom.btnSelectAll, this.dom.btnRotateCW, this.dom.btnRotateCCW,
        this.dom.btnRotate180, this.dom.btnRotateReset,
        this.dom.btnMoveUp, this.dom.btnMoveDown,
        this.dom.btnDelete, this.dom.btnResetAll,
        this.dom.btnZoomApply, this.dom.zoomInput,
        this.dom.btnPurgeMemory,
      ];
      btns.forEach(b => { if (b) b.disabled = !hasPdf; });
      if (this.dom.btnOpen) this.dom.btnOpen.disabled = hasPdf;
    }
  }

  // =================== PDFLockTool ===================

  class PDFLockTool {
    constructor() {
      this.pdfBytes = null;
      this._pdfOpfsFile = null;
      this.fileName = '';
      this.sourceOpenPassword = '';
      this.sourceWasEncrypted = false;
      this.initialRestrictions = {};
      this.selectAllState = false;
      this.restrictionLabelKeys = Object.freeze({
        print: 'lock.restrictionLabel.print',
        copy: 'lock.restrictionLabel.copy',
        modify: 'lock.restrictionLabel.modify',
        annotate: 'lock.restrictionLabel.annotate',
        fill: 'lock.restrictionLabel.fill',
        extract: 'lock.restrictionLabel.extract',
        comment: 'lock.restrictionLabel.comment',
      });
      this.dom = {};
      this._onPageHide = () => this.dispose();
      window.addEventListener('pagehide', this._onPageHide, true);
      this.init();
    }

    init() {
      const $ = id => document.getElementById(id);
      this.dom = {
        btnOpen: $('lock-btn-open'),
        btnReset: $('lock-btn-reset'),
        btnToggle: $('lock-btn-toggle'),
        btnLock: $('lock-btn-lock'),
        btnUnlock: $('lock-btn-unlock'),
        fileInfo: $('lock-file-info'),
        encryptionInfo: $('lock-encryption-info'),
        restrictionsList: $('restrictions-list'),
        password: $('lock-password'),
        passwordConfirm: $('lock-password-confirm'),
        fileInput: $('lock-file-input'),
      };

      this.checkboxes = {};
      this.dom.restrictionsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        this.checkboxes[cb.dataset.key] = cb;
        cb.addEventListener('change', () => this.updateRestrictionStyle(cb.dataset.key));
      });

      this.dom.btnOpen.onclick = () => this.dom.fileInput.click();
      this.dom.fileInput.onchange = (e) => {
        if (e.target.files.length) this.openFiles(Array.from(e.target.files));
        e.target.value = '';
      };
      this.dom.btnReset.onclick = () => this.resetRestrictions();
      this.dom.btnToggle.onclick = () => this.toggleSelectAll();
      this.dom.btnLock.onclick = () => this.lockPdf();
      this.dom.btnUnlock.onclick = () => this.unlockPdf();

      // Drag and drop support for Lock tab
      this.setupDragDrop();
      this.dom.btnToggle.textContent = t('lock.selectAllRestrictions');
      this.setEncryptionInfoState(false, t('msg.encryptionDetailNotSelected'));
    }

    setupDragDrop() {
      const tabLock = document.getElementById('tab-lock');
      let dragCounter = 0;

      tabLock.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        document.body.classList.add('drag-active');
      });
      tabLock.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; document.body.classList.remove('drag-active'); }
      });
      tabLock.addEventListener('dragover', (e) => e.preventDefault());
      tabLock.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        document.body.classList.remove('drag-active');
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
        if (files.length) this.openFiles(files);
      });
    }

    async setLockSourceBytes(bytes) {
      if (this._pdfOpfsFile) {
        await deleteOpfsFile(this._pdfOpfsFile);
        this._pdfOpfsFile = null;
      }

      const opfsFile = await writeBytesToOpfs(bytes, 'lock-src');
      if (opfsFile) {
        this._pdfOpfsFile = opfsFile;
        this.pdfBytes = null;
        return;
      }

      this.pdfBytes = bytes;
    }

    async readLockBytes() {
      if (this._pdfOpfsFile) {
        const bytes = await readBytesFromOpfs(this._pdfOpfsFile);
        if (bytes) return bytes;
      }
      if (this.pdfBytes) return this.pdfBytes.slice();
      return null;
    }

    async openFiles(files) {
      const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (!pdfFiles.length) {
        await showAlert('Lỗi', 'Không có file PDF hợp lệ để mở.');
        return;
      }

      const file = pdfFiles[0];
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await this.setLockSourceBytes(bytes);
        this.fileName = file.name;
        this.sourceOpenPassword = '';
        this.sourceWasEncrypted = false;
        this.dom.fileInfo.textContent = file.name;
        this.dom.fileInfo.style.color = '';
        this.dom.password.value = '';
        this.dom.passwordConfirm.value = '';
        this.applyRestrictionsState({});

        // Try to read restrictions
        await this.readRestrictions(bytes);
        this.setUiState(true);
      } catch (err) {
        await showAlert('Lỗi', `Không thể mở file: ${err.message}`);
      }
    }

    setEncryptionInfoState(isEncrypted, detailText) {
      const baseText = isEncrypted
        ? t('lock.encryptedState')
        : t('lock.unencryptedState');
      this.dom.encryptionInfo.textContent = detailText ? `${baseText} (${detailText})` : baseText;
      this.dom.encryptionInfo.style.color = isEncrypted ? '#2d8f00' : '#de5602';
    }

    applyRestrictionsState(restrictionState) {
      Object.entries(this.checkboxes).forEach(([key, cb]) => {
        cb.checked = !!(restrictionState && restrictionState[key]);
        this.updateRestrictionStyle(key);
      });
      this.syncSelectAllButtonState();
    }

    syncSelectAllButtonState() {
      const boxes = Object.values(this.checkboxes);
      const allChecked = boxes.length > 0 && boxes.every(cb => cb.checked);
      this.selectAllState = allChecked;
      this.dom.btnToggle.textContent = allChecked
        ? t('lock.deselectAllRestrictions')
        : t('lock.selectAllRestrictions');
    }

    getRestrictionLabel(key) {
      const keyPath = this.restrictionLabelKeys[key];
      return keyPath ? t(keyPath) : key;
    }

    getSelectedRestrictionLabels(restrictions) {
      return Object.entries(restrictions || {})
        .filter(([, locked]) => !!locked)
        .map(([key]) => this.getRestrictionLabel(key));
    }

    async promptForOpenPassword(fileName, bytes) {
      while (true) {
        const result = await showPasswordPrompt(
          'File bị khóa',
          `File '${fileName || 'PDF'}' bị khóa bằng password.\nNhập password để mở:`
        );

        if (!result || result.action === 'cancel') return null;

        const openPassword = result.input || '';
        try {
          const task = pdfjsLib.getDocument({ data: bytes.slice(), password: openPassword });
          const pdfDoc = await task.promise;
          return { pdfDoc, openPassword };
        } catch (err) {
          if (err && err.name === 'PasswordException') {
            await showAlert('Lỗi', 'Password không đúng. Vui lòng nhập lại hoặc nhấn Hủy.');
            continue;
          }
          throw err;
        }
      }
    }

    async readRestrictions(bytes) {
      let pdfDoc = null;
      this.sourceOpenPassword = '';
      this.sourceWasEncrypted = false;
      this.applyRestrictionsState({});

      try {
        let detectedEncrypted = false;

        // Use pdf-lib to check encryption metadata first.
        try {
          const testDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
          detectedEncrypted = !!testDoc.isEncrypted;
        } catch {
          detectedEncrypted = false;
        }

        try {
          const task = pdfjsLib.getDocument({ data: bytes.slice() });
          pdfDoc = await task.promise;
        } catch (e) {
          if (e && e.name === 'PasswordException') {
            detectedEncrypted = true;
            const opened = await this.promptForOpenPassword(this.fileName, bytes);
            if (!opened) {
              this.sourceWasEncrypted = true;
              this.setEncryptionInfoState(true, t('msg.encryptionDetailNeedPassword'));
              this.applyRestrictionsState({});
              this.initialRestrictions = this.getCurrentRestrictions();
              return;
            }

            pdfDoc = opened.pdfDoc;
            this.sourceOpenPassword = opened.openPassword;
            this.dom.password.value = opened.openPassword;
            this.dom.passwordConfirm.value = opened.openPassword;
          } else {
            throw e;
          }
        }

        // Check permissions
        const perms = await pdfDoc.getPermissions();
        if (!detectedEncrypted && Array.isArray(perms)) {
          detectedEncrypted = true;
        }

        this.sourceWasEncrypted = detectedEncrypted;
        if (detectedEncrypted) {
          this.setEncryptionInfoState(
            true,
            this.sourceOpenPassword
              ? t('msg.encryptionDetailOpenedByPassword')
              : t('msg.encryptionDetailOwnerPassword')
          );

          const mapping = {
            print: false,
            copy: false,
            modify: false,
            annotate: false,
            fill: false,
            extract: false,
            comment: false,
          };

          if (Array.isArray(perms)) {
            const permissionFlags = (pdfjsLib && pdfjsLib.PermissionFlag) ? pdfjsLib.PermissionFlag : {};
            const hasPerm = (flagName) => {
              const flag = permissionFlags[flagName];
              return Number.isInteger(flag) ? perms.includes(flag) : true;
            };

            mapping.print = !(hasPerm('PRINT') || hasPerm('PRINT_HIGH_QUALITY'));
            mapping.copy = !hasPerm('COPY');
            mapping.modify = !hasPerm('MODIFY_CONTENTS');
            mapping.annotate = !hasPerm('MODIFY_ANNOTATIONS');
            mapping.fill = !hasPerm('FILL_INTERACTIVE_FORMS');
            mapping.extract = !hasPerm('COPY');
            mapping.comment = !hasPerm('MODIFY_ANNOTATIONS');
          }

          this.applyRestrictionsState(mapping);
        } else {
          this.setEncryptionInfoState(false, t('msg.encryptionDetailNoOpenPassword'));
          this.applyRestrictionsState({});
        }

        this.initialRestrictions = this.getCurrentRestrictions();
      } catch (err) {
        console.warn('[Lock PDF] Không thể đọc thông tin mã hóa:', err);
        if (this.sourceWasEncrypted) {
          this.setEncryptionInfoState(true, t('msg.encryptionDetailPartialMetadata'));
          this.applyRestrictionsState({});
        } else {
          this.setEncryptionInfoState(false, t('msg.encryptionDetailMetadataFallback'));
          this.applyRestrictionsState({});
        }
        this.initialRestrictions = this.getCurrentRestrictions();
      } finally {
        if (pdfDoc) {
          try { await pdfDoc.destroy(); } catch { /* ignore */ }
        }
      }
    }

    getCurrentRestrictions() {
      const result = {};
      Object.entries(this.checkboxes).forEach(([key, cb]) => {
        result[key] = cb.checked;
      });
      return result;
    }

    updateRestrictionStyle(key) {
      const cb = this.checkboxes[key];
      if (!cb) return;
      const label = cb.closest('.restriction-item');
      if (label) {
        label.classList.toggle('checked', cb.checked);
      }
    }

    resetRestrictions() {
      this.applyRestrictionsState(this.initialRestrictions);
    }

    toggleSelectAll() {
      this.selectAllState = !this.selectAllState;
      Object.values(this.checkboxes).forEach(cb => { cb.checked = this.selectAllState; });
      Object.keys(this.checkboxes).forEach(k => this.updateRestrictionStyle(k));
      this.dom.btnToggle.textContent = this.selectAllState
        ? t('lock.deselectAllRestrictions')
        : t('lock.selectAllRestrictions');
    }

    async lockPdf() {
      const sourceBytes = await this.readLockBytes();
      if (!sourceBytes) {
        await showAlert('Cảnh báo', t('msg.selectPdfFirst'));
        return;
      }

      const restrictions = this.getCurrentRestrictions();
      const hasRestriction = Object.values(restrictions).some(v => v);
      const password = (this.dom.password.value || '').trim();
      const passwordConfirm = (this.dom.passwordConfirm.value || '').trim();

      if (!hasRestriction && !password) {
        await showAlert('Cảnh báo', 'Vui lòng chọn ít nhất 1 tính năng cần khóa hoặc nhập password.');
        return;
      }
      if (password !== passwordConfirm) {
        await showAlert('Lỗi', 'Password nhập lại không khớp.');
        return;
      }

      // Check QPDF availability
      if (typeof QPDF === 'undefined') {
        await showAlert('Lỗi', 'Thư viện QPDF chưa được tải. Vui lòng tải lại extension.');
        return;
      }

      try {
        // Build QPDF encryption command arguments
        const DEFAULT_ENCRYPTION_KEY_BITS = 256;
        const LEGACY_FALLBACK_KEY_BITS = 128;
        const ALLOW_LEGACY_AES128_FALLBACK = true;
        let appliedEncryptionKeyBits = DEFAULT_ENCRYPTION_KEY_BITS;

        const sourceOpenPassword = this.sourceOpenPassword || '';
        const userPassword = password || '';
        const ownerPassword = password ? password + '_owner' : 'owner_' + Date.now();

        // Legacy qpdf build in qpdf.js works reliably with print/modify/extract flags.
        const blockPrint = !!restrictions.print;
        const blockModify = !!(restrictions.modify || restrictions.annotate || restrictions.fill || restrictions.comment);
        const blockExtract = !!(restrictions.copy || restrictions.extract);

        const buildEncryptArgs = (keyBits) => {
          const buildArgs = [];
          if (sourceOpenPassword) buildArgs.push(`--password=${sourceOpenPassword}`);
          buildArgs.push('--encrypt', userPassword, ownerPassword, String(keyBits));
          if (keyBits === LEGACY_FALLBACK_KEY_BITS) {
            buildArgs.push('--use-aes=y');
          }
          if (blockPrint) buildArgs.push('--print=none');
          if (blockModify) buildArgs.push('--modify=none');
          if (blockExtract) buildArgs.push('--extract=n');
          buildArgs.push('--', 'input.pdf', 'output.pdf');
          return buildArgs;
        };

        let args = buildEncryptArgs(appliedEncryptionKeyBits);

        // Prepare input data
        const inputBuffer = sourceBytes.buffer.slice(
          sourceBytes.byteOffset,
          sourceBytes.byteOffset + sourceBytes.byteLength
        );

        console.log('[Lock PDF] Starting QPDF encryption...');
        console.log('[Lock PDF] Input size:', inputBuffer.byteLength, 'bytes');
        console.log('[Lock PDF] QPDF args:', args.join(' '));

        // Run QPDF with sequential, promisified operations
        const qpdfLogs = [];
        const lockedBytes = await new Promise((resolve, reject) => {
          let done = false;
          let qpdfInstance = null;
          let timeoutId = null;

          const cleanup = () => {
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (qpdfInstance) {
              try { qpdfInstance.terminate(); } catch (e) { /* ignore */ }
              qpdfInstance = null;
            }
          };

          const finish = (err, result) => {
            if (done) return;
            done = true;
            cleanup();
            if (err) reject(err);
            else resolve(result);
          };

          // Promisify a single QPDF operation
          const promisify = (op, opName) => new Promise((res, rej) => {
            const cb = (err, data) => {
              if (err) rej(new Error(`[${opName}] ${err.message}`));
              else res(data);
            };
            op(cb);
          });

          try {
            QPDF({
              keepAlive: true,
              logger: (txt) => {
                console.log('[QPDF]', txt);
                qpdfLogs.push(txt);
              },
              onError: (err) => {
                console.error('[Lock PDF] QPDF init error:', err.message);
                finish(new Error(t('msg.qpdfInitFailed', { error: err.message })));
              },
              ready: async (qpdf) => {
                qpdfInstance = qpdf;
                console.log('[Lock PDF] QPDF worker ready, starting operations...');

                try {
                  const validateOutputBytes = (rawData, stepName) => {
                    if (!rawData || rawData.length === 0) {
                      throw new Error(`${stepName}: QPDF trả về file output rỗng (0 bytes)`);
                    }

                    const out = new Uint8Array(rawData);
                    if (out.length < 20) {
                      throw new Error(`${stepName}: File output quá nhỏ (${out.length} bytes), có thể bị lỗi`);
                    }

                    const header = String.fromCharCode(out[0], out[1], out[2], out[3], out[4]);
                    if (!header.startsWith('%PDF')) {
                      throw new Error(`${stepName}: Output không phải file PDF hợp lệ (header: "${header}")`);
                    }

                    return out;
                  };

                  // Step 1: Save input file to QPDF virtual FS
                  console.log('[Lock PDF] Step 1/3: Saving input.pdf to worker...');
                  await promisify(
                    (cb) => qpdf.save('input.pdf', inputBuffer, cb),
                    'Save input.pdf'
                  );
                  console.log('[Lock PDF] Step 1/3: Done');

                  // Step 2: Execute QPDF encryption
                  console.log('[Lock PDF] Step 2/3: Executing QPDF encryption...');
                  try {
                    await promisify(
                      (cb) => qpdf.execute(args, cb),
                      'Execute encrypt'
                    );
                  } catch (execErr) {
                    const msg = execErr && execErr.message ? execErr.message : String(execErr);
                    const shouldFallback = ALLOW_LEGACY_AES128_FALLBACK
                      && appliedEncryptionKeyBits !== LEGACY_FALLBACK_KEY_BITS
                      && /invalid for 128-bit keys|invalid for 256-bit keys|QPDF exited with status 2/i.test(msg);
                    if (!shouldFallback) throw execErr;

                    const fallbackArgs = buildEncryptArgs(LEGACY_FALLBACK_KEY_BITS);

                    console.warn('[Lock PDF] Primary encrypt args failed; retrying legacy profile...');
                    console.warn('[Lock PDF] Fallback args:', fallbackArgs.join(' '));
                    appliedEncryptionKeyBits = LEGACY_FALLBACK_KEY_BITS;
                    await promisify(
                      (cb) => qpdf.execute(fallbackArgs, cb),
                      'Execute encrypt (fallback)'
                    );
                  }
                  console.log('[Lock PDF] Step 2/3: Done');

                  // Step 3: Load encrypted output file
                  console.log('[Lock PDF] Step 3/3: Loading output.pdf from worker...');
                  const outputData = await promisify(
                    (cb) => qpdf.load('output.pdf', cb),
                    'Load output.pdf'
                  );
                  console.log('[Lock PDF] Step 3/3: Done, output size:', outputData ? outputData.length : 0, 'bytes');

                  const result = validateOutputBytes(outputData, 'Primary profile');
                  console.log('[Lock PDF] Output validation passed (%PDF header OK)');
                  finish(null, result);
                } catch (e) {
                  console.error('[Lock PDF] Operation failed:', e.message);
                  const logSummary = qpdfLogs.length > 0
                    ? '\n\nQPDF logs:\n' + qpdfLogs.slice(-20).join('\n')
                    : '';
                  finish(new Error(e.message + logSummary));
                }
              },
            });
          } catch (e) {
            finish(new Error(t('msg.qpdfInitFailed', { error: e.message })));
          }

          // Timeout with diagnostic info
          timeoutId = setTimeout(() => {
            if (!done) {
              const logSummary = qpdfLogs.length > 0
                ? '\n\nQPDF logs:\n' + qpdfLogs.slice(-10).join('\n')
                : `\n\n${t('msg.qpdfNoLogs')}`;
              finish(new Error(t('msg.qpdfTimeout') + logSummary));
            }
          }, 60000);
        });

        // Generate output filename
        const name = this.fileName.replace(/\.pdf$/i, '');
        const outputName = `${name}_locked-by-pdfman.pdf`;
        const selectedRestrictionLabels = this.getSelectedRestrictionLabels(restrictions);
        const restrictionsSummary = selectedRestrictionLabels.length
          ? selectedRestrictionLabels.map(label => `- ${label}`).join('\n')
          : t('lockReport.noRestrictions');
        const encryptionProfileLabel = appliedEncryptionKeyBits === DEFAULT_ENCRYPTION_KEY_BITS
          ? 'AES-256 (primary profile)'
          : 'AES-128 (fallback profile)';

        const compatibilityNotes = [];
        if (appliedEncryptionKeyBits !== DEFAULT_ENCRYPTION_KEY_BITS) {
          compatibilityNotes.push(t('lockReport.compatibilityFallback'));
        }
        if (restrictions.annotate || restrictions.fill || restrictions.comment) {
          compatibilityNotes.push(t('lockReport.compatibilityGrouped'));
        }
        const compatibilityText = compatibilityNotes.length
          ? `\n\n${t('lockReport.compatibilityTitle')}\n${compatibilityNotes.join('\n')}`
          : '';

        downloadBlob(lockedBytes, outputName);
        await showAlert('Thành công',
          `${t('lockReport.successTitle')}\n\n` +
          `${t('lockReport.fileLine', { fileName: outputName })}\n` +
          `${t('lockReport.profileLine', { profile: encryptionProfileLabel })}\n` +
          (password
            ? `${t('lockReport.passwordSet')}\n`
            : `${t('lockReport.passwordNotSet')}\n`) +
          `${t('lockReport.restrictionsTitle')}\n${restrictionsSummary}` +
          compatibilityText
        );
        this.clearForm();
      } catch (err) {
        console.error('[Lock PDF] Final error:', err);
        await showAlert('Lỗi', t('msg.lockPdfFailed', { error: err.message }));
      }
    }

    async unlockPdf() {
      const sourceBytes = await this.readLockBytes();
      if (!sourceBytes) {
        await showAlert('Cảnh báo', t('msg.selectPdfFirst'));
        return;
      }

      try {
        const unlockedBytes = await unlockPdfBytes(sourceBytes, this.fileName);
        if (!unlockedBytes) return; // user cancelled password entry

        // Check if actually changed (was it encrypted?)
        if (unlockedBytes === sourceBytes) {
          await showAlert('Thông báo', 'File PDF này không bị khóa.');
          return;
        }

        // Generate output filename
        const name = this.fileName.replace(/\.pdf$/i, '');
        const outputName = `${name}_unlocked-by-pdfman.pdf`;

        downloadBlob(unlockedBytes, outputName);
        await showAlert('Thành công', `PDF đã được mở khóa thành công: ${outputName}`);
        this.clearForm();
      } catch (err) {
        await showAlert('Lỗi', `Lỗi khi mở khóa PDF: ${err.message}`);
      }
    }

    clearForm() {
      this.pdfBytes = null;
      if (this._pdfOpfsFile) {
        const staleFile = this._pdfOpfsFile;
        this._pdfOpfsFile = null;
        deleteOpfsFile(staleFile).catch(() => { /* ignore */ });
      }
      this.fileName = '';
      this.sourceOpenPassword = '';
      this.sourceWasEncrypted = false;
      this.initialRestrictions = {};
      this.selectAllState = false;
      this.dom.fileInfo.textContent = t('lock.fileNotSelected');
      this.dom.fileInfo.style.color = '';
      this.dom.password.value = '';
      this.dom.passwordConfirm.value = '';
      Object.values(this.checkboxes).forEach(cb => { cb.checked = false; });
      Object.keys(this.checkboxes).forEach(k => this.updateRestrictionStyle(k));
      this.dom.btnToggle.textContent = t('lock.selectAllRestrictions');
      this.setEncryptionInfoState(false, t('msg.encryptionDetailNotSelected'));
      this.setUiState(false);
    }

    dispose() {
      try { this.clearForm(); } catch { /* ignore */ }
      if (this._onPageHide) {
        window.removeEventListener('pagehide', this._onPageHide, true);
        this._onPageHide = null;
      }
      revokeAllTempObjectUrls();
    }

    setUiState(hasFile) {
      const widgets = [
        this.dom.btnReset, this.dom.btnToggle,
        this.dom.btnLock, this.dom.btnUnlock,
        this.dom.password, this.dom.passwordConfirm,
      ];
      Object.values(this.checkboxes).forEach(cb => { cb.disabled = !hasFile; });
      widgets.forEach(w => { if (w) w.disabled = !hasFile; });
    }

    onLanguageChanged() {
      this.syncSelectAllButtonState();

      if (!this.fileName) {
        this.dom.fileInfo.textContent = t('lock.fileNotSelected');
        this.dom.fileInfo.style.color = '';
        this.setEncryptionInfoState(false, t('msg.encryptionDetailNotSelected'));
        return;
      }

      const detail = this.sourceWasEncrypted
        ? (this.sourceOpenPassword
          ? t('msg.encryptionDetailOpenedByPassword')
          : t('msg.encryptionDetailOwnerPassword'))
        : t('msg.encryptionDetailNoOpenPassword');

      this.setEncryptionInfoState(this.sourceWasEncrypted, detail);
    }
  }

  // =================== Tab Management ===================

  function setupTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        btns.forEach(b => b.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + tabId).classList.add('active');
      });
    });
  }

  // =================== Initialization ===================

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupLanguageToggleButton();
    setupThemeToggleButtons();
    applyThemeMode(activeThemeMode, { persist: false });
    applyLanguage(activeLanguage, { persist: false });
    window._pdfManager = new PDFManagerApp();
    window._pdfLockTool = new PDFLockTool();
    applyLanguage(activeLanguage, { persist: false });
  });

})();
