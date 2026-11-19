"""VieNeu ONNX CPU voice cloning, lazily loaded and cached per Lambda process."""

import hashlib
import os
import tempfile
from pathlib import Path

from .base import PermanentProviderError
from voice_clone_manifest import ARTIFACTS, CODEC_REVISION


_MODEL = None


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _fetch_model():
    local = os.environ.get("VOICE_CLONE_MODEL_DIR")
    cache = os.environ.get("VOICE_CLONE_CACHE_DIR")
    if local and Path(local).is_dir():
        model_dir = Path(local)
        os.environ["HF_HOME"] = cache or str(model_dir.parents[3])
        return model_dir
    bucket, prefix = os.environ.get("VOICE_CLONE_MODEL_BUCKET"), os.environ.get("VOICE_CLONE_MODEL_PREFIX", "")
    if not bucket or not prefix:
        raise PermanentProviderError("VOICE_CLONE_MODEL_MISSING", "VieNeu chưa được cài trên máy chủ.")
    from tts_common import aws
    root = Path("/tmp/voice-clone")
    model_dir, cache_dir = root / "model", root / "hf-cache"
    client = aws.s3()
    for folder, files in ARTIFACTS.items():
        destination = model_dir if folder == "model" else cache_dir / "hub" / f"models--OpenMOSS-Team--MOSS-Audio-Tokenizer-Nano-ONNX" / "snapshots" / CODEC_REVISION
        for name, expected in files.items():
            path = destination / name if folder == "model" else destination / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.is_file() and (not expected or _sha256(path) == expected):
                continue
            path.unlink(missing_ok=True)
            client.download_file(bucket, f"{prefix.rstrip('/')}/{folder}/{name}", str(path))
            if expected and _sha256(path) != expected:
                path.unlink(missing_ok=True)
                raise PermanentProviderError("VOICE_CLONE_MODEL_CHECKSUM", "Tệp VieNeu tải về không hợp lệ.")
    refs = cache_dir / "hub" / "models--OpenMOSS-Team--MOSS-Audio-Tokenizer-Nano-ONNX" / "refs"
    refs.mkdir(parents=True, exist_ok=True)
    (refs / "main").write_text(CODEC_REVISION, encoding="ascii")
    os.environ["HF_HOME"] = str(cache_dir)
    os.environ["HF_HUB_OFFLINE"] = "1"
    return model_dir


def _model():
    global _MODEL
    if _MODEL is None:
        from vieneu import Vieneu
        model_dir = _fetch_model()
        _MODEL = Vieneu(backend="onnx", precision="int8", threads=4,
                        backbone_repo=str(model_dir), onnx_repo=str(model_dir),
                        onnx_dir=str(model_dir / "onnx_int8"))
    return _MODEL


class VieNeuProvider:
    def __init__(self, user_id, profile, settings, timeout):
        self.user_id, self.profile, self.settings, self.timeout = user_id, profile, settings, timeout

    def synthesize(self, text, voice, speed):
        if voice != self.profile["voiceProfileId"]:
            raise PermanentProviderError("VOICE_PROFILE_NOT_FOUND", "Không tìm thấy hồ sơ giọng.")
        from tts_common import aws, config
        response = aws.s3().get_object(Bucket=config.JOBS_BUCKET, Key=self.profile["referenceKey"])
        audio = response["Body"].read()
        response["Body"].close()
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix="voice-clone-", suffix=".wav", delete=False) as sample:
                temp_path = sample.name
                sample.write(audio)
            import lameenc
            import numpy as np
            model = _model()
            wave = model.infer(text, ref_audio=temp_path, denoise=self.settings["denoise"],
                               use_ref_codes=self.settings["useRefCodes"], temperature=self.settings["temperature"])
            if speed != 1:
                import librosa
                wave = librosa.effects.time_stretch(wave, rate=speed)
            pcm = (np.clip(wave, -1, 1) * 32767).astype("<i2").tobytes()
            encoder = lameenc.Encoder(); encoder.set_bit_rate(128); encoder.set_in_sample_rate(48000)
            encoder.set_out_sample_rate(48000); encoder.set_channels(1); encoder.set_quality(2)
            return encoder.encode(pcm) + encoder.flush()
        except PermanentProviderError:
            raise
        except ImportError:
            raise PermanentProviderError("VOICE_CLONE_DEPENDENCY_MISSING", "VieNeu thiếu thư viện cần thiết trên máy chủ. Cài các gói VOICE-02 vào Python đang chạy backend.") from None
        except Exception as error:
            raise PermanentProviderError("VOICE_CLONE_FAILED", "VieNeu chưa tạo được audio. Hãy kiểm tra mẫu giọng hoặc thử lại.") from error
        finally:
            if temp_path:
                Path(temp_path).unlink(missing_ok=True)
