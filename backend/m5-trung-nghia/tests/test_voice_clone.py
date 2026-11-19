import base64
import builtins
import io
import json
import os
import wave
from unittest import mock

from test_submit import FlowTestCase, Context, worker, submit, MP3
from tts_common import db


def reference_audio(seconds=3):
    output = io.BytesIO()
    with wave.open(output, 'wb') as sample:
        sample.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
        sample.writeframes(bytes(8000 * 2 * seconds))
    return output.getvalue()


class VoiceCloneTest(FlowTestCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch.dict(os.environ, {'VOICE_CLONE_ENABLED': 'true'})
        patcher.start(); self.addCleanup(patcher.stop)

    def profile(self, audio=None):
        body = {'name': 'Giọng mẫu', 'lang': 'vi-VN', 'consent': True,
                'audioBase64': base64.b64encode(audio if audio is not None else reference_audio()).decode()}
        result = submit.handler({'path': '/voice-profiles', 'httpMethod': 'POST', 'body': json.dumps(body)}, None)
        return result['statusCode'], json.loads(result['body'])

    def test_profile_submit_worker_and_replay_use_same_voice(self):
        from providers.vieneu import VieNeuProvider
        status, profile = self.profile()
        self.assertEqual(status, 201)
        body = self.good(provider='vieneu', voice=profile['voiceProfileId'],
                         voiceProfileId=profile['voiceProfileId'], voiceClone={'temperature': 0.8})
        status, result = self.post(**body)
        self.assertEqual(status, 202, result)
        # Exercise the actual provider factory and registry without loading the CPU model.
        from providers import get_provider
        with mock.patch.object(worker, 'get_provider', get_provider), \
                mock.patch.object(VieNeuProvider, 'synthesize', return_value=MP3) as synth:
            event = {'userId': 'demo', 'jobId': result['jobId']}
            self.assertEqual(worker.handler(event, Context())['status'], 'DONE')
            self.assertEqual(worker.handler(event, Context())['status'], 'SKIPPED')
            synth.assert_called_once_with(body['text'], profile['voiceProfileId'], body['speed'])
        self.assertEqual(db.get_job('demo', result['jobId'])['provider'], 'vieneu')

    def test_disabled_or_deleted_profile_never_reaches_model(self):
        status, profile = self.profile()
        status, result = self.post(**self.good(provider='vieneu', voice=profile['voiceProfileId'],
                                               voiceProfileId=profile['voiceProfileId']))
        self.assertEqual(status, 202)
        with mock.patch.dict(os.environ, {'VOICE_CLONE_ENABLED': 'false'}):
            outcome = worker.handler({'userId': 'demo', 'jobId': result['jobId']}, Context())
        self.assertEqual(outcome['status'], 'FAILED')
        self.synthesize.assert_not_called()

    def test_truncated_wav_and_missing_consent_do_not_store_profiles(self):
        for data in (b'RIFF', reference_audio()[:44], reference_audio()[:-100]):
            status, result = self.profile(data)
            self.assertEqual((status, result['error']['code']), (400, 'INVALID_REFERENCE_AUDIO'))
        self.assertFalse(self.s3.objects)
        response = submit.handler({'path': '/voice-profiles', 'httpMethod': 'POST',
                                  'body': json.dumps({'consent': False})}, None)
        status, result = response['statusCode'], json.loads(response['body'])
        self.assertEqual((status, result['error']['code']), (400, 'CONSENT_REQUIRED'))

    def test_sixty_seconds_is_accepted_and_longer_audio_gets_duration_error(self):
        status, _ = self.profile(reference_audio(60))
        self.assertEqual(status, 201)
        status, result = self.profile(reference_audio(61))
        self.assertEqual((status, result['error']['code']), (400, 'REFERENCE_AUDIO_TOO_LONG'))
        self.assertIn('vượt quá thời lượng tối đa 60 giây', result['error']['message'])

    def test_short_and_oversized_samples_return_specific_errors(self):
        for audio, code in [(reference_audio(2), 'REFERENCE_AUDIO_TOO_SHORT'),
                            (bytes(2 * 1024 * 1024 + 1), 'REFERENCE_AUDIO_TOO_LARGE')]:
            status, result = self.profile(audio)
            self.assertEqual((status, result['error']['code']), (400, code))
        self.assertFalse(self.s3.objects)

    def test_worker_reports_missing_clone_dependencies(self):
        from providers import get_provider

        _, profile = self.profile()
        voice = profile['voiceProfileId']
        status, result = self.post(**self.good(provider='vieneu', voice=voice, voiceProfileId=voice))
        self.assertEqual(status, 202)
        original_import = builtins.__import__

        def import_without_encoder(name, *args, **kwargs):
            if name == 'lameenc':
                raise ImportError('fixture')
            return original_import(name, *args, **kwargs)

        with mock.patch.object(worker, 'get_provider', get_provider), \
                mock.patch('builtins.__import__', side_effect=import_without_encoder):
            outcome = worker.handler({'userId': 'demo', 'jobId': result['jobId']}, Context())
        self.assertEqual(outcome['status'], 'FAILED')
        job = db.get_job('demo', result['jobId'])
        self.assertEqual(job['errorCode'], 'VOICE_CLONE_DEPENDENCY_MISSING')

    def test_invalid_profile_id_is_a_client_error(self):
        result = submit.handler({'path': '/voice-profiles/bad', 'pathParameters': {'id': 'bad'}}, None)
        self.assertEqual(result['statusCode'], 400)
