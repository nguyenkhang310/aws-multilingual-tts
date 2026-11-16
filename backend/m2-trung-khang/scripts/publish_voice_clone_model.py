"""Upload only pinned VieNeu model artifacts to a private jobs-bucket prefix."""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'synthesize'))
from voice_clone_manifest import ARTIFACTS, CODEC_REPO, CODEC_REVISION, MODEL_REPO, VIE_REVISION


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def source_path(root, repo, revision, name):
    snapshot = root / 'hf-cache' / 'hub' / f'models--{repo.replace("/", "--")}' / 'snapshots' / revision
    return snapshot / name


def publish(root, bucket, prefix, region):
    import boto3

    if not re.fullmatch(r'[a-z0-9.-]{3,63}', bucket) or not re.fullmatch(r'[A-Za-z0-9/_-]{1,180}', prefix):
        raise ValueError('Bucket hoặc prefix không hợp lệ.')
    prefix = prefix.strip('/')
    client = boto3.client('s3', region_name=region)
    marker = f'{prefix}/_READY.json'
    client.delete_object(Bucket=bucket, Key=marker)
    manifest = {'modelRevision': VIE_REVISION, 'codecRevision': CODEC_REVISION, 'files': []}
    sources = {'model': (MODEL_REPO, VIE_REVISION), 'codec': (CODEC_REPO, CODEC_REVISION)}
    for folder, files in ARTIFACTS.items():
        repo, revision = sources[folder]
        for name, expected in files.items():
            path = source_path(root, repo, revision, name)
            if not path.is_file() or expected and sha256(path) != expected:
                raise ValueError(f'Artifact thiếu hoặc checksum sai: {folder}/{name}')
            key = f'{prefix}/{folder}/{name}'
            client.upload_file(str(path), bucket, key, ExtraArgs={
                'ContentType': 'application/octet-stream', 'ServerSideEncryption': 'AES256'})
            manifest['files'].append({'key': key, 'sha256': sha256(path), 'bytes': path.stat().st_size})
    client.put_object(Bucket=bucket, Key=marker, Body=json.dumps(manifest).encode(),
                      ContentType='application/json', ServerSideEncryption='AES256')
    return len(manifest['files'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, required=True, help='voice02-local/model từ script prepare_voice_clone_model.py')
    parser.add_argument('--bucket', required=True, help='JobsBucketName của stack hiện tại')
    parser.add_argument('--prefix', default='voice-clone/vieneu-3.8.4')
    parser.add_argument('--region', default='us-east-1')
    args = parser.parse_args()
    count = publish(args.model_dir, args.bucket, args.prefix, args.region)
    print(f'Đã tải lên {count} tệp model đã khóa vào prefix riêng; WAV mẫu giọng không được tải lên bởi script này.')


if __name__ == '__main__':
    main()
