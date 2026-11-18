# VieNeu chạy local

Thư mục này chứa model, cache, WAV tham chiếu, môi trường Python và MP3 thử nghiệm. Các tệp đó chỉ nằm trên máy cá nhân và bị Git bỏ qua. Chỉ README này được theo dõi trong Git; mỗi thành viên tự cài package và tải model.

Backend do `npm run dev` chạy dùng **`.venv` ở gốc repo**, không dùng `deployment/local/voice/.venv`. Chạy PowerShell từ `D:\aws` sau khi đã tạo `.venv` và cài `deployment/local/requirements.txt` theo hướng dẫn chạy local.

## Cài package và tải model

```powershell
.\.venv\Scripts\python.exe -m pip install vieneu==3.8.4 --no-deps
.\.venv\Scripts\python.exe -m pip install -r backend/m2-trung-khang/scripts/voice_clone_requirements.txt
.\.venv\Scripts\python.exe backend/m2-trung-khang/scripts/prepare_voice_clone_model.py --output-dir deployment\local\voice\model
```

Lệnh cuối tải khoảng 312 MiB model VieNeu và codec từ các revision đã ghim; script kiểm checksum của artifact có checksum công bố. Model nằm dưới `deployment\local\voice\model\hf-cache\hub\`. Không cần tải lại nếu các file đã có.

## Bật trong local backend

Trong `deployment/local/.env.local`, đặt:

```dotenv
VOICE_CLONE_ENABLED=true
VOICE_CLONE_MODEL_DIR=deployment/local/voice/model/hf-cache/hub/models--pnnbao-ump--VieNeu-TTS-v3-Turbo/snapshots/61b85e3d937fbbacb387714180e8182823512523
VOICE_CLONE_CACHE_DIR=deployment/local/voice/model/hf-cache
```

Khởi động lại `npm run dev`, nhập `DEMO_TOKEN` trong Cài đặt, rồi vào **Chọn giọng đọc → Nguồn giọng đọc → VieNeu · Nhại giọng**. Web nhận MP3/WAV 3–60 giây, tối đa 10 MiB; chuẩn hóa mẫu thành WAV PCM 16 kHz mono. API lưu toàn bộ WAV, còn VieNeu v3 Turbo tự dùng tối đa 8 giây đầu khi suy luận. Tệp dài hơn 60 giây báo rõ vượt thời lượng. Dùng mẫu sạch, ít nhiễu và chỉ một người nói. Thẻ giọng mang tên bạn nhập xuất hiện sau khi lưu. Không huấn luyện model riêng cho từng user. VieNeu hiện chỉ đọc tiếng Việt trực tiếp, không dịch và không dùng sắc thái Azure/Gemini.

## Nội dung thư mục

- `model/`: model VieNeu và MOSS codec đã tải, khoảng 312 MiB.
- Mẫu giọng: chỉ lưu local nếu dùng script smoke; không đưa lên Git.
- `output/`: MP3 sinh ra khi thử model.
- `.venv/`: môi trường thử riêng; `npm run dev` không dùng nó. Backend chạy bằng `.venv` ở gốc repo.
- Mọi audio cá nhân và MP3 sinh ra đều bị Git bỏ qua.

Không tải model mỗi lần chạy `npm run dev`: thiết lập cần cài package và tải model một lần cho mỗi máy. Nếu model hoặc package thiếu, bật cấu hình sẽ báo lỗi rõ; làm theo phần cài đặt bên trên rồi khởi động lại.
