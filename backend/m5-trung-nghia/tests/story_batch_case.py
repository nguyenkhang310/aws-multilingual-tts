"""Shared fake S3, Lambda Event and M2 worker setup for chapter batch tests."""

import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'backend/m3-trung-duc/common/python'),
                str(ROOT / 'backend/m3-trung-duc/tests'),
                str(ROOT / 'backend/m5-trung-nghia/submit'),
                str(ROOT / 'backend/m2-trung-khang/synthesize')]
from story_batch_fakes import SafeS3, LambdaQueue  # noqa: E402
from tts_common import aws, config, storage, story_chapters, story_content, story_projects  # noqa: E402
import app, audiobooks  # noqa: E402

spec = importlib.util.spec_from_file_location('story_worker', ROOT / 'backend/m2-trung-khang/synthesize/app.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class StoryBatchCase(unittest.TestCase):
    def setUp(self):
        self.s3, self.lambdas = SafeS3(), LambdaQueue()
        self.entry = {'provider': 'azure', 'engine': 'neural', 'voices': [
            {'id': 'voice-fixture', 'styles': ['cheerful']}], 'speedRange': [0.7, 1.2]}
        patches = [mock.patch.object(aws, 's3', return_value=self.s3),
                   mock.patch.object(aws, 'lambda_client', return_value=self.lambdas),
                   mock.patch.object(app, '_find_entry', return_value=self.entry),
                   mock.patch.object(config, 'JOBS_BUCKET', 'jobs'),
                   mock.patch.object(config, 'AUDIO_BUCKET', 'audio'),
                   mock.patch.object(config, 'SYNTH_FUNCTION_NAME', 'worker'),
                   mock.patch.object(config, 'DAILY_CHAR_LIMIT', 30000),
                   mock.patch.dict(os.environ, {'STORY_MAX_ACTIVE': '1'})]
        for patcher in patches:
            patcher.start(); self.addCleanup(patcher.stop)
        project = story_projects.create('demo', {'title': 'Truyện', 'sourceLang': 'vi-VN', 'targetLang': 'en-US'})
        self.pid = project['projectId']
        chapter = story_chapters.create('demo', self.pid, {'chapterNumber': 1, 'title': 'Mở đầu'})
        self.cid = chapter['chapterId']
        self.chapter_path = f'/audiobooks/{self.pid}/chapters/{self.cid}'
        self.text = ('Xin chào. 日本語 한글 中文 😊\n' * 1000)
        upload = 'a' * 32
        story_content.upload('demo', self.pid, self.cid, upload, 0, self.text)
        self.chapter = story_content.commit('demo', self.pid, self.cid, upload, 1, 1)

    def call(self, method, suffix, body=None, scope='demo'):
        event = {'httpMethod': method, 'path': self.chapter_path + suffix,
                 'requestContext': {'scope': scope}, 'queryStringParameters': {}}
        if body is not None:
            event['body'] = json.dumps(body, ensure_ascii=False)
        response = audiobooks.handler(event, None)
        return response['statusCode'], json.loads(response['body'])

    def plan(self):
        status, plan = self.call('POST', '/audio-plans', {'chapterRevision': self.chapter['revision'],
            'provider': 'azure', 'voice': 'voice-fixture', 'speed': 0.9,
            'style': 'cheerful', 'styleIntensity': 1.2})
        self.assertEqual(status, 201)
        return plan

    def start(self, plan):
        return self.call('POST', f"/audio-plans/{plan['planId']}/start", {})

    def tick(self, plan):
        return self.call('POST', f"/audio-plans/{plan['planId']}/tick", {})

    def progress(self, plan):
        event = {'httpMethod': 'GET', 'path': self.chapter_path + '/audio-progress',
                 'requestContext': {'scope': 'demo'},
                 'queryStringParameters': {'planId': plan['planId'], 'limit': '25'}}
        response = audiobooks.handler(event, None)
        return response['statusCode'], json.loads(response['body'])

    def complete(self, event=None, *, deliver_destination=False):
        event = event or self.lambdas.events[-1]
        context = mock.Mock(aws_request_id='fixture')
        context.get_remaining_time_in_millis.return_value = 30000
        def produce(job, _context, _checkpoint):
            return storage.put_audio(job['userId'], job['jobId'], b'ID3-fixture-mp3')
        with mock.patch.object(worker, '_produce_audio', side_effect=produce):
            result = worker.handler(event, context)
        self.assertEqual(result['status'], 'DONE')
        if deliver_destination:
            envelope = {'version': '1.0', 'requestContext': {'condition': 'Success'},
                        'requestPayload': event, 'responsePayload': result}
            self.assertEqual(app.handler(envelope, None)['status'], 'RECONCILED')
        return result
