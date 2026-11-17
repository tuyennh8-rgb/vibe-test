# Đập chuột

Mini game đập chuột chạy trên trình duyệt: lưới 3×3, mỗi lượt 30 giây, đập trúng +1 điểm, bấm trượt −1 điểm. Người chơi **đăng ký họ tên, email, số điện thoại** trước khi chơi; dữ liệu lưu vào PostgreSQL. Có **trang admin** (`/admin`) để xem, tìm kiếm, xoá và xuất danh sách ra CSV.

| Thư mục / file | Nội dung |
|---|---|
| `app/` | Game (`index.html`, `style.css`, `game.js`) |
| `admin/` | Trang quản trị (`/admin`) |
| `src/`, `server.js` | Server Node.js: API đăng ký, đăng nhập admin, PostgreSQL |
| `design/` | Design system (`tokens.css`, `design-system.html`) |
| `docs/` | Bộ tài liệu đặc tả (mở `docs/index.html`) |
| `Dockerfile`, `docker-compose.yml`, `.env.example` | Đóng gói và cấu hình để chạy bằng Docker |
| `YEU-CAU.md` | Yêu cầu ban đầu |

## Cách chạy bằng Docker

Cần cài sẵn [Docker Desktop](https://www.docker.com/products/docker-desktop/) (đã có Docker Compose).

1. Mở terminal tại thư mục gốc của dự án (nơi có `docker-compose.yml`).
2. **Tạo file `.env`** từ file mẫu rồi điền mật khẩu thật:

   ```bash
   cp .env.example .env
   ```

   Mở `.env` và đổi các giá trị `POSTGRES_PASSWORD`, `ADMIN_PASSWORD` (từ 10 ký tự) và `SESSION_SECRET` (từ 32 ký tự; tạo nhanh bằng `openssl rand -hex 32`). File `.env` chứa mật khẩu nên **không được đưa lên Git** (đã nằm trong `.gitignore`).

3. Build và khởi động:

   ```bash
   docker compose up --build -d
   ```

4. Mở trình duyệt:
   - Game: **http://localhost:3000**
   - Trang admin: **http://localhost:3000/admin** (đăng nhập bằng `ADMIN_USER` và `ADMIN_PASSWORD` trong `.env`)

Hai dịch vụ chạy cùng nhau: `app` (server Node.js) và `db` (PostgreSQL 17, không mở cổng ra ngoài, chỉ `app` kết nối được).

Các lệnh thường dùng:

```bash
docker compose ps                 # xem trạng thái (healthy là đang chạy tốt)
docker compose logs -f app        # xem log của game, nhấn Ctrl+C để thoát
docker compose restart app        # khởi động lại (phiên đăng nhập admin sẽ mất)
docker compose down               # dừng và xoá container, GIỮ dữ liệu
```

### Dữ liệu người chơi

- Dữ liệu nằm trong volume Docker `db-data`, nên còn nguyên sau `restart` và `down`.
- **`docker compose down -v` xoá luôn volume, mất toàn bộ danh sách người chơi.** Chỉ dùng khi cố ý xoá sạch.
- Sao lưu nhanh ra file: `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > sao-luu.sql`
- Trong trang admin, nút **Xuất CSV** tải danh sách (theo bộ lọc tìm kiếm hiện tại) về máy; mở được bằng Excel.

### Ghi chú

- Quy tắc đăng ký: họ tên 2 đến 100 ký tự; email đúng định dạng, **mỗi email chỉ một hồ sơ** (đăng ký lại bằng email đã có thì dùng lại hồ sơ cũ và **giữ nguyên** họ tên, số điện thoại đã lưu); số điện thoại di động Việt Nam (10 số, hoặc `+84`/`84`); phải tick đồng ý lưu thông tin. Server tự kiểm tra lại mọi thứ.
- Admin: một tài khoản cố định trong `.env`; sai mật khẩu 5 lần thì bị khoá 15 phút; phiên đăng nhập hết hạn sau 8 giờ. Thiếu hoặc quá yếu `ADMIN_PASSWORD` / `SESSION_SECRET` thì server không khởi động và in ra lý do.
- Kiểm tra server còn sống: `curl http://localhost:3000/healthz` trả về `ok` (kể cả database).
- Sửa file trong `app/`, `admin/`, `src/` hoặc `design/` xong thì chạy lại `docker compose up --build -d`.
- Cổng 3000 bị chiếm? Đổi `"3000:3000"` thành `"8080:3000"` trong `docker-compose.yml` rồi mở `http://localhost:8080`.
- Chạy sau proxy HTTPS (nginx, ngrok...): đặt `TRUST_PROXY=true` và `COOKIE_SECURE=true` trong `.env`.
- **Bản GitHub Pages (trang tĩnh) không có máy chủ nên không đăng ký được, do đó không vào chơi được.** Muốn chơi bản có đăng ký, phải chạy bằng Docker.
- Font Inter Tight tải từ Google Fonts nên cần có mạng; mất mạng thì game vẫn chạy với font hệ thống.
