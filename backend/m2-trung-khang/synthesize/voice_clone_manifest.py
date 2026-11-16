"""Pinned ONNX files used by the optional VieNeu provider."""

VIE_REVISION = "61b85e3d937fbbacb387714180e8182823512523"
CODEC_REVISION = "ceff0d0749bfb3fa2d61149794ec6feef0d1e1ae"
MODEL_REPO = "pnnbao-ump/VieNeu-TTS-v3-Turbo"
CODEC_REPO = "OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX"
ARTIFACTS = {
    "model": {
        "denoiser.onnx": "b7621953291cfe05e695a9c0ff4255aa2f93239fc17c26627e18b7b6b8f72f0b",
        "speaker_encoder.onnx": "a6ac6a63997761ae2997373e2ee1c47040854b4b759ea41ec48e4e42df0f4d73",
        "onnx_int8/config.json": "", "onnx_int8/tokenizer.json": "",
        "onnx_int8/vieneu_acoustic_cached.onnx": "f631e3387c788c3d8b9a5ac5df94952af5bc4c4d1049ff8a751e76a246fff2d4",
        "onnx_int8/vieneu_backbone_shared.data": "bb683925f7c8d826fadca4f8a0252ae4d5fc5b7837c14f6857e18f4c6666588d",
        "onnx_int8/vieneu_decode_step.onnx": "2c5b30bd8ccb751c58d651f44c074df10c4113efd08719adaa8e3dec6a6ce2ca",
        "onnx_int8/vieneu_prefill.onnx": "c6a80dabf67c820de798f8deb7d4e0f37d81b5d76e33fbe20ab5a67f2d371f4e",
        "onnx_int8/vieneu_v3_heads.npz": "fb22484baa424bbb775133a6e5f0d00d6299b2b256fbe3312a864b85b9aed01e",
    },
    "codec": {
        "moss_audio_tokenizer_decode_full.onnx": "0fbbafe3fd4afa2a019af5c5ced204af6e2d1db044fa40f021525d2aee95b4ac",
        "moss_audio_tokenizer_decode_shared.data": "e69d52e0f4e84ca27850557ee54face46632d3a5a16c89bd246c7c408466dcad",
        "moss_audio_tokenizer_decode_step.onnx": "9527c86a29e1837edec1f74db57d5eeaadb3a715af3382703566460afed25855",
        "codec_browser_onnx_meta.json": "",
        "moss_audio_tokenizer_encode.onnx": "eadea4a645abdcf98714c7aead122ee2ce7da6e080f9f80b977cd1ca8e19473a",
        "moss_audio_tokenizer_encode.data": "aa751265b2bab2887eac224484546b194875aa7494b607115439b3dc6b228a2c",
    },
}
