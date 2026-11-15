# CHANGELOG — M3

## 2026-11-15 — Chia đoạn Audio Truyện theo câu (coded, locally tested)

- Mỗi story segment tối đa 10.000 ký tự UTF-16, ưu tiên kết thúc ở dấu câu; M2 vẫn chia nhỏ bên trong một job theo provider. Chương đã lưu không tự đổi ranh giới, phải lưu lại nội dung nếu muốn chia lại.
- M3 suite: 65/65 PASS. Chưa nghiệm thu MP3 thật hoặc chất lượng ngắt nghỉ trên AWS.

## 2026-11-15 — Gỡ lưu trữ nhân vật Audio Truyện

- Xóa repository S3 CAS và test riêng cho hồ sơ nhân vật/quan hệ; không còn code M3 đọc/ghi `characters.json`. Các object đã có trong bucket không bị tự xóa.
- Kiểm M3 **64 tests PASS** sau khi gỡ.

## 2026-11-15 — Lưu ảnh bìa dự án Audio Truyện (coded, locally tested)

- Common Layer thêm kiểm PNG/JPEG thật, 5 MiB, 20 MP/10.000 px mỗi cạnh; presigned POST staging, backend đọc/kiểm rồi sao chép cover private và ghi key/metadata bằng ETag CAS. GET cấp presigned URL 15 phút; thay/xóa giữ metadata nhất quán qua CAS. Prefix staging tự hết hạn sau một ngày, cover chính không theo TTL job.
- M3 suite: 66 tests PASS, gồm upload hợp lệ, MIME/size/magic/pixel sai, đổi/xóa, refresh URL, scope, stale version và lỗi S3. Chưa kiểm quyền, CORS, lifecycle hoặc tải ảnh trên S3 Sandbox thật.

## 2026-11-14 — Hồ sơ nhân vật Audio Truyện (coded, locally tested)

- Common Layer thêm `story_characters.py`: mỗi dự án một object S3 JSON, CAS bằng ETag, tối đa 100 nhân vật và 200 sự kiện quan hệ. Sự kiện đã lưu chỉ thêm; sửa hồ sơ vẫn được sau khi chương đầu tiên bị xóa mềm. M3 cần review retention và hành vi xung đột trên S3 thật.
- Kiểm local: M3 62/62 tests đạt, gồm version cũ, quan hệ sai, CAS conflict và chương đã xóa. Không gọi AWS thật hoặc deploy.

## 2026-11-14 — STORY-01A Audio Truyện (coded, locally tested)

- Common Layer thêm kho Project/Chapter/Segment trong S3 jobs bucket, CAS metadata, upload chunk, manifest revision và source/segment paging. Tạo/sửa/xóa mềm, idempotency key được băm thành ID; dữ liệu ghi dở chưa công bố.
- Fingerprint tạo chương được giữ bất biến trong metadata: gửi lại cùng key/payload vẫn tìm đúng chương sau khi đổi tên hoặc số chương.
- Lifecycle jobs bucket chỉ hết hạn các prefix job/counter cũ, không xóa `audiobooks/demo/` sau 30 ngày. S3 object chưa commit/đã xóa mềm còn cho tới khi Lab reset; M3 cần chốt cleanup/retention.
- M3 suite 58 tests đạt, gồm chương 500.000 ký tự Unicode, CAS, concurrent commit, lỗi ghi dở và khôi phục đúng ranh giới đoạn từ backup. Chưa thử bucket/retention trên Sandbox.

Các mục cũ giữ nguyên nội dung và lệnh theo cấu trúc tại thời điểm ghi. Đường dẫn hiện hành, nhiệm vụ và lệnh chạy xem [README](README.md).


**Người phụ trách:** Trung Đức
**Danh sách việc:** `backend/m3-trung-duc/README.md`

## TRẠNG THÁI NHANH

- Ngày cập nhật lần cuối: 2026-11-09
- Đang làm: Xác nhận tương thích sau khi tái cấu trúc repo, bổ sung hỗ trợ audio parts, checkpoint và idempotency mapping; chuẩn bị nghiệm thu SB-M3-05 trên Sandbox
- Đã xong: SB-M3-01, SB-M3-02, SB-M3-03, SB-M3-04 (CODED & LOCALLY TESTED); 49/49 unit tests đạt; các suite M1/M2/M5 gọi qua common layer M3 đều pass
- Việc tiếp theo: Phối hợp cùng M1 và M4 deploy thử nghiệm trên Sandbox khi có phiên lab, kiểm chứng S3 bucket private và History Lambda qua Function URL (SB-M3-05)
- Đang bị chặn bởi: Chờ phiên lab hoạt động để kiểm chứng Level 2 trên Sandbox
- Tài nguyên AWS tôi đã tạo: (chưa có)

## NHẬT KÝ

### 2026-11-09: Đồng bộ cấu trúc module và mở rộng hỗ trợ tài liệu dài, audio parts và idempotency

- Đã làm:
  - Đồng bộ theo cấu trúc thư mục mới: toàn bộ mã nguồn, tài liệu và kiểm thử của module M3 được quản lý tập trung tại `backend/m3-trung-duc/`.
  - Tiếp nhận và xác nhận các hàm mở rộng trong tầng `tts_common`:
    - `storage.py`: Bổ sung `put_part`, `read_part`, `delete_parts` hỗ trợ lưu trữ tạm thời các phân đoạn âm thanh (lên đến 100 parts / 50 MiB) phục vụ luồng ghép MP3 cho tài liệu dài tới 10.000 ký tự.
    - `db.py`: Bổ sung `checkpoint_job` cho phép worker ghi nhận tiến độ dịch/audio từng phần an toàn bằng ETag/lease đang giữ; tích hợp cơ chế lưu mapping `idempotency/<scope>/<digest>.json` chống gửi trùng request (`create_idempotency`, `get_idempotency`, `update_idempotency`).
    - `history/app.py`: Cập nhật trả trường thông tin bản dịch (`translated`, `sourceLang`) và xử lý dọn dẹp audio parts khi xóa bản thu (`delete_parts`).
  - Tiếp nhận chuyển giao bộ kiểm thử `test_storage.py` và fixture `fake_s3.py` từ M2 về đúng owner M3.
- Kiểm tra:
  - Chạy toàn bộ bộ kiểm thử của M3: `python -m unittest discover -s backend/m3-trung-duc/tests` đạt **49/49 tests PASS** trong 0.027s.
  - Kiểm tra tương thích chéo: Chạy các suite test của M1, M2, M5 kết nối qua common layer M3, tất cả đều đạt PASS.
- Quyết định và lý do: Giữ nguyên hợp đồng S3 JSON + CAS ETag; hỗ trợ lưu trữ audio parts dạng private và xóa an toàn kèm tombstone job.
- Trạng thái: **CODED & LOCALLY TESTED** (SB-M3-01 -> SB-M3-04); SB-M3-05 giữ OPEN chờ phiên Lab.
- Tài nguyên AWS đã tạo/sửa: Chưa có (chờ phiên lab thực tế).
- Việc tiếp theo: Phối hợp kiểm chứng SB-M3-05 trên AWS Sandbox khi nhóm mở phiên lab.

### 2026-11-08: Rà soát toàn bộ mã nguồn M3 và xác nhận kiểm thử local

- Đã làm: Rà soát chi tiết toàn bộ mã nguồn và tài liệu của module M3 (`backend/common/`, `backend/history/`, `infra/m3-storage-data.yaml`). Chạy kiểm thử tự động toàn bộ test suite của M3.
- File đã rà soát/cập nhật:
  - `backend/common/python/tts_common/db.py`: CRUD job JSON trên S3, CAS qua ETag (`IfMatch`, `IfNoneMatch: *`), claim lease (`claim_job`), auto-fail job kẹt (`fail_stale_job`), phân trang lịch sử bằng cursor (`list_jobs`), xóa có tombstone (`delete_job`), kiểm soát hạn mức ký tự theo ngày (`reserve_chars`, `refund_chars`).
  - `backend/common/python/tts_common/storage.py`: Lưu file MP3 vào S3 Audio private, sinh presigned URL nghe có thời hạn (`get_audio_url`), xóa audio (`delete_audio`).
  - `backend/history/app.py`: Điều hướng 3 endpoints `GET /jobs/{id}`, `GET /history`, `DELETE /history/{id}`.
  - `infra/m3-storage-data.yaml`: Khai báo `JobsBucket`, `AudioBucket`, `CommonLayer`, `HistoryFunction`.
  - `docs/tasks/task-m3.md`, `logs/log-m3.md`.
- Kiểm tra: Chạy `python -m unittest discover -s tests/unit/m3` đạt **26/26 tests PASS** trong 0.014s. Các ca kiểm thử bao gồm kiểm tra schema v1, ngăn ghi đè job, xử lý xung đột CAS retry, lọc job ẩn/hết hạn, sắp xếp cursor newest-first, chặn xóa job đang chạy (`JOB_BUSY`), xử lý job kẹt chuyển FAILED, và bảo mật presigned URL không lưu vào S3.
- Quyết định và lý do: Thống nhất giữ nguyên thiết kế hiện tại đã pass test (dùng CAS claim trong worker kết hợp trần hạn mức ngày `usage/YYYY-MM-DD.json`, không bổ sung mapping file idempotency riêng gây phức tạp không cần thiết).
- Trạng thái: **CODED & LOCALLY TESTED**.
- Tài nguyên AWS đã tạo/sửa: Chưa có (chờ phiên lab thực tế).
- Việc tiếp theo: Phối hợp với M1 và M4 kiểm tra tích hợp trên AWS Sandbox khi nhóm mở phiên lab mới.
