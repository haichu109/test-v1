# GymLog — Bảng Lịch Sử Tập Gym (HTML + CSS + JS + Firestore)

## Cấu trúc
- `index.html`, `styles.css`, `app.js` — giao diện và logic.
- `firebase-config.js` — cấu hình Firebase project (bạn tự điền).
- `firestore.rules` — Security Rules cho Firestore.

Dữ liệu nằm trong **1 document** `gymlog/main` gồm `startDate`, `updatedAt`, `days[]`.
App tự lưu lên Firestore ~1 giây sau mỗi thay đổi; Ctrl + S hoặc nút 💾 lưu ngay.
Một bản tạm luôn được giữ trong `localStorage`, nên mất mạng vẫn dùng được và sẽ đẩy lên khi mở lại.

## Thiết lập Firebase (làm 1 lần)
1. Vào https://console.firebase.google.com → **Add project**.
2. **Build → Firestore Database → Create database** → chọn vị trí (vd. `asia-southeast1`) → Production mode.
3. Tab **Rules**: dán nội dung `firestore.rules` → **Publish**.
4. **Project settings → General → Your apps → Web (</>)** → đăng ký app → copy `firebaseConfig`
   và dán các giá trị vào `firebase-config.js`.

## Chạy local
Mở bằng một web server local (khuyên dùng hơn mở file trực tiếp):
- VS Code: cài extension **Live Server** → chuột phải `index.html` → *Open with Live Server*; hoặc
- `npx serve .` (cần Node.js) rồi mở địa chỉ được in ra.

Dòng trạng thái trên đầu trang cho biết đang lưu ở đâu:
- `☁️ Đã lưu lên Firestore` — kết nối OK.
- `💻 Chưa cấu hình Firebase` — `firebase-config.js` còn trống.
- `⚠️ Không kết nối được Firestore` — sai config, chưa tạo database hoặc Rules chặn (xem Console F12).

## Lưu ý
- Không có đăng nhập: ai có link web + config đều xem/sửa được dữ liệu. Chỉ phù hợp dùng cá nhân.
- 1 document Firestore tối đa 1 MB (~vài nghìn ngày tập) — đủ dùng nhiều năm.
- Chuyển dữ liệu cũ: ở app cũ bấm **⬇️ Tải bản sao JSON**, rồi ở app mới bấm **📂 Nhập JSON**.
