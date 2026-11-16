"""Tải model ONNX được pin và kiểm SHA-256, ngoài Git."""

import argparse
import hashlib
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "synthesize"))
from voice_clone_manifest import VIE_REVISION, CODEC_REVISION, MODEL_REPO, CODEC_REPO, ARTIFACTS


FILES = {MODEL_REPO: (VIE_REVISION, ARTIFACTS["model"]),
         CODEC_REPO: (CODEC_REVISION, ARTIFACTS["codec"])}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Prepare pinned VieNeu ONNX CPU artifacts")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    cache_dir = args.output_dir / "hf-cache" / "hub"
    os.environ["HF_HOME"] = str(args.output_dir / "hf-cache")
    from huggingface_hub import hf_hub_download

    for repo, (revision, files) in FILES.items():
        folder = "model" if repo.startswith("pnnbao-") else "codec"
        for name, expected in files.items():
            cached = Path(hf_hub_download(repo, name, revision=revision, cache_dir=cache_dir))
            if expected and sha256(cached) != expected:
                raise RuntimeError(f"SHA-256 mismatch: {repo}/{name}")
            print(f"OK {folder}/{name} {cached.stat().st_size} bytes")
        cache_name = repo.replace("/", "--")
        refs = args.output_dir / "hf-cache" / "hub" / f"models--{cache_name}" / "refs"
        refs.mkdir(parents=True, exist_ok=True)
        (refs / "main").write_text(revision, encoding="ascii")
    model_snapshot = (args.output_dir / "hf-cache" / "hub" /
                      "models--pnnbao-ump--VieNeu-TTS-v3-Turbo" / "snapshots" / VIE_REVISION)
    print(f"Model directory: {model_snapshot}")
    print("Pinned ONNX artifacts are ready.")


if __name__ == "__main__":
    main()
