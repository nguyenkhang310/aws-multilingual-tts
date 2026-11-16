"""Thử VieNeu-TTS trên CPU, tách biệt khỏi Lambda và API sản phẩm.

Chỉ dùng mẫu giọng do người chạy có quyền sử dụng; giữ đầu vào và đầu ra
trong thư mục thử nghiệm cục bộ đã được Git ignore.
"""

import argparse
import json
import os
import time
from pathlib import Path


SENTENCES = (
    "Xin chào, đây là bản thử giọng tiếng Việt.",
    "Hôm nay chúng ta cùng nghe một câu chuyện ngắn về Sài Gòn.",
)


def validate_reference(path):
    import soundfile as sf

    if not path.is_file() or path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Mẫu giọng phải là tệp WAV có dung lượng không quá 2 MiB.")
    info = sf.info(path)
    seconds = info.frames / info.samplerate
    if info.format != "WAV" or not 3 <= seconds <= 8 or info.channels not in (1, 2):
        raise ValueError("Cần WAV 3–8 giây, một hoặc hai kênh.")
    return round(seconds, 3)


def encode_mp3(audio):
    import lameenc
    import numpy as np

    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(128)
    encoder.set_in_sample_rate(48000)
    encoder.set_out_sample_rate(48000)
    encoder.set_channels(1)
    encoder.set_quality(2)
    return encoder.encode(pcm) + encoder.flush()


def main():
    parser = argparse.ArgumentParser(description="Smoke test VieNeu-TTS v3 Turbo ONNX CPU")
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--consent", action="store_true", help="Xác nhận có quyền dùng mẫu giọng")
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    if not args.consent:
        parser.error("Cần --consent để xác nhận quyền sử dụng mẫu giọng.")
    if not 1 <= args.threads <= 8:
        parser.error("--threads cần trong khoảng 1–8.")
    reference_seconds = validate_reference(args.reference)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    os.environ["HF_HOME"] = str(args.cache_dir)
    os.environ["HF_HUB_OFFLINE"] = "1"
    from vieneu import Vieneu
    import psutil

    process = psutil.Process()
    start = time.monotonic()
    model = Vieneu(backend="onnx", precision="int8", threads=args.threads,
                   backbone_repo=str(args.model_dir), onnx_repo=str(args.model_dir),
                   onnx_dir=str(args.model_dir / "onnx_int8"))
    init_seconds = round(time.monotonic() - start, 2)
    init_rss_mb = round(process.memory_info().rss / 1024**2, 1)
    results = []
    for index, sentence in enumerate(SENTENCES, start=1):
        start = time.monotonic()
        audio = model.infer(sentence, ref_audio=str(args.reference), denoise=True)
        path = args.output_dir / f"sample-{index}.mp3"
        path.write_bytes(encode_mp3(audio))
        results.append({"file": str(path), "seconds": round(time.monotonic() - start, 2),
                        "audioSeconds": round(len(audio) / 48000, 2), "bytes": path.stat().st_size,
                        "rssMb": round(process.memory_info().rss / 1024**2, 1)})
    print(json.dumps({"engine": "vieneu-3.8.4/onnx-int8", "referenceSeconds": reference_seconds,
                      "initSeconds": init_seconds, "initRssMb": init_rss_mb,
                      "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
