import importlib.util
import json
import os
import struct
import sys
import unittest
import zlib
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'backend/m3-trung-duc/common/python'),
                str(ROOT / 'backend/m3-trung-duc/tests'), str(ROOT / 'backend/m5-trung-nghia/submit')]
from fake_s3 import FakeS3  # noqa: E402
from tts_common import aws, config  # noqa: E402
import audiobooks  # noqa: E402

spec = importlib.util.spec_from_file_location('story_http_router', ROOT / 'backend/m1-minh-ly/http/app.py')
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)


def cover_png(width=3, height=4):
    def chunk(name, payload):
        body = name + payload
        return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    pixels = b''.join(b'\0' + b'\xff\0\0\xff' * width for _ in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


class StoryApiTest(unittest.TestCase):
    def setUp(self):
        self.s3 = FakeS3()
        self.patchers = [mock.patch.object(aws, 's3', return_value=self.s3),
                         mock.patch.object(config, 'JOBS_BUCKET', 'jobs'),
                         mock.patch.dict(os.environ, {'DEMO_TOKEN': 'test-token'})]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        router.set_lambda_invoker(lambda _name, event: audiobooks.handler(event, None))
        self.addCleanup(router.set_lambda_invoker, None)

    def call(self, method, path, body=None, key=None, token=True):
        event = {'httpMethod': method, 'path': path,
                 'headers': {'X-Demo-Token': 'test-token' if token else '',
                             **({'Idempotency-Key': key} if key else {})}}
        if body is not None:
            event['body'] = json.dumps(body, ensure_ascii=False)
        result = router.handler(event, None)
        return result['statusCode'], json.loads(result['body']) if result['body'] else None

    def test_audio_plan_paths_keep_m1_auth_and_route_to_m5(self):
        _, project = self.call('POST', '/audiobooks',
                               {'title': 'Truyện', 'sourceLang': 'vi-VN', 'targetLang': 'vi-VN'})
        _, chapter = self.call('POST', f"/audiobooks/{project['projectId']}/chapters",
                               {'title': 'Mở đầu', 'chapterNumber': 1})
        path = f"/audiobooks/{project['projectId']}/chapters/{chapter['chapterId']}/audio-plans"
        self.assertEqual(self.call('GET', path, token=False)[0], 401)
        status, result = self.call('GET', path)
        self.assertEqual(status, 200)
        self.assertEqual(result['items'], [])
        self.assertEqual(self.call('POST', path, {'chapterRevision': 1, 'provider': 'azure'})[0], 400)
        glossary_path = f"/audiobooks/{project['projectId']}/glossary"
        self.assertEqual(self.call('GET', glossary_path, token=False)[0], 401)
        self.assertEqual(self.call('GET', glossary_path)[1], {'revision': 0, 'entries': []})
        translation_path = f"/audiobooks/{project['projectId']}/chapters/{chapter['chapterId']}/translation-plans"
        self.assertEqual(self.call('GET', translation_path, token=False)[0], 401)
        self.assertEqual(self.call('GET', translation_path)[1]['items'], [])

    def test_character_routes_are_removed(self):
        project_id = 'a' * 32
        chapter_id = 'b' * 32
        self.assertEqual(self.call('GET', f'/audiobooks/{project_id}/characters')[0], 404)
        self.assertEqual(self.call('POST',
            f'/audiobooks/{project_id}/chapters/{chapter_id}/character-suggestions')[0], 404)

    def test_create_upload_reload_conflict_and_delete(self):
        self.assertEqual(self.call('GET', '/audiobooks', token=False)[0], 401)
        body = {'title': 'Truyện Việt', 'sourceLang': 'vi-VN', 'targetLang': 'en-US'}
        status, project = self.call('POST', '/audiobooks', body, 'project-key')
        self.assertEqual(status, 201)
        self.assertEqual(self.call('POST', '/audiobooks', body, 'project-key')[1]['projectId'], project['projectId'])
        path = f"/audiobooks/{project['projectId']}/chapters"
        status, chapter = self.call('POST', path, {'chapterNumber': 1, 'title': 'Mở đầu'}, 'chapter-key')
        self.assertEqual(status, 201)
        self.assertEqual(self.call('POST', path, {'chapterNumber': 1, 'title': 'Khác'}, 'chapter-key')[0], 409)
        chapter_path = f"{path}/{chapter['chapterId']}"
        upload = 'a' * 32
        text = 'Xin chào 😊\n'
        self.assertEqual(self.call('PUT', chapter_path + '/uploads',
                                   {'uploadId': upload, 'index': 0, 'text': text})[0], 200)
        self.assertEqual(self.call('POST', chapter_path + '/commit',
                                   {'uploadId': upload, 'count': 1, 'revision': 1})[0], 200)
        self.assertEqual(self.call('GET', chapter_path + '/source')[1]['text'], text)
        self.assertEqual(self.call('GET', chapter_path + '/segments')[1]['items'][0]['sourceText'], text)
        self.assertEqual(self.call('GET', path)[1]['items'][0]['textLength'], len(text.encode('utf-16-le')) // 2)
        self.assertEqual(self.call('PATCH', chapter_path, {'revision': 1, 'title': 'Stale'})[0], 409)
        self.assertEqual(self.call('DELETE', chapter_path, {'revision': 2})[0], 400)
        self.assertEqual(self.call('DELETE', chapter_path, {'revision': 2, 'confirm': True})[0], 200)
        self.assertEqual(self.call('GET', chapter_path)[0], 404)

    def test_cover_api_requires_auth_validates_project_scope_and_refreshes_signed_url(self):
        _, project = self.call('POST', '/audiobooks',
                               {'title': 'Truyện bìa', 'sourceLang': 'vi-VN', 'targetLang': 'vi-VN'})
        pid = project['projectId']
        path = f'/audiobooks/{pid}/cover'
        upload_path = f'/audiobooks/{pid}/cover-upload'
        upload_body = {'contentType': 'image/png', 'sizeBytes': len(cover_png()), 'version': 1}
        self.assertEqual(self.call('POST', upload_path, upload_body, token=False)[0], 401)
        self.assertEqual(self.call('GET', path)[0], 404)
        self.assertEqual(self.call('POST', upload_path, {**upload_body, 'contentType': 'image/svg+xml'})[0], 400)
        status, ticket = self.call('POST', upload_path, upload_body)
        self.assertEqual(status, 201)
        self.assertTrue(ticket['fields']['key'].startswith('audiobook-cover-staging/demo/'))
        self.s3.seed('jobs', ticket['fields']['key'], cover_png(), 'image/png')
        status, result = self.call('POST', path, {'uploadId': ticket['uploadId'], 'version': ticket['version']})
        self.assertEqual(status, 200)
        self.assertEqual(result['project']['cover']['contentType'], 'image/png')
        self.assertNotIn('coverKey', result['project'])
        detail = self.call('GET', f'/audiobooks/{pid}')[1]
        self.assertEqual(detail['cover']['width'], 3)
        self.assertEqual(self.call('GET', path)[1]['cover']['url'], detail['cover']['url'])
        self.assertEqual(self.call('DELETE', path, {'version': 1})[0], 409)
        cleared = self.call('DELETE', path, {'version': result['project']['version']})
        self.assertEqual(cleared[0], 200)
        self.assertIsNone(cleared[1]['project']['cover'])
        self.assertEqual(self.call('GET', path)[0], 404)
        forbidden = audiobooks.handler({'httpMethod': 'GET', 'path': path,
            'requestContext': {'scope': 'another-scope'}}, None)
        self.assertEqual(forbidden['statusCode'], 403)

    def test_oversize_chunk_and_cors(self):
        with mock.patch.object(router, 'MAX_BODY_BYTES', 80):
            status, body = self.call('PUT', '/audiobooks/' + 'a' * 32 + '/chapters/' + 'b' * 32 + '/uploads',
                                     {'text': 'x' * 200})
        self.assertEqual((status, body['error']['code']), (413, 'PAYLOAD_TOO_LARGE'))
        event = {'httpMethod': 'OPTIONS', 'path': '/audiobooks', 'headers': {}}
        response = router.handler(event, None)
        self.assertEqual(response['statusCode'], 204)
        self.assertIn('PATCH', response['headers']['Access-Control-Allow-Methods'])

    def test_three_chapters_survive_new_requests_and_one_edit(self):
        _, project = self.call('POST', '/audiobooks',
                               {'title': 'Truyện dài', 'sourceLang': 'vi-VN', 'targetLang': 'vi-VN'})
        base = f"/audiobooks/{project['projectId']}/chapters"
        saved = []
        for number in (1, 2, 15):
            _, chapter = self.call('POST', base, {'chapterNumber': number, 'title': f'Chương {number}'})
            path = f"{base}/{chapter['chapterId']}"
            upload = f'{number:032x}'
            self.call('PUT', path + '/uploads', {'uploadId': upload, 'index': 0, 'text': f'Nội dung {number}'})
            self.call('POST', path + '/commit', {'uploadId': upload, 'count': 1, 'revision': 1})
            saved.append(path)
        self.assertEqual([item['chapterNumber'] for item in self.call('GET', base)[1]['items']], [1, 2, 15])
        self.call('PATCH', saved[1], {'revision': 2, 'title': 'Chương hai đã sửa'})
        self.assertEqual(self.call('GET', saved[0] + '/source')[1]['text'], 'Nội dung 1')
        self.assertEqual(self.call('GET', saved[2] + '/source')[1]['text'], 'Nội dung 15')
        self.assertEqual(self.call('GET', base)[1]['items'][1]['title'], 'Chương hai đã sửa')


if __name__ == '__main__':
    unittest.main()
