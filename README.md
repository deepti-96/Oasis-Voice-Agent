<img src="assets/banner.png" alt="Logo" style="border-radius: 30px; width: 60%;">

## Context
- Cactus (YC S25) is a low-latency engine for mobile devices & wearables. 
- Cactus runs locally on edge devices with hybrid routing of complex tasks to cloud models like Gemini.
- Google DeepMind just released Gemma 4, the first on-device model you can voice-prompt. 
- Gemma 4 on Cactus is multimodal, supporting voice, vision, function calling, transcription and more! 

## Challenge
- All teams MUST build products that use Gemma 4 on Cactus. 
- All products MUST leverage voice functionality in some way. 
- All submissions MUST be working MVPs capable of venture backing. 
- Winner takes all: Guaranteed YC Interview + GCP Credits. 

## Special Tracks 
- Best On-Device Enterprise Agent (B2B): Highest commercial viability for offline tools.
- Ultimate Consumer Voice Experience (B2C): Best use of low-latency compute to create ultra-natural, instantaneous voice interaction.
- Deepest Technical Integration: Pushing the boundaries of the hardware/software stack (e.g., novel routing, multi-agent on-device setups, extreme power optimization).

Prizes per special track: 
- 1st Place: $2,000 in GCP credits
- 2nd Place: $1,000 in GCP credits 
- 3rd Place: $500 in GCP credits 

## Judging 
- **Rubric 1**: The relevnance and realness of the problem and appeal to enterprises and VCs. 
- **Rubric 2**: Correcness & quality of the MVP and demo. 

## Setup (clone this repo and hollistically follow)
- Step 1: Fork this repo, clone to your Mac, open terminal.
- Step 2: `git clone https://github.com/cactus-compute/cactus`
- Step 3: `cd cactus && source ./setup && cd ..` (re-run in new terminal)
- Step 4: `cactus build --python`
- Step 5: `cactus download google/functiongemma-270m-it --reconvert`
- Step 6: Get cactus key from the [cactus website](https://cactuscompute.com/dashboard/api-keys)
- Sept 7: Run `cactus auth` and enter your token when prompted.
- Step 8: `pip install google-genai` (if using cloud fallback) 
- Step 9: Obtain Gemini API key from [Google AI Studio](https://aistudio.google.com/api-keys) (if using cloud fallback) 
- Step 10: `export GEMINI_API_KEY="your-key"` (if using cloud fallback) 

## Next steps
1. Read Cactus docs carefully: [Link](https://docs.cactuscompute.com/latest/)
2. Read Gemma 4 on Cactus walkthrough carefully: [Link](https://docs.cactuscompute.com/latest/blog/gemma4/)
3. Cactus & DeepMind team would be available on-site. 

---

## Our Project: Crisis Intake

### What It Does
A React Native iOS app that turns natural conversation into structured housing intake data on-device. A field worker sits with a displaced individual and just talks — the app listens, transcribes, extracts structured fields via Gemma 4 tool calling, and fills a visual form in real-time. Audio never persists. PII never leaves the device.

### Why It Matters
Housing intake for displaced individuals currently takes 30-60 minutes of rigid form-based Q&A. The caseworker reads questions, types answers, breaks eye contact, and processes the person rather than helping them. Our app does 90 seconds of natural conversation, extracts 20+ structured fields on-device, and generates a 30-day resource plan via sanitized cloud handoff.

### Architecture
- **On-device**: Gemma 4 E2B (INT4, ~400MB) for entity extraction via tool calling + document vision. Moonshine STT (61M) for transcription. Silero VAD for silence detection. All via Cactus React Native SDK.
- **Pipeline**: Audio chunk → VAD → silence trigger → STT → editable transcript → Gemma 4 tool call → form fills (grey → amber → green) → audio buffer flushed
- **Cloud (optional)**: Sanitized data (PII stripped) → Gemini 2.5 Flash → risk score + 30-day timeline + program matching
- **Privacy**: Audio never written to disk. Images deleted after vision extraction. Confirmed fields can't be overwritten by AI. Sanitization strips names, DOB, phone, address before any cloud call.

### Track
Deepest Technical Integration / Best On-Device Enterprise Agent (B2B)

### Docs
- [Design Specification](docs/superpowers/specs/2026-04-18-crisis-intake-design.md)
- [Implementation Plan](docs/plans/2026-04-18-crisis-intake-implementation.md)