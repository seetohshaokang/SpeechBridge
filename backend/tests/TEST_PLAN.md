# Agent Tools Unit Test Plan

This document outlines the comprehensive unit testing strategy for the three main agent tools in `agent.py`:

1. `transcribe_audio` - ElevenLabs Scribe v2 STT
2. `correct_speech` - Gemini-based transcript correction  
3. `synthesise_voice` - ElevenLabs TTS

---

## Test Structure

```
tests/
├── TEST_PLAN.md (this file)
├── test_dysarthria.py (dataset loading tests)
└── test_agent_tools.py (agent tool unit tests)
```

---

## 1. Test `transcribe_audio` Tool

### Test 1.1: Basic Transcription with Dysarthria Audio
**Objective:** Verify basic transcription functionality

**Setup:**
- Use sample audio from dysarthria dataset
- Mock `eleven.speech_to_text.convert()`

**Test Steps:**
1. Load a dysarthria sample using `load_dysarthria_patient_samples(n_samples=1)`
2. Call `transcribe_audio(audio_b64=sample["audio_b64"], condition="dysarthria")`
3. Assert return value is dict
4. Assert `raw_transcript` key exists
5. Assert transcript is non-empty string

**Expected Result:**
```python
{
    "raw_transcript": "some transcribed text"
}
```

---

### Test 1.2: Test Each Condition Type
**Objective:** Verify different keyterm lists are applied per condition

**Test Steps:**
1. For each condition in `["dysarthria", "stuttering", "aphasia", "general"]`:
   - Call `transcribe_audio()` with that condition
   - Verify mock was called with correct keyterms list
   - Assert keyterms match `_KEYTERMS[condition]`

**Mock Verification:**
- Check `keyterms` parameter passed to ElevenLabs API
- Dysarthria should use 42 keyterms (water, hungry, toilet, etc.)
- Stuttering should use 36 keyterms (because, probably, people, etc.)
- Aphasia should use 42 keyterms (house, car, food, etc.)
- General should use 21 keyterms

---

### Test 1.3: Invalid Audio Handling
**Objective:** Verify error handling for bad input

**Test Cases:**
- Pass invalid base64 string → expect exception
- Pass empty string → expect exception
- Pass None → expect exception

**Expected Behavior:**
- Should raise `Exception` or `ValueError`

---

### Test 1.4: Audio Format Compatibility
**Objective:** Verify base64 encoding/decoding works correctly

**Test Steps:**
1. Load real WAV file from dataset
2. Encode to base64
3. Pass to tool
4. Verify tool correctly decodes and processes
5. Mock should receive valid audio bytes

---

## 2. Test `correct_speech` Tool

### Test 2.1: Basic Correction with Dysarthria Transcript
**Objective:** Verify basic correction functionality

**Setup:**
- Mock `key_manager.invoke()` to return valid JSON

**Test Steps:**
1. Call `correct_speech(raw_transcript="wa-ter ple-ase", condition="dysarthria")`
2. Assert return dict has keys: `corrected_text`, `confidence`, `changes`
3. Assert `confidence` is float between 0.0 and 1.0
4. Assert `changes` is list

**Expected Result:**
```python
{
    "corrected_text": "water please",
    "confidence": 0.87,
    "changes": ["restored word boundaries"]
}
```

---

### Test 2.2: Test Each Condition's Correction Logic
**Objective:** Verify different prompts/hints per condition

**Test Steps:**
1. For each condition:
   - Call `correct_speech()` with condition-appropriate transcript
   - Capture prompt sent to Gemini
   - Verify condition hint is in prompt
   
**Condition-Specific Hints to Verify:**
- **Dysarthria:** "consonants are often dropped or blurred"
- **Stuttering:** "repetition of sounds, syllables, or words"
- **Aphasia:** "word-finding difficulty"
- **General:** "speech difficulty"

---

### Test 2.3: JSON Parsing Handling
**Objective:** Verify robust parsing of Gemini responses

**Test Cases:**

**Case A: Valid JSON**
```python
Mock returns: '{"corrected_text": "hello", "confidence": 0.9, "changes": []}'
Expected: Parsed dict with all fields
```

**Case B: JSON wrapped in markdown**
```python
Mock returns: '```json\n{"corrected_text": "hello", "confidence": 0.9}\n```'
Expected: Correctly strips markdown and parses
```

**Case C: Invalid JSON**
```python
Mock returns: 'This is not JSON'
Expected: Fallback behavior - returns original transcript with confidence=0.4
```

---

### Test 2.4: Edge Cases
**Objective:** Handle unusual inputs gracefully

**Test Cases:**
- Empty transcript: `""` → should return dict with empty/low confidence
- Very long transcript (500+ words) → should process without error
- Special characters: `"Hello!!! @#$%"` → should handle correctly
- Unicode: `"café"` → should preserve correctly

---

### Test 2.5: Gemini Key Rotation
**Objective:** Verify key rotation on quota errors

**Test Steps:**
1. Mock first key to raise quota error (429/ResourceExhausted)
2. Mock second key to succeed
3. Call `correct_speech()`
4. Assert second key was used
5. Verify rotation logged

**Test Case 2: All Keys Exhausted**
1. Mock all 3 keys to raise quota errors
2. Call `correct_speech()`
3. Assert final exception is raised
4. Verify "All Gemini keys exhausted" logged

---

## 3. Test `synthesise_voice` Tool

### Test 3.1: Basic TTS Generation
**Objective:** Verify basic text-to-speech works

**Setup:**
- Mock `eleven.text_to_speech.convert()`

**Test Steps:**
1. Call `synthesise_voice(text="Hello world")`
2. Assert returns dict with keys: `audio_b64`, `format`
3. Assert `format == "mp3"`
4. Assert `audio_b64` is valid base64 string
5. Verify can decode base64 to bytes

**Mock Return:**
```python
[b'mock', b'audio', b'chunks']  # Generator of bytes
```

---

### Test 3.2: Custom Voice ID
**Objective:** Verify voice_id parameter works

**Test Cases:**
- Use default voice ID (not specified) → should use `DEFAULT_VOICE_ID`
- Pass custom voice_id: `"custom123"` → mock should receive it

**Verification:**
- Check `voice_id` parameter in mock call

---

### Test 3.3: Text Variations
**Objective:** Handle different text inputs

**Test Cases:**
- Short: `"Hi"` → should work
- Long: 500 word sentence → should work
- Punctuation: `"Hello! How are you?"` → should work
- Empty: `""` → verify behavior (may error or return silence)

---

### Test 3.4: Audio Output Validation
**Objective:** Verify output format and size

**Test Steps:**
1. Mock to return realistic audio chunks
2. Call `synthesise_voice(text="test")`
3. Decode `audio_b64`
4. Assert length > 0
5. Assert length is reasonable (not 1 byte, not 100MB)

---

## 4. Integration Tests: Full Pipeline

### Test 4.1: End-to-End Pipeline with Mocked APIs
**Objective:** Verify tools chain correctly

**Setup:**
- Mock all three external API calls
- Mock returns realistic intermediate values

**Test Flow:**
```
transcribe_audio → correct_speech → synthesise_voice
     ↓                   ↓                  ↓
raw_transcript    corrected_text      audio_b64
```

**Test Steps:**
1. Call `_run_pipeline_sync(audio_b64="...", condition="dysarthria", voice_id="...")`
2. Assert final dict contains:
   - `raw_transcript`
   - `corrected_text`
   - `confidence`
   - `changes`
   - `audio_b64`
   - `audio_format`
   - `gemini_key_used`
3. Verify tools called in correct order
4. Verify data flows between tools correctly

---

### Test 4.2: Async Wrapper
**Objective:** Test `run_agent()` async function

**Test Steps:**
1. Call `await run_agent(audio_b64="...", condition="dysarthria")`
2. Assert returns same structure as sync version
3. Verify `asyncio.to_thread()` was used

---

### Test 4.3: Key Rotation During Pipeline
**Objective:** Verify retry logic when key rotates mid-pipeline

**Scenario:**
- First pipeline run hits quota error in `correct_speech`
- Key rotates
- Pipeline retries automatically

**Test Steps:**
1. Mock `correct_speech` to raise quota error on first call
2. Mock success on second call (after rotation)
3. Call `run_agent()`
4. Assert pipeline completes successfully
5. Verify `gemini_key_used` changed

---

## 5. Helper Function Tests

### Test 5.1: `_message_content_to_str`
**Test Cases:**

```python
# Case 1: String input
input: "hello"
expected: "hello"

# Case 2: None input  
input: None
expected: ""

# Case 3: List of strings
input: ["hello", "world"]
expected: "helloworld"

# Case 4: List of dicts with "text" key
input: [{"text": "hello"}, {"text": "world"}]
expected: "helloworld"

# Case 5: Objects with .text attribute
input: [MockObj(text="hello")]
expected: "hello"
```

---

### Test 5.2: `_normalize_tool_result`
**Test Cases:**

```python
# Case 1: Dict input
input: {"key": "value"}
expected: {"key": "value"}

# Case 2: JSON string
input: '{"key": "value"}'
expected: {"key": "value"}

# Case 3: Invalid JSON
input: "not json"
expected: {"raw": "not json"}

# Case 4: Other types
input: 123
expected: {}
```

---

## Pytest Fixtures to Create

```python
@pytest.fixture
def mock_audio_b64():
    """Returns mock base64-encoded audio"""
    return base64.b64encode(b"RIFF mock wav data").decode()

@pytest.fixture
def mock_transcript():
    """Returns mock transcription result"""
    return "wa-ter ple-ase help"

@pytest.fixture  
def mock_gemini_response():
    """Returns mock Gemini correction response"""
    return {
        "corrected_text": "water please help",
        "confidence": 0.87,
        "changes": ["restored word boundaries"]
    }

@pytest.fixture
def mock_audio_chunks():
    """Returns mock TTS audio chunks (generator)"""
    return [b'mock', b'audio', b'data']

@pytest.fixture
def mock_elevenlabs(monkeypatch):
    """Mocks the ElevenLabs client"""
    mock = MagicMock()
    monkeypatch.setattr("agent.eleven", mock)
    return mock

@pytest.fixture
def mock_key_manager(monkeypatch):
    """Mocks the GeminiKeyManager"""
    mock = MagicMock()
    monkeypatch.setattr("agent.key_manager", mock)
    return mock
```

---

## Mocking Patterns

### Mock ElevenLabs STT
```python
@patch("agent.eleven.speech_to_text.convert")
def test_transcribe(mock_convert):
    mock_result = Mock()
    mock_result.text = "transcribed text"
    mock_convert.return_value = mock_result
    # ... test code
```

### Mock Gemini Correction
```python
@patch("agent.key_manager.invoke")
def test_correct(mock_invoke):
    mock_response = Mock()
    mock_response.content = '{"corrected_text": "hello", "confidence": 0.9, "changes": []}'
    mock_invoke.return_value = mock_response
    # ... test code
```

### Mock ElevenLabs TTS
```python
@patch("agent.eleven.text_to_speech.convert")
def test_synthesise(mock_convert):
    mock_convert.return_value = [b'mock', b'audio']
    # ... test code
```

---

## Success Criteria

- [ ] All helper functions tested (100% coverage)
- [ ] All three tools tested individually with mocks
- [ ] Each condition type tested (dysarthria, stuttering, aphasia, general)
- [ ] Error handling and edge cases covered
- [ ] Key rotation logic tested
- [ ] Full pipeline integration tested
- [ ] Async wrapper tested
- [ ] All tests pass with `pytest tests/test_agent_tools.py`
- [ ] Tests run quickly (no real API calls)

---

## Running Tests

```bash
# Run all agent tool tests
pytest tests/test_agent_tools.py -v

# Run specific test class
pytest tests/test_agent_tools.py::TestTranscribeAudio -v

# Run with coverage
pytest tests/test_agent_tools.py --cov=agent --cov-report=term-missing

# Run single test
pytest tests/test_agent_tools.py::TestTranscribeAudio::test_basic_transcription -v
```

---

## Notes

- **Mock all external APIs** - No real ElevenLabs or Gemini calls during tests
- **Use pytest fixtures** for common setup (audio data, mocks)
- **Test isolation** - Each test should be independent
- **Fast execution** - All tests should run in < 5 seconds total
- **Use dataset samples** - Leverage `load_dysarthria_patient_samples()` for realistic audio
- **Verify logging** - Check that appropriate log messages are generated

---

## Implementation Priority

1. **Phase 1:** Helper functions (`_message_content_to_str`, `_normalize_tool_result`)
2. **Phase 2:** Individual tool tests with basic happy paths
3. **Phase 3:** Edge cases and error handling
4. **Phase 4:** Pipeline integration and key rotation
5. **Phase 5:** Async wrapper and full system tests

---

## Future Enhancements

- Add property-based testing with `hypothesis` for fuzz testing
- Add performance benchmarks for pipeline latency
- Test with real audio samples in CI/CD (integration tests)
- Add mutation testing to verify test quality
