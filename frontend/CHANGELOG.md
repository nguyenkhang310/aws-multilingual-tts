# CHANGELOG — M4

## 2026-11-17 — Kiểm đúng thao tác Tạo giọng đọc

- Thử 8 chu kỳ tạo giọng thường/dịch, chờ PENDING/PROCESSING rồi DONE/FAILED ở 390/1.440 px. Mỗi chu kỳ có đúng một request tạo job và một document ban đầu; URL, định danh trang, DOM ô nhập và nội dung không đổi, không pageerror. API/MP3 giả lập, không gọi provider/AWS thật.
- Tái hiện cú nhảy ở kết quả dịch: cuộn từ 135 về 0 ngay lập tức khi hoàn tất. Bỏ ép về đầu; chỉ đưa kết quả vào vùng nhìn bằng cuộn mượt khi cần, giữ vị trí nếu kết quả đã thấy; giảm chuyển động dùng cuộn tức thời. Khối kết quả hiện nhẹ bằng opacity, không phát lại animation của toàn trang. Chưa có bằng chứng browser thật của người dùng tải document mới trong thao tác gen.
- Build web và các kiểm thử luồng tạo giọng/kết quả đạt; bổ sung regression cho kết quả đã thấy/ngoài vùng nhìn/giảm chuyển động. Không đổi API, model, env, app hoặc deploy.

## 2026-11-17 — Giữ phiên web khi thao tác

- Bỏ `location.reload()` khi lưu mã truy cập. Kết nối lại catalog/lịch sử trong phiên, giữ trang và bản nháp; xóa bản thu đang mở/dữ liệu phiên cũ khi đổi mã, bỏ phản hồi cũ đến muộn. Không cho đổi mã khi đang tạo giọng/nhập tài liệu; lỗi lưu bộ nhớ không được coi là đã lưu mã.
- Điều hướng nội bộ dùng History API và nghe Back/Forward; bỏ sự kiện trùng khi hash vẫn là trang đang mở, tránh đóng bảng chọn/reset tìm kiếm hai lần. Giữ guard bản nháp khi đổi trang. Liên kết bàn phím vào ô nhập giữ đúng màn Dịch và đọc.
- Khai báo rõ type=button cho các nút thao tác và bộ chọn; chỉ nút gửi form mới submit. Chặn điều hướng mặc định khi thả tệp ngoài vùng nhập, không thay trình xử lý nhập tệp hiện có. Giữ animation/kính và lỗi API hiện trên màn, không reload/fallback.
- **140 kiểm thử web PASS** với `node --test --test-concurrency=1 tests/*.test.mjs`, production build PASS. Lượt chạy song song trước có một assertion đồng hồ giọng thiết bị lệch thời gian; suite tuần tự đã đạt. **Hai luồng Chrome end-to-end PASS** ở 390/1.440 px: đổi/lưu mã bằng Enter, giữ nháp, Back/Forward, chọn giọng, menu/hộp thoại, tạo truyện, thả tệp ngoài vùng nhập; mỗi luồng chỉ có một request document và cùng định danh trang, không pageerror. API/story dùng fixture/Moto local, không gọi AWS/provider thật; chưa kiểm Safari hoặc deploy.


## 2026-11-17 — Rút thông báo trong ô soạn

- Bỏ thông báo kiểm tra chính tả thành công/bỏ qua và trạng thái Đã lưu nháp trong ô nhập; giữ tự lưu bản nháp. Bỏ tiêu đề gợi ý và mô tả chia phần lặp. Lỗi cần xử lý, giới hạn, tiến độ, tên tệp và thông báo gửi ảnh trực tuyến vẫn giữ.
- Kiểm tra chính tả lỗi/hết lượt/timeout vẫn tạo bản thu nguyên văn theo luồng cũ; web chỉ thông báo ngắn ngoài ô nhập khi bản thu sẵn sàng. App dùng thông báo ngắn, không báo kiểm tra thành công khi chưa kiểm được. Không đổi timeout/model hoặc fallback của dịch/TTS.
- Web 138 và app 107 kiểm thử local PASS; web build và app typecheck/lint PASS. Kiểm lại luồng web sau khi bỏ trạng thái thừa; không gọi provider/AWS thật, không sửa env hoặc push/deploy.

## 2026-11-17 — Làm rõ kết quả dịch trên web

- Đưa kết quả lên đầu vùng soạn sau khi tạo bản thu, tự cuộn đúng vùng nội dung để thấy kết quả; không đẩy xuống dưới ô nhập. Khối riêng có biểu tượng dịch, tiêu đề, nhãn ngôn ngữ và viền xanh theo theme.
- Thanh thao tác tách khỏi văn bản: nút Sao chép bản dịch có icon/khung và trạng thái Đã sao chép; lỗi clipboard hiện thông báo và cho thử lại. Nghe bản dịch/Tạm dừng điều khiển cùng trình phát hiện có, không tạo audio thứ hai. Văn bản dài cuộn riêng, giữ xuống dòng và hỗ trợ chiều chữ RTL; các nút xuống hàng khi màn hình hẹp.
- **138 kiểm thử web PASS**, production build PASS; vẫn có cảnh báo chunk lớn hiện hữu. **8 bố cục/thao tác Chrome PASS** ở 320/390/768/1.440 px, sáng/tối: vị trí kết quả, tự cuộn, copy đúng xuống dòng, văn bản dài cuộn và chỉ một audio. Kiểm phát/tạm dừng từ kết quả trên desktop; API/MP3 dùng fixture local, không gọi provider thật.
- Không đổi backend/API/provider, app hoặc env/key trong lượt này. Không gọi dịch vụ thật hoặc deploy.

## 2026-11-17 — Kính điều khiển và lựa chọn giọng web/app

- Sidebar/trình phát web dùng chung `control-glass`, nền xuyên thấu, viền phản sáng và bóng nâng; giữ sóng 3D, chuyển động, sáng/tối, tăng tương phản và giảm chuyển động/độ trong suốt. Thanh thu gọn giữ chiều cao cũ, logo/icon căn giữa, không lộ dải cuộn; vẫn cuộn/chọn bằng bàn phím khi khung thấp.
- Bỏ Xuất báo cáo và code CSV liên quan; không thêm hẹn giờ. Rút mô tả lặp, giữ thông báo gửi ảnh trực tuyến, quota, lỗi và backup. Khôi phục phụ đề “Hệ thống giọng nói đa ngôn ngữ”. Thanh phát chỉ hiện khi mở bản thu; header xuống hàng theo chiều rộng workspace.
- Giữ đầu gạt Liquid Glass của Glisse, tăng độ phân giải con trỏ/cảm ứng lên 0,001; phím điều hướng giữ bước có ý nghĩa. Âm lượng cập nhật ngay; tua có preview riêng, không bị `timeupdate` giật lại, thả mới seek. Hủy/lost capture/blur bỏ preview; đổi nguồn không áp vị trí của tệp cũ. Giữ dependency và vật liệu kính cũ của đầu gạt.
- Web/app lọc catalog đúng provider, không gom tất cả nguồn ngoài Gemini vào Azure. Dịch tách ngôn ngữ gốc khỏi nguồn TTS, giữ bản nháp/cặp ngôn ngữ khi còn được hỗ trợ; giọng đích chỉ thuộc ngôn ngữ/nguồn đã chọn. Đổi nguồn/giọng bỏ sắc thái cũ, duyệt cũ hoặc phản hồi xử lý đến muộn không tạo job. Nhãn Quét chữ, Azure Translator và Giọng sau khi dịch phân biệt ba tác vụ. Không thay API dịch, fallback, provider model hoặc key/env.
- **244 kiểm thử frontend PASS:** web 137, app 107; gồm chuyển provider trong màn dịch, nguồn không có giọng ở provider đích, preview cache và lỗi 401 không tạo MP3/fallback. App typecheck/lint, web build và Expo export iOS/Android/web PASS; Vite còn cảnh báo chunk lớn hiện hữu.
- **100 trường hợp Chrome local PASS:** 39 bố cục/kính/player ở 320–2.560 px, 12 thao tác tua/âm lượng bằng chuột/cảm ứng giả lập/bàn phím, 14 kiểm tra thanh bên/provider web (gồm khung thấp 320/390 px), 4 chuyển nguồn/cặp ngôn ngữ/sắc thái trên Expo web, 31 luồng tạo giọng/duyệt bản dịch/typo và bố cục web/app. Fixture MP3 có HTTP Range; API dùng Moto và HTTP provider giả, không dùng tài liệu riêng hoặc gọi AWS/Azure/Gemini thật. Không pageerror ở các bộ kiểm này. Chưa xác minh Safari, cảm giác kéo/bàn phím/GlassView trên thiết bị native hoặc xác thực key Translator thật. Chưa commit/push hoặc deploy trong lượt này.

## 2026-11-16 — Rà điều hướng trước khi đồng bộ các nhánh

- Chặn phản hồi tải truyện/chương đến muộn mở lại màn đã đóng hoặc ghi lên truyện khác; tách phiên tải danh sách và truyện đang mở trên web/app. Đóng modal trả focus với `preventScroll`, tránh cuộn lệch toàn bộ khung.
- Web kiểm tra rời trang cả khi bấm sidebar lẫn Back/đổi hash; từ chối rời trang giữ hash và bản nháp. Chọn lại trang hiện tại không hỏi bỏ nội dung. Sau lưu chương không tải lại source để xóa ô nhập/đổi vị trí; bổ sung regression có parent cập nhật revision thật.
- App giữ key phiên soạn khi chương tự nhận diện nhận ID lần đầu, không remount sang mục nghe sau lưu. Back đóng bảng tùy chọn trước, sau đó lần lượt Chương → Truyện → Thư viện → trang trước; bản nháp có giữ/bỏ. Thu nhỏ màn phát giữ chương đang mở và cùng phiên âm thanh. Bảng tạo/sửa truyện cảnh báo thay đổi chưa lưu; đóng bỏ ảnh đang chọn để không áp nhầm vào truyện khác. Khóa rời bảng dịch nhiều chương đang chạy; dùng Tạm dừng trước khi đóng.
- **241 kiểm thử frontend PASS:** web 134, app 107. App typecheck/lint không lỗi/cảnh báo; web production build và Expo export iOS/Android/web PASS, Vite còn cảnh báo chunk lớn hiện hữu. **207 trường hợp Chrome local PASS:** 194 trường hợp bố cục/nhập liệu/nghe đã chạy lại trên bản mới, thêm 13 trường hợp phản hồi chậm, Back/giữ-bỏ nháp, đổi hash, chọn lại trang, lưu chương đầu và các cấp quay lại. API/âm thanh dùng fixture/Moto và HTTP provider giả; không gọi AWS/Azure/Gemini thật. Browser/Expo web chưa chứng minh cử chỉ, bàn phím hoặc GlassView trên thiết bị native.
- Rà README gốc/M4 và AGENTS theo luồng mới, bỏ hướng dẫn player cũ; không thay backend production, dependency, env/key, không triển khai Sandbox. Giữ ba stash cũ. Người dùng giao commit tiếng Việt và đồng bộ main/M1–M5 bằng fast-forward sau fetch, không force-push; GUIDE riêng cập nhật sau commit và tiếp tục ignore.

## 2026-11-16 — Thiết kế lại Audio Truyện và thống nhất trình phát

- Web/app chuyển thành Thư viện → Truyện với danh sách chương → Chương. Thư viện có bìa/tìm kiếm, chương đã lưu ưu tiên nghe, nội dung và bản dịch là các mục riêng. Bỏ danh sách chương lặp ở sidebar, các khung tiến độ/đoạn xem trước dư và trình phát HTML riêng từng đoạn. Giữ kính, chuyển động, sáng/tối và giảm chuyển động; tham khảo Liquid Glass/WWDC26 của Apple và cách tổ chức audiobook, không sao chép giao diện cũ.
- Nút nghe, thanh nhỏ và màn phát lớn dùng chung phiên. Hàng đợi đọc đủ pagination, giữ thứ tự phần hoàn tất liên tiếp, dừng trước phần lỗi/chưa xong và làm mới URL khi đổi đoạn. Thu nhỏ player không dừng tiếng. Web dùng đồng hồ media thật; app dùng PlaybackProvider hiện có. Bổ sung regression về thứ tự, pagination, một media element và giới hạn số chương.
- Sửa modal nhập chương: một tiêu đề, chọn tài liệu → kiểm tra ngôn ngữ/nội dung/thứ tự → lưu; thân cửa sổ cuộn riêng, header/nút đóng gọn và không ép chung một hàng. Chỉ đóng sau khi lưu hết batch; lỗi giữ các chương còn lại và revision để thử tiếp. Chọn tệp lỗi giữ các bản đang duyệt; khóa input/đóng khi đang lưu. Thuật ngữ và chọn chương dịch mở trực tiếp, không lặp accordion bên trong. Sửa số thập phân/ngoài giới hạn, ký tự null, retry timestamp theo giây và khung web bị focus cuộn lệch do backdrop.
- App dùng một Sheet vật lý cho từng luồng, đổi nội dung trong Sheet thay vì chồng modal. Danh sách ngôn ngữ/giọng/sắc thái là hàng chọn có tìm kiếm; đổi bảng đặt lại vị trí cuộn và chọn xong đóng bàn phím. Ô soạn tính theo màn hình/cỡ chữ/bàn phím/thanh phát; giữ xác nhận bỏ nháp và back Android. Android có BlurTargetView của trang/bảng đang focus. Giữ thông báo Gemini trực tuyến, quota và bước duyệt bản dịch/OCR.
- **239 kiểm thử frontend PASS:** web 132 và app 107 với Node 22; web production build, app typecheck/lint và Expo export iOS/Android/web PASS. Vite vẫn có cảnh báo chunk lớn hiện hữu. Các thay đổi không thêm dependency, không sửa env/key hoặc backend production.
- **194 trường hợp Chrome local PASS:** 100 bố cục Audio Truyện trên web/Expo web (320×568, 390×844, 768×1024, 844×390, 1440×900; sáng/tối), hai luồng nghe chung, 31 trường hợp modal/nhập nhiều tệp/thuật ngữ/chọn chương dịch trên web, 30 thao tác app và 31 luồng/bố cục TTS/preview/typo hiện có. Dùng Moto và HTTP provider giả, MP3 fixture mã hóa thật; không gọi Azure/Gemini/AWS thật. Đã xem ảnh màn nhập chương, trang truyện và ô soạn; không pageerror hoặc tràn ngang trong các trường hợp đã kiểm. Giữ ba stash cũ, chưa commit/push trong yêu cầu thiết kế này.
- **Giới hạn:** chưa kiểm bàn phím hệ thống, cử chỉ back, GlassView/BlurView hoặc âm thanh trên iPhone/Android thật; export và Expo web không thay thế nghiệm thu thiết bị. Chưa deploy Sandbox và không nâng trạng thái dịch vụ bắt buộc của đề bài.

## 2026-11-16 — Tích hợp M5, hoàn thiện Audio Truyện trên web/app

- Merge giữ lịch sử 22 commit M5 tới `48e7008` trên nền sửa tích hợp `5cb0fc8`. Tiếp nhận Audio Truyện, auto language ELD, TYPO-CORRECTION-02, batch và callback; không thay key/env hoặc triển khai AWS. `shared/story-client.ts` dùng chung CRUD/CAS, phân trang, upload phần, bản dịch, audio plan và backup; `story-translation-run.ts` điều phối dịch nhiều chương, dừng khi đóng/ẩn/ra nền.
- Expo có nhập/chỉnh chương, xác nhận ngôn ngữ chương đầu, tên riêng/thuật ngữ, dịch và sửa/duyệt từng phần, dịch nhiều chương, chọn Azure/Gemini/giọng/tốc độ/sắc thái/cường độ, xác nhận batch, pause/resume/retry, nghe/tua/lưu từng MP3 và backup. Sheet dùng safe area/keyboard sẵn có, chuyển mục nhẹ theo reduced motion, giữ nháp khi yêu cầu đóng, cảnh báo Gemini trực tuyến và duyệt OCR trước khi thay chữ. Dùng lại xử lý ảnh 4 MP/2.400 px của TTS; tài liệu dài chia trang chỉnh 30.000 ký tự.
- Web/app chia chương thành Nội dung/Bản dịch/Âm thanh; tạo truyện và tùy chọn thu gọn, giảm nhãn mô tả. Web ẩn danh sách khi mở truyện, chỉ cuộn khung nội dung tới chương. App dùng danh sách chương gọn, bảng chọn giọng và trình phát riêng trong sheet; không đẩy route dưới modal. Giữ kính, màu, chữ, chuyển động và sáng/tối hiện có. App nhập một tệp mỗi lần; nhập nhiều tệp/gộp MP3 vẫn trên web, không giả khả năng native.
- Sửa root SAM bị lặp `GeminiTtsDailyCallLimit` ở TtsCore và thiếu ở Submit; truyền đúng mỗi stack một lần. Sửa duyệt nhiều phần dịch bị dính chữ ở ranh giới, giữ khoảng trắng đã có và thêm ngắt đoạn khi thiếu. Bổ sung regression về giới hạn, CAS, hủy, fingerprint, nguồn bản duyệt và backup không chứa URL ký; giữ toàn bộ bằng chứng lịch sử các owner.
- **630 kiểm thử local PASS:** M1 38, M2 115, M3 65, M5 159, runtime 18, web 131, app 104. Web production build, app typecheck/lint, Expo export iOS/Android/web và cfn-lint sáu template PASS. Vite còn cảnh báo kích thước chunk hiện hữu.
- **67 trường hợp Chrome PASS:** 31 luồng/bố cục TTS/preview/typo, 35 trường hợp Audio Truyện và một luồng gộp MP3. Bộ Audio Truyện chạy qua router/submit/worker/repository hiện có với Moto và HTTP provider giả: tạo chương, dịch/duyệt, tạo MP3 fixture mã hóa LAME, player, glossary, xuất/khôi phục bản dịch và xác nhận Auto; 24 bố cục Expo web và 8 bố cục web sáng/tối, rộng 320–1.440 px, gồm màn ngang. Không pageerror hoặc request provider thật. Đã xem ảnh và kiểm lại 8 bố cục web sau sửa cuộn. Tạo hai đoạn qua worker/Moto, gộp bằng LAME trên trình duyệt và giải mã file tải xuống: MP3 stereo 79.872 byte, 4,992 giây. Không gọi Azure/Gemini/AWS thật, chưa nghe giọng thật, chưa kiểm bàn phím/GlassView/âm thanh trên thiết bị native hoặc deploy Sandbox.
- Cập nhật README, hợp đồng dịch truyện và AGENTS quy tắc thiết kế cho các lượt sửa tiếp theo; GUIDE cá nhân vẫn ignore. Giữ ba stash cũ. Đồng bộ Git không đồng nghĩa đã triển khai AWS hoặc đạt yêu cầu API Gateway/Polly/DynamoDB.

## 2026-11-15 — Trạng thái kiểm tra chính tả (TYPO-CORRECTION-02)

- Web/app phân biệt Gemini hết quota, timeout, chưa kiểm tra được và đã kiểm tra nhưng không thấy gợi ý; khi `skipped` tiếp tục bản gốc. Giữ màn duyệt hai bản và nút chọn hiện có.

## 2026-11-15 — Tinh gọn thanh phát và màu hoàn tất truyện (coded)

- Bỏ dòng phụ chứa tên giọng/ngôn ngữ dưới tên nội dung trên thanh phát cố định; giữ tên nội dung và các nút điều khiển.
- Vòng tiến độ truyện ở trạng thái hoàn tất dùng xanh lá tươi hơn (`#22c55e`) cùng nền trong dịu.

## 2026-11-15 — Gọn danh sách đoạn và tiến độ Audio Truyện (coded, locally tested)

- Web hiển thị mỗi đoạn bằng thẻ gọn: số đoạn, độ dài và trích đầu → cuối; không thay source lưu trong chương. Vòng tiến độ chuyển xanh lá khi mọi chương có audio hoàn tất. Sidebar dùng nền xanh nhạt hơn và thêm tên truyện tách khỏi danh sách chương.
- Kiểm local: 11/11 test Audio Truyện, web production build PASS. Chưa kiểm trực quan trên trình duyệt/thiết bị thật; M4 cần review màu sáng/tối.

## 2026-11-15 — Danh sách chương và audio gộp (coded, locally tested)

- Web đặt Audio Truyện cuối điều hướng, hiển thị chương trong ô cuộn dưới mục này, chọn chương đầu vừa nhập; tách Chỉnh chương khỏi đoạn đã lưu và tạo audio. Web/app khi đang RUNNING chỉ gọi tick bổ sung nếu còn đoạn chờ và không có job đang chạy; không phát lại trạng thái chưa rõ.
- Web cho gộp và tải MP3 cả chương khi mọi đoạn DONE; mã hóa ở trình duyệt bằng lamejs, tối đa 60 phút, không ghi lên S3. Kiểm local: 11/11 test Audio Truyện, web build và app typecheck PASS. Chưa nghe thử file gộp hoặc kiểm trên thiết bị thật/Sandbox. M4 cần review UX/CORS và chi phí bộ nhớ trình duyệt.

## 2026-11-15 — Bỏ quản lý nhân vật Audio Truyện (coded)

- Gỡ block Nhân vật và quan hệ, màn duyệt Gemini, API client, kiểu dữ liệu và CSS liên quan khỏi web. Backup mới không xuất nhân vật; import backup cũ vẫn nhận dự án/chương và bỏ qua trường nhân vật cũ.
- Kiểm local: web UI **129/129 PASS**, production build PASS (Vite vẫn cảnh báo chunk lớn). Chưa kiểm trực quan trên thiết bị; không deploy.

## 2026-11-15 — Đồng bộ nút duyệt chính tả web/app (coded, locally tested)

- Web và app dùng cùng thứ tự nút: **Giữ bản gốc → Dùng bản tự chỉnh → Dùng bản sửa**. Ban đầu **Dùng bản sửa** là nút xanh; khi người dùng sửa nội dung khác đề xuất, nút xanh chuyển sang **Dùng bản tự chỉnh**. Nếu nội dung trở lại đúng đề xuất, màu xanh trở lại **Dùng bản sửa**.
- Giữ nguyên nội dung được gửi theo đúng nút đã chọn; không đổi luồng duyệt bản dịch. App bỏ dòng mô tả phụ để phần duyệt khớp với web.
- Kiểm local: web UI **132/132 PASS**, production build PASS (Vite có cảnh báo hiện hữu về chunk lớn); app tests **95/95 PASS**, typecheck và lint PASS, Expo export iOS/Android PASS. Chưa kiểm trực quan trên thiết bị thật.

## 2026-11-15 — Gọn nhập chương và tạo Audio Truyện (coded)

- Nhập nhiều chương bỏ hai câu hướng dẫn lặp và nút “Nhận diện lại”; giữ “Tối đa 10 tệp” cạnh nút nhập, đổi nhãn thành “Ngôn ngữ” và thu gọn từng chương thành tên trước khi mở phần chỉnh sửa có nền riêng.
- Gom khôi phục backup vào khối Dự án Audio Truyện. Tạo audio chương dùng một nút thao tác, còn ước tính Gemini và trạng thái được chia thành các ô ngắn. Mỗi MP3 có tên chương/đoạn và player nhỏ dùng chung phong cách nút, màu và thanh tua của web.
- Đặt khôi phục backup phía trên danh sách truyện; giữ bộ đếm tệp cạnh nút nhập trên màn hẹp và tăng độ thoáng phần chọn ngôn ngữ. Khi polling làm mới URL ký S3 cho cùng MP3, player giữ nguyên nguồn đang phát; chỉ đổi nguồn khi sang tệp khác hoặc cần làm mới URL. Lỗi NOT_FOUND từ API ảnh bìa hiện hướng dẫn kiểm tra máy chủ local hoặc stack M1/M5.
- Lỗi S3 ảnh bìa được phân biệt theo bucket, quyền, chữ ký và kích thước; API web/app trả NOT_FOUND được hướng dẫn kiểm tra route/máy chủ. Không tự deploy stack. Chưa chạy test/build hoặc kiểm chứng AWS thật trong lượt này.

## 2026-11-15 — STORY-UI-01 ảnh bìa Audio Truyện (coded, locally tested)

- Web/app cho chọn ảnh khi tạo project và thêm/thay/xóa sau đó; thumbnail đứng 2:3, placeholder sách, trạng thái lỗi và gia hạn URL một lần. Expo dùng `expo-image-picker` đã có; web tái sử dụng `FilePickerButton`. Web backup hỏi xác nhận khi ảnh không được đóng kèm; export loại cover và presigned URL khỏi JSON, import tạo project mới không ảnh.
- Giới hạn client/backend: JPEG/PNG, 5 MiB; backend kiểm magic/headers và pixel 20 MP/10.000 px, không tin MIME do client khai báo. Upload trực tiếp qua presigned POST tới bucket private; local runtime dùng Moto bridge có HMAC để không gửi ảnh lên AWS.
- Kiểm local: web **131/131 UI tests** và production build PASS; app **94/94 tests**, typecheck, lint và Expo export iOS/Android PASS. Local runtime **18/18**, M1 **37/37**, M3 **66/66**, M5 **135/135**. Chưa kiểm trực quan trên thiết bị, S3 CORS/retention hoặc upload CloudFront/Sandbox thật. Cần M1/M3/M5 review; không commit/push/deploy.

## 2026-11-15 — Đồng bộ màu biểu tượng Công cụ trên app

- Đổi màu icon và nền icon của **Dịch và đọc** và **Audio Truyện** sang xanh `#0072BC`, cùng màu với **Tạo giọng đọc**. Giữ nguyên bố cục, điều hướng và nội dung.
- Không chạy test/build cho chỉnh sửa màu nhỏ này.

## 2026-11-15 — AUTO-LANGUAGE-03: thay detector cũ bằng ELD (coded, locally tested)

- Thử `franc` 6.2.0 (MIT) và ELD 2.1.1 (Apache-2.0) trên cùng câu ngắn Việt/Anh/Trung/Nhật/Hàn. `franc` nhầm ba câu Anh/Việt có tên riêng và không xác định câu Trung ngắn; chọn ELD small vì nhận đúng các mẫu này và tiếng Việt không dấu trong thử local. fastText `lid.176.ftz` là model nén, nhưng chưa có runtime `.ftz` được kiểm trên Expo Go; không đưa bản `.bin` 126 MB vào ứng dụng. Không thêm backend/Lambda/API/key.
- Xóa từ điển từ vựng, regex chấm điểm và hàm heuristic cũ trong `frontend/shared/language-detection.ts`; giữ facade kiểu kết quả và thay bằng adapter ELD, mapping locale, quy tắc thận trọng cho mẫu ngắn/Hán tự mơ hồ/văn bản trộn. Web/Expo mỗi bên lazy-load `eld/small` đúng một lần; mẫu giới hạn 1.600 ký tự, kết quả cũ không ghi đè nội dung mới. Audio Truyện chỉ nhận diện lúc nhập chương đầu chưa xác nhận hoặc khi bấm Nhận diện lại.
- Corpus độc lập 22 mẫu: detector cũ **22/22**, ELD mới **22/22** trên cùng bộ (bộ cũ đã được tối ưu cho một số mẫu này, nên không tuyên bố tăng độ chính xác chung). Node 26.5 local: lượt đầu khoảng **280 ms**, suy luận ấm khoảng **0,04 ms/mẫu**, chênh heap khoảng **61 MiB** trong tiến trình benchmark; chưa đo điện thoại thật. Web model chunk **1.606.234 byte**, gzip khoảng **464 KiB**, tải riêng khi cần; license Apache-2.0 được giữ trong web/app.
- Web **130/130 tests** và production build PASS; Expo **93/93 tests**, typecheck/lint, export iOS/Android PASS. Bốn suite backend M1/M2/M3/M5 PASS; M1 có test bị skip do môi trường. Chưa kiểm CloudFront/Sandbox thật hoặc runtime native trên thiết bị; M4 cần review gói frontend trước deploy. Không commit/push/deploy.

### Bổ sung Model Packaging & AWS Academy

- Khóa model small theo `eld@2.1.1` trong cả hai lockfile: tarball `https://registry.npmjs.org/eld/-/eld-2.1.1.tgz` với SHA-512 integrity; file nguồn đã cài `node_modules/eld/src/ngrams/small.js`, 1.600.055 byte, SHA-256 `81df62f6b072f475b5b09e2cfa4a8ba4ab71eb99c713eb4b4ace461463180ab6`. Thêm `frontend/scripts/verify-eld-model.mjs`; `npm ci` chạy kiểm tra qua `prepare`, web build/dev và app start cũng xác minh trước khi chạy.
- Mô phỏng clone sạch bằng bản sao frontend không chứa `node_modules`, `dist`, `.cache`, `.env.local` hoặc npm cache cũ. `npm ci` web/app với cache riêng đều PASS và in đúng SHA-256. Web production build PASS; model có trong `dist/assets/static.small-D_GE8V2-.js` (1.606.234 byte, gzip 464,46 KiB). Vite preview trả trang và chunk model HTTP 200 (chunk trả 1.606.234 byte). Expo export iOS/Android PASS; bundle JS Hermes lần lượt 7 MB/7,2 MB, model được đóng gói cùng bundle, không có file model cần copy riêng.
- Kiểm tra quy trình deploy: `sandbox.sh web` chạy `npm ci`, build và `aws s3 sync dist` toàn bộ rồi invalidate CloudFront; asset model có trong cùng static output. Đây là bằng chứng build/package và mô phỏng host local, **chưa chạy lệnh AWS hoặc xác minh CloudFront/S3 của phiên thật**. Các thay đổi chưa commit/push/deploy.

## 2026-11-15 — Gọn giao diện Expo Dịch và đọc / Audio Truyện (coded, locally tested)

- Dịch và đọc trên Expo đặt Tự nhận diện ngay trong ô **Từ**; bỏ nút ngôn ngữ nguồn lặp phía trên. Tạo giọng đọc vẫn giữ một nút chọn ngôn ngữ. Khi chưa tải catalog, ô đích giữ lựa chọn thay vì hiện nhầm cùng ngôn ngữ nguồn.
- Audio Truyện trên Expo bỏ dòng mô tả dài; thay ô nhập mã `vi-VN` bằng bộ chọn dùng tên tiếng Việt của cùng danh sách ngôn ngữ trên web. Tự nhận diện là một lựa chọn trong **Ngôn ngữ gốc**, gửi `und` theo contract hiện hành.
- Expo tests **92/92 PASS**, typecheck và lint PASS. Chưa kiểm giao diện trực tiếp trên thiết bị.

## 2026-11-15 — AUTO-LANGUAGE-02: nhận diện mặc định và submit ngay (coded, locally tested)

- Bổ sung từ/cụm thông dụng để câu Anh có tên Việt và câu Việt có tên thương hiệu vẫn được nhận diện đúng; thêm bằng chứng cụm Trung văn, giữ kết quả không chắc chắn cho Hán tự mơ hồ. Heuristic offline, mẫu tối đa 1.600 ký tự, không gọi AI.
- Web/Expo bật Auto cho phiên soạn mới, kiểm sau 320 ms và kiểm đồng bộ khi submit trước debounce. Dùng locale/giọng hợp lệ trong chính lượt bấm; giữ giọng tương thích, chọn giọng đầu tiên của cùng provider khi cần. Manual override khóa Auto; không gửi `und` cho TTS. Audio Truyện tiếp tục giữ ngôn ngữ project đã xác nhận.
- Web tests **130/130 PASS**, build PASS; Expo tests **92/92 PASS**, typecheck và lint PASS. Có test dán rồi submit ngay, debounce/manual override, dịch chỉ mở bước duyệt, và các ví dụ Việt/Anh/Trung/Nhật/Hàn. Chưa thử giao diện trên thiết bị thật hoặc backend AWS.

## 2026-11-14 — Audio Truyện: giao diện, nhân vật và giọng đích (coded, locally tested)

- Web đổi ghi chú backup, ngày hiển thị, khoảng cách, panel khôi phục, nhóm nút dự án và form nhập/chỉnh chương; bỏ “Nhận diện lại” cùng chú giải dài trong audio. Thêm vòng tỷ lệ chương có audio đầy đủ, tối đa 50 chương/lượt. Dùng nhãn tiếng Việt cho sắc thái và giọng có tên chữ Hán.
- Web có hồ sơ nhân vật, gán giọng dự kiến, ma trận quan hệ theo chương và màn duyệt từng đề xuất Gemini. Không tự gọi Gemini khi nhập file; chỉ lưu mục đã chọn. Backup mới chứa hồ sơ nhân vật, ánh xạ lại ID chương khi nhập; backup cũ vẫn đọc được. Không chứa MP3. Giọng dự kiến chưa dùng cho batch TTS.
- Nếu ngôn ngữ đích dự án khác nguồn chương, web chọn giọng đích và gửi `translateTo` vào plan; backend yêu cầu Azure Translator, lỗi 503 nếu chưa cấu hình. M4 cần review UI, màn hình nhỏ, tính phù hợp của gán giọng trước khi deploy.
- Kiểm local: web 128/128 UI tests, production build đạt; app 84/84 tests và typecheck đạt. Chưa kiểm trực quan trên thiết bị hoặc AWS/Azure/Gemini thật. Không commit/push/deploy.

### Chỉnh tiếp giao diện theo ảnh phản hồi

- Danh sách dự án hiện lại **ngôn ngữ gốc → ngôn ngữ đích** cạnh ngày, giảm khoảng cách dòng. Danh sách chương và trình chỉnh chương nằm cùng một block; hồ sơ nhân vật ở block riêng. Trạng thái `DRAFT` hiện **Bản nháp**, tiêu đề Chỉnh chương nhỏ hơn.
- Gọn thẻ tạo audio, dùng nhãn **Giọng kể** và **Sắc thái giọng kể** để diễn đạt đúng batch một giọng/chương. Ưu tiên giọng có nhiều sắc thái trong catalog; tùy chọn tự nhận diện sắc thái áp dụng cho từng đoạn khi backend bật tính năng. Gọn mục nhân vật, ẩn nút Gemini khi chương chưa có chữ; lỗi 404 backend hiện ngắn và có nút thử lại. Khi duyệt Gemini hoặc thêm nhân vật, web tự gợi ý giọng từ catalog theo giới tính và tránh trùng giọng nếu có thể; người dùng vẫn đổi được. Gợi ý giọng chưa phải phân vai MP3.
- Chỉnh chương thành thẻ con có nền, viền và bóng nằm trong block Chương đã lưu; hàng chương đang chọn có nền nhấn nhẹ. Cân lại chiều rộng ô tên/số chương, nút Đóng và nhập tệp, giảm chiều cao textarea trên màn lớn và xếp một cột trên mobile. Đổi nhãn thành **Thay đổi ngôn ngữ nguồn**. Kiểm riêng 2 UI tests liên quan, web build và `git diff --check` đạt; chưa đối chiếu bằng trình duyệt/thiết bị thật.

## 2026-11-14 — AUTO-LANGUAGE-01 (coded, locally tested)

- Thêm detector offline dùng mẫu tối đa 1.600 ký tự, từ khóa và dấu chữ viết; không thêm package, API, key hay model. Web/Expo thêm lựa chọn Tự nhận diện cho Tạo giọng đọc và Dịch và đọc; kết quả không chắc chắn cần chọn thủ công. Ngôn ngữ đích/giọng đích và nội dung không bị thay. Manual override khóa tự động cho bản nhập hiện tại.
- Audio Truyện web cho tạo project chờ bằng `sourceLang=und`, nhận diện ở file chương đầu và yêu cầu xác nhận trước PATCH project/chapter. Chương sau kế thừa; nút Nhận diện lại là thao tác chủ động. Expo cho tạo project chờ và hướng dẫn hoàn tất nhập chương trên web. Đổi ngôn ngữ chương tăng revision, khiến plan cũ không còn hợp lệ.
- Kiểm local: detector 15/15 trường hợp; web 124/124 UI tests và production build; app 84/84 tests, typecheck, lint, Expo export iOS/Android. Backend M1 chạy 37 tests (14 skipped), M2 114/114 qua `.venv` có `lameenc`, M3 60/60, M5 130/130. Chưa kiểm âm thanh, OCR hay giao diện trên thiết bị/Sandbox thật; M4 cần review trước triển khai. Không commit/push/deploy.

## 2026-11-14 — Gọn giao diện Audio Truyện (coded, locally tested)

- Bỏ câu mô tả dài ở đầu form; chỉ giữ ghi chú backup nhỏ ở góc. Form tạo dự án không còn nút chọn file; sau khi chọn dự án mới có nhập tài liệu/chương. Khôi phục backup nằm trong mục riêng thu gọn dưới danh sách dự án.
- Tái sử dụng bộ chọn ngôn ngữ và tên tiếng Việt của Studio, dùng `cmn-CN` đúng catalog thay cho `zh-CN` ở dự án mới; dự án cũ mang `zh-CN` vẫn hiển thị tên dễ đọc. Tách một nút nhập file dùng chung cho Studio, nhập chương đơn và nhiều chương, giữ nguyên parser/giới hạn/upload.
- Kiểm web local: 121/121 UI tests và production build đạt; chưa đối chiếu trực quan trên thiết bị hoặc CloudFront thật. M4 cần review giao diện trước khi triển khai. Không commit/push/deploy.

## 2026-11-14 — STORY-01A Audio Truyện (coded, locally tested)

- Web thêm trang Audio Truyện: project/chapter, nhập từng hoặc nhiều file TXT/MD/DOCX/PDF/ảnh, chỉnh sửa, xem segments, upload chunk 30.000 ký tự và xuất/nhập JSON backup. Studio TTS giữ giới hạn riêng; parser tài liệu chỉ nhận giới hạn 1.000.000 ký tự khi gọi từ Audio Truyện.
- Expo thêm màn project/chapter cơ bản từ Công cụ; nhập file lớn/backup còn trên web. CloudFront forward `/audiobooks*` không cache tới M1. M4 cần review UI/mobile/hosting trước Sandbox.
- Web 119/119 tests (gồm tạo/mở lại project/chapter, nhập nhiều file và retry sau lỗi upload), production build đạt; app 68/68 tests, typecheck, lint và Expo export iOS/Android đạt. Chưa kiểm trên thiết bị hoặc CloudFront thật. Local Moto trong RAM mất dữ liệu khi tắt backend; người dùng cần xuất backup.
- Sửa retry khi PATCH thứ tự thành công rồi upload lỗi: giữ revision mới trong bản nháp. Trình chỉnh chương giữ nội dung đang sửa khi lưu metadata thành công nhưng upload lỗi, sau đó retry đúng revision; đóng trình chỉnh sẽ tải lại danh sách.

Các mục cũ giữ nguyên nội dung và lệnh theo cấu trúc tại thời điểm ghi. Đường dẫn hiện hành, nhiệm vụ và lệnh chạy xem [README](README.md).


**Người phụ trách:** Nguyên Khang
**Danh sách việc:** [README](README.md)

## 2026-11-16 — Review tích hợp M5 tới 8224da7 trước đợt Audio Truyện

- Ghép 13 commit từ `587dfde` tới `8224da7`, giữ nguyên lịch sử M5. Web/app có Azure preview, duyệt bản dịch/chính tả, cường độ sắc thái, bỏ chờ AI và đo thời gian. App gom màn duyệt vào `TextReview`, xếp cột trên màn hẹp/chữ lớn, lỗi ngay trong màn duyệt; khôi phục tạo hàng loạt khi tắt typo, giữ từng phần khi cần duyệt. Thêm chặn DONE thiếu MP3, giữ bản dịch tự chỉnh khi thử lại và bỏ lỗi preview cũ sau khi đổi nháp.
- Web/app dùng chung phân loại lỗi submit, có `UNSUPPORTED_STYLE_INTENSITY`; backend giới hạn/đóng response preview. Regression cho retry bản dịch, phản hồi muộn, mã idempotency và response quá lớn. Giữ chuyển động/kính và env/key thật.
- Kiểm local nền `8224da7` cùng các sửa tích hợp: M1 **37**, M2 **114**, M3 **53**, M5 **114**, runtime **17**, web **117**, app **68** tests PASS (**520**); web build, app typecheck/lint, Expo export iOS/Android/web và cfn-lint PASS. Chrome **31 trường hợp**: 7 luồng (dịch/typo/duyệt, hủy/retry, cảm xúc/cường độ, bỏ chờ, batch không trùng, thiếu audio, web preview) và 24 bố cục sáng/tối ở 320/390/768 px, ngang 844 px và desktop 1440 px. Không pageerror hoặc request provider; dùng fixture ngoài repo, chưa kiểm native/provider/Sandbox thật.
- Trong lúc chốt, người dùng báo M5 push thêm Audio Truyện; giữ các sửa đã kiểm bằng commit local trước khi merge tiếp. Chưa push hoặc deploy trong bước này, ba stash cũ nguyên vẹn. Kết quả đợt Audio Truyện phải ghi riêng sau khi kiểm lại.

## 2026-11-14 — Kiểm tra luồng chính tả theo nguồn giọng (local)

- Sửa web `Tạo tất cả các phần` để tôn trọng công tắc Kiểm tra chính tả bằng AI; trước đó luồng này luôn gửi `/text/correct` kể cả khi tắt. Giữ trạng thái kiểm tra ngay dưới ô nhập sau khi tạo bản thu, vì toast cũ bị thông báo hoàn tất thay thế. Kiểm thử cho Azure và Gemini xác nhận công tắc tắt gửi nguyên văn, bật thì có đề xuất mới mở màn duyệt trước khi tạo job.
- Xác nhận nút Dùng bản sửa đã thay nội dung ô nhập của Tạo giọng đọc trên web/app; thêm regression test web cho đổi nguồn, giọng và sắc thái sau khi chọn bản sửa, vẫn giữ văn bản đã duyệt và không gọi correction lần hai trong phiên.
- Web UI tests 115/115, production build đạt; M5 tests 113/113. Chưa gọi provider thật trong lượt này; phát âm Gemini có thể nghe đúng lỗi gõ dù metadata job vẫn giữ văn bản gốc. Cần xem phản hồi `/text/correct` của câu lỗi thực tế để xác nhận model có đưa ra đề xuất sau khi khởi động lại backend.

## 2026-11-14 — UI-FIX và TTS-PERFORMANCE-01 (local)

- Web bỏ câu mô tả thừa trong Kiểm tra nội dung, giãn nhãn/textarea 22 px và 10 px, giữ hai khung bằng chiều cao trên desktop, đổi Dùng bản sửa sang primary và Dùng bản tự chỉnh sang secondary. Không đổi callback lựa chọn.
- Web/app thêm Kiểm tra chính tả bằng AI mặc định tắt cho Tạo giọng đọc; bật thì vẫn duyệt gốc/đề xuất/tự chỉnh. Cho bỏ qua request đang chờ, bỏ kết quả muộn và nhớ nội dung đã duyệt trong phiên. Dịch và đọc vẫn duyệt Azure preview rồi kiểm typo trên văn bản đích; cảm xúc Auto giữ lựa chọn riêng.
- Ghi thời gian tiền xử lý, correction, submit, quan sát PROCESSING/DONE và lúc audio phát được; polling job đầu nhanh hơn rồi giãn đến 3 giây, không đổi polling history. Log chỉ chứa stage/duration/provider/status. Kiểm local mock: web 112/112 tests và build; app 67/67 tests, typecheck, lint, Expo export iOS/Android. Chưa benchmark provider/AWS thật hoặc thử thiết bị; M4 review giao diện trước khi triển khai. Không commit/push/deploy.

## 2026-11-13 — TTS-INTEGRATION-03: review bản dịch và chính tả trên web/app

- Theo task M5, chỉnh tối thiểu luồng web/app: `Dịch và đọc` dùng Azure preview, đối chiếu bản gốc/bản dịch và tự chỉnh trước khi tạo MP3; sau xác nhận mới kiểm typo Gemini trên bản đích. `/synthesize` nhận văn bản đích với `translateTo=null`, vẫn giữ voice/provider/styleIntensity. Tài liệu nhiều phần duyệt lần lượt; preview trong phiên được dùng lại khi tiếp tục, kể cả app chuyển sang màn Bản thu rồi quay lại. Giao diện sửa chính tả thêm lựa chọn tự chỉnh, giữ gốc và đề xuất; lỗi/skipped hiện thông báo và tiếp tục dùng văn bản đã chọn.
- Kiểm local với mock: web 109 UI tests + production build; app 66 tests, typecheck/lint và Expo export iOS/Android. Chưa kiểm trên thiết bị thật hoặc backend AWS/Translator/Gemini thật. M4 cần review các diff trong `frontend/web/`, `frontend/app/` và hợp đồng API trước khi deploy. Không commit/push/deploy trong lượt này.

## 2026-11-13 — Bàn giao Gemini TTS cho các nhánh thành viên

- Người dùng yêu cầu commit **`thêm TTS gemini, thêm sắc thái, thêm nhiều giọng đọc và quốc gia hơn`**, push `main` cùng năm nhánh M1–M5. Fetch xác nhận sáu nhánh remote cùng nền `d6ebefa`; gói bàn giao gồm Gemini TTS web/app/backend, catalog/cảm xúc, đóng gói Lambda và hướng dẫn cấu hình, kèm thẻ sóng âm trang chủ app đã hoàn thiện trước đó.
- Đối chiếu bằng chứng **488 test local PASS**, web build/app TypeScript/lint, Expo export và các lượt kiểm giao diện ở mục tích hợp bên dưới. Kiểm diff/registry đồng bộ, loại env thật, key, output build và bản thu mẫu; giữ nguyên ba stash cũ. Bàn giao bằng fast-forward/atomic push tới sáu nhánh, không force-push. Commit/push không bật Gemini trên AWS và không thay bằng chứng nghiệm thu Sandbox.

## 2026-11-13 — Bật Gemini TTS trong môi trường local

- Theo yêu cầu trực tiếp của người dùng, đặt `GEMINI_TTS_ENABLED=true` trong env backend thật đã được ignore; kiểm các key và cấu hình còn lại giữ nguyên. Model hiệu lực `gemini-3.8-flash-tts`, hạn mức 100 lượt/ngày, encoder đã có.
- Kiểm lịch sử local rỗng trước khi khởi động lại đúng launcher của repo. Mở lại API/web/Expo bằng `npm run dev -- --no-voices`, không gọi catalog Azure hoặc tạo thêm bản thu thử. API `/voices` trực tiếp và qua proxy web đều trả Gemini enabled, 71 locale/30 giọng; Expo `/status` đang chạy. Không gọi provider thật hoặc AWS, không deploy/commit/push.

## 2026-11-13 — Thêm Gemini TTS trên web và app

- Thêm nguồn **Gemini TTS**, giữ Azure mặc định và adapter ElevenLabs cũ. Dùng `gemini-3.8-flash-tts` qua Interactions API theo tài liệu Google; catalog gọn gồm 30 giọng và 71 ngôn ngữ/vùng, dùng chung cho web/app. Có 11 sắc thái cụ thể, Tự nhiên và Tự chọn theo nội dung; Gemini tự điều chỉnh cách đọc, không cần thêm request phân tích cảm xúc. Danh sách giọng lọc theo ngôn ngữ để tránh lặp hàng nghìn thẻ; đổi nguồn giữ bản nháp, không gửi cấu hình cũ sau khi đổi nguồn trong lúc kiểm chữ. Không phát giọng thiết bị để giả nghe thử Gemini; giữ sóng/kính/chuyển động hiện có.
- Tích hợp M2/M3/M5 bằng trường provider/model và quota/CAS/chunk/checkpoint/MP3/history sẵn có, giữ route và fingerprint cũ khi không truyền provider. Chia Gemini theo 1.000 ký tự, kiểm WAV mono 24 kHz/16-bit rồi mã hóa MP3 thật bằng `lameenc`. Quota request riêng, lỗi auth/model/quota/audio rõ; timeout không tự gọi lại hoặc đổi model/provider. Dịch và đọc vẫn dùng Azure Translator trước nguồn TTS được chọn; bổ sung mapping Serbian/Mongolian Cyrillic.
- Local thêm cờ/model/hạn mức trong env mẫu; không sửa env thật. SAM và `azure.py plan --gemini-tts true` có wiring và staging wheel Linux cp312 x86_64 để Lambda có encoder, không thêm service AWS, role hoặc EventInvokeConfig. Đã thử tải/kiểm wheel ELF và cfn-lint template staging tại máy cá nhân; chưa upload/package lên AWS. Cập nhật hướng dẫn local/Sandbox, hợp đồng và phân công owner.
- **Kiểm local:** M1 **36**, M2 **111**, M3 **53**, M5 **103**, runtime/launcher **17**, web **105**, app **63** tests PASS (**488** tổng cộng), gồm dịch Azure → Gemini và validation cấu hình TTS riêng; web build, app TypeScript/lint, Expo export iOS/Android/web và cfn-lint root/template con PASS. Chrome kiểm hai luồng tạo MP3 với provider giả lập và 18 bố cục sáng/tối (web 320–1440 px, app web 320–844 px kể cả ngang): đổi nguồn/giọng/sắc thái đúng body, giữ nháp, không tràn ngang, không pageerror/request ra provider. AWS trong RAM bằng Moto; bộ mã hóa MP3 thật được kiểm trong test.
- **Hai lượt Gemini thật theo quyền đã cấp, không gọi thêm:** mẫu vi-VN/Kore/Vui vẻ → DONE trong 5,15 giây, MP3 114.048 byte; mẫu en-US/Kore/Điềm tĩnh → DONE trong 5,60 giây, MP3 166.656 byte. ffprobe nhận đúng MP3 mono 24 kHz, thời lượng 7,128/10,416 giây. Chỉ dùng câu mẫu tự tạo, key backend đọc trong RAM, cấu hình bật riêng trong phiên Moto; không đưa key/audio mẫu vào Git. Chưa có đánh giá nghe đối chiếu/bản ngữ, không kết luận chất lượng luôn hơn Azure hoặc mọi giọng/ngôn ngữ đều đã đạt.
- Chưa kiểm thiết bị native thật, quota/egress Lambda hoặc Sandbox; chưa deploy/commit/push trong lượt này. Cờ Gemini TTS mặc định tắt, phải cấu hình và khởi động lại theo [local README](../deployment/local/README.md#gemini-tts--thêm-nguồn-tạo-giọng). Gemini có quota/quyền model riêng của dự án Google; `store=false` không thay chính sách dữ liệu của Google.

## 2026-11-13 — Gọn trang chủ app, chạm sóng âm để tạo giọng

- Theo điều chỉnh mới nhất của người dùng: bỏ dấu cộng trong thẻ Tạo giọng đọc, dùng cụm sóng âm làm vùng chạm có nhãn hỗ trợ VoiceOver/TalkBack. Thẻ giảm chiều cao từ 210 xuống 180; văn bản mẫu gom thành một nhóm có đường phân cách, hàng Dịch và đọc giữ riêng.
- Chạm sóng có phản hồi co nhẹ, phóng sóng ngắn trước khi mở trình soạn thảo bằng fullscreen modal hiện có. Khóa thao tác để tránh mở trùng, hủy animation khi rời trang/vào nền, khôi phục khi quay lại. Giữ chuyển động sóng, kính thanh tab, sáng/tối; tùy chọn giảm chuyển động bỏ animation và mở trực tiếp. Không thêm dependency hay sửa API/OCR/bản nháp.
- Kiểm local: app TypeScript/lint và **61/61 tests PASS**; Expo export web/iOS/Android PASS. Chrome/WebKit kiểm 24 bố cục (320×568, 390×844, 430×932, 768×1024, 1024×768, 844×390 × sáng/tối): không tràn ngang/cắt vùng chạm; mở/đóng/mở lại giữ bản nháp. Kiểm thêm chạm hủy, chạm đôi không mở trùng, Enter, giảm chuyển động hệ điều hành, sóng đang chạy và lịch sử mẫu; không pageerror hoặc request ngoài localhost.
- Kiểm trên bản Expo web và đóng gói native, chưa kiểm chuyển cảnh/kính/haptic/Dynamic Type trên thiết bị iOS/Android thật. Không gọi provider/AWS, không dùng env/key thật, không deploy/commit/push trong lượt này.

## 2026-11-13 — Bàn giao nâng cấp OCR cho cả nhóm

- Người dùng duyệt giao diện và yêu cầu commit **`nâng cấp ocr lên pro`**, push lên main cùng năm nhánh thành viên. Đã fetch remote và fast-forward nền M4 tới main/PR #15; cây source nền không đổi, giữ toàn bộ lịch sử M2/M4 đã merge và ba stash cũ.
- Bản bàn giao gồm đọc ảnh Gemini `gemini-3.5-flash-lite`, API/quota/giới hạn ảnh, bộ đọc web/app, màn đối chiếu trước nhập, lựa chọn OCR tại thiết bị và cấu hình/hướng dẫn local/Sandbox. Kết quả offline/build/export và Gemini thật nằm ở các mục 12/11; không gọi thêm provider hoặc deploy trong lượt push.
- Rà diff/đường dẫn, kiểm không đưa key/token thật, env local, ảnh mẫu hoặc tài nguyên sinh vào Git. Giữ nguyên key/cấu hình local đã bật cho người dùng. Đồng bộ nhánh bằng fast-forward giữ lịch sử; push atomic và kiểm các remote head sau thao tác. Commit/push không đồng nghĩa đã bật OCR trên AWS.

## 2026-11-12 — Đổi model OCR sau khi nghiệm thu Gemini thật

- Người dùng yêu cầu tiếp tục thử, cho phép đổi model và cấu hình để đọc ảnh hoạt động. Đã lấy danh sách model bằng key backend, không in key. `gemini-3.6-flash` được liệt kê nhưng lượt đọc trả 503 quá tải; chọn **gemini-3.5-flash-lite**, không đổi TTS/dịch/cảm xúc.
- **Kết quả nhận dạng thật:** văn bản Việt có dấu/tên/số 530 ký tự trả 200 trong 4,92 giây; bảng bốn cột 181 ký tự sau chuẩn hóa khoảng trắng trả 200 trong 3,08 giây. Cả hai CER=0 trên fixture sau chuẩn hóa NFC và khoảng trắng, số khớp bản gốc. Ảnh nghiêng 7 độ từng timeout 25 giây; thử lại qua giao diện web thật → proxy → router/Submit → Gemini trả 200, màn duyệt xuất hiện, chấp nhận vào editor đúng nội dung, không pageerror. Nội dung ảnh nghiêng 384 ký tự sau chuẩn hóa cũng CER=0, số/tên/dấu khớp fixture; dòng trắng khác bản gốc được bỏ qua khi so sánh.
- Phiên này có **7 lượt inference** và một lượt đọc danh sách model: 1 lượt 3.6 quá tải; 3 lượt 3.5 mức low có hai thành công/một timeout; 2 lượt thử minimal bị quá tải/timeout; 1 lượt 3.5 low qua web thành công. Giữ mức low đã có kết quả, không đưa thay đổi thinking chưa đạt vào sản phẩm. Mọi lượt thử lại là kiểm tra có chủ đích, không thêm retry hoặc đổi model ngầm vào API.
- Đổi mặc định OCR ở handler, runtime local, env mẫu, SAM root/M5, tests và hướng dẫn sang `gemini-3.5-flash-lite`. Theo yêu cầu cấu hình của người dùng, cập nhật đúng hai dòng trong env thật: `GEMINI_OCR_MODEL=gemini-3.5-flash-lite`, `GEMINI_OCR_ENABLED=true`; kiểm các key/field còn lại giữ nguyên. Env thật vẫn bị Git ignore. Cần khởi động lại tiến trình dev đang chạy để nhận cấu hình mới; không tự dừng tiến trình của người dùng.
- Hồi quy M1 **36 PASS**, M5 **99 PASS**, cfn-lint root/template con và `git diff --check` PASS. Không sửa component UI/animation ở lượt đổi model. Kết quả nhận dạng dùng Gemini thật, AWS/SSM/S3 là Moto trong RAM; không gọi Azure/TTS, không tạo bản thu hoặc deploy Sandbox. Các ảnh là dữ liệu tổng hợp ngoài repo, không tài liệu riêng.
- Ba loại ảnh đã có một lần đọc đúng; điều này **không bảo đảm mọi ảnh hoặc mọi lượt đều thành công**. Quá tải/timeout còn có thể xảy ra từ dịch vụ; chưa có ảnh chụp lỗi thực tế của người dùng, chưa kiểm camera/native iPhone/Android hoặc hạ tầng AWS thật. Màn đối chiếu chữ và trạng thái lỗi vẫn cần giữ.

## 2026-11-12 — Thử Gemini thật với ba ảnh tổng hợp theo quyền được cấp

- Người dùng cho phép tối đa ba ảnh mẫu; đã gửi **đúng 3 request** qua router/Submit local và client Interactions thật, model `gemini-3.8-flash`. Key chỉ đọc vào RAM từ env backend; dùng Moto S3/SSM trong RAM, không gọi AWS/Azure thật, không đổi env hoặc triển khai tài nguyên.
- Ba mẫu JPEG tự tạo 1500 × 2100 px, font Be Vietnam Pro: văn bản Việt có dấu/tên/số (183.712 byte), bảng bốn cột có tên/số tiền (105.535 byte), trang nghiêng 7 độ với mờ nhẹ 0,35 px (141.919 byte). Nội dung tổng hợp, không dùng tài liệu riêng. Ảnh/ground truth/report nằm ngoài repo để kiểm, không commit vào source.
- **Cả ba trả HTTP 503/GEMINI_BUSY**, lần lượt khoảng 1,04 / 0,94 / 1,56 giây. Google báo model đang có nhu cầu cao; không có văn bản được trả nên **chưa thể đo độ chính xác, lỗi dấu, bảng hoặc ảnh nghiêng**. Không gọi thêm, đổi model hay tự retry sau giới hạn ba lượt. Đây không phải Sandbox verified hoặc bằng chứng Gemini nhận dạng tốt trên ảnh thật.
- Sửa thông báo OCR khi `GEMINI_BUSY` thành “Gemini đang bận. Chờ một lát rồi thử lại; bản nháp được giữ nguyên.”, tránh mô tả nhầm là trang đã đọc một phần. Test hồi quy M5 **99 PASS** (`.venv/bin/python -m unittest discover -s backend/m5-trung-nghia/tests`), thêm đối chiếu thông báo quá tải; `git diff --check` PASS.
- Cần nghiệm thu lại khi dịch vụ khả dụng với số lượt được thống nhất; vẫn cần mẫu camera thực tế và kiểm native iOS/Android. Ba lượt từ chối không chứng minh key/quota hay chất lượng OCR đã đạt; không giả kết quả nhận dạng hoặc chuyển sang bộ đọc khác để báo thành công.

## 2026-11-12 — Đọc ảnh bằng Gemini và duyệt tài liệu trước khi nhập

- Người dùng đồng ý bổ sung gửi ảnh/trang scan tới Gemini qua backend, thay giới hạn chỉ OCR tại thiết bị của đợt trước. Thêm hai lựa chọn rõ **Gemini · Trực tuyến** / **Trên thiết bị**; giữ local Paddle/VietOCR/Tesseract và toàn bộ chuyển động/kính hiện có. PDF có lớp chữ vẫn lấy chữ cục bộ. Không tuyên bố OCR cũ đã đủ chính xác hoặc Gemini luôn đúng.
- `POST /documents/recognize` dùng router M1 + Submit M5 hiện có, inline JPG/PNG/WebP ≤2 MiB, body route này ≤3 MiB; route cũ giữ 250 KiB. Key ở SSM/backend, model OCR riêng `gemini-3.8-flash`, schema text/unclear/warnings, kiểm trạng thái hoàn tất/kích thước/output. Prompt giữ ngôn ngữ/dấu/tên/số, không dịch/viết lại hoặc thực thi chỉ dẫn trong ảnh; chỗ không rõ được yêu cầu đánh dấu. Không tạo TTS job, lưu ảnh/chữ S3 hoặc log. Counter CAS `ocr-usage/` riêng, mặc định 100 lượt/ngày, timeout 25 giây, không retry/model fallback tự động; `store=false` không thay điều khoản dữ liệu Google.
- Web/app có màn **Kiểm tra tài liệu**: ảnh gốc với ảnh chụp, chữ sửa được, cảnh báo và chấp nhận/hủy; chưa duyệt không thay bản nháp. Kiểm bản nháp đổi trong khi đọc, chặn tạo giọng khi đang review. PDF scan gửi tuần tự; lỗi trang sau không nhập phần thiếu. Hủy/ngắt mạng giữ bản nháp và bỏ phản hồi muộn.
- WebView/iframe chỉ xử lý ảnh/PDF và gửi từng trang cho API client của app; không có key/token trong trang đọc. Handshake phân biệt bộ đọc cũ chưa hỗ trợ Gemini; lỗi key/quota không bị ẩn thành nhận dạng thành công. Model OCR cục bộ không tải khi đọc bằng Gemini.
- Root SAM/M5/local env mẫu có flags/model/quota riêng; CloudFront thêm `/documents/*` không cache. `azure.py plan` thêm cờ OCR và tên SSM, giữ token/CORS/giá trị cũ, không tự apply. README/AGENTS/kiến trúc/hợp đồng và hướng dẫn local/Sandbox cập nhật ngoại lệ gửi ảnh; giữ env thật/stash/lịch sử owner khác.
- **415 tests local PASS:** M1 36, M2 102, M5 99, launcher/runtime 16, web 101, app 61. Lệnh: `.venv/bin/python -m unittest discover -s <thư mục tests>`; local thêm `-p 'test_*.py'`; `npm --prefix frontend/web run test:ui`; `npm --prefix frontend/app test`. Gồm schema/quota/auth/binary caps/SSM overrides, request lớn qua HTTP local, giữ bản nháp/review và không tạo MP3/fallback.
- Web build, app typecheck/lint, Expo export iOS/Android/web và cfn-lint root/template con PASS. Web entry còn cảnh báo khoảng 509 kB đã có trước; worker/model/PDF lazy-load. Browser Chrome/WebKit kiểm review/accept/cancel/quota/PDF hai trang, RPC reader của app, app web upload→duyệt→editor; không pageerror hoặc gửi mạng ngoài mock. Kiểm reflow web 320/390/768/1440 px sáng/tối; app web 320/390/768 px. Fixture phản hồi mẫu chỉ xác minh tích hợp, không chứng minh độ chính xác Gemini.
- Trạng thái **coded + locally tested**. Chưa gọi Gemini thật, chưa đo độ chính xác trên ảnh lỗi của người dùng, chưa kiểm native iPhone/Android thật hoặc deploy AWS. Đã hỏi riêng quyền thử tối đa ba ảnh tổng hợp với key backend; chưa chạy nếu chưa nhận đồng ý. Build/export không nâng thành sandbox verified. Không sửa env thật hoặc tự bật tính năng trên stack.

## 2026-11-12 — Nâng cấp OCR tiếng Việt và sửa nhập liệu trên app

- Tách **Ngôn ngữ tài liệu** khỏi giọng đọc, mặc định Việt/Anh trên web và app; đổi giọng không đổi bộ OCR. Dùng Paddle phát hiện dòng + VietOCR ONNX `ocr-v1` cho tiếng Việt; Tesseract `best_int` giữ cho các ngôn ngữ khác. Căn ảnh camera, chỉnh nghiêng từng dòng, chia dòng dài và giữ dấu Unicode; không tự dịch hoặc gửi ảnh gốc lên API.
- Gộp bộ sinh tài nguyên/bộ đọc vào `frontend/shared/`, bỏ entry PDF trùng trong app. Web/Expo tự phục vụ model, worker, PDF và WASM; tải OCR khi dùng, model khóa phiên bản/kích thước/SHA-256. Cache và tài nguyên sinh bỏ qua Git; thêm đầy đủ giấy phép. Bộ phát hiện loại xác suất nền và giải phóng tensor sau mỗi lần chạy.
- Ô nhập app có khung, cỡ chữ và khoảng cách ổn định; đo chiều cao vùng thực, tránh trừ bàn phím hai lần. iOS dùng offset safe area, Android dùng resize. Có nút ẩn bàn phím; ô mã truy cập có nhãn riêng, chữ canh trái và cuộn đúng vị trí. Cập nhật mẫu/nội dung cũ về công nghệ và giới hạn hiện tại.
- Hủy/lỗi giữ bản nháp; đóng worker cũ, chặn phản hồi muộn, kiểm model tải hỏng. Bộ đọc app báo lỗi HTTP hoặc chưa sẵn sàng sau 30 giây thay vì chờ mãi. Cảnh báo OCR không thay việc người dùng kiểm chữ.
- **446 kiểm thử local PASS:** M1 31, M2 102, M3 53, M5 93, local 16, web 95, app 56. Lệnh: `.venv/bin/python -m unittest discover -s <thư mục tests>`; `npm --prefix frontend/web run test:ui`; `npm --prefix frontend/app test`. Regression gồm đủ bảng chữ tiếng Việt, OCR độc lập giọng, checksum model, SHA nhị phân trên LAN và hủy worker.
- Web production build, app typecheck/lint, Expo export iOS/Android/web bằng Node 22 và `cfn-lint deployment/template.yaml backend/*/infra/*.yaml frontend/infra/*.yaml` PASS. Web còn cảnh báo chunk entry khoảng 505 kB; model/worker OCR tải riêng. Build/export và browser mô phỏng không thay kiểm bàn phím/camera/WebView trên iPhone hoặc Android thật.
- Kiểm luồng mới trên Chrome/WebKit: sáu lượt OCR thật (web với giọng Anh + OCR Việt, bộ đọc app Việt/Anh), hai lượt thao tác xóa nội dung/cài đặt giao diện/ô mã; không có pageerror hoặc gửi ảnh ra máy chủ ngoài. QA từng chặn nhầm URL `blob:` trên WebKit và đọc kết quả trước khi OCR xong; sửa fixture rồi chạy lại.
- Ảnh mẫu tổng hợp thẳng/phối cảnh đã chạy qua WASM trên Chrome/WebKit. Có lỗi dấu và dấu câu còn lại; chưa có mẫu ảnh lỗi thực tế của người dùng, không cam kết mọi ảnh chính xác hoặc tuyên bố OCR tốt nhất. Chỉ `coded` + `locally tested`; chưa gọi provider/AWS hoặc triển khai Sandbox. README/AGENTS/hợp đồng được cập nhật, lịch sử owner khác giữ nguyên.
- Người dùng yêu cầu commit tiếng Việt và push bản mới. Bản bàn giao gom cả giao diện/scan/sắc thái còn trong working tree từ các mục trước; giữ env thật, ba stash và công việc đã merge từ M2. Kết quả push và mã commit được xác nhận sau thao tác.

## 2026-11-12 — Phân biệt catalog cũ và giọng không hỗ trợ sắc thái

- Catalog local đang có 70 giọng nhưng toàn bộ thiếu trường `styles`, kể cả Jenny/Guy. Launcher trước đó chỉ nhận catalog thiếu/khác vùng nên giữ lại dữ liệu cũ. Bổ sung kiểm schema sắc thái để lấy lại khi người dùng khởi động có Speech key; giữ `--no-voices`, không tự chạy launcher hoặc gọi provider trong phiên sửa lỗi.
- API giữ `styles: []` cho giọng đã biết không hỗ trợ, khác với thiếu metadata. Web/app phân biệt hai trạng thái và đánh dấu giọng “Có sắc thái”; không tuyên bố Hoài My/Nam Minh có cảm xúc, không đổi provider hay dùng Gemini phân tích thay cho khả năng tạo âm thanh của model.
- **264 kiểm thử local PASS:** M2 102, launcher/runtime 16, web 94, app 52; app typecheck/lint và web production build PASS. Build còn cảnh báo chunk JS trên 500 kB đã ghi ở mục trước. Fixture kiểm catalog cũ/mới, vùng thay đổi và API không bỏ mảng styles rỗng; không đọc/sửa env thật, gọi AWS/provider, deploy hoặc commit/push.

## 2026-11-11 — Đồng bộ code, sửa giao diện, scan tài liệu và thêm sắc thái giọng

- Đã fetch và fast-forward `origin/main` từ `5150082` lên `e5e7819`, giữ PR #14/camera/worker OCR tái sử dụng và sửa bàn phím của M2. Giữ ba stash, env thật và dịch vụ dev của người dùng; chưa commit/push hoặc triển khai AWS.
- Mobile web dùng cùng Sidebar, logo, active pill và mục điều hướng với desktop; bỏ menu phụ khác bố cục. Drawer có nền đủ tương phản, cuộn được, đóng khi điều hướng/đổi sang khung desktop. Sửa IntersectionObserver của sóng 3D trong trình phát để quan sát khung cover thay vì hình lớn bị scale; giữ toàn bộ keyframes cũ, tôn trọng hệ điều hành/giảm chuyển động/ẩn trang.
- App: Android BlurView nhận đúng target trang đang focus, tránh tự blur dock; iOS giữ GlassView native. Android dùng resize bàn phím, không cộng padding kiểu iOS. Sửa hàng nút nhập/chia phần, vùng chạm xóa, lọc giọng theo ngôn ngữ, URL kết nối dài và thông báo giảm chuyển động của hệ điều hành. Bỏ thời lượng đoán trong ô nhập và nút chia sẻ trùng trong trình phát; xóa nội dung cũng xóa tên tệp/chỉ số phần.
- OCR dùng chung Tesseract.js 7 `best_int`, phân tích bố cục AUTO/chỉnh nghiêng, NFC, cache model web có phiên bản SHA-256. Thêm OpenCV.js 4.12.0-release.1 tải/khởi tạo khi cần và cách chọn góc jscanify MIT để căn phối cảnh ảnh camera; giữ ảnh nền trắng hoặc không có viền tin cậy. Đã sửa vòng Promise vô hạn của OpenCV self-thenable; giải phóng Mat/canvas/ảnh native, hủy và lỗi phải unmount worker cũ. Tăng độ nét PDF scan/ảnh camera trong trần 4 MP. Giữ giấy phép, không thêm npm jscanify với dependency canvas/node không cần cho Expo.
- Đã so Tesseract/PaddleOCR/Scribe và thử model float/đổi thứ tự ngôn ngữ/tăng tương phản/scale/sharpen trên mẫu tổng hợp. Chưa có bằng chứng tốt hơn bộ hiện tại; model float gặp vấn đề relaxed SIMD trên runtime 7 nên không đưa bản thử vào sản phẩm. Không tuyên bố OCR chính xác tuyệt đối, không gửi ảnh gốc lên API, vẫn yêu cầu duyệt chữ sau quét.
- Theo phạm vi cảm xúc được giao tiếp: registry lấy `StyleList` thật; web/app chọn sắc thái Azure hoặc `auto` khi Gemini được bật rõ. M2 tạo SSML escape, phân tích một sắc thái chủ đạo sau dịch và CAS `resolvedStyle` trước audio. M3 giữ metadata/counter Gemini riêng có giới hạn; M5 validate trước quota và giữ fingerprint cũ khi neutral. Root/child SAM và env mẫu nối cờ mặc định tắt. Gemini timeout/quota/output sai kết thúc FAILED có hướng dẫn chọn thủ công, không giả thành công hoặc fallback trung tính. M1/M2/M3/M5 cần review phần thuộc owner; lịch sử CHANGELOG của họ giữ nguyên.
- **439 kiểm thử local PASS:** M1 31, M2 101, M3 53, M5 93, local runtime/launcher 15, web 94, app 52. Thêm kiểm style theo đúng giọng, SSML injection/speed, quota trước network, structured enum, CAS/retry giữ kết quả, tương thích idempotency và gửi style trên UI. Web production build, app typecheck/lint, Expo export iOS/Android/web và `cfn-lint` toàn bộ template PASS. Build web còn cảnh báo entry JS trên 500 kB; OpenCV/model/PDF ở asset/chunk riêng, không thêm xử lý ảnh vào chuyển động giao diện.
- Chromium/WebKit kiểm web production 364 tổ hợp và Expo web 288 tổ hợp (trang/kích thước/sáng-tối), không có tràn khung hoặc pageerror. Chip lọc giọng cuộn ngang được kiểm riêng bằng cuộn tới/chọn tiếng Anh, không coi phần ngoài viewport của vùng cuộn là lỗi. Hai engine kiểm xóa nội dung, sheet/theme và chọn giọng → sắc thái → một POST đúng dữ liệu ở cả web/app. Sóng có animation chạy trên bản build dùng API HTTPS fixture; đây không phải bằng chứng CloudFront đã được cập nhật.
- Tám ca OCR thật local bằng WASM: web và bộ đọc app, ảnh Việt/Anh thường và ảnh phối cảnh, trên Chromium/WebKit; có text đầu ra, không lỗi luồng. Vẫn có lỗi dấu trên mẫu, không phải benchmark chất lượng bản ngữ. Bộ chặn mạng QA ban đầu chặn `blob:` trên WebKit và phép kiểm mảng lỗi rỗng báo nhầm; đã sửa/đối chiếu output. Model/core CDN của app được phục vụ bằng fixture local trong QA, không xác minh mạng CDN trên iPhone thật.
- Nguồn/report/screenshot kiểm trình duyệt nằm ngoài repo tại `/tmp/tts-ui-qa`. Chưa nghe MP3 cảm xúc bằng key thật, chưa kiểm camera/blur/bàn phím trên thiết bị iOS/Android vật lý, chưa deploy hoặc gọi AWS/Azure/Gemini. Cập nhật README owner, AGENTS, contract và hướng dẫn Azure/local để bật, giới hạn và nghiệm thu đúng mức `coded` + `locally tested`.

## 2026-11-10 — Bàn giao giao diện và API chung lên các nhánh

- Theo yêu cầu người dùng: commit tiếng Việt và push bản hiện có lên main cùng M1–M5. Phạm vi gồm giao diện responsive/player/sóng 3D, xử lý timeout local, Expo login, API chung web/app và đồng bộ catalog/lịch sử; giữ các commit đã merge của M2/M3.
- Đối chiếu bằng chứng kiểm thử/build/export ở các mục phía dưới; không gọi lại provider hoặc AWS. Fetch và kiểm ancestry trước push, chỉ cập nhật fast-forward/atomic, không force-push. Giữ ba stash, env thật, dữ liệu dev và tài nguyên sinh ngoài Git. Mã commit và kết quả remote được báo sau khi thao tác hoàn tất; không triển khai Sandbox.

## 2026-11-10 — Web/app dùng chung API và tự cập nhật giọng, bản thu

- Người dùng chốt đồng bộ giọng và bản thu trước; bản nháp/file gốc/theme vẫn riêng trên mỗi thiết bị. Giữ API paths, provider, scope demo và hạ tầng hiện có.
- Launcher giữ `npm run dev` cho API Python + web + Expo; thêm `--api-url https://DOMAIN.cloudfront.net` để web/Expo dùng cùng API AWS đang triển khai, không khởi động Python API, đọc key env backend hoặc lấy catalog Azure riêng. URL HTTPS được kiểm tra; lỗi không in thông tin credential/query. Giữ lọc secret, LAN, mã nhập trên từng UI và cleanup tiến trình. Script upload web in lệnh Expo theo cùng WebDomain, không tự triển khai native.
- Web/app cập nhật catalog khi trở lại foreground, cập nhật trang lịch sử mới nhất mỗi 15 giây khi đang mở; không polling lúc ẩn hoặc chồng request. `shared/history.ts` dùng thứ tự jobId/cursor M3 để giữ các trang cũ đã tải thêm, loại bản đã xóa khỏi vùng trang mới quét và không trùng ID. Làm mới chủ động/kéo xuống tải lại từ đầu. Version request chặn snapshot trước khi đổi mã/xóa/lưu bản thu ghi đè dữ liệu mới.
- App thêm nút Kết nối và trạng thái/lỗi thật trong Cài đặt, chỉ áp mã sau khi bấm; đổi/xóa mã vô hiệu phản hồi cũ và xóa catalog/lịch sử hiện tại. Xóa nội dung trường mã rồi bấm Xóa mã truy cập để bỏ mã đã lưu. Không gửi mã qua QR hoặc EXPO_PUBLIC env; lỗi API không chuyển sang nghe trên máy.
- **156 kiểm thử local PASS:** web 92, app 49, launcher/runtime/TLS 15. App typecheck/lint, web production build và Expo export iOS/Android/web bằng Node 22 PASS; bash syntax và diff whitespace sạch. Test bổ sung URL chung/không đọc env ở cloud mode, API app HTTPS, merge phân trang, foreground/ẩn và chống request nền chồng nhau.
- Chrome/WebKit cùng mở web production + bản Expo web export, dùng một API fixture: tạo từ web xuất hiện ở app, tạo từ app xuất hiện ở web, polling nền nhận bản mới/xóa, mã sai không giữ lịch sử cũ và xóa mã đã lưu đạt; không pageerror. Kiểm màn Kết nối ở 320/390/820 px trên hai engine, không che nút. Ảnh/script/report QA ngoài repo tại `/tmp/tts-responsive-qa`. Đây là kiểm browser/Expo web và đóng gói native, chưa chạy trên iPhone/Android thật hoặc Sandbox.
- Cập nhật README gốc/frontend/local, hướng dẫn Azure và AGENTS về hai môi trường, foreground sync và app native dùng backend AWS. Không gọi AWS/provider thật, sửa env người dùng, commit/push hoặc tắt dịch vụ dev của người dùng; chỉ dừng server QA do agent mở. Giữ toàn bộ thay đổi trước đó trong working tree.

## 2026-11-10 — Sửa launcher cho Expo Go trên iPhone cần đăng nhập

- Người dùng báo Expo Go đã đăng nhập nhưng CLI chưa đăng nhập. Đối chiếu tài liệu Expo và code `getUserAsync` trong CLI đang cài: chế độ offline bỏ qua lấy actor tài khoản, trong khi iPhone thật yêu cầu CLI/Expo Go cùng tài khoản. Bỏ cờ `--offline` đang ép cứng trong launcher; giữ LAN, `--go`, API base, lọc secret và cleanup tiến trình.
- Hướng dẫn `npx expo login`/`whoami` cùng tài khoản, khởi động lại phiên offline cũ và quét QR trong README local; frontend README trỏ đến cùng hướng dẫn. Không tự đăng nhập, đọc credential Expo, sửa env hoặc tắt dev server của người dùng.
- Kiểm local: **13/13** runtime/launcher/TLS tests PASS, `git diff --check` sạch. Không khởi động Expo online hoặc xác minh trên iPhone thật; người dùng cần hoàn tất đăng nhập trên máy. Nguồn: [Expo Go sign-in required](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/).

## 2026-11-10 — Sửa local tạo giọng chờ mãi ở 0%

- Đọc trạng thái job người dùng báo từ API local: PROCESSING, 0/1, chưa có lỗi. Stack tiến trình đang chạy chờ SSL handshake; phép kiểm TLS riêng tới Speech East Asia timeout sau 8 giây, không gửi HTTP, key hoặc văn bản. Người dùng xác nhận dùng Wi-Fi trường; cần thử mạng khác để xác định bộ lọc/đường truyền, chưa kết luận key sai hoặc hết quota.
- Sửa M2 giới hạn timeout mỗi request provider ở 60 giây và vẫn chừa ngân sách cleanup; job nhiều đoạn giữ ngân sách 600 giây. Timeout trực tiếp hoặc bọc trong URLError có mã PROVIDER_TIMEOUT và lời nhắn an toàn. Local gọi lượt hai bằng cờ `final_attempt`: dùng ETag đang giữ để FAILED sau lỗi thực, hoặc hoàn tất DONE từ MP3 đã lưu; không gọi provider thêm, không ghi đè chủ lease mới. Không bật cờ ở Lambda hoặc đổi async/recovery policy AWS.
- Log local thêm STARTED/attempt/jobId; không ghi key, văn bản hoặc URL âm thanh. Web chờ không xác định khi chưa có checkpoint, hiện phần trăm khi đã có phần hoàn tất; nhận FAILED thì dừng busy, hiển thị lỗi và giữ bản nháp.
- **229 kiểm thử local PASS:** M2 94, router M1 31, runtime/launcher/TLS 13, web 91; TypeScript/Vite production build PASS. Regression gồm timeout hai lần → FAILED qua router/submit/worker/Moto/history và xóa được; timeout rồi thành công trên cùng job; khôi phục MP3 đã lưu; CAS đổi chủ; không lộ lỗi thô; UI chờ → 33% → lỗi giữ nội dung. Provider HTTP được mock, không dùng key/env thật hoặc tiêu quota.
- Chưa xác minh tạo MP3 thật sau khi đổi mạng; giữ nguyên tiến trình dev và dữ liệu RAM người dùng. Cần Ctrl+C rồi `npm run dev` để Python nạp bản sửa; tài liệu xử lý ở README local. Không deploy, commit/push hoặc sửa CHANGELOG owner khác; giữ toàn bộ thay đổi UI trước đó.

## 2026-11-10 — Đồng bộ sóng 3D của trình phát với trang chủ

- Bỏ nền vuông, viền và phần cắt quanh biểu tượng trong thanh phát. Thu nhỏ nguyên mẫu `ToolArt` để giữ đúng tỷ lệ nét, ánh kính và bóng; dùng chung chuyển động lên xuống/nhịp sóng của trang chủ, không cần đợi phát âm thanh. Giữ cơ chế dừng khi khuất, giảm chuyển động và kích thước thanh phát gọn.
- Kiểm local: Chrome/WebKit **28 cấu hình** (320–2560 px, sáng/tối) không cắt sóng, lấn tên hoặc tràn ngang; tám animation dùng đúng nhịp trang chủ, giảm chuyển động của hệ điều hành và trong app đều dừng sóng. **90/90 web tests PASS**, build TypeScript/Vite PASS. Dùng API fixture, không gọi provider/AWS; chưa kiểm thiết bị thật, không commit/push.

## 2026-11-10 — Sửa reflow web, thanh phát nổi và thu gọn nhập tài liệu

- Tái hiện cửa sổ 1163 × 556: `.composer` chỉ cao 179 px trong khi nội dung cao 358 px; hàng tạo giọng nằm ngoài khung và bị `overflow: hidden` cắt. Bỏ ép chiều cao, giữ vùng nội dung cuộn được; lưới chuyển một/hai cột theo chiều rộng thực sau sidebar. Header thu gọn khi cửa sổ rất thấp. Tên giọng dài, form kết nối và nút trong modal được co/xuống dòng; cài đặt giọng nằm cùng vùng cuộn, không có scrollbar con che chức năng.
- Gỡ sóng trang trí khỏi ô nhập và CSS không còn dùng; giữ sóng/chuyển động ở Tổng quan và ảnh bìa bản thu. Viền composer tối/focus dùng cùng màu ở cả bốn cạnh, bỏ nét focus riêng bên trái. Giữ keyframes, sidebar motion, kính, theme, giảm chuyển động và tương phản cao.
- Thanh phát theo ảnh tham chiếu Apple Music: điều khiển ở trái, bìa/tên/tiến độ giữa, thư viện/âm lượng/tải MP3 bên phải. Kính trong và bóng nổi, cao 64 px trên desktop, rộng tối đa 760 px, đặt nổi bằng absolute trong workspace; không còn một hàng footer riêng. Mobile chia hai hàng dưới 105 px. Khoảng cuộn cuối bảo đảm có thể đưa nút thao tác ra khỏi vùng thanh phát; timeline tiếp tục dùng đồng hồ MP3 thật.
- Bỏ ô tải tệp lớn trùng lặp và dòng hướng dẫn thường trực; gom nhập tệp/chụp ảnh vào toolbar. Form nhận kéo thả tệp nhưng giữ hành vi kéo chữ thông thường; busy/OCR không nhận tệp mới. Hiện một dòng tên tệp sau khi nhập, xóa nội dung thì xóa cả tên tệp. Không đổi parser/OCR, giới hạn 50 MiB, API, env hoặc backend.
- Kiểm thử: **90/90 web tests PASS**, gồm nhập TXT qua input, kéo thả tệp, không chặn kéo chữ và xóa tên tệp; build production TypeScript/Vite đạt. Chrome và WebKit kiểm **560 cấu hình**: bảy trang × 20 kích thước (320–2560 px, gồm cửa sổ 320 px chiều cao và ngang) × sáng/tối; không tràn ngang hoặc composer cắt nội dung, nút tạo giọng đưa vào vùng nhìn thấy được. Thêm **48 lượt trạng thái** tài liệu dài/lỗi, chọn giọng/modal, theme/focus, sidebar/mobile menu và Cài đặt; viền focus đủ bốn cạnh, không pageerror.
- Player trên Chrome/WebKit: **28 cấu hình** đều gọn dưới 105 px, các nút không chồng nhau; MP3 mẫu local 6 giây phát/tạm dừng, click timeline tua thực, lặp, mute/unmute, tải, đổi bản thu và mở thư viện đạt. Thêm **10 cấu hình nhập tệp** kiểm chooser, tên dài, file drop/text drop, capture input và vị trí player nổi; không overflow/pageerror. QA dùng API/MP3 fixture riêng, script/ảnh/báo cáo ở `/tmp/tts-responsive-qa`, không thêm dependency hay e2e vào repo.
- Mức bằng chứng: coded + locally tested trên browser engine; chưa kiểm bàn phím/Safari iPhone hoặc Android thật, chưa đo FPS thiết bị. Không gọi AWS/Azure/Gemini, deploy, commit/push hoặc sửa lịch sử các owner khác; năm commit đã có trên nhánh và các stash được giữ.

## 2026-11-09 — Bàn giao bản sửa lỗi dịch cho các nhánh

- Người dùng yêu cầu commit/push bản sửa lỗi Azure/Gemini lên main và các nhánh M1–M5. Phạm vi gồm 10 file source/test/tài liệu của đợt chẩn đoán phía dưới; giữ nguyên env thật, key, tiến trình dev và ba stash.
- Đối chiếu 220 kiểm thử local đã đạt với source hiện hành; kiểm diff/ignore và bí mật trước commit. Fetch và kiểm quan hệ tổ tiên trước khi push, chỉ cập nhật fast-forward, không force-push. Kết quả remote cùng mã commit được xác nhận trong bàn giao sau thao tác; không chạy lại provider hoặc deploy AWS.

## 2026-11-09 — Chẩn đoán lỗi dịch local và làm rõ thông báo provider

- Log người dùng xác nhận các lượt `/voices` và `/history` cuối đã qua xác thực. Phép kiểm riêng Azure Translator với câu mẫu trả 401/401001 khi env đang để `global`; ảnh resource xác nhận Location East Asia. Giữ nguyên env người dùng, thử override vùng trong bộ nhớ: HTTP 200. Luồng router → submit → worker → Azure Translator → Azure Speech → S3 Moto trả 202 rồi DONE ở attempt 1, MP3 hợp lệ 32.832 byte. Đây là thử provider thật từ máy local, không phải Sandbox, chưa nghe/đánh giá chất lượng mọi giọng.
- Gemini metadata của model đã chọn trả 200; các POST mẫu ghi nhận 503 hoặc timeout 30 giây. Thử model khác cũng trả 503 với thông báo quá tải. Chưa có bản dịch Gemini thành công trong lượt này; không đổi model/env, tự fallback, tăng quota hoặc kéo dài timeout để che lỗi. Không dùng tài liệu của người dùng cho phép thử.
- Sửa thông báo backend dùng chung web/app: phân biệt Gemini auth/model/quota/timeout/network/5xx và quota demo; giữ public `TRANSLATION_UNAVAILABLE` và typo `skipped`. Azure nhận diện nhầm key Speech, key/vùng sai, HTTP bị từ chối và quota 403001; quota hết không retry. Chỉ đọc mã lỗi Azure trong body có giới hạn, đóng response, không chuyển raw body/key/văn bản ra UI/log.
- **220 kiểm thử offline PASS:** M1 31, M2 89, M5 90, launcher/TLS 10. Thêm regression cho header vùng, phân biệt auth/quota và làm sạch lỗi provider. Không sửa CSS/chuyển động, frontend bundle, SAM, tiến trình dev đang chạy hoặc env thật; không deploy AWS, commit/push trong lượt này. Người dùng cần đặt `AZURE_TRANSLATOR_REGION=eastasia`, Ctrl+C rồi `npm run dev` để phiên hiện tại đọc lại cấu hình/code. Cách xử lý trong `deployment/local/README.md`.

## 2026-11-09 — Bàn giao source và đồng bộ các nhánh

- Người dùng yêu cầu push bản hiện có lên toàn bộ nhánh trước khi tiếp tục xử lý lỗi web. Phạm vi gồm source M4 và các phần tích hợp M1/M2/M3/M5, OCR 50 MiB, TTS 10.000 ký tự, Azure/Gemini và công cụ local; không deploy AWS hoặc gọi provider trong đợt bàn giao này.
- Fetch xác nhận `main`, `m1-minhly`, `m2-trungkhang`, `m3-trungduc`, `m4-nguyenkhang`, `m5-trungnghia` đều là tổ tiên của bản tích hợp. Đồng bộ bằng fast-forward/atomic push, không force-push; giữ ba stash và lịch sử owner. Mã commit và trạng thái remote được xác nhận trong báo cáo bàn giao sau push.
- Chạy lại **399 kiểm thử PASS**: M1 31, M2 87, M3 49, M5 89, web 91, app 42, launcher/TLS 10. Build web với env công khai trống, app typecheck/lint, Expo export iOS+Android với dotenv tắt, cfn-lint tất cả template và `git diff --check` đạt. Đây là bằng chứng local/mock, không phải nghiệm thu Azure/Gemini/AWS thật.
- **Vấn đề còn mở:** người dùng vẫn báo lỗi trên web sau hướng dẫn nhập mã demo. Phép kiểm riêng `/voices` trước bàn giao ghi nhận 401 khi thiếu token và 200 khi gửi đúng token qua cả API/proxy; chưa tái hiện và xác định nguyên nhân lỗi còn lại trên trình duyệt người dùng. Không đánh dấu đã sửa hoàn toàn; cần kiểm request/response và origin/storage của phiên trình duyệt tiếp theo.
- File env thật, key/token, catalog local, dependency, build/export và dữ liệu QA không thuộc bản commit; chỉ đưa env mẫu không có key cùng source/test/tài liệu/giấy phép. Không dừng hay thay đổi tiến trình dev người dùng đang mở.

## 2026-11-09 — Chọn sẵn model Gemini cho local

- Theo yêu cầu chỉ cần dán key: đặt `GEMINI_MODEL=gemini-3.8-flash` và hai cờ Gemini local thành true trong env được ignore; giữ nguyên key/Azure/cấu hình khác. Người dùng cần điền key trước khi chạy vì local runner kiểm cấu hình đầy đủ, không gọi provider khi còn thiếu key.
- Đối chiếu [model/Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview) và [hướng dẫn model mới](https://ai.google.dev/gemini-api/docs/latest-model). Bỏ sampling `temperature` cũ; dùng `thinking_level=low` cho Gemini 3.x để phù hợp tác vụ ngắn và timeout, giữ structured JSON/store=false. Không đổi SAM mặc định hoặc provider Azure.
- Kiểm thử payload và suite M5 **89/89 PASS** bằng mock; `git diff --check` sạch. Không dùng key thật/gọi Gemini/AWS, không deploy/commit/push; quyền truy cập và quota của key cần thử thực tế sau khi người dùng điền.

## 2026-11-09 — Gộp M5 3f87586, giữ Azure và sửa HTTPS local

- Theo yêu cầu tiếp tục sửa startup và lấy code mới của Nghĩa: fetch phát hiện `origin/m5-trungnghia` mới tại `3f87586`; nhánh M4 được fast-forward tới commit đó. Sao lưu source/diff ngoài repo và tạo stash riêng trước khi nhập; hai stash cũ được giữ. Khôi phục thay đổi M4 bằng merge ba phía trên nền `ae76ef0`, xử lý sáu xung đột, giữ 50 MiB/tệp, 10.000 ký tự/lượt, tự phục vụ OCR web và key env được ignore. Không tạo commit/push mới.
- Luồng mặc định vẫn Azure Translator → Azure Speech. Gemini của M5 là lựa chọn rõ ràng để dịch/xem lại trước khi đọc, mặc định tắt; không fallback hoặc dùng key Azure cho Gemini. Runtime local dùng lại handler M5 và mock SSM/counter, nhận key/model/cờ tùy chọn ở env backend, không thêm server vào lệnh chạy chung. Bảy API cũ được giữ; `/text/translate` là mở rộng M5 đã có trên nhánh nhập về.
- Gom vòng dịch web/app vào `shared/translation.ts`: Gemini 2.000 ký tự/phần, ngữ cảnh 600 ký tự, giữ cặp UTF-16, dừng/tiếp tục và bỏ phản hồi của tài liệu cũ. Không dùng giới hạn TTS 10.000 cho Gemini. App nhận limits/capability thực từ catalog và giữ index/giới hạn phần khi duyệt sửa lỗi; hỗ trợ nhập tài liệu ngay trong màn dịch. Báo cáo riêng M5 chuyển vào `backend/m5-trung-nghia/reference/`, nội dung giữ nguyên từng byte; lịch sử M5 không sửa.
- Bridge Gemini local riêng của M5 được giữ để owner dùng độc lập; request tới bridge không nhận mã demo của API chính. Lệnh chạy chung xóa URL bridge phụ khỏi env phiên để dùng đúng backend/SSM/counter local đã cấu hình, không mở cổng thứ tư.
- Sửa URLError: đã tái hiện Python ngoài cấu hình IDE có 0 CA và lỗi xác thực chứng chỉ. Runtime bổ sung Certifi khi thiếu CA và không có CA riêng, chỉ trong tiến trình local; không tắt TLS hoặc sửa trust store máy. Lỗi chứng chỉ/DNS/timeout/HTTP được mô tả riêng, không in raw exception chứa key/URL/proxy. Kiểm HTTPS bằng CA fixture xác minh kết nối thành công và vẫn từ chối sai hostname; không dùng key người dùng để kiểm.
- **399 kiểm thử PASS:** M1 31, M2 87, M3 49, M5 89, web 91, app 42 và launcher/TLS 10. Web production build, app typecheck/lint, Expo export iOS+Android, cfn-lint root/tất cả template con, Bash syntax, liên kết tài liệu và `git diff --check` PASS. Unit/integration dùng mock, không gọi dịch vụ/provider thật.
- Chrome trên build production với API fixture: Azure giữ nguồn/giọng đích/bản dịch đúng, Gemini chỉ chạy khi chọn và chưa tự tạo MP3; OCR thật tiếng Việt, PDF chữ+scan, DOCX, tệp đúng 50 MiB, từ chối 51 MiB, hủy nhập giữ nháp, gửi đúng 10.000 ký tự/lượt. MP3 fixture 5,072 giây phát/tua theo media clock. Bảy trang × năm cỡ 320/390/768/1440/2560 × sáng/tối không tràn ngang; không pageerror hoặc request ngoài origin local.
- Đối chiếu source trước khi gộp: giữ nguyên 7 keyframes, 14 animation, 14 transition và các backdrop-filter. `npm run dev` với env mẫu/`--no-voices` chạy đủ ba dịch vụ, API/proxy/Metro 200, Gemini chưa bật trả 503 đúng; Ctrl+C exit 0 và không còn listener cũ. QA source/ảnh/log ở ngoài repo. Chưa deploy, gọi Azure/Gemini thật hoặc nghiệm thu trên điện thoại thật; source model M5 cần owner xác nhận với key thực trước khi bật.

## 2026-11-09 — Một lệnh chạy backend, web và Expo Go

- Thêm `npm run dev` tại gốc repo, gọi launcher Python trong `deployment/local/`; không thêm workspace/dependency chung giữa React web và React Native. Giữ nguyên thiết kế và hiệu ứng giao diện.
- Tự chọn IPv4 LAN, bind API và URL MP3 cùng địa chỉ; web đi qua proxy loopback, Expo nhận API base qua môi trường phiên chạy. Không sửa env/key người dùng; không truyền key/token/AWS credentials sang bundler. Catalog thiếu/khác vùng được lấy từ Azure khi người chạy có Speech key; hỗ trợ `--no-voices`, `--refresh-voices`, `--ip` và env fixture cho kiểm offline.
- Kiểm cổng trước khi chạy; không tắt tiến trình khác hoặc đổi cổng ngầm. Kiểm readiness, dừng cả nhóm khi một dịch vụ lỗi/Ctrl+C/SIGTERM, khôi phục terminal sau Expo. API hỗ trợ override host/public URL được validate trong phiên, không đổi file env.
- Kiểm local: **6/6 test launcher PASS**, gồm chọn IP, cổng bận, lọc secret, override env, dịch vụ lỗi/cleanup tiến trình con và Ctrl+C không gọi Azure. Router/runtime M1 **29/29 PASS**; Bash syntax, Python compile, `git diff --check` PASS.
- Chạy thật bằng `npm run dev` với env mẫu không key + `--no-voices`: API health/history 200, web `/api/history` 200; manifest Expo Go iOS/Android 200 và hai bundle Metro 200 chứa đúng API LAN. QR/shortcut terminal hoạt động; Ctrl+C exit 0, kiểm không còn listener 8000/5173/8081 hoặc worker Metro/Vite. Khởi động lại ngay thành công; mở trùng báo cổng bận và giữ nguyên phiên đang chạy.
- Không gọi AWS/Azure thật, không dùng env key người dùng, không deploy/commit/push; manifest/bundle không thay thế nghiệm thu trên điện thoại thật.

## 2026-11-09 — Env và backend local trước Sandbox

- Theo yêu cầu mới: chuẩn bị env để thử local trước, chưa deploy AWS. Tạo env mẫu backend/web/app và hai file `.env.local` backend/web được ignore; key để trống, không yêu cầu gửi key trong chat. Đã cài dependency dev riêng trong `.venv` được ignore.
- `deployment/local/server.py` dùng lại handler M1/M2/M3/M5; Moto mô phỏng S3/SSM trong RAM, một worker local có retry hữu hạn. Không thêm provider/repository production, không sửa template hay chuyển Lambda sang đọc env plaintext. Catalog chỉ tải Azure khi người chạy chủ động dùng lệnh `voices`; startup/health không gọi Azure.
- Web dùng `/api` qua proxy Vite tới Python port 8000. App có env mẫu public API base và hướng dẫn IP LAN; key chỉ phía Python, mã demo nhập trong Cài đặt. Local media có URL ký/hạn dùng + HTTP Range; các file thật, cache catalog và venv không lên Git.
- Kiểm thực tế: `.venv/bin/python -m unittest discover -s backend/m1-minh-ly/tests` **29 PASS**, trong đó **9 ca local runtime** (env validation, catalog dùng mock, auth/health, submit/poll/idempotency, dịch/giọng đích, CAS, media Range/signature/delete và CORS). M2 **87**, M3 **49**, M5 **82** PASS; web **85** PASS và production build PASS.
- Chrome localhost + backend local chưa điền key: lưu mã demo thành công, history 200, catalog 503 rõ ràng, nút tạo giọng bị chặn; proxy `/api/health` 200; không pageerror hay request ngoài localhost. Không gọi Azure/Sandbox thật; MP3/dịch trong suite dùng provider giả, không ghi nghiệm thu giọng thật.
- Cách chạy và chuyển Sandbox: `deployment/local/README.md`; README gốc/frontend/owner M1, kiến trúc và AGENTS được cập nhật. Không commit/push hoặc ghi thêm log của owner khác.

## 2026-11-09 — Dịch và đọc, OCR và giới hạn tài liệu

- Theo yêu cầu người dùng: làm sẵn code Azure Translator và hướng dẫn cấu hình thủ công, chưa có resource/key; 50 MiB/tệp, 10.000 ký tự/request. Không gọi AWS/provider live, không deploy hoặc tự commit/push trong đợt này.
- Đối chiếu và tích hợp source M5 `ae76ef0` trên nền M2/main `49c0e60`: dùng lại parser/OCR/tài liệu nhiều phần, idempotency, correction/stats/recovery và tests; giữ các cập nhật tiếng Trung/tải MP3 của M2. Không tạo bộ submit/repository cạnh tranh.
- Backend: submit validate nguồn/đích và giọng đích; worker dịch qua Azure Translator bằng key SSM riêng, checkpoint bằng CAS, rồi tạo MP3; không giả bản dịch thành công. Request dài chia đoạn 1.500 ký tự, cache private parts để retry, ghép MPEG Layer III/cập nhật duration/seek và dọn phần tạm. Cùng một EventInvokeConfig; timeout 600 giây. Bản dịch vượt 10.000 ký tự báo lỗi, không cắt chữ.
- Web: 50 MiB/tệp, giới hạn nội dung 200.000 đơn vị UTF-16/50.000 từ; catalog cung cấp maxChars/capability. Giữ nguyên bản gốc, hiển thị/sao chép bản dịch riêng; chọn/chạy các phần tài liệu và hủy OCR. Camera dùng native file picker trên mobile nếu hỗ trợ. DOCX kiểm tổng dung lượng trước giải nén, PDF có CMap/font/WASM tự phục vụ cùng web.
- OCR web self-host worker/WASM và model Việt/Anh/Nhật/Hàn/Trung giản thể/phồn thể. Kiểm SHA-256 và byte size trước khi dùng để tránh Tesseract bỏ model lỗi và đọc bằng tiếng Anh. Tài nguyên sinh nằm trong ignore, npm prepare/build sinh lại; không đưa ảnh gốc lên backend.
- Có script cấu hình `configure-translator` (key nhập kín, kiểm một câu khi người vận hành chạy, SSM SecureString); root SAM chỉ nhận tên/vùng. Hướng dẫn có trong docs/AZURE-SPEECH.md. Bộ `languages.py` có câu bản ngữ cho 35 locale, dry-run mặc định, live có budget/resume và report/MP3 ngoài repo, vẫn cần người nghe đánh giá.
- Kiểm local: M1 **20**, M2 **87**, M3 **49**, M5 **82** tests pass (**238 backend**), trong đó M2 có FFmpeg CBR/VBR thật để kiểm duration và giải mã MP3 ghép. Web **85** tests pass; app **37** tests pass, typecheck/lint pass, Expo export iOS/Android pass. Build web và cfn-lint root/tất cả template con pass. Đây không phải bằng chứng nghiệm thu Sandbox, Azure Translator thật, mọi giọng hoặc thiết bị native thật.
- Chrome headless trên build production + API fixture local: dịch dùng giọng đích/giữ bản gốc/hiện bản dịch, OCR tiếng Việt thật, DOCX, PDF hỗn hợp chữ + scan, tệp chính xác 50 MiB được nhận và 51 MiB bị chặn, hủy OCR giữ nháp, gửi 10.000 ký tự trong một job; MP3 5,072 giây phát/tua bằng media clock. 7 trang × 5 cỡ 320/390/768/1440/2560 × sáng/tối không tràn ngang; không pageerror hoặc request CDN ngoài. Model lỗi bị chặn trước OCR, bản nháp được giữ. Fixtures và báo cáo kiểm local ở /tmp, không đưa vào repo.
- Đối chiếu CSS với HEAD: 7 keyframes, 14 dòng animation, 14 dòng transition và 13 dòng backdrop-filter không đổi. Đây là kiểm source/render Chrome, không thay thế kiểm Safari/iOS/Android thật.


## TRẠNG THÁI NHANH

- Ngày cập nhật: 2026-11-09.
- Đã code/local test: tích hợp M5 mới, Dịch và đọc với Translator riêng, OCR/scan, 50 MiB/tệp, 10.000 ký tự/request, MP3 chia/ghép có checkpoint và bộ nghiệm thu ngôn ngữ. Chi tiết và bằng chứng ở mục mới nhất phía trên.
- Bước tiếp theo: điền key trong env Python và chạy local theo `deployment/local/README.md`; sau khi local đạt mới tạo/cấu hình Translator và review changeset trên Sandbox. Xem [hướng dẫn](../docs/AZURE-SPEECH.md#dịch-và-đọc--azure-translator).
- Git: người dùng đã yêu cầu bàn giao source lên sáu nhánh; xem mục bàn giao mới nhất. Chưa làm trong đợt này: provider/AWS live, deploy, nghiệm thu giọng thực tế/máy iOS/Android thật. Lỗi web do người dùng báo vẫn mở; không xem build/mock là bằng chứng đã triển khai hoặc xử lý xong phiên trình duyệt thực.

## NHẬT KÝ

### 2026-11-08: Đồng bộ Azure lên Git thành công
- Đã push atomic commit tích hợp a76cf97 và merge b07bc3e lên main, m1-minhly, m2-trungkhang, m3-trungduc, m4-nguyenkhang, m5-trungnghia. ls-remote xác nhận cả sáu cùng b07bc3e; không force-push, các commit riêng M1 được giữ trong lịch sử.
- Các thay đổi sau phép kiểm trên chỉ cập nhật log bàn giao này; không đổi runtime, không chạy lại/deploy AWS. Source/artifact cũ có bản sao ngoài repo, không đẩy release, node_modules, env, key hoặc token.

### 2026-11-08: Chuẩn hóa Azure mặc định và chuẩn bị đồng bộ nhóm
- Ủy quyền: người dùng yêu cầu hướng dẫn chi tiết cho cả nhóm, sau đó giao dọn code và push lên main cùng các nhánh thành viên. Giữ thay đổi trước đó và sao lưu source diff/untracked ngoài repo trước cleanup.
- Bằng chứng mới từ người dùng: configure PASS sau sửa SDK, plan tạo changeset, apply/status ba Lambda cùng Azure/vùng, upload web PASS và người dùng báo dùng được. Không suy ra mọi ngôn ngữ/native đã kiểm; agent không thao tác AWS.
- Dọn code: gom tạo mới/cập nhật vào azure.py theo configure → plan → review → apply; CREATE token file 0600/SDK, UPDATE giữ token/CORS. Bỏ bootstrap ElevenLabs, tự xóa rollback stack, smoke script ghi request/response ra file và cleanup hàng loạt; HTTP smoke trả exit code đúng. Template/settings mặc định Azure, giữ adapter ElevenLabs cho dữ liệu/test cũ.
- Bỏ hai provider stub Polly/external_vi không được import, pipeline ZIP hosting riêng cùng dev dependency/test mới dư; bản sao ngoài repo giữ lịch sử local. Không xóa tài liệu plans/logs hay chỉnh task/log người khác. Giữ hai registry theo yêu cầu Lambda Layer.
- Tài liệu: một guide AZURE-SPEECH.md cho Azure Students/F0/vùng, CloudShell, Git, CREATE/UPDATE, web/app, mã, lỗi/reset; README/DEPLOY/frontend README trỏ cùng quy trình. Guide phân biệt bằng chứng phiên cũ với luồng CREATE mới chỉ kiểm local.
- Kiểm tra local: 143 backend tests đạt (M2 81, M3 26, M5 21, router 15), web 61/61 và production build đạt, app 22/22 cùng TypeScript/lint đạt (lint dùng Node 22.22.2). cfn-lint root + năm stack con, bash syntax, link/mục lục và 18 block Bash trong guide đạt; probe Python hợp lệ. SDK thật với Stubber xác minh SSM, S3 artifact và CREATE changeset, không gọi mạng. Smoke HTTP được mô phỏng cả PASS/FAIL và không in token.
- Git: hợp nhất bốn commit riêng M1 vào nhánh tích hợp, giữ lịch sử và root Azure hiện tại; chuẩn bị đồng bộ sáu nhánh bằng fast-forward, không force-push. Xung đột root/infra M1 giữ stack tích hợp đang dùng, output router, OAC giới hạn distribution của M4 và EventInvokeConfig duy nhất ở M2; không đưa lại root monolithic/permission rộng từ nhánh cũ. Giữ nguyên task/log M1, dashboard JSON và khảo sát fallback; gom script khảo sát vào scripts/m1, đổi test_live_ec2 thành probe_ec2 để test discovery không gọi mạng thật. Bản source sạch từ staged tree đã npm ci/build web thành công, không dựa node_modules/release của máy hiện tại. Task/log/dashboard M1 khớp nguyên bản nhánh owner; script khảo sát chỉ kiểm cú pháp, không chạy live. Không chạy AWS/provider trong lượt cleanup này.

### 2026-11-08: Sửa script cấu hình Azure sau lỗi AWS ParamValidation
- Bằng chứng người dùng: configure vượt qua bước lấy/kiểm catalog Azure rồi báo AWS ParamValidation khi lưu SSM; bản đầu ẩn chi tiết nên chưa kết luận được nguyên nhân hoặc field AWS từ chối.
- Đã sửa local: payload put_parameter/create_change_set gửi bằng Boto3 trong memory thay AWS CLI đọc /dev/stdin; giữ quyền/phiên lab và region AWS us-east-1. Lỗi service hiển thị code/message đã che Value; lỗi validation SDK chỉ hiện tên field, không in request/traceback/key.
- Kiểm tra: M2 76/76 đạt; kiểm tra offline với Boto3/Botocore 1.42.97 và Stubber đạt cho SSM, CloudFormation, che secret và thiếu Name. Client dùng credential giả, không gọi mạng/AWS/provider. Script --help chạy trên Python 3.9; chưa xác nhận bản sửa trong Sandbox.
- Bàn giao: file release/azure.py để thay riêng scripts/azure.py trên CloudShell đã áp dụng patch cũ; cập nhật lại full patch/manifest cho checkout sạch. Không áp dụng lại full patch lên checkout đã sửa. Chưa deploy/commit/push.

### 2026-11-08: Tích hợp Azure Speech theo yêu cầu chuyển provider
- Ủy quyền: người dùng chọn Azure thay ElevenLabs, tự tạo Speech F0 ở eastasia và báo tải/nghe được MP3 sau phép thử CloudShell. Người dùng giao cấu hình để hệ thống dùng Azure; agent thực hiện code local, AWS/key vẫn do người dùng thao tác.
- Bằng chứng người dùng: stack tts-dev và hosting CREATE_COMPLETE, script upload web PASS; ElevenLabs nhận HTTP 401 detected_unusual_activity trong CloudShell và website ElevenLabs cũng báo chặn Free theo IP. Azure trực tiếp Hoài My phát được; chưa khẳng định worker/app Azure chạy thật.
- Đã viết: Azure REST adapter gửi SSML escape XML, tốc độ giữ 0,7–1,2, trả MP3; chung SSM key reader/MP3/no-redirect, cache key tối đa 60 giây. HTTP/network lỗi phân loại hữu hạn, không ghi key/text/provider body. ElevenLabs mặc định vẫn giữ để không tự đổi hệ thống của các thành viên khác.
- Registry/config: configure lấy catalog thực từ Azure region, lọc GA Neural và chọn giọng theo giới tính; yêu cầu có vi/en/ja, không bịa voice ID hoặc tự fallback provider. Key lưu riêng /tts/dev/azure-speech, hai bản registry được sinh cùng nhau. Root/M2/M5 nối TtsProvider/AzureSpeechRegion; worker, voices và submit dùng cùng registry. Web hiển thị Azure Speech; app dùng tên từ API hiện có.
- Triển khai: scripts/azure.py tạo changeset trước, giữ DemoToken/CORS/Env bằng UsePreviousValue, không tự xóa stack; apply riêng sau khi người dùng xem. Agent không gọi AWS/provider, không commit/push. Bộ patch chỉ chứa phần chuyển Azure, không lẫn bản hosting local cũ.
- Kiểm thử local: M2 74/74, M3 26/26, M5 21/21 và router 15/15 đạt; có luồng Azure mock thật qua factory → S3, event trùng không gọi lại, registry chung voices/submit/worker, SSML escape, không rò secret, giữ token/CORS và plan chưa execute. Web workspace 65/65 cùng build đạt; app 22/22 và TypeScript đạt. cfn-lint cho root và năm stack con không báo lỗi. Không gọi AWS/provider.
- Bàn giao: release/azure-update.patch khoảng 58 KB, 20 file, base 8b6a63c; apply --check/apply trên git archive sạch đạt, từng file khớp workspace. Bản sạch chạy lại 136 backend tests, 61 web tests và build đạt (không kèm bốn test hosting local cũ). Patch/manifest được ignore trong release, không có key; không commit/push. Hướng dẫn ở docs/guides/AZURE-SPEECH.md; tài liệu hosting static cũ đánh dấu lịch sử. Không sửa log/tick task M1/M2/M3/M5.

### 2026-11-07: Chuẩn bị hosting M4 local và hướng dẫn AWS thủ công
- Ủy quyền: người dùng giao thực hiện local, đến phần AWS thì hướng dẫn để người dùng tự làm; không chạy AWS CLI/API, tạo resource hoặc upload từ máy agent.
- Kiểm kê: thêm compatibility mapping trong task M4 mục 19; giữ bảy paths/field. Đã xác định các phần còn chờ M1–M5: HTTP origin, auth/token/hash được nhóm duyệt, registry giọng thật, speed/char cap, history text/cursor, async và MR typo/stats. SB-M4-01 hoàn tất audit local; ba task còn lại chưa tick vì chưa đạt acceptance AWS/API.
- Hạ tầng: thay file comment bằng template CloudFormation M4 độc lập, bốn resource WebBucket/WebOriginAccessControl/WebDistribution/WebBucketPolicy. Bucket private, ownership enforced, SSE-S3, chỉ cấp CloudFront distribution này GetObject; HTTPS, cache disabled cho trang gốc, cache optimized cho assets/fonts/brand, security headers. Không rewrite lỗi thành HTML, không HTTP/API origin, không IAM hay root SAM của M1. Retain chỉ bảo vệ khỏi xóa/thay stack, không chống reset Academy.
- Đóng gói: npm run build:hosting build lại rồi sinh release/web.zip và manifest.json chứa SHA-256/MIME/cache/sourceCommit/sourceDirty. Demo mặc định buộc API base trống kể cả env cũ. URL API chỉ cấu hình bằng cờ HTTPS công khai sau bàn giao, manifest ghi api-configured-unverified. Không thêm auth/header/scope hoặc key vào bundle. ZIP đúng gốc, từ chối dotfile/symlink, không ghi đè release khi build thiếu index; thêm fflate làm dev dependency, không thêm vào UI bundle.
- Kiểm tra: cfn-lint 1.46.0 (us-east-1) không báo lỗi; kiểm tra invariants resource types, private S3, OAC SourceArn, HTTP deny, cache và không fallback đạt. 63/63 kiểm thử web đạt, gồm bốn test đóng gói. Đã build thử URL API giả, rồi build demo với env URL cũ giả: ZIP cuối không chứa hai URL thử, mode demo/API base null.
- Bản bàn giao: ZIP demo khoảng 1,1 MB, 14 file; xác minh hash tất cả file và chạy trực tiếp nội dung ZIP qua HTTP với MIME và nosniff. Desktop 1440 và mobile 390 mở các trang/hash routes, tải CSS/fonts/logo và lưu chế độ tối qua reload; không lỗi JS/HTTP và không request ngoài origin local. Script/ảnh QA ở /tmp, không thêm e2e hoặc ảnh vào repo.
- Hướng dẫn: docs/guides/M4-HOSTING.md có mở lab/region, review bốn resource, tạo stack tách biệt, Outputs, upload asset trước/index sau, MIME/cache (đặc biệt PDF worker .mjs), invalidation, kiểm S3 direct deny, cập nhật và reset. Đã liên kết từ frontend/README.md.
- Trạng thái: CODED / LOCALLY TESTED cho static hosting preparation; AWS capability UNVERIFIED, NOT DEPLOYED. Backend/app nguồn và shared API contract không đổi; chưa commit/push lượt này.

### 2026-11-07: Bàn giao thay đổi frontend qua Git
- Người dùng yêu cầu commit `thêm chế độ tối trong web, sửa chiều cao và bug xóa ko hết trong app` và đồng bộ các nhánh. Phạm vi commit gồm frontend cùng nhật ký M4; không có thay đổi backend/hạ tầng.
- Đã lấy commit tài liệu mới nhất `446223f` từ main bằng fast-forward, giữ nguyên thay đổi giao diện đang làm và stash định dạng task M4 cũ. Sáu nhánh remote hiện đều là tổ tiên của bản chuẩn bị push nên có thể fast-forward cùng một commit, giữ toàn bộ lịch sử.
- Bằng chứng local giữ như các entry bên dưới: 59 kiểm thử web, 16 kiểm thử app, TypeScript/lint, build web, bundle iOS/Android và kiểm tra giao diện bằng trình duyệt đã đạt. Chưa kiểm chứng native trên máy thật hoặc triển khai AWS. Push Git không có workflow deploy trong repo.

### 2026-11-07: Thêm ánh xanh nền tối, mây trắng và tăng chuyển động sóng web
- Theo yêu cầu tiếp theo: phối ba vùng ánh xanh HCMUTE phía sau kính trên nền đen, giữ lớp màu tĩnh để giảm tải; tương phản cao vẫn ẩn nền trang trí. Biểu tượng đám mây trong avatar đổi sang trắng cho cả sáng/tối.
- Sóng 3D: chu kỳ co giãn từ 2,8 xuống 1,7 giây, biên độ từ 0,94–1,04 lên 0,78–1,14 kèm nhún dọc theo từng thanh; cụm sóng nhún 6 điểm thay vì 3. Giữ dừng khi ngoài màn hình/ẩn tab, thumbnail đứng yên khi chưa phát, hỗ trợ giảm chuyển động của ứng dụng và hệ điều hành. Chỉ dùng transform CSS, không thêm JS mỗi khung hình hoặc dependency.
- Kiểm tra: production build đạt; trình duyệt kiểm tra nền/kích thước 320/390/1440/2560px, chuyển sáng/tối và tương phản cao. Kiểm tra mây trắng, biên sóng trên mobile/desktop và hai chế độ giảm chuyển động đều đạt, không có lỗi JavaScript. Không đổi bố cục/API hoặc mã app; không commit/push.

### 2026-11-07: Sửa dock/thao tác app và thêm web tối với kính trong
- Phạm vi: bảo trì giao diện theo yêu cầu riêng của người dùng; không triển khai migration/AWS và không tick checklist Sandbox còn proposed.
- Dock: iPhone có inset đáy 34 điểm dùng khoảng cách 20 thay vì 42; máy không có home indicator dùng 8, xoay ngang có inset dùng tối thiểu 16. Android giữ đầy đủ vùng thanh hệ thống cộng 8. Khoảng cuộn cuối trang tiếp tục tính từ kích thước dock/trình phát nhỏ.
- Thao tác: bỏ bộ nhận chạm trùng với Pressable, kéo chỉ đổi tab khi thả và trả thanh chọn về đúng vị trí khi hủy; màn hình mất focus không nhận chạm. Tăng vùng chạm nghe thử/lưu giọng/điều khiển bản thu lên 44 điểm; ẩn glyph trang trí khỏi nhãn trợ năng. Mở danh sách từ trình phát dùng một lệnh điều hướng.
- Dữ liệu hiển thị: xóa bản thu đang mở đồng thời dọn trình phát nhỏ; khóa xóa/chia sẻ khi đang xử lý, dọn tệp chia sẻ tạm sau khi hoàn tất/hủy. Hiện trạng thái chờ giọng thiết bị, cho dừng lúc đang tải; bỏ kết quả phát cũ khi chuyển bản thu. Danh sách giọng máy chủ có loading/lỗi/thử lại; chọn ngôn ngữ và giọng cùng lúc, chưa có giọng hợp lệ thì khóa tạo. Nội dung trống hiển thị thời lượng 0:00.
- Web: thêm Cài đặt → Giao diện → Hệ thống/Sáng/Tối, giữ tùy chọn cũ và khóa lưu trữ. Theo dõi đổi màu hệ điều hành, áp dụng màu trước khi React tải để tránh chớp trắng. Nền tối #000000, kính trong trung tính, viền phản sáng mảnh và blur cục bộ; không dùng nền xanh navy. AWS đổi phần chữ sang sáng, giữ mũi tên cam. Menu, cửa sổ, thanh trượt, thông báo lỗi và tùy chọn tương phản cao có màu phù hợp.
- App tối: nền đen và các ô xám trung tính, sóng âm/nút giữ xanh. GlassView native dùng clear khi tối, regular khi sáng; fallback giảm nền phủ và độ mờ. Không thêm thư viện, shader hoặc hiệu ứng theo con trỏ.
- Kiểm tra local: app TypeScript/ESLint và 16/16 kiểm thử đạt; web production build và 59/59 kiểm thử đạt; đóng gói Hermes iOS/Android thành công. Không thay API routes, headers, schema, dependency hoặc khóa lưu dữ liệu.
- Kiểm tra trình duyệt: 145 lượt app trên 11 cấu hình 320–1366px, có mô phỏng inset/xoay/cửa sổ thấp và cuộn cuối danh sách; 40 lượt web tối trên 8 trang × 5 chiều rộng 320/390/768/1440/2560px. Chạy lại điều hướng, kéo tab, tạo hai lần, giọng yêu thích, tài liệu TXT/DOCX/PDF và PDF hỏng, lưu qua reload. API mô phỏng kiểm tra loading giọng/lỗi/thử lại, duyệt nội dung, polling, xóa bản thu và dọn trình phát. Hủy tải giọng không phát kết quả cũ, mở danh sách từ trình phát đúng trang. Không phát hiện lỗi JavaScript trong các luồng đã kiểm tra; ảnh/script kiểm tra ở ngoài repo.
- Giới hạn: trình duyệt không xác nhận bàn phím native, home indicator thực, khúc xạ clear glass hoặc hiệu năng GPU trên iPhone/Android; vẫn cần Expo Go trên thiết bị thật. Không gọi AWS hoặc provider TTS, không deploy, không commit/push trong lượt này.

### 2026-11-06: Sửa vùng an toàn và bố cục app nhiều kích thước
- Vấn đề từ ảnh iPhone: nút đóng/cài đặt nằm cùng vùng đồng hồ; trang soạn thảo dùng modal native riêng, kích thước và khoảng chừa dưới còn cố định.
- Đã làm: cấp SafeAreaProvider cho từng trang/cửa sổ, dùng inset đo được để đặt padding rõ ràng; root có initialWindowMetrics. Tiêu đề dùng hai cột nút bằng nhau, luôn nằm ngoài vùng cuộn. Không gán chiều cao thanh trạng thái cố định. Bản web đọc CSS safe-area vì Router 58 trả inset bằng 0 trên web.
- Bố cục: gộp ScreenFrame/Header/PageScroll/Page/KeyboardArea, dùng chung SearchField và hook kích thước. Lề thay đổi theo chiều rộng, nội dung tablet giới hạn 960 điểm; lưới bản thu giảm số cột khi chữ lớn. Bật xoay màn hình, thanh dưới tránh cả mép trái/phải khi xoay, thu chiều cao ở cửa sổ thấp, chừa vùng cuộn theo dock và trình phát nhỏ.
- Bàn phím: KeyboardAvoidingView dùng chung cho soạn thảo, trang tìm kiếm và cửa sổ chọn giọng. Ẩn dock khi nhập, bỏ padding đáy dư khi bàn phím mở; header/footer thu gọn ở cửa sổ thấp. Editor cuộn nội bộ, hàng ký tự/tác vụ được xuống dòng. Bỏ nút cài đặt trùng ở đầu trang; giữ nút ở hàng tạo giọng. Trình phát chia hai cột khi đủ rộng, ảnh bìa co theo chiều cao và mọi điều khiển nằm trong vùng cuộn.
- Dọn code: bỏ wrapper Screen, tiêu đề/tìm kiếm/khoảng chừa cố định lặp ở từng trang và import/style không dùng; gom phần dùng chung trong components, hooks và lib. Không thêm e2e, tài liệu kế hoạch hoặc ảnh kiểm tra vào repo; build/cache/PDF sinh tự động tiếp tục được ignore. Không thay API, khóa lưu dữ liệu hoặc mã web/backend.
- Kiểm tra: TypeScript, ESLint và 14/14 kiểm thử đạt; ma trận hình học gồm cỡ chữ 1–3 và inset khác nhau. Expo Doctor 20/20, npm audit --omit=dev không có lỗ hổng, bundle Hermes iOS và Android thành công.
- Kiểm tra trình duyệt: 145 lượt trên 11 khung gồm 320×568, 390×844, 430×932, 360×800, 412×915, 568×320, 844×390, 800×360, 768×1024, 1366×1024 và 390×430. Mô phỏng inset tai thỏ/thanh hệ thống, kiểm tra trang/tab, ba chế độ soạn thảo, cửa sổ chọn, trình phát, cuộn cuối thư viện và đổi kích thước khi đang mở trang; không tràn ngang, header/footer/dock trong vùng an toàn, không có lỗi JavaScript. Kịch bản và ảnh kiểm tra đặt ngoài repo.
- Kiểm tra chức năng: tạo hai lần chỉ lưu một bản, chọn/lưu/tìm giọng, sáng/tối, giảm chuyển động, tốc độ đọc, lưu nháp/lịch sử qua reload; nhập TXT/DOCX/PDF và lỗi PDF hỏng; kéo tab chỉ chuyển khi thả. API mô phỏng kiểm tra một lần, chờ duyệt rồi mới synthesize một lần, polling và xóa lịch sử đều đạt. Không gọi AWS tính phí.
- Giới hạn: chưa chạy giao diện bằng Expo Go trên thiết bị iOS/Android thật; không có iOS Simulator, AVD Pixel_9a không boot vì thiếu dung lượng. Chưa xác nhận bàn phím native, Dynamic Type thực, khúc xạ kính hoặc FPS; không khẳng định không còn mọi lỗi hiển thị trên mọi thiết bị.
- File đã đổi: frontend/app/{app.json,src/app/,src/components/,src/hooks/,src/lib/layout.ts,tests/layout.test.ts}, frontend/README.md, docs/tasks/task-m4.md, logs/log-m4.md.
- Tài nguyên AWS đã tạo/sửa: không.
- Việc tiếp theo: kiểm tra các phần native trên máy thật; nối API thật khi có địa chỉ từ M1/M5. Commit theo đúng tên người dùng yêu cầu: sẵn sàng với giao diện app native ios; đẩy cả nhánh m4-nguyenkhang.
- Cần báo module khác: không có thay đổi hợp đồng chung.

### 2026-11-06: Khớp Expo SDK 58 với Expo Go trên iPhone
- Nguyên nhân: ảnh thiết bị báo Expo Go chỉ hỗ trợ SDK 58, dự án đang dùng SDK 57.
- Đã làm: nâng Expo, React 19.3, React Native 0.88.1 và các thư viện theo danh sách tương thích SDK 58; dựng lại package-lock, thêm .nvmrc 22 và sửa hướng dẫn chạy. Dùng Node 22 đã có trong /opt/homebrew/opt/node@22/bin, không thay liên kết Node mặc định của máy.
- Tương thích: chuyển thanh tab sang emitter/navigateToTab của Expo Router 58; bỏ ref TextInput không sử dụng; khai báo generic unknown cho WebView 14 để tránh giao props với undefined thành never. Không đổi giao diện, khóa lưu trữ hoặc hợp đồng API.
- Kiểm tra: TypeScript/lint và 12/12 kiểm thử đạt; Expo Doctor 20/20; đóng gói iOS thành công. Chrome kiểm tra điều hướng, kéo chọn, sáng/tối, giọng yêu thích, tốc độ, tạo giọng không trùng, lịch sử/lưu qua reload và nhập TXT/DOCX/PDF/lỗi PDF hỏng đều đạt, không có lỗi JavaScript. Máy chủ đã khởi động lại ở cổng 8081 và manifest iOS trả sdkVersion 58.0.0.
- File đã đổi: frontend/app/{package.json,package-lock.json,.nvmrc,src/app/compose.tsx,src/components/{PdfReader.tsx,TabBar.tsx}}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa: không.
- Đang dở / việc tiếp theo: người dùng bấm Go home trong Expo Go rồi mở lại dự án; còn cần xác nhận kính và âm thanh trên iPhone thật. Node mặc định đang là 20, lần tự chạy sau cần nvm use hoặc thêm Node 22 vào PATH theo README.
- Cần báo module khác: không.

### 2026-11-05: App Expo tiếng Việt và thanh kính theo ảnh tham chiếu
- Đã làm: tạo frontend/app riêng, không thay đổi mã web. Bốn tab Trang chủ/Giọng đọc/Công cụ/Bản thu và nút + mở trang soạn thảo; có trang trình phát, cài đặt và hướng dẫn. Dùng logo hiện có HCMUTE | AWS, bỏ khung trắng AWS; chế độ tối đổi màu phần chữ bằng lớp tint, giữ mũi tên cam và ảnh gốc.
- Thiết kế: kính gốc UIGlassEffect qua expo-glass-effect khi hệ điều hành hỗ trợ; BlurView dự phòng. Cử chỉ kéo tham khảo expo-glass-tabs (MIT), đã giữ giấy phép. Đo chiều rộng thật của cụm bốn tab, thanh chọn chạy trên luồng giao diện, đổi màu icon theo vị trí tay, chỉ chuyển trang khi thả. Nút + là hình tròn riêng, có phản hồi chạm và giảm chuyển động. Đây là thanh tùy biến dùng kính native, không khẳng định là UITabBar hoặc khớp hoàn toàn iOS 27.
- Chức năng: lưu nháp/cài đặt/giọng yêu thích/bản thu cục bộ; nghe bằng expo-speech khi chưa có máy chủ. API giữ hợp đồng chung; kiểm tra lỗi đánh máy một lần, chờ chọn bản gốc/bản sửa, khóa gửi trùng, theo dõi job định kỳ. MP3 dùng expo-audio, tua/lặp/chuyển bản thu và bảng chia sẻ iOS. Không giả kết quả dịch hoặc MP3 trong chế độ nghe trên máy.
- Tài liệu: chọn PDF/DOCX/TXT tối đa 10 MB, nội dung 20.000 ký tự. TXT/DOCX xử lý cục bộ; PDF.js chạy trong WebView, không tải tệp lên dịch vụ ngoài. npm ci tự dựng tài nguyên PDF từ mã nguồn; đầu ra sinh tự động và bộ nhớ đệm được ignore. Xóa màn hình/ảnh mẫu Expo và tệp khởi động không dùng.
- Nội dung: bỏ slogan, ô số liệu trang trí, mô tả trùng chức năng và câu quảng bá. Dùng nhãn tiếng Việt ngắn; giữ lỗi, giới hạn tệp và trạng thái cần thiết. Mẫu văn bản dùng thông báo học tập, bài học về luồng Polly/S3 và giới thiệu Nhóm 5.
- File đã đổi: frontend/app/, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Kiểm tra: npm ci sạch, npm run typecheck, npm run lint, npm test (12/12), npx expo export --platform ios và expo-doctor (21/21) đạt; npm audit không báo lỗ hổng. Chrome bản web: điều hướng, tìm/lưu giọng, sáng/tối, tốc độ, tạo hai lần chỉ lưu một bản, phát/lịch sử/tìm kiếm/lưu qua reload, nhập TXT/DOCX/PDF thật và báo lỗi PDF hỏng. Kéo tab chỉ chuyển trang khi thả; không tràn ngang ở 320/375/390/430/768 px. API mô phỏng kiểm tra một lần, chỉ synthesize sau khi chọn, gửi nội dung đã chọn một lần, polling và xóa lịch sử đạt. Kịch bản trình duyệt/ảnh thử nằm ngoài repo.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; không gọi dịch vụ tính phí.
- Lỗi gặp / đang dở: chưa kiểm tra trực tiếp Expo Go trên iPhone. Giọng/âm lượng, khúc xạ kính gốc, bàn phím và độ mượt cần kiểm tra trên máy thật; chưa đánh dấu hoàn tất 4.11/4.12.
- Việc tiếp theo: chạy npm start trong frontend/app và quét QR bằng Expo Go tương thích SDK 57; kiểm tra các phần trên rồi nối API thật.
- Cần báo module khác: không đổi hợp đồng API; cần địa chỉ API hoạt động từ M1/M5 để kiểm tra AWS xuyên suốt.

### 2026-11-05: Gộp nút tạo giọng vào ô soạn thảo
- Đã làm: chuyển nút Tạo giọng đọc/Dịch và tạo giọng đọc vào hàng editor-status bên trong composer, cạnh bộ đếm/thời lượng/xóa văn bản. Xóa generate-row và hàng footer bên ngoài vốn giữ margin/min-height gây khoảng trống dưới ô nhập.
- Chi tiết: nút là submit của form thay vì lặp onClick; giữ khóa chống gửi trùng và các điều kiện disabled. Nhãn Đã lưu nháp nằm cạnh bộ đếm; văn bản mẫu, lỗi và tiến độ xử lý nằm trong composer và chỉ hiện khi có nội dung tương ứng. Hàng điều khiển cho phép xuống dòng ở chiều rộng hẹp để không cắt nút.
- File đã đổi: frontend/web/src/App.tsx, frontend/web/src/styles.css, frontend/web/tests/app.test.mjs, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; kiểm thử dùng API mô phỏng.
- Kiểm tra: node --test tests/app.test.mjs đạt 9/9, gồm submit từ nút trong ô nhập, bấm hai lần chỉ gửi một lần và lỗi văn bản rỗng hiển thị trong cùng form. Chạy npm run build và git diff --check trước commit; chưa xác nhận ảnh trực tiếp qua trình duyệt.
- Việc tiếp theo: đối chiếu hàng nút trong ô nhập ở desktop/mobile; các phần AWS còn chờ như nhật ký trước.
- Cần báo module khác: không.

### 2026-11-05: Lời chào Nhóm 5, tìm kiếm gợi ý và màu HCMUTE/AWS
- Đã làm: đổi tên hiển thị thành Nhóm 5. Lời chào tiếng Việt theo giờ thiết bị: sáng từ 05:00 đến trước 12:00, chiều từ 12:00 đến trước 18:00, còn lại là tối; kiểm tra mỗi phút/khi cửa sổ nhận lại focus và không hiển thị đồng hồ. Tăng logo HCMUTE lên 48×58px/chữ 24px desktop, 40×48px/chữ 22px mobile; giữ header không khung và H1 riêng. Avatar dùng CloudFill SVG sẵn có trong Framework7, không thêm dependency/ảnh bitmap.
- Tìm kiếm: thay nút mở Modal bằng HeaderSearch với ô nhập thật và danh sách ngay bên dưới. Lọc theo ký tự, nhận tiếng Việt không dấu, tối đa sáu gợi ý công cụ/bản thu từ dữ liệu đã tải; chọn bằng chuột hoặc mũi tên/Enter, Escape/bấm ngoài đóng, có nút xóa và trạng thái không tìm thấy. Query riêng nên không làm đổi bộ lọc thư viện/chọn giọng. Bỏ toàn bộ Modal search, Ctrl/⌘ K, aria-keyshortcuts và CSS command-search không còn dùng. Trên màn hình hẹp ô gõ vẫn hiện đầy đủ, không thu thành nút mở cửa sổ.
- Màu: đo từ public/brand/hcmute.png và aws.webp: HCMUTE xanh #0072BC, AWS navy #252F3E/cam #FF9900. Đồng bộ token, nền mesh, sóng 3D, nút chính, player, chọn/focus và avatar; cam làm điểm nhấn, progress cam đậm #B66D00 để đủ rõ. Giữ đỏ/cảnh báo/thành công cho trạng thái ngữ nghĩa. Hai cặp màu kiểm tra tính toán: trắng trên #0072BC 5,08:1; navy trên cam 6,31:1, chưa coi đây là kiểm định toàn bộ giao diện.
- File đã đổi: frontend/web/src/{App.tsx,components/{PageHeader.tsx,HeaderSearch.tsx,ui.tsx},styles.css}, frontend/web/tests/{app.test.mjs,header.test.mjs}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; tìm kiếm dùng dữ liệu đã có trong frontend, không thay API.
- Kiểm tra: npm run test:ui đạt 55/55, gồm lọc tăng dần/không dấu, chọn công cụ/bản thu, bàn phím, Escape/bấm ngoài, query độc lập với thư viện, giới hạn gợi ý và đổi lời chào qua focus/timer. npm run build thành công; git diff --check đạt.
- Lỗi gặp / đang dở: thử lại trình duyệt vẫn báo browser access host unavailable; chưa xác nhận ảnh/độ mượt trên máy thật. Backend M1/M5 còn chờ như nhật ký trước.
- Việc tiếp theo: đối chiếu palette, logo/lời chào và danh sách gợi ý ở desktop/mobile; luồng AWS vẫn cần API thật.
- Cần báo module khác: không có yêu cầu mới.

### 2026-11-05: Bỏ khung header, tách tiêu đề trang thành hàng lớn
- Đã làm: header đứng trực tiếp trên nền ứng dụng; bỏ gradient, border, bo góc, backdrop-filter và box-shadow ở rule riêng lẫn selector dùng chung. Gỡ header khỏi cả quy tắc tương phản cao và fallback để khung không xuất hiện lại ở chế độ khác.
- Thứ bậc: giữ HCMUTE và lời chào gọn như ảnh, dòng mô tả ngắn bên dưới lời chào. Tên mục như Tổng quan được đưa ra khỏi header thành H1 riêng ngay trên nội dung, 28px desktop/24px mobile, căn theo mép lưới nội dung. Xóa ngày/timer và CSS tiêu đề nhỏ không còn dùng.
- File đã đổi: frontend/web/src/{App.tsx,components/PageHeader.tsx,styles.css}, frontend/web/tests/app.test.mjs, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; không đổi API hoặc dữ liệu.
- Kiểm tra: 8/8 kiểm thử ứng dụng đạt, gồm tám màn hình, vị trí H1 riêng, branding, tìm kiếm, xuất CSV và sidebar. Chạy npm run build và git diff --check trước commit; chưa kiểm tra ảnh thực qua trình duyệt vì browser access host chưa kết nối ở lượt trước.
- Việc tiếp theo: đối chiếu header không khung và tiêu đề lớn trên trình duyệt thật; các phần AWS còn chờ như nhật ký trước.
- Cần báo module khác: không.

### 2026-11-05: Header ShipCODE, lưới Tổng quan và tối ưu chuyển động sidebar
- Đã làm: header theo ảnh mới, HCMUTE đứng cạnh “Hey, ShipCODE”, tên trang như Tổng quan nằm bên dưới. Sidebar và drawer chỉ giữ AWS. Đưa tìm kiếm lên header, vẫn dùng Ctrl/⌘ K; bố cục và nhãn tự thu gọn trên màn hình nhỏ.
- Chức năng header: Xuất báo cáo tải CSV gồm mã bản thu, nội dung, ngôn ngữ, giọng, ký tự, tốc độ, trạng thái và thời điểm tạo. Chỉ xuất dữ liệu lịch sử đã tải; thông báo rõ nếu còn trang dữ liệu chưa tải. CSV có BOM giữ tiếng Việt, xử lý dấu nháy/xuống dòng và tránh nội dung bị Excel thực thi như công thức; không chứa presigned URL. Chưa có bản thu thì mở thư viện với hướng dẫn ngắn. Không tạo job hoặc gọi thêm dịch vụ TTS khi xuất.
- Căn bố cục: Tổng quan dùng chung lưới ba cột, hero và bản thu gần đây chiếm hai cột, ba KPI bằng nhau; hai card dưới tự bằng chiều cao theo nội dung. Gom gap về 20px, padding card nhất quán, bỏ override KPI thừa; tablet hai cột và mobile một cột. Biểu đồ giảm gap, giữ nhãn ngày trên một dòng để không tràn khi card hẹp. Giữ sóng 3D và các ô kính rời.
- Sửa nguyên nhân tải chuyển động từ code: trước đó grid-template-columns và height/max-height thay đổi liên tục, buộc layout lại workspace; Glisse nav-selection có ResizeObserver vẽ lại rim/canvas theo chiều rộng. Nay bố cục đổi một lần mỗi lần bấm, hook useSidebarMotion nối hình học cũ/mới bằng transform 380ms. Chỉ scale nền kính/workspace/pill; nhóm logo, nav và nút chỉ dịch chuyển. Bỏ Glass nav và blur chữ; không có bộ lọc SVG nền toàn màn hình.
- Chi tiết chuyển động: lấy vị trí đang hiển thị trước khi hủy animation cũ để đảo chiều không giật về điểm đầu; hủy khi resize, unmount hoặc bật giảm chuyển động ở app/hệ điều hành. Bù bo góc nền kính và dọn will-change sau khi xong. Giữ fallback thu/mở tức thời nếu trình duyệt không có Web Animations API.
- File đã đổi: frontend/web/src/{App.tsx,styles.css,components/{PageHeader.tsx,Sidebar.tsx,ui.tsx},hooks/useSidebarMotion.ts,lib/data.ts,views/Dashboard.tsx}, frontend/web/tests/{app.test.mjs,data.test.mjs,motion.test.mjs}, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không. Không đổi API, dữ liệu hoặc hạ tầng của module khác.
- Kiểm tra: npm run test:ui đạt 47/47, bao gồm xuất CSV, branding/header, tìm kiếm, đảo chiều và cancellation của chuyển động, giảm chuyển động, resize/unmount và fallback. npm run build và git diff --check được chạy trước khi commit. Các kiểm thử chuyển động dùng rect/WAAPI giả, không đo FPS.
- Lỗi gặp / đang dở: browser access host vẫn unavailable khi thử lại, chưa xác nhận hình ảnh/FPS trên trình duyệt thật. Backend M1/M5 còn chờ như mục trước. Không khẳng định đạt 60fps hoặc khớp pixel với ảnh/video.
- Việc tiếp theo: kiểm tra header/thu-mở sidebar ở màn hình lớn và điện thoại; vào lịch sử, tải thêm trang nếu có rồi bấm Xuất báo cáo để thử CSV bằng Excel.
- Cần báo module khác: không có yêu cầu mới.

### 2026-11-05: Sidebar Liquid Glass theo video tham chiếu
- Đã làm: đọc video 1793878216867_192046527460282917_6446778780327023864.mp4 (9,7 giây, 30fps); trích khung hình tổng thể và từng 2 frame quanh đoạn mở. Quan sát sidebar hẹp dạng viên, nở hai chiều quanh tâm dọc, viền sáng mảnh, pill chọn mục giãn từ tròn thành dài và chữ hiện trễ. Đo đoạn mở chính khoảng 2,43–2,90 giây; đoạn cuối video phủ lớp tối trước khi thấy đầy đủ một lần đóng.
- Triển khai: khung sidebar trong hơn, gradient phản sáng và blur cố định 18px; chuyển kích thước/bo góc 460ms với easing giảm tốc; chữ hiện sau 120ms và mờ trước khi đóng. Đảo cùng trạng thái CSS để đóng/mở và bấm đảo chiều giữa chừng không cần khóa hay bộ đếm JavaScript. Nội dung chính thay đổi bề rộng cùng nhịp; không thêm thư viện hay đặt bộ lọc SVG toàn màn hình.
- Chi tiết: nút tròn nằm sát mép bên phải, chevron xoay theo trạng thái; tooltip kính khi dùng chuột/bàn phím ở thanh hẹp. Đưa tìm kiếm desktop vào sidebar, giữ tìm kiếm/menu trên topbar cho mobile. Giữ logo HCMUTE và AWS cùng màu nền hiện tại; không thêm thông tin tài khoản giả từ video.
- File đã đổi: frontend/web/src/components/Sidebar.tsx, frontend/web/src/App.tsx, frontend/web/src/styles.css, frontend/web/tests/app.test.mjs, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Kiểm tra: npm run test:ui đạt 38/38, thêm thao tác thu hẹp, tooltip/focus, tìm kiếm và bấm đóng/mở liên tục; kiểm tra TypeScript/build. Trình duyệt báo browser access host is unavailable khi thử kết nối lại, nên chưa xác nhận hình ảnh, FPS hoặc khớp từng pixel với video trên máy thật. Các phép kiểm thử DOM không đo chuyển động.
- Quyết định và lý do: tách phần sidebar khỏi App để dễ đọc; chỉ dùng CSS cho chuyển động, giữ các ô kính rời đã làm ở lượt trước. Ảnh trích video chỉ dùng phân tích tạm trong cache, không đưa vào mã nguồn hoặc bản build.
- Lỗi gặp / đang dở: cần đối chiếu trực quan hai chiều trên máy thật; không khẳng định giống 100% khi chưa có preview chạy được.
- Việc tiếp theo: tải lại web, thử nút mũi tên cạnh logo, bấm đảo chiều giữa chừng và thử tùy chọn Giảm chuyển động.
- Cần báo module khác: không có thay đổi giao diện API; các phần backend M1/M5 còn chờ như mục trước.

### 2026-11-05: Tách các ô kính, tinh gọn code và kiểm tra luồng M4
- Đã làm: bỏ nền/viền/blur của workspace; thanh trên, ô nhập, cài đặt giọng và trình phát dùng cùng một công thức kính riêng, nền trắng khoảng 50% để thấy màu xanh phía sau. Giữ sóng 3D, màu slate, chế độ tương phản cao, giảm chuyển động và fallback cho trình duyệt không hỗ trợ blur.
- Dọn code: thay bộ bọc nút Glisse có so sánh cây React bằng nút HTML và CSS; bỏ hai lớp div glass-layer, CSS/biến bị lặp, classname và export không dùng. Gộp kiểm thử nút gạt/menu thành controls.test.mjs, API/tài liệu thành data.test.mjs và dùng chung environment.mjs; xóa các file cũ sau khi gộp. Đổi build sang tsc --noEmit để không tạo tsconfig.tsbuildinfo; dọn tệp này và dist sau khi xác nhận build.
- Sửa lỗi từ lượt rà soát trước: nút play trong Tổng quan/lịch sử thực sự phát và đổi biểu tượng khi tạm dừng; bật tiếng trở về âm lượng trước; vô hiệu tải MP3 khi chỉ nghe giọng thiết bị. Modal đang xóa không tự đóng bởi Escape; sidebar thu gọn và ghi nhớ; tiêu đề tab/shortcut/focus rõ hơn. Không báo dữ liệu trống khi đang tải hoặc tải lỗi; bỏ phản hồi giọng/bản thu cũ khi người dùng đã chọn mới.
- Luồng 4.3–4.5: gọi /text/correct một lần khi nhấn tạo, hiển thị bản gốc/bản sửa và đánh dấu thay đổi; giữ nguyên bản gốc nếu kiểm tra lỗi hoặc người dùng chọn giữ. Không gửi trùng, không kiểm tra lần hai sau khi chọn; bỏ đề xuất cũ nếu đầu vào đổi. Không đổi hợp đồng API.
- File đã đổi: frontend/web/src/{App.tsx,styles.css,components/,hooks/useStudio.ts,lib/{api.ts,types.ts},views/Dashboard.tsx}, frontend/web/tests/, frontend/web/package.json, frontend/README.md, logs/log-m4.md, docs/tasks/task-m4.md.
- Tài nguyên AWS đã tạo/sửa (tên, region): không; toàn bộ kiểm thử dùng mô phỏng, không gọi dịch vụ tính phí.
- Kiểm tra: npm run test:ui đạt 37/37, gồm điều khiển, điều hướng, modal, âm thanh, duyệt lỗi đánh máy, phản hồi đến không đúng thứ tự, dữ liệu API và tài liệu. npm run build đạt. Chưa xác nhận hình ảnh hoặc FPS trên trình duyệt thực vì browser access host chưa kết nối.
- Lỗi gặp / đang dở: không có lỗi kiểm thử/build. Chưa hoàn tất bước 4.11 hoặc triển khai AWS. git pull ở đầu lượt rà soát bị sandbox chặn ghi .git/FETCH_HEAD; không thay đổi cấu hình Git chung.
- Việc tiếp theo: xem các ô kính rời trên màn hình lớn/điện thoại; thử dịch, nhập tài liệu và tạo/tải MP3 với API thật sau khi backend sẵn sàng.
- Cần báo module khác: M5 hoàn thiện backend/submit (hiện trả NOT_IMPLEMENTED/501) và /text/correct; M1 nối các route API trong SAM. Không sửa file của M1/M5.

### 2026-11-05: Bỏ khung trang trí bọc icon
- Đã làm: bỏ span bọc cùng nền/viền/bo góc của hai icon Dịch và đọc, Đọc tài liệu; hiển thị SVG trực tiếp trên card và chỉnh lại selector căn chữ/mũi tên. Bỏ vòng viền trang trí quanh icon bản thu gần đây.
- File đã đổi: `frontend/web/src/views/Dashboard.tsx`, `frontend/web/src/styles.css`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: giảm các lớp trang trí theo ảnh người dùng gửi, giữ bộ icon hiện tại, tông xanh slate và sóng 3D.
- Kiểm tra: `npm.cmd run build` và `git diff --check` thành công. Chưa kiểm tra trực quan trên trình duyệt qua công cụ.
- Lỗi gặp / đang dở: không có lỗi build; cần người dùng đối chiếu hình ảnh cuối.
- Việc tiếp theo: tải lại trang Tổng quan để xem icon trực tiếp trên card.
- Cần báo module khác: không.

### 2026-11-05: Hoàn thiện sóng 3D, kính và sửa các điều khiển
- Đã làm: rà giao diện từ code và ảnh người dùng cung cấp. Giữ sóng 3D làm điểm nhấn theo yêu cầu, chỉnh góc nhìn, cạnh vát, phản sáng, bóng nền và chuyển động nhỏ hơn. Thêm nền xanh slate chuyển động chậm bằng transform; điều chỉnh độ trong sidebar/khung nội dung và giữ blur vừa phải, có fallback và chế độ tương phản cao/giảm chuyển động. Rút gọn copy bị lặp, thêm hành động cho lịch sử trống và bỏ kéo giãn hàng card dưới.
- Đã sửa điều khiển: thay Glisse Switch bằng nút gạt có một núm CSS được giới hạn trong track, xử lý click sau kéo, hủy kéo và bàn phím. Cơ chế cũ có lớp phóng đại SVG và quy tắc scale chồng thêm khi giảm chuyển động, phù hợp lỗi ảnh người dùng gửi. Thay cả bốn native select bằng Radix Select dùng chung (ngôn ngữ gốc/đích, lọc giọng, lọc lịch sử); menu portal vào dialog khi nằm trong dialog để tránh bị che bởi top layer.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/components/PreferenceSwitch.tsx`, `frontend/web/src/components/Select.tsx`, `frontend/web/src/views/Dashboard.tsx`, `frontend/web/src/styles.css`, `frontend/web/tests/preference-switch.test.mjs`, `frontend/web/tests/select.test.mjs`, `frontend/web/package.json`, `frontend/web/package-lock.json`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: giữ bố cục và điểm nhấn sóng 3D người dùng thích. Dùng Radix Select để tái sử dụng hành vi focus, bàn phím và định vị menu; chỉ thêm happy-dom vào devDependencies để kiểm thử tương tác, không thêm thư viện chuyển động. Không sửa mã node_modules hay API.
- Kiểm tra: `npm run test:ui` đạt 10 kiểm thử (gồm hai nhóm), bao gồm click một lần, kéo hai chiều, giới hạn biên, hủy kéo, bàn phím, chọn/đóng menu và portal đúng dialog. Build thành công; `git diff --check` đạt. Các kiểm thử DOM không xác nhận hình ảnh hay FPS.
- Lỗi gặp / đang dở: browser access host chưa kết nối, nên không kiểm tra trực quan lần cuối qua công cụ. Ảnh người dùng là căn cứ xác định native dropdown và hai khung kính; cần người dùng đối chiếu bản cuối. Nếu nền/sóng không chạy, kiểm tra “Giảm chuyển động” trong Cài đặt và thiết lập giảm chuyển động của hệ điều hành.
- Việc tiếp theo: mở chọn ngôn ngữ ở trang tạo giọng, dịch, chọn giọng trong dialog và lịch sử; thử kéo/tap các nút gạt trên máy tính/điện thoại; kiểm tra độ mượt trên máy thật.
- Cần báo module khác: không; không đổi quy ước hoặc tài nguyên AWS.

### 2026-11-05: Đồng bộ icon phong cách iOS bằng Framework7 Icons
- Đã làm: tìm trên GitHub và web, đối chiếu SF Symbols và Framework7 Icons. Chọn https://github.com/framework7io/framework7-icons (MIT), không dùng bộ SF Symbols chính thức của Apple. Thay toàn bộ 32 ánh xạ icon dùng chung và spinner bằng SVG cùng bộ; biểu tượng Dịch và đọc dùng TextBubbleFill thay hai mũi tên. Sidebar, công cụ, trình phát, tìm kiếm, cài đặt và thông báo tự dùng bộ mới qua component Icon.
- File đã đổi: `frontend/web/src/components/ui.tsx`, `frontend/web/src/framework7-icons.d.ts`, `frontend/web/src/styles.css`, `frontend/web/package.json`, `frontend/web/package-lock.json`, `frontend/web/public/licenses/framework7-icons.txt`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: Framework7 là bộ iOS được phép dùng trên web theo MIT, phù hợp hướng hình ảnh Apple. Import trực tiếp từng SVG React để không tải cả bộ hoặc font/CDN; gỡ dependency Lucide cũ. Thêm khai báo kiểu TypeScript ngắn vì package chưa cung cấp kiểu; giữ giấy phép trong public/licenses để bản build cũng có thông báo bản quyền.
- Lỗi gặp / đang dở: build lần đầu phát hiện prop size của Lucide không phù hợp SVG mới, đã đổi thành width/height. Build cuối thành công; kiểm tra render server cho 32 SVG và spinner đạt, đúng kích thước và aria-hidden; `git diff --check` đạt. Chưa kiểm tra trực quan trên trình duyệt.
- Việc tiếp theo: tải lại trang, kiểm tra icon Dịch và đọc, sidebar và các nút trình phát trên máy tính/điện thoại.
- Cần báo module khác: không; không đổi API hay hạ tầng.

### 2026-11-05: Đổi palette trắng sữa và xanh slate theo ảnh tham chiếu
- Đã làm: đổi nền nhiều màu thành trắng lạnh với một vùng xanh xám khuếch tán phía trên; giảm độ bão hòa kính, dùng viền trắng và bóng mềm; đổi màu nhấn, nút, thanh âm lượng, tiến độ và sóng âm sang xanh slate. Gom palette dùng chung vào biến CSS và thêm nền đặc dự phòng khi không hỗ trợ backdrop-filter. Chỉ sửa giao diện trong `styles.css`.
- File đã đổi: `frontend/web/src/styles.css`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: áp dụng màu và cảm giác vật liệu từ ảnh Payno người dùng gửi, giữ nguyên bố cục hiện tại sau khi người dùng hủy bản thiết kế lại Tổng quan. Dùng gradient tĩnh, không thêm thư viện, ảnh, vòng lặp hay hiệu ứng chuyển động.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trong trình duyệt. `npm.cmd run build` và `git diff --check` thành công. Kiểm tra toán học hai cặp màu: chữ trắng trên nút #435f87 đạt 6,51:1; chữ phụ #606c7b trên nền #f1f5f8 đạt 4,88:1; chưa đánh giá toàn bộ các trạng thái kính.
- Việc tiếp theo: tải lại trang, đối chiếu màu nền và độ rõ chữ trên máy tính/điện thoại với ảnh tham chiếu.
- Cần báo module khác: không; không đổi API hay hạ tầng.

### 2026-11-05: Bỏ viền chồng và giảm tải chuyển động kính
- Đã làm: xem ảnh người dùng gửi và đọc mã Glisse 0.5.0 trong node_modules. Nút màu đặc không còn dùng LiquidButton, tránh chồng mép SVG lên viền CSS. Bỏ `data-glisse-backdrop` vì chế độ này tạo vòng requestAnimationFrame để theo dõi các lớp kính và lọc nền toàn màn hình. Thay hai lớp Glass lớn ở thanh trên/trình phát bằng div kính CSS; giữ khúc xạ thật ở điều hướng và nút trong suốt. Giảm blur panel từ 20px xuống 14px, bỏ transform CSS trùng với spring của nút Glisse, bỏ dịch chuyển toàn bộ trang khi chuyển màn và làm dịu chuyển động mục điều hướng.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/AudioPlayer.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/styles.css`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: lần tích hợp trước dùng khúc xạ trên vùng quá rộng. Ưu tiên độ mượt bằng cách giới hạn bộ lọc SVG vào bề mặt nhỏ; Safari/Firefox giữ kính mờ và mép sáng. Không sửa mã thư viện, không thêm dependency.
- Lỗi gặp / đang dở: chưa xác nhận trực quan hoặc đo FPS trên máy người dùng. Đã chạy lại `npm.cmd run build` sau thay đổi cuối cùng thành công; `git diff --check` đạt.
- Việc tiếp theo: người dùng tải lại web, kiểm tra nút tạo giọng, chuyển trang và kéo thanh tốc độ; nếu còn giật cần đo Performance trên trình duyệt thực tế.
- Cần báo module khác: không.

### 2026-11-05: Tích hợp Liquid Glass bằng Glisse
- Đã làm: tìm và đối chiếu các thư viện miễn phí trên GitHub; chọn mở rộng Glisse 0.5.0 đã có trong repo (https://github.com/0kzh/glisse, giấy phép MIT). Dùng Glass cho mục điều hướng đang chọn, thanh trên và nền trình phát; dùng nút kính cho tìm kiếm, chọn giọng và nút phụ. Thêm một nền màu tĩnh để khúc xạ, chỉnh độ trong, mép kính và bóng bằng CSS; giữ tùy chọn tương phản cao và giảm chuyển động. Chạy `npm.cmd run build` và `git diff --check` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/components/AudioPlayer.tsx`, `frontend/web/src/components/ui.tsx`, `frontend/web/src/styles.css`, `frontend/README.md`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: tái sử dụng một thư viện MIT đang có, không thêm dependency hoặc file hiệu ứng riêng. Các lớp Glass dùng memo và không chứa nội dung thay đổi để tránh dựng lại khúc xạ khi gõ chữ hoặc khi thời gian phát đổi. Nền được đánh dấu `data-glisse-backdrop` theo cơ chế của thư viện.
- Lỗi gặp / đang dở: chưa xác nhận hình ảnh trên trình duyệt; công cụ computer-use dừng vì không xác minh được URL tab Chrome, nên không tiếp tục điều khiển UI. `git pull` vẫn bị chặn quyền ghi `.git/FETCH_HEAD` trong sandbox. Chưa xác nhận giống hoàn toàn giao diện iOS gốc hoặc hiệu năng trên điện thoại.
- Việc tiếp theo: chạy `npm run dev` tại `frontend/web`, kiểm tra trang tạo giọng, tổng quan, menu và trình phát trên máy tính/điện thoại; kiểm tra thêm Safari/Firefox.
- Cần báo module khác: không; không đổi API hay tài nguyên AWS.

### 2026-11-05: Đặt tên ứng dụng là TTS Studio
- Đã làm: đổi tên bên dưới logo, tiêu đề menu điện thoại, tiêu đề tab và mô tả trang thành “TTS Studio”. Chạy `npm.cmd run build` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/index.html`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: dùng tên “TTS Studio” do người dùng chọn; mô tả trang vẫn nêu chức năng chuyển văn bản thành giọng nói đa ngôn ngữ.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trên trình duyệt.
- Việc tiếp theo: tải lại trang để xem tên mới và tiếp tục đối chiếu bước 4.1.
- Cần báo module khác: không.

### 2026-11-05: Đổi nhãn giao diện cho đúng đề tài
- Đã làm: đổi nhãn bên dưới logo và tiêu đề menu trên điện thoại thành “Chuyển văn bản thành giọng nói”; bỏ chữ “Phòng thu” khỏi mô tả trang; căn giữa và cho nhãn xuống dòng. Chạy `npm.cmd run build` thành công.
- File đã đổi: `frontend/web/src/App.tsx`, `frontend/web/src/styles.css`, `frontend/web/index.html`, `logs/log-m4.md`, `docs/tasks/task-m4.md`.
- Tài nguyên AWS đã tạo/sửa (tên, region): không.
- Quyết định và lý do: dùng tên chức năng chính của đề tài thay cho tên phòng thu âm.
- Lỗi gặp / đang dở: chưa kiểm tra trực quan trên trình duyệt; đầu phiên `git pull` bị chặn quyền ghi `.git/FETCH_HEAD` trong môi trường agent.
- Việc tiếp theo: kiểm tra hiển thị nhãn trên máy tính và điện thoại.
- Cần báo module khác: không.

## 2026-11-08 — Tổ chức repo theo thành viên và sửa timeline web

Phạm vi được người dùng giao bao trùm repo; tên thư mục kỹ thuật dùng tiếng Anh thông dụng, hướng dẫn giữ tiếng Việt. Trạng thái: CODED & LOCALLY TESTED; không gọi AWS/Azure, không deploy, không commit/push trong lượt này.

- Backend chia `m1-minh-ly`, `m2-trung-khang`, `m3-trung-duc`, `m5-trung-nghia`; mỗi owner có README nhiệm vụ, CHANGELOG, code theo chức năng, infra và tests. Common Layer/fixture S3 thuộc M3; namespace `tts_common` được giữ.
- Frontend giữ `web` và `app` theo cấu trúc công cụ chuẩn. Root SAM/config/scripts chuyển vào `deployment`; tài liệu chung còn trong `docs`. Giữ riêng `docs/AZURE-SPEECH.md`; sửa import, CodeUri/ContentUri/Location, script root, đường dẫn tài liệu và PR template.
- Gộp task vào README owner, giữ checkbox và lịch sử cũ, bỏ bản đồ tài liệu trùng và banner không còn dùng. Dọn comment/docstring lặp; giữ invariant bảo mật/concurrency, directive và giấy phép. Rút gọn bảng route M1 và dùng chung hằng đường dẫn registry trong script Azure.
- Web tách `usePlayback`: MP3 dùng currentTime/duration thực, không khởi tạo duration bằng số ký tự. Metadata muộn, seek/pause/ended/repeat, đổi bản thu/URL và promise cũ được xử lý theo phiên phát. Giọng thiết bị dùng thời gian đọc thực, không đoán tổng duration trước khi kết thúc; tiến độ theo nội dung đọc. Bỏ transition gây trễ timeline, căn range và chặn co quá mức; thêm mô tả tiến độ cho trình đọc màn hình.
- AGENTS ghi đầy đủ owner, gate, dependencies, acceptance, lệnh kiểm tra và giới hạn triển khai. Ghi rõ bản Azure/Function URL/S3 JSON chưa đáp ứng ba dịch vụ bắt buộc trong đề nếu chưa có chấp thuận của giảng viên. Quyết định môi trường/ngoại lệ còn chờ; không tự bật Polly/DynamoDB/API Gateway.

Kiểm tra đã chạy:

- Backend: M1 15, M2 64, M3 43, M5 21 tests PASS (143 tổng; storage tests chuyển về M3).
- Web: clean npm ci, TypeScript/production build và 69 tests PASS, gồm timeline MP3, giọng thiết bị và race khi đổi URL/bản thu.
- App: clean npm ci/prepare, typecheck, lint và 22 tests PASS; Expo export tạo bundle iOS và Android thành công.
- Chrome local: 7 trang ở 320/390/768/1440/2560 px với sáng/tối, không phát hiện tràn ngang hoặc lỗi JavaScript. MP3 mẫu 12 giây phát/dừng/tua/phát tiếp đúng đồng hồ. Dữ liệu/API/âm thanh mẫu nằm ngoài repo, chỉ dùng localhost.
- cfn-lint đạt cho root và 5 template con; audit đường dẫn đóng gói tồn tại, cấu hình resource/permission không đổi; hai registry nguồn/Layer đồng bộ và link tài liệu local hợp lệ.

Giới hạn: chưa kiểm trên iPhone/Android thật hoặc phiên Sandbox mới; browser/export/mock không chứng minh các phần đó đã đạt. M4 checklist không được tick thêm do lượt kiểm tra local này. Hướng dẫn deploy sau tổ chức lại dùng `python3 deployment/scripts/azure.py ...` và `bash deployment/scripts/sandbox.sh ...` từ gốc repo.

## 2026-11-08 — Hoàn thiện README và bàn giao cây thư mục

Người dùng yêu cầu rà soát toàn bộ thay đổi, khôi phục hình AWS trong README, commit với tên `cấu hình lại cây thư mục` và đồng bộ main cùng năm nhánh thành viên bằng cập nhật giữ nguyên lịch sử.

- README gốc viết lại: banner AWS và hai logo cũ, mục lục, chức năng/trạng thái, đối chiếu đề bài, kiến trúc, công nghệ, cây thư mục, phân công, local/env, API, triển khai thủ công, kiểm thử, cấu hình/bảo mật, Git và xử lý sự cố. Banner đã được khôi phục nguyên bản; hướng dẫn Azure giữ tại `docs/AZURE-SPEECH.md`.
- Rà hướng dẫn M4 theo cấu trúc mới, bỏ tham chiếu mục cũ và phân biệt cách lưu demo token hiện có với thiết kế dự kiến. Không tick thêm nhiệm vụ AWS hoặc thay đổi bằng chứng của thành viên khác.
- Rà soát lại: backend 143 tests, web production build và 69 tests, app typecheck/lint và 22 tests, export iOS/Android đều đạt. cfn-lint đạt root + 5 template con; đường dẫn đóng gói và registry đồng bộ, logical ID/resource properties/permissions không đổi.
- Markdown được render để kiểm liên kết, heading anchors và ảnh local; bản xem trước desktop/mobile phục vụ kiểm tra, không đưa vào repo. Giấy phép, lockfile, tests và lịch sử cũ được giữ; cache/dependency/build/env không đưa vào commit.
- Việc kiểm tra và đồng bộ Git không gọi AWS/provider hoặc triển khai tài nguyên. Kiểm trên thiết bị thật và phiên Sandbox mới vẫn cần thực hiện riêng.
