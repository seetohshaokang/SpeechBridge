import pandas as pd
import base64
from pathlib import Path

def load_dysarthria_patient_samples(
    n_samples: int = 10,
    gender: str = None,  # "Male" or "Female" or None for both
    patient_id: str = None,  # e.g., "M01", "F03"
) -> list[dict]:
    """
    Load audio samples from dysarthria patients only.
    
    Args:
        n_samples: Number of samples to load
        gender: Filter by "Male" or "Female" (None = all)
        patient_id: Filter by specific patient (e.g., "M01")
    
    Returns:
        List of dicts with audio_b64, expected_text, metadata
    """
    # Load and filter CSV
    df = pd.read_csv("data/data_with_path.csv")
    df = df[df["Is_dysarthria"] == "Yes"]  # Only dysarthria patients
    
    if gender:
        df = df[df["Gender"] == gender]
    
    if patient_id:
        # Filter by patient ID in the path
        df = df[df["Wav_path"].str.contains(f"/{patient_id}/")]
    
    samples = df.head(n_samples)
    
    results = []
    base_path = Path("data/Dysarthria and Non Dysarthria/Dataset")
    
    for _, row in samples.iterrows():
        # Convert Kaggle paths to local paths
        wav_rel = row["Wav_path"].split("Dataset/")[1]
        txt_rel = row["Txt_path"].split("Dataset/")[1]
        
        wav_file = base_path / wav_rel
        txt_file = base_path / txt_rel
        
        if wav_file.exists() and txt_file.exists():
            # Read and encode audio
            with open(wav_file, "rb") as f:
                audio_b64 = base64.b64encode(f.read()).decode()
            
            # Read expected text
            with open(txt_file, "r") as f:
                expected_text = f.read().strip()
            
            results.append({
                "audio_b64": audio_b64,
                "expected_text": expected_text,
                "gender": row["Gender"],
                "prompt": row["Prompts"],
                "wav_path": str(wav_file),
                "txt_path": str(txt_file),
            })
    
    return results

if __name__ == "__main__":
    # Test 1: Load basic samples
    print("Test 1: Loading 5 dysarthria samples...")
    samples = load_dysarthria_patient_samples(n_samples=5)
    print(f"✓ Loaded {len(samples)} samples")
    assert len(samples) > 0, "No samples loaded!"

     # Test 2: Validate structure
    print("\nTest 2: Validating data structure...")
    first = samples[0]
    required_keys = ["audio_b64", "expected_text", "gender", "prompt", "wav_path", "txt_path"]
    for key in required_keys:
        assert key in first, f"Missing key: {key}"
    print(f"✓ All required keys present: {list(first.keys())}")

    # Test 3: Validate audio is properly encoded
    print("\nTest 3: Checking audio encoding...")
    audio_bytes = base64.b64decode(first["audio_b64"])
    print(f"✓ Audio size: {len(audio_bytes)} bytes")
    assert len(audio_bytes) > 1000, "Audio seems too small"
    assert audio_bytes[:4] == b'RIFF', "Not a valid WAV file"

    # Test 4: Gender filter
    print("\nTest 4: Testing gender filter...")
    male_samples = load_dysarthria_patient_samples(n_samples=3, gender="Male")
    assert all(s["gender"] == "Male" for s in male_samples)
    print(f"✓ Gender filter works: {len(male_samples)} male samples")
    
    # Test 5: Patient ID filter
    print("\nTest 5: Testing patient ID filter...")
    m01_samples = load_dysarthria_patient_samples(n_samples=3, patient_id="M01")
    assert all("M01" in s["wav_path"] for s in m01_samples)
    print(f"✓ Patient filter works: {len(m01_samples)} samples from M01")

     # Test 6: Display sample content
    print("\nTest 6: Sample data preview...")
    for i, sample in enumerate(samples[:3], 1):
        print(f"\n  Sample {i}:")
        print(f"    Expected: {sample['expected_text']}")
        print(f"    Gender: {sample['gender']}")
        print(f"    Audio size: {len(base64.b64decode(sample['audio_b64']))} bytes")
        print(f"    Path: {Path(sample['wav_path']).name}")

    # Test 7: Verify paths are correct
    print("\nTest 7: Validating file paths...")
    assert Path(first["wav_path"]).exists(), f"WAV file not found: {first['wav_path']}"
    assert Path(first["txt_path"]).exists(), f"TXT file not found: {first['txt_path']}"
    print("✓ All file paths valid")
    
    print("\n✅ All validation tests passed!")