import os
import sys
import xml.etree.ElementTree as ET
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Piano Waterfall Backend")

# Enable CORS for frontend requests
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

@app.get("/api/soundfonts")
def list_soundfonts():
  project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
  soundfonts_dir = os.path.join(project_root, "frontend", "public", "soundfonts")
  if not os.path.exists(soundfonts_dir):
    try:
      os.makedirs(soundfonts_dir, exist_ok=True)
    except Exception as e:
      print(f"Failed to create soundfonts directory: {e}")
      return {}
      
  soundfonts = {}
  try:
    for entry in os.scandir(soundfonts_dir):
      if entry.is_dir():
        # Get list of audio files inside
        audio_files = []
        for f in os.scandir(entry.path):
          if f.is_file() and f.name.lower().endswith(('.wav', '.mp3', '.ogg', '.aac')):
            audio_files.append(f.name)
        soundfonts[entry.name] = audio_files
  except Exception as e:
    print(f"Error scanning soundfonts: {e}")
  return soundfonts

class NoteEvent(BaseModel):
    midi: int
    time: float
    duration: float

class TranscribeRequest(BaseModel):
    notes: List[NoteEvent]
    bpm: int = 120
    key: str = "C"
    time_signature: str = "4/4"

@app.post("/api/transcribe")
def transcribe_midi(req: TranscribeRequest):
    if not req.notes:
        raise HTTPException(status_code=400, detail="No notes provided for transcription")
        
    print(f"[api/transcribe] Received {len(req.notes)} notes: {[{'midi': n.midi, 'time': round(n.time, 3), 'duration': round(n.duration, 3)} for n in req.notes]}")
    try:
        from music21 import stream, note, chord, tempo, metadata, key, clef, layout, musicxml, meter
        
        # 1. Group notes by start time (chord detection)
        # We group notes starting within a 0.05-second (50ms) window
        grouped_notes = []
        sorted_raw = sorted(req.notes, key=lambda x: x.time)
        
        current_group = []
        group_start_time = -1.0
        
        for n in sorted_raw:
            if group_start_time < 0:
                current_group = [n]
                group_start_time = n.time
            elif n.time - group_start_time <= 0.05:
                current_group.append(n)
            else:
                grouped_notes.append(current_group)
                current_group = [n]
                group_start_time = n.time
        if current_group:
            grouped_notes.append(current_group)
            
        # 2. Setup music21 streams
        p1 = stream.Part() # Right hand (Treble)
        p1.id = 'RightHand'
        p1.partName = ' '
        
        p2 = stream.Part() # Left hand (Bass)
        p2.id = 'LeftHand'
        p2.partName = ' '
        
        p1.append(clef.TrebleClef())
        p2.append(clef.BassClef())
        
        # Add Key Signature
        try:
            p1.append(key.Key(req.key))
            p2.append(key.Key(req.key))
        except Exception as e:
            print(f"[api/transcribe] Warning: Failed to set key {req.key}: {e}")
            p1.append(key.Key('C'))
            p2.append(key.Key('C'))
            
        # Add Time Signature
        try:
            p1.append(meter.TimeSignature(req.time_signature))
            p2.append(meter.TimeSignature(req.time_signature))
        except Exception as e:
            print(f"[api/transcribe] Warning: Failed to set time signature {req.time_signature}: {e}")
            p1.append(meter.TimeSignature('4/4'))
            p2.append(meter.TimeSignature('4/4'))
            
        p1.append(tempo.MetronomeMark(number=req.bpm))
        p2.append(tempo.MetronomeMark(number=req.bpm))
        
        # Smart adaptive hand splitting heuristic
        last_right_midi = 72.0
        last_left_midi = 48.0
        
        for group in grouped_notes:
            sorted_notes = sorted(group, key=lambda x: x.midi)
            right_notes = []
            left_notes = []
            
            for n in sorted_notes:
                # Calculate assignment scores
                dist_right = abs(n.midi - last_right_midi)
                dist_left = abs(n.midi - last_left_midi)
                
                # Bias based on central C (60)
                bias_right = 10.0 if n.midi >= 60 else 0.0
                bias_left = 10.0 if n.midi < 60 else 0.0
                
                score_right = -dist_right + bias_right
                score_left = -dist_left + bias_left
                
                if score_right > score_left:
                    right_notes.append(n)
                else:
                    left_notes.append(n)
            
            # Post-processing: Enforce strict separation (no crossover within the same chord)
            if right_notes and left_notes:
                min_right = min(n.midi for n in right_notes)
                max_left = max(n.midi for n in left_notes)
                if min_right < max_left:
                    # Fallback to simple split at 60 for this group
                    right_notes = [n for n in group if n.midi >= 60]
                    left_notes = [n for n in group if n.midi < 60]
            
            # Update moving averages
            if right_notes:
                avg_right = sum(n.midi for n in right_notes) / len(right_notes)
                last_right_midi = 0.8 * last_right_midi + 0.2 * avg_right
            if left_notes:
                avg_left = sum(n.midi for n in left_notes) / len(left_notes)
                last_left_midi = 0.8 * last_left_midi + 0.2 * avg_left
            
            # Start offset in beats: time in seconds -> beats: time * bpm / 60
            avg_time = sum(n.time for n in group) / len(group)
            offset_beats = avg_time * req.bpm / 60.0
            
            if right_notes:
                max_dur_sec = max(n.duration for n in right_notes)
                dur_beats = max_dur_sec * req.bpm / 60.0
                dur_beats = max(0.25, dur_beats) # Clamp to at least 1/16th note
                
                if len(right_notes) == 1:
                    el = note.Note(right_notes[0].midi)
                else:
                    el = chord.Chord([n.midi for n in right_notes])
                el.quarterLength = dur_beats
                p1.insert(offset_beats, el)
                
            if left_notes:
                max_dur_sec = max(n.duration for n in left_notes)
                dur_beats = max_dur_sec * req.bpm / 60.0
                dur_beats = max(0.25, dur_beats)
                
                if len(left_notes) == 1:
                    el = note.Note(left_notes[0].midi)
                else:
                    el = chord.Chord([n.midi for n in left_notes])
                el.quarterLength = dur_beats
                p2.insert(offset_beats, el)
                
        # 3. Quantize both streams
        p1 = p1.quantize(quarterLengthDivisors=(4, 3), processOffsets=True, processDurations=True)
        p2 = p2.quantize(quarterLengthDivisors=(4, 3), processOffsets=True, processDurations=True)
        
        # Calculate total duration in beats, rounding up to the nearest full measure (calculated from time signature)
        import math
        
        beats_per_measure = 4.0
        try:
            parts = req.time_signature.split('/')
            num = int(parts[0])
            den = int(parts[1])
            if den == 4:
                beats_per_measure = float(num)
            elif den == 8:
                beats_per_measure = float(num) / 2.0
            elif den == 2:
                beats_per_measure = float(num) * 2.0
        except Exception as e:
            print(f"[api/transcribe] Failed to parse beats_per_measure from {req.time_signature}: {e}")

        max_time_sec = max((n.time + n.duration) for n in req.notes)
        total_duration_beats = max_time_sec * req.bpm / 60.0
        total_measures = max(1, math.ceil(total_duration_beats / beats_per_measure))
        total_duration_beats = float(total_measures * beats_per_measure)
        
        # Fill rests over the entire time range to avoid empty measures or durational mismatches
        p1.makeRests([0.0, total_duration_beats], fillGaps=True, inPlace=True)
        p2.makeRests([0.0, total_duration_beats], fillGaps=True, inPlace=True)
        
        # 4. Fill rests and split measures
        p1.makeMeasures(inPlace=True)
        p2.makeMeasures(inPlace=True)
        
        # 5. Assemble Score
        score = stream.Score()
        score.insert(0, metadata.Metadata(title="Live Recorded Performance"))
        
        staffGroup = layout.StaffGroup([p1, p2], symbol='brace', name='Piano')
        score.insert(0, staffGroup)
        
        score.insert(0, p1)
        score.insert(0, p2)
        
        # 6. Export to MusicXML
        exporter = musicxml.m21ToXml.ScoreExporter(score)
        xml_element = exporter.parse()
        
        xml_bytes = ET.tostring(xml_element, encoding='utf-8')
        xml_str = xml_bytes.decode('utf-8')
        
        # Add standard declarations
        declaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
        doctype = '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n'
        final_xml = declaration + doctype + xml_str
        
        return {"status": "success", "xml": final_xml}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")

if __name__ == "__main__":
  import uvicorn
  # Run uvicorn on port 8000
  uvicorn.run(app, host="0.0.0.0", port=8000)
