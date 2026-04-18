# FlowStep AI

Browser-only realtime task guidance and verification. The app accepts PDF or pasted instructions, turns them into steps, watches the user through the webcam, detects action using frame differencing, overlays MediaPipe hand landmarks, advances steps automatically, and speaks guidance with the Web Speech API.

## Run locally

`getUserMedia()` requires a secure context, so serve the folder over `http://localhost` instead of opening `index.html` directly.

PowerShell:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## What is implemented

- PDF upload and pasted-text parsing into an in-browser step list
- Live webcam feed with a hidden capture canvas sampled on an interval
- Motion detection using frame differencing between consecutive sampled frames
- MediaPipe Hands overlay with live hand landmark drawing
- Automatic step progression based on motion start, stabilization, and hand presence
- Real-time voice guidance, confirmations, corrections, and idle prompts
- Demo Mode that lowers thresholds for live demos
