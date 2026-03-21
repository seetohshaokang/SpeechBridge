import pytest
import base64
import json
import logging
import re
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import sys

# Set path up 3 levels in backend/
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from agent import (
    transcribe_audio,
    correct_speech,
    _message_content_to_str,
    _normalize_tool_result,
)

from load_dysarthria import load_dysarthria_patient_samples
from util.logger import setup_logger
import os

# Setup test logger - writes to same log file as agent for unified view
# In serverless environments, use stdout only
IS_SERVERLESS = os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME')
log_file = None if IS_SERVERLESS else 'logs/agent.log'
logger = setup_logger('test_dysarthria', log_file=log_file, level=logging.DEBUG)

# Fixtures

@pytest.fixture
def mock_audio_b64():
    """Returns mock base64-encoded WAV audio"""
    # Create a minimal valid WAV header
    wav_header = b'RIFF' + b'\x00' * 36  # Simplified WAV header
    return base64.b64encode(wav_header).decode()

@pytest.fixture
def real_dysarthria_sample():
    """Loads one real dysarthria sample from dataset"""
    logger.info("\n" + "=" * 60)
    logger.info("FIXTURE: Loading Real Dysarthria Sample")
    logger.info("=" * 60)
    samples = load_dysarthria_patient_samples(n_samples=1)
    if not samples:
        logger.warning("⚠ No dysarthria samples available - skipping test")
        pytest.skip("No dysarthria samples available")
    
    sample = samples[0]
    logger.info(f"✓ Expected text: '{sample.get('expected_text', 'N/A')}'")
    logger.info(f"✓ Gender: {sample.get('gender', 'N/A')}")
    logger.info(f"✓ Prompt: {sample.get('prompt', 'N/A')}")
    logger.info(f"✓ Audio b64 length: {len(sample['audio_b64'])} chars")
    return sample

@pytest.fixture
def mock_transcript():
    """Returns mock dysarthria-style transcript"""
    return "wa-ter ple-ase help me"

# ═══════════════════════════════════════════════════════════════════════════════
# Test 1: transcribe_audio Tool
# ═══════════════════════════════════════════════════════════════════════════════
class TestTranscribeAudio:
    """Tests for transcribe_audio tool"""
    # ─── Test 1.1: Basic Transcription ────────────────────────────────────────
    
    @patch("agent.eleven.speech_to_text.convert")
    def test_basic_transcription_with_dysarthria(self, mock_convert, mock_audio_b64):
        """Test 1.1: Basic transcription with mocked audio"""
        logger.info("=" * 60)
        logger.info("TEST 1.1: Basic Transcription with Dysarthria")
        logger.info("=" * 60)
        
        # Setup mock
        mock_result = Mock()
        mock_result.text = "water please help"
        mock_convert.return_value = mock_result
        logger.debug(f"Mock setup: Will return transcript '{mock_result.text}'")
        
        # Call tool
        logger.info("Calling transcribe_audio.invoke()...")
        result = transcribe_audio.invoke({
            "audio_b64": mock_audio_b64,
            "condition": "dysarthria"
        })
        logger.info(f"Received result: {result}")
        
        # Assertions
        assert isinstance(result, dict), "Result should be a dict"
        assert "raw_transcript" in result, "Should have raw_transcript key"
        assert isinstance(result["raw_transcript"], str), "Transcript should be string"
        assert len(result["raw_transcript"]) > 0, "Transcript should not be empty"
        assert result["raw_transcript"] == "water please help"
        logger.info(f"✓ Transcript validated: '{result['raw_transcript']}'")
        
        # Verify mock was called
        mock_convert.assert_called_once()
        logger.info("✓ Test passed!")

    @pytest.mark.integration
    @pytest.mark.slow
    def test_end_to_end_transcription_and_correction(self, real_dysarthria_sample):
        """Integration test: Real audio -> ElevenLabs -> Gemini -> Compare with ground truth"""
        logger.info("=" * 80)
        logger.info("INTEGRATION TEST: End-to-End Dysarthria Pipeline")
        logger.info("=" * 80)
        
        expected_text = real_dysarthria_sample["expected_text"]
        logger.info(f"Ground Truth: '{expected_text}'")
        logger.info(f"Audio file: {real_dysarthria_sample['wav_path']}")
        logger.info(f"Gender: {real_dysarthria_sample['gender']}, Prompt: {real_dysarthria_sample['prompt']}")
        
        # Step 1: Transcribe with ElevenLabs API (NO MOCKING)
        logger.info("\n" + "-" * 80)
        logger.info("STEP 1: Transcribing audio with ElevenLabs API...")
        logger.info("-" * 80)
        audio_b64_len = len(real_dysarthria_sample["audio_b64"])
        logger.info(f"Audio size: {audio_b64_len} chars base64")
        
        transcription_result = transcribe_audio.invoke({
            "audio_b64": real_dysarthria_sample["audio_b64"],
            "condition": "dysarthria"
        })
        
        assert "raw_transcript" in transcription_result, "Should have raw_transcript key"
        assert isinstance(transcription_result["raw_transcript"], str), "Transcript should be string"
        assert len(transcription_result["raw_transcript"]) > 0, "Should have non-empty transcript"
        
        raw_transcript = transcription_result["raw_transcript"]
        logger.info(f"✓ ElevenLabs Raw Transcript: '{raw_transcript}'")
        
        # Step 2: Correct speech with Gemini API (NO MOCKING)
        logger.info("\n" + "-" * 80)
        logger.info("STEP 2: Correcting speech with Gemini API...")
        logger.info("-" * 80)
        logger.info(f"Input to correction: '{raw_transcript}'")
        
        correction_result = correct_speech.invoke({
            "raw_transcript": raw_transcript,
            "condition": "dysarthria"
        })
        
        assert "corrected_text" in correction_result, "Should have corrected_text key"
        assert "confidence" in correction_result, "Should have confidence key"
        assert isinstance(correction_result["corrected_text"], str), "Corrected text should be string"
        assert isinstance(correction_result["confidence"], float), "Confidence should be float"
        
        corrected_text = correction_result["corrected_text"]
        confidence = correction_result["confidence"]
        changes = correction_result.get("changes", [])
        
        logger.info(f"✓ Gemini Corrected Text: '{corrected_text}'")
        logger.info(f"✓ Confidence: {confidence}")
        logger.info(f"✓ Changes: {changes}")
        
        # Step 3: Compare with ground truth
        logger.info("\n" + "-" * 80)
        logger.info("STEP 3: Comparing with Ground Truth")
        logger.info("-" * 80)
        logger.info(f"Expected:  '{expected_text}'")
        logger.info(f"Raw:       '{raw_transcript}'")
        logger.info(f"Corrected: '{corrected_text}'")
        
        # Normalize for comparison (case-insensitive, strip whitespace)
        expected_normalized = expected_text.lower().strip()
        corrected_normalized = corrected_text.lower().strip()
        
        exact_match = (expected_normalized == corrected_normalized)
        logger.info(f"\n{'✓' if exact_match else '✗'} Exact match: {exact_match}")
        
        # Calculate simple word accuracy
        expected_words = expected_normalized.split()
        corrected_words = corrected_normalized.split()
        
        logger.info(f"Word count - Expected: {len(expected_words)}, Corrected: {len(corrected_words)}")
        
        # Log result summary
        logger.info("\n" + "=" * 80)
        logger.info("TEST RESULT SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Pipeline Status: {'✓ PASSED' if len(corrected_text) > 0 else '✗ FAILED'}")
        logger.info(f"Ground Truth Match: {'✓ EXACT' if exact_match else '✗ DIFFERENT'}")
        logger.info(f"Correction Confidence: {confidence}")
        logger.info("=" * 80)
        
        logger.info("✓ Integration test completed!")
    
    @pytest.mark.integration
    @pytest.mark.slow
    def test_e2e_batch_samples(self):
        """Integration test: Batch test multiple dysarthria samples through full pipeline"""
        n_samples = 10
        target_prompt = "You wished to know all about my grandfather."
        
        logger.info("\n" + "=" * 80)
        logger.info(f"INTEGRATION TEST: Batch E2E Test")
        logger.info(f"Target Prompt: '{target_prompt}'")
        logger.info("=" * 80)
        
        samples = load_dysarthria_patient_samples(n_samples=n_samples, prompt=target_prompt)
        if not samples:
            pytest.skip(f"No dysarthria samples available for prompt: '{target_prompt}'")
        
        logger.info(f"✓ Loaded {len(samples)} samples from dataset")
        results = []
        
        for i, sample in enumerate(samples, 1):
            logger.info(f"\n{'='*80}")
            logger.info(f"PROCESSING SAMPLE {i}/{len(samples)}")
            logger.info(f"{'='*80}")
            
            # Extract patient ID, session, and wav number from path
            wav_path = sample["wav_path"]
            # Extract patient ID (e.g., M01, F03)
            patient_match = re.search(r'/(M\d+|F\d+)/', wav_path)
            patient_id = patient_match.group(1) if patient_match else "Unknown"
            # Extract session (e.g., Session1, Session2)
            session_match = re.search(r'/(Session\d+)/', wav_path)
            session = session_match.group(1) if session_match else "Unknown"
            # Extract wav file number (e.g., 0053.wav)
            wav_filename = Path(wav_path).name
            
            expected_text = sample["expected_text"]
            logger.info(f"Patient: {patient_id} | Session: {session} | Wav: {wav_filename}")
            logger.info(f"Gender: {sample['gender']} | Prompt: {sample['prompt']}")
            logger.info(f"Ground Truth: '{expected_text}'")
            
            # Step 1: Transcribe with ElevenLabs API
            logger.info("\n[1/2] Transcribing with ElevenLabs API...")
            try:
                transcription = transcribe_audio.invoke({
                    "audio_b64": sample["audio_b64"],
                    "condition": "dysarthria"
                })
                raw_transcript = transcription["raw_transcript"]
                logger.info(f"✓ Raw Transcript: '{raw_transcript}'")
            except Exception as e:
                logger.error(f"✗ Transcription failed: {e}")
                results.append({
                    "sample_id": i,
                    "expected": expected_text,
                    "raw": None,
                    "corrected": None,
                    "confidence": 0.0,
                    "match": False,
                    "error": str(e)
                })
                continue
            
            # Step 2: Correct with Gemini API
            logger.info("[2/2] Correcting with Gemini API...")
            try:
                correction = correct_speech.invoke({
                    "raw_transcript": raw_transcript,
                    "condition": "dysarthria"
                })
                corrected_text = correction["corrected_text"]
                confidence = correction["confidence"]
                logger.info(f"✓ Corrected: '{corrected_text}'")
                logger.info(f"✓ Confidence: {confidence}")
            except Exception as e:
                logger.error(f"✗ Correction failed: {e}")
                results.append({
                    "sample_id": i,
                    "expected": expected_text,
                    "raw": raw_transcript,
                    "corrected": None,
                    "confidence": 0.0,
                    "match": False,
                    "error": str(e)
                })
                continue
            
            # Step 3: Compare
            expected_normalized = expected_text.lower().strip()
            corrected_normalized = corrected_text.lower().strip()
            exact_match = (expected_normalized == corrected_normalized)
            
            logger.info(f"\nMatch: {'✓ YES' if exact_match else '✗ NO'}")
            
            results.append({
                "sample_id": i,
                "expected": expected_text,
                "raw": raw_transcript,
                "corrected": corrected_text,
                "confidence": confidence,
                "match": exact_match,
                "gender": sample["gender"],
                "prompt": sample["prompt"]
            })
        
        # Final Summary
        logger.info(f"\n{'='*80}")
        logger.info("BATCH TEST SUMMARY")
        logger.info(f"{'='*80}")
        
        successful_results = [r for r in results if "error" not in r]
        failed_results = [r for r in results if "error" in r]
        
        logger.info(f"Total samples processed: {len(results)}")
        logger.info(f"Successful: {len(successful_results)}")
        logger.info(f"Failed: {len(failed_results)}")
        
        if successful_results:
            matches = sum(1 for r in successful_results if r["match"])
            avg_confidence = sum(r["confidence"] for r in successful_results) / len(successful_results)
            
            logger.info(f"\nExact matches: {matches}/{len(successful_results)} ({matches/len(successful_results)*100:.1f}%)")
            logger.info(f"Average confidence: {avg_confidence:.2f}")
            
            logger.info("\nDetailed Results:")
            for r in successful_results:
                match_symbol = "✓" if r["match"] else "✗"
                logger.info(f"\n  Sample {r['sample_id']} {match_symbol} (confidence: {r['confidence']:.2f})")
                logger.info(f"    Expected:  '{r['expected']}'")
                logger.info(f"    Corrected: '{r['corrected']}'")
        
        if failed_results:
            logger.info("\nFailed Samples:")
            for r in failed_results:
                logger.info(f"  Sample {r['sample_id']}: {r.get('error', 'Unknown error')}")
        
        logger.info(f"\n{'='*80}")
        logger.info("✓ Batch integration test completed!")
        
        # Assert at least some samples processed successfully
        assert len(successful_results) > 0, "All samples failed - check API connectivity"
    
    # ─── Test 1.3: Invalid Audio Handling ─────────────────────────────────────
    
    def test_invalid_base64_string(self):
        """Test 1.3: Invalid base64 should raise exception"""
        logger.info("=" * 60)
        logger.info("TEST 1.3: Invalid Base64 String")
        logger.info("=" * 60)
        logger.info("Testing with invalid base64 string: 'not!valid!base64!'")
        
        with pytest.raises(Exception) as exc_info:
            transcribe_audio.invoke({
                "audio_b64": "not!valid!base64!",
                "condition": "dysarthria"
            })
        
        logger.info(f"✓ Exception raised as expected: {type(exc_info.value).__name__}")
        logger.info("✓ Test passed!")
    
    def test_empty_audio_string(self):
        """Test 1.3: Empty audio should raise exception"""
        logger.info("=" * 60)
        logger.info("TEST 1.3: Empty Audio String")
        logger.info("=" * 60)
        logger.info("Testing with empty audio string")
        
        with pytest.raises(Exception) as exc_info:
            transcribe_audio.invoke({
                "audio_b64": "",
                "condition": "dysarthria"
            })
        
        logger.info(f"✓ Exception raised as expected: {type(exc_info.value).__name__}")
        logger.info("✓ Test passed!")
    # ─── Test 1.4: Audio Format Compatibility ─────────────────────────────────
    
    @patch("agent.eleven.speech_to_text.convert")
    def test_audio_base64_decode(self, mock_convert, real_dysarthria_sample):
        """Test 1.4: Verify base64 encoding/decoding works"""
        logger.info("=" * 60)
        logger.info("TEST 1.4: Audio Base64 Decode")
        logger.info("=" * 60)
        
        # Setup mock
        mock_result = Mock()
        mock_result.text = "decoded successfully"
        mock_convert.return_value = mock_result
        
        # Get audio from dataset
        audio_b64 = real_dysarthria_sample["audio_b64"]
        logger.info(f"Audio base64 length: {len(audio_b64)} chars")
        
        # Verify we can decode it
        audio_bytes = base64.b64decode(audio_b64)
        logger.info(f"Decoded audio bytes: {len(audio_bytes)} bytes")
        assert len(audio_bytes) > 0, "Should have audio bytes"
        assert audio_bytes[:4] == b'RIFF', "Should be valid WAV"
        logger.info(f"✓ Audio format validated: WAV (RIFF header found)")
        
        # Call tool
        logger.info("Calling transcribe_audio.invoke()...")
        result = transcribe_audio.invoke({
            "audio_b64": audio_b64,
            "condition": "dysarthria"
        })
        logger.info(f"Received result: {result}")
        
        # Verify tool processed it
        assert "raw_transcript" in result
        mock_convert.assert_called_once()
        logger.info("✓ Test passed!")
# ═══════════════════════════════════════════════════════════════════════════════
# Test 2: correct_speech Tool
# ═══════════════════════════════════════════════════════════════════════════════
class TestCorrectSpeech:
    """Tests for correct_speech tool"""
    # ─── Test 2.1: Basic Correction ───────────────────────────────────────────
    
    @patch("agent.key_manager.invoke")
    def test_basic_correction(self, mock_invoke):
        """Test 2.1: Basic correction with valid JSON response"""
        logger.info("=" * 60)
        logger.info("TEST 2.1: Basic Speech Correction")
        logger.info("=" * 60)
        
        # Setup mock Gemini response
        mock_response = Mock()
        mock_response.content = json.dumps({
            "corrected_text": "water please",
            "confidence": 0.87,
            "changes": ["restored word boundaries"]
        })
        mock_invoke.return_value = mock_response
        logger.debug(f"Mock Gemini response: {mock_response.content}")
        
        # Call tool
        raw_input = "wa-ter ple-ase"
        logger.info(f"Input transcript: '{raw_input}'")
        logger.info("Calling correct_speech.invoke()...")
        result = correct_speech.invoke({
            "raw_transcript": raw_input,
            "condition": "dysarthria"
        })
        logger.info(f"Received result: {result}")
        
        # Assertions
        assert isinstance(result, dict), "Result should be dict"
        assert "corrected_text" in result
        assert "confidence" in result
        assert "changes" in result
        
        assert result["corrected_text"] == "water please"
        assert isinstance(result["confidence"], float)
        assert 0.0 <= result["confidence"] <= 1.0, "Confidence should be 0-1"
        assert isinstance(result["changes"], list)
        
        logger.info(f"✓ Corrected: '{raw_input}' -> '{result['corrected_text']}'")
        logger.info(f"✓ Confidence: {result['confidence']}")
        logger.info(f"✓ Changes: {result['changes']}")
        logger.info("✓ Test passed!")
    # ─── Test 2.3: JSON Parsing Handling ──────────────────────────────────────
    
    @patch("agent.key_manager.invoke")
    def test_json_parsing_valid(self, mock_invoke):
        """Test 2.3 Case A: Valid JSON response"""
        logger.info("=" * 60)
        logger.info("TEST 2.3A: JSON Parsing - Valid JSON")
        logger.info("=" * 60)
        
        mock_response = Mock()
        mock_response.content = '{"corrected_text": "hello", "confidence": 0.9, "changes": []}'
        mock_invoke.return_value = mock_response
        logger.debug(f"Mock response content: {mock_response.content}")
        
        logger.info("Input: 'h-hello'")
        result = correct_speech.invoke({
            "raw_transcript": "h-hello",
            "condition": "dysarthria"
        })
        logger.info(f"Parsed result: {result}")
        
        assert result["corrected_text"] == "hello"
        assert result["confidence"] == 0.9
        assert result["changes"] == []
        logger.info("✓ Valid JSON parsed correctly")
        logger.info("✓ Test passed!")
    @patch("agent.key_manager.invoke")
    def test_json_parsing_with_markdown_wrapper(self, mock_invoke):
        """Test 2.3 Case B: JSON wrapped in markdown code block"""
        logger.info("=" * 60)
        logger.info("TEST 2.3B: JSON Parsing - Markdown Wrapped")
        logger.info("=" * 60)
        
        mock_response = Mock()
        mock_response.content = '```json\n{"corrected_text": "hello", "confidence": 0.85, "changes": ["test"]}\n```'
        mock_invoke.return_value = mock_response
        logger.debug(f"Mock response (with markdown wrapper):\n{mock_response.content}")
        
        logger.info("Input: 'h-hello'")
        result = correct_speech.invoke({
            "raw_transcript": "h-hello",
            "condition": "dysarthria"
        })
        logger.info(f"Parsed result: {result}")
        
        assert result["corrected_text"] == "hello"
        assert result["confidence"] == 0.85
        assert result["changes"] == ["test"]
        logger.info("✓ Markdown-wrapped JSON parsed correctly")
        logger.info("✓ Test passed!")
    @patch("agent.key_manager.invoke")
    def test_json_parsing_invalid_fallback(self, mock_invoke):
        """Test 2.3 Case C: Invalid JSON should fallback gracefully"""
        logger.info("=" * 60)
        logger.info("TEST 2.3C: JSON Parsing - Invalid JSON Fallback")
        logger.info("=" * 60)
        
        mock_response = Mock()
        mock_response.content = "This is not valid JSON at all"
        mock_invoke.return_value = mock_response
        logger.debug(f"Mock response (invalid JSON): '{mock_response.content}'")
        
        original_transcript = "wa-ter ple-ase"
        logger.info(f"Input: '{original_transcript}'")
        logger.info("Expecting graceful fallback to original transcript...")
        result = correct_speech.invoke({
            "raw_transcript": original_transcript,
            "condition": "dysarthria"
        })
        logger.info(f"Fallback result: {result}")
        
        # Should return original transcript with low confidence
        assert result["corrected_text"] == original_transcript
        assert result["confidence"] == 0.4
        assert "could not parse correction" in result["changes"][0].lower()
        logger.info(f"✓ Fallback successful: returned original with confidence {result['confidence']}")
        logger.info("✓ Test passed!")
    # ─── Test 2.4: Edge Cases ─────────────────────────────────────────────────
    
    @patch("agent.key_manager.invoke")
    def test_empty_transcript(self, mock_invoke):
        """Test 2.4: Empty transcript handling"""
        logger.info("=" * 60)
        logger.info("TEST 2.4: Empty Transcript Handling")
        logger.info("=" * 60)
        
        mock_response = Mock()
        mock_response.content = '{"corrected_text": "", "confidence": 0.1, "changes": ["empty input"]}'
        mock_invoke.return_value = mock_response
        logger.debug(f"Mock response: {mock_response.content}")
        
        logger.info("Input: '' (empty string)")
        result = correct_speech.invoke({
            "raw_transcript": "",
            "condition": "dysarthria"
        })
        logger.info(f"Result: {result}")
        
        assert isinstance(result, dict)
        assert "corrected_text" in result
        assert "confidence" in result
        logger.info(f"✓ Empty transcript handled with confidence {result['confidence']}")
        logger.info("✓ Test passed!")
    @patch("agent.key_manager.invoke")
    def test_long_transcript(self, mock_invoke):
        """Test 2.4: Very long transcript"""
        logger.info("=" * 60)
        logger.info("TEST 2.4: Very Long Transcript")
        logger.info("=" * 60)
        
        mock_response = Mock()
        mock_response.content = '{"corrected_text": "corrected", "confidence": 0.8, "changes": []}'
        mock_invoke.return_value = mock_response
        
        # Create 500+ word transcript
        long_text = " ".join(["word"] * 600)
        logger.info(f"Generated long transcript: {len(long_text.split())} words, {len(long_text)} chars")
        
        logger.info("Calling correct_speech with very long transcript...")
        result = correct_speech.invoke({
            "raw_transcript": long_text,
            "condition": "dysarthria"
        })
        logger.info(f"Result: {result}")
        
        assert isinstance(result, dict)
        assert "corrected_text" in result
        logger.info("✓ Long transcript handled successfully")
        logger.info("✓ Test passed!")
    @patch("agent.key_manager.invoke")
    def test_special_characters(self, mock_invoke):
        """Test 2.4: Special characters in transcript"""
        logger.info("=" * 60)
        logger.info("TEST 2.4: Special Characters Handling")
        logger.info("=" * 60)
        
        mock_response = Mock()
        mock_response.content = '{"corrected_text": "Hello!!!", "confidence": 0.9, "changes": []}'
        mock_invoke.return_value = mock_response
        
        input_text = "Hello!!! @#$%"
        logger.info(f"Input with special chars: '{input_text}'")
        result = correct_speech.invoke({
            "raw_transcript": input_text,
            "condition": "dysarthria"
        })
        logger.info(f"Result: {result}")
        
        assert "corrected_text" in result
        logger.info(f"✓ Special characters handled: '{input_text}' -> '{result['corrected_text']}'")
        logger.info("✓ Test passed!")
    @patch("agent.key_manager.invoke")
    def test_unicode_characters(self, mock_invoke):
        """Test 2.4: Unicode characters"""
        logger.info("=" * 60)
        logger.info("TEST 2.4: Unicode Characters Handling")
        logger.info("=" * 60)
        
        mock_response = Mock()
        mock_response.content = '{"corrected_text": "café", "confidence": 0.95, "changes": []}'
        mock_invoke.return_value = mock_response
        
        input_text = "café"
        logger.info(f"Input with unicode: '{input_text}'")
        result = correct_speech.invoke({
            "raw_transcript": input_text,
            "condition": "dysarthria"
        })
        logger.info(f"Result: {result}")
        
        assert result["corrected_text"] == "café"
        logger.info(f"✓ Unicode preserved: '{input_text}' -> '{result['corrected_text']}'")
        logger.info("✓ Test passed!")
    # ─── Test 2.5: Gemini Key Rotation ────────────────────────────────────────
    
    def test_key_rotation_on_quota_error(self):
        """Test 2.5: Key rotation when quota error occurs"""
        print("\n🧪 Testing key rotation on quota error...")
        from agent import GeminiKeyManager
        
        # Mock the entire _build method to control LLM creation
        with patch("agent.GeminiKeyManager._build") as mock_build:
            # Create two mock LLMs
            first_llm = Mock()
            second_llm = Mock()
            
            # First LLM raises quota error
            first_llm.invoke.side_effect = Exception("429 ResourceExhausted quota exceeded")
            print("   Mock: First key will raise quota error")
            
            # Second LLM succeeds
            mock_response = Mock()
            mock_response.content = "success after rotation"
            second_llm.invoke.return_value = mock_response
            print("   Mock: Second key will succeed")
            
            # _build returns first LLM on index 0, second LLM on index 1
            mock_build.side_effect = [first_llm, second_llm]
            
            # Create manager
            manager = GeminiKeyManager(["key1", "key2", "key3"])
            
            # Call invoke - should rotate and succeed
            result = manager.invoke("test prompt")
            
            # Assertions
            print(f"   ✓ Result: {result.content}")
            print(f"   ✓ Active key index: {manager.active_index}")
            assert result.content == "success after rotation"
            assert manager.active_index == 1, "Should have rotated to key 2 (index 1)"
            assert mock_build.call_count == 2, "Should have built twice (initial + rotation)"
            print("   ✅ Test passed - key rotation works!")
       
    def test_all_keys_exhausted(self):
        """Test 2.5: All Gemini keys exhausted raises exception"""
        print("\n🧪 Testing all keys exhausted scenario...")
        from agent import GeminiKeyManager
        
        with patch("agent.GeminiKeyManager._build") as mock_build:
            # All LLMs raise quota errors
            mock_llm = Mock()
            mock_llm.invoke.side_effect = Exception("429 ResourceExhausted quota exceeded")
            mock_build.return_value = mock_llm
            
            print("   Mock: All 3 keys will raise quota errors")
            
            manager = GeminiKeyManager(["key1", "key2", "key3"])
            
            # Should exhaust all keys and raise
            with pytest.raises(Exception) as exc_info:
                manager.invoke("test prompt")
            
            # Verify quota error propagated
            print(f"   ✓ Exception raised: {type(exc_info.value).__name__}")
            print(f"   ✓ Error message contains: {str(exc_info.value)[:100]}...")
            assert "429" in str(exc_info.value) or "ResourceExhausted" in str(exc_info.value)
            assert mock_build.call_count == 3, "Should have tried all 3 keys"
            print("   ✅ Test passed - all keys exhausted as expected!")

# ═══════════════════════════════════════════════════════════════════════════════
# Test 5: Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════
class TestHelperFunctions:
    """Tests for helper functions"""
    # ─── Test 5.1: _message_content_to_str ────────────────────────────────────
    
    def test_message_content_string(self):
        """Test 5.1 Case 1: String input"""
        logger.info("=" * 60)
        logger.info("TEST 5.1: _message_content_to_str - String Input")
        logger.info("=" * 60)
        
        input_val = "hello"
        logger.info(f"Input: {repr(input_val)}")
        result = _message_content_to_str(input_val)
        logger.info(f"Output: {repr(result)}")
        
        assert result == "hello"
        logger.info("✓ Test passed!")
    def test_message_content_none(self):
        """Test 5.1 Case 2: None input"""
        logger.info("TEST 5.1: _message_content_to_str - None Input")
        result = _message_content_to_str(None)
        logger.info(f"Input: None -> Output: {repr(result)}")
        assert result == ""
        logger.info("✓ Test passed!")
    def test_message_content_list_of_strings(self):
        """Test 5.1 Case 3: List of strings"""
        logger.info("TEST 5.1: _message_content_to_str - List of Strings")
        input_val = ["hello", "world"]
        logger.info(f"Input: {input_val}")
        result = _message_content_to_str(input_val)
        logger.info(f"Output: {repr(result)}")
        assert result == "helloworld"
        logger.info("✓ Test passed!")
    def test_message_content_list_of_dicts(self):
        """Test 5.1 Case 4: List of dicts with text key"""
        logger.info("TEST 5.1: _message_content_to_str - List of Dicts")
        input_val = [{"text": "hello"}, {"text": "world"}]
        logger.info(f"Input: {input_val}")
        result = _message_content_to_str(input_val)
        logger.info(f"Output: {repr(result)}")
        assert result == "helloworld"
        logger.info("✓ Test passed!")
    def test_message_content_objects_with_text_attr(self):
        """Test 5.1 Case 5: Objects with .text attribute"""
        logger.info("TEST 5.1: _message_content_to_str - Objects with .text Attr")
        
        class MockObj:
            def __init__(self, text):
                self.text = text
        
        input_val = [MockObj("hello"), MockObj("world")]
        logger.info(f"Input: List of MockObj with text attrs")
        result = _message_content_to_str(input_val)
        logger.info(f"Output: {repr(result)}")
        assert result == "helloworld"
        logger.info("✓ Test passed!")
    # ─── Test 5.2: _normalize_tool_result ─────────────────────────────────────
    
    def test_normalize_dict_input(self):
        """Test 5.2 Case 1: Dict input"""
        logger.info("=" * 60)
        logger.info("TEST 5.2: _normalize_tool_result - Dict Input")
        logger.info("=" * 60)
        
        input_val = {"key": "value"}
        logger.info(f"Input: {input_val}")
        result = _normalize_tool_result(input_val)
        logger.info(f"Output: {result}")
        assert result == {"key": "value"}
        logger.info("✓ Test passed!")
    def test_normalize_json_string(self):
        """Test 5.2 Case 2: JSON string"""
        logger.info("TEST 5.2: _normalize_tool_result - JSON String")
        input_val = '{"key": "value"}'
        logger.info(f"Input (JSON string): {input_val}")
        result = _normalize_tool_result(input_val)
        logger.info(f"Output (parsed dict): {result}")
        assert result == {"key": "value"}
        logger.info("✓ Test passed!")
    def test_normalize_invalid_json(self):
        """Test 5.2 Case 3: Invalid JSON"""
        logger.info("TEST 5.2: _normalize_tool_result - Invalid JSON")
        input_val = "not json"
        logger.info(f"Input (invalid JSON): '{input_val}'")
        result = _normalize_tool_result(input_val)
        logger.info(f"Output (fallback with raw key): {result}")
        assert result == {"raw": "not json"}
        logger.info("✓ Invalid JSON handled gracefully")
        logger.info("✓ Test passed!")
    def test_normalize_other_types(self):
        """Test 5.2 Case 4: Other types"""
        logger.info("TEST 5.2: _normalize_tool_result - Other Types")
        input_val = 123
        logger.info(f"Input (integer): {input_val}")
        result = _normalize_tool_result(input_val)
        logger.info(f"Output (empty dict): {result}")
        assert result == {}
        logger.info("✓ Non-dict/non-string handled gracefully")
        logger.info("✓ Test passed!")
