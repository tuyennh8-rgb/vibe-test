# Đập chuột

Mini game đập chuột chạy trên trình duyệt: lưới 3×3, mỗi lượt 30 giây, đập trúng +1 điểm, bấm trượt −1 điểm.

| Thư mục / file | Nội dung |
|---|---|
| `app/` | Game (`index.html`, `style.css`, `game.js`) |
| `design/` | Design system (`tokens.css`, `design-system.html`) |
| `docs/` | Bộ tài liệu đặc tả (mở `docs/index.html`) |
| `YEU-CAU.md` | Yêu cầu ban đầu |
| `server.js`, `Dockerfile`, `docker-compose.yml` | Đóng gói để chạy bằng Docker |

## Cách chạy bằng Docker

Cần cài sẵn [Docker Desktop](https://www.docker.com/products/docker-desktop/) (đã có Docker Compose).

1. Mở terminal tại thư mục gốc của dự án (nơi có `docker-compose.yml`).
2. Build và khởi động:

   ```bash
   docker compose up --build -d
   ```

3. Mở trình duyệt tại **http://localhost:3000** và chơi.

Các lệnh thường dùng:

```bash
docker compose ps                 # xem trạng thái (healthy là đang chạy tốt)
docker compose logs -f app        # xem log, nhấn Ctrl+C để thoát
docker compose restart app        # khởi động lại
docker compose down               # dừng và xóa container
```

Ghi chú:

- Dịch vụ `app` là một server Node.js nhỏ (`server.js`, không cần cài gói nào). Server phục vụ `app/` tại `/` và `design/` tại `/design/`, vì game dùng `design/tokens.css`. Thư mục `docs/` không nằm trong ảnh Docker.
- Kiểm tra server còn sống: `curl http://localhost:3000/healthz` trả về `ok`.
- Sửa file trong `app/` hoặc `design/` xong thì chạy lại `docker compose up --build -d` để ảnh Docker nhận bản mới.
- Cổng 3000 bị chiếm? Đổi `"3000:3000"` thành `"8080:3000"` trong `docker-compose.yml` rồi mở `http://localhost:8080`.
- Game chưa cần cơ sở dữ liệu. Điểm cao nhất lưu trong trình duyệt của người chơi (`localStorage`).
- Font Inter Tight tải từ Google Fonts nên cần có mạng; mất mạng thì game vẫn chạy với font hệ thống.
