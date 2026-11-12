# Mini game "Đập chuột" — Tài liệu yêu cầu

Trạng thái: **chỉ là đặc tả, chưa có code.**

## 1. Tổng quan

Game đập chuột chạy trên trình duyệt (desktop và mobile). Người chơi có 30 giây để bấm vào những con chuột xuất hiện ngẫu nhiên trên lưới 3×3 và ghi càng nhiều điểm càng tốt.

- Chạy hoàn toàn phía client, không cần backend, không cần đăng nhập.
- Một người chơi, mỗi lượt độc lập.

## 2. Luật chơi

1. Lưới gồm **9 ô** (3 hàng × 3 cột). Mỗi ô là một "hang" chuột.
2. Bấm nút **Bắt đầu** để vào lượt chơi. Đồng hồ đếm ngược từ **30 giây**.
3. Trong lượt chơi, **tại mỗi thời điểm chỉ có đúng 1 con chuột** xuất hiện ở một ô ngẫu nhiên.
4. Chuột ở lại ô trong một khoảng thời gian ngắn rồi tự biến mất. Sau đó chuột mới xuất hiện ở ô khác.
   - Ô mới được chọn ngẫu nhiên, **khác ô trước đó**.
   - Thời gian chuột ở lại: **800 ms**; nghỉ giữa hai con: **200 ms**. (Cố định, không tăng độ khó trong bản đầu.)
5. Người chơi bấm (click hoặc chạm) vào ô đang có chuột để đập.
6. Hết 30 giây, lượt chơi kết thúc ngay: chuột biến mất, mọi thao tác bấm vào lưới bị bỏ qua, hiện màn hình kết quả.
7. Có thể bấm **Chơi lại** để bắt đầu lượt mới; điểm và đồng hồ được đặt lại.

## 3. Cách tính điểm

| Tình huống | Điểm |
|---|---|
| Bấm trúng ô đang có chuột | **+1** |
| Bấm vào ô trống | 0 (không phạt) |
| Bấm lại vào chuột đã bị đập | 0 |
| Chuột tự biến mất mà chưa bị đập | 0 |

- Mỗi con chuột chỉ tính điểm **tối đa 1 lần**. Sau khi bị đập, chuột biến mất ngay.
- Điểm không bao giờ âm.
- Điểm tối đa lý thuyết: 30 s ÷ (0,8 s + 0,2 s) = **30 điểm** (nếu đập trúng mọi con chuột).
- **Điểm cao nhất** được lưu trên trình duyệt (`localStorage`) và hiển thị ở các màn hình. Nếu `localStorage` không dùng được thì game vẫn chơi bình thường, chỉ không lưu kỷ lục.

## 4. Màn hình

### 4.1. Màn hình bắt đầu
- Tên game.
- Hướng dẫn một dòng: "Đập chuột trong 30 giây, mỗi con trúng được 1 điểm."
- Nút **Bắt đầu**.
- Điểm cao nhất (nếu đã có).

### 4.2. Màn hình chơi
- Thanh thông tin phía trên: **Điểm** hiện tại và **Thời gian còn lại** (giây, đếm ngược từ 30).
- Lưới 3×3 ở giữa; các ô là hình vuông, cùng kích thước, có khoảng cách đều nhau.
- Chuột hiển thị là hình/emoji 🐹 trong ô; ô trống chỉ là cái hang.
- Phản hồi khi bấm: đập trúng → chuột biến mất ngay và điểm tăng (có hiệu ứng nhẹ, ví dụ nháy sáng); bấm trượt → không có phản hồi đặc biệt.
- Bố cục co giãn theo màn hình: không cuộn trang, lưới nằm trọn trong khung nhìn từ chiều rộng 320 px trở lên; ô đủ lớn để chạm bằng ngón tay (tối thiểu 64 px).

### 4.3. Màn hình kết thúc
- Dòng "Hết giờ!".
- **Điểm của lượt vừa chơi** và **điểm cao nhất**.
- Nếu phá kỷ lục: hiện thông báo "Kỷ lục mới!".
- Nút **Chơi lại**.

### 4.4. Luồng chuyển màn hình

```
Màn hình bắt đầu --[Bắt đầu]--> Màn hình chơi --[hết 30 s]--> Màn hình kết thúc
                                      ^                              |
                                      +-----------[Chơi lại]---------+
```

## 5. Yêu cầu phi chức năng

- Chạy trên bản mới của Chrome, Safari, Firefox, Edge; hỗ trợ chuột và cảm ứng.
- Đồng hồ chính xác, không bị lệch khi tab bị ẩn rồi hiện lại (tính theo mốc thời gian thực, không cộng dồn từng tick).
- Phản hồi khi bấm dưới 100 ms.
- Giao diện đọc được rõ, độ tương phản đủ; ô lưới thao tác được bằng bàn phím là điểm cộng, không bắt buộc.

## 6. Ngoài phạm vi (bản đầu)

Âm thanh, nhiều mức độ khó, chuột tăng tốc, điểm trừ, bảng xếp hạng online, chế độ nhiều người chơi, tạm dừng giữa lượt.

## 7. Tiêu chí hoàn thành

Game được coi là xong khi **tất cả** các mục sau đều đạt:

- [ ] Mở file bằng trình duyệt là chơi được, không cần cài đặt hay server.
- [ ] Hiển thị đúng lưới 3×3 gồm 9 ô.
- [ ] Bấm **Bắt đầu** thì đồng hồ chạy từ 30 và giảm đều mỗi giây về 0.
- [ ] Tại mọi thời điểm có tối đa 1 chuột, xuất hiện ngẫu nhiên và không lặp lại ô liền trước.
- [ ] Bấm trúng chuột: +1 điểm, chuột biến mất ngay; bấm trúng cùng một con chuột nhiều lần chỉ tính 1 điểm.
- [ ] Bấm ô trống hoặc chuột đã biến mất: điểm không đổi.
- [ ] Đến 0 giây lượt chơi dừng, chuột biến mất, bấm vào lưới không còn tăng điểm.
- [ ] Màn hình kết thúc hiển thị đúng điểm lượt vừa chơi và điểm cao nhất.
- [ ] **Chơi lại** đặt lại điểm về 0 và đồng hồ về 30; không còn bộ đếm cũ chạy ngầm (bấm Chơi lại liên tục không làm đồng hồ chạy nhanh).
- [ ] Điểm cao nhất còn giữ sau khi tải lại trang.
- [ ] Dùng được trên điện thoại (chiều rộng 320 px trở lên), chạm vào ô hoạt động đúng, không bị zoom hay cuộn ngoài ý muốn.
- [ ] Không có lỗi trong console khi chơi trọn một lượt.

## 8. Câu hỏi còn mở

Các giá trị dưới đây là giả định để chốt đặc tả; có thể đổi trước khi làm:

- Thời gian chuột ở lại 800 ms và nghỉ 200 ms.
- Có phạt điểm khi bấm trượt hay không (hiện tại: không).
- Giao diện dùng emoji hay ảnh/hình vẽ riêng cho chuột và hang.
