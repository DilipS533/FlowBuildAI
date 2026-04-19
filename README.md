# StepSight AI

React/Vite version of the browser-only realtime task guidance app. It keeps the same product behavior:

- PDF upload or pasted text instruction parsing
- live webcam capture with `getUserMedia()`
- motion detection through frame differencing in the browser
- MediaPipe hand tracking with overlay points, trails, and labels
- automatic step progression after motion plus stabilization
- realtime voice guidance with the Web Speech API

## Architecture

The app is split by responsibility:

- `src/components/`: UI layout and display components
- `src/hooks/useFlowSession.js`: session orchestration, camera lifecycle, step engine
- `src/hooks/useSpeechGuide.js`: speech queue and voice behavior
- `src/lib/`: PDF parsing, motion analysis, hand overlay rendering, instruction parsing
- `src/config/analysisConfig.js`: motion and hand-tracking thresholds

## Run locally

Install dependencies:

```powershell
npm install
```

Start the dev server:

```powershell
npm run dev
```

Then open the local Vite URL shown in the terminal. `localhost` satisfies the secure-context requirement for webcam access.

## Branching

The original working single-file implementation is preserved on `main`.
The modular React refactor lives on `refactor/react-modular-architecture`.
