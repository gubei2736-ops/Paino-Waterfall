import sys
from pydantic import BaseModel
from typing import List
import xml.etree.ElementTree as ET

class NoteEvent(BaseModel):
    midi: int
    time: float
    duration: float

class TranscribeRequest(BaseModel):
    notes: List[NoteEvent]
    bpm: int = 120

def transcribe_midi_handler(req: TranscribeRequest):
    try:
        from music21 import stream, note, chord, tempo, metadata, key, clef, layout, musicxml
        
        # 1. Group notes by start time (chord detection)
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
        p2 = stream.Part() # Left hand (Bass)
        
        p1.append(clef.TrebleClef())
        p2.append(clef.BassClef())
        
        p1.append(tempo.MetronomeMark(number=req.bpm))
        p2.append(tempo.MetronomeMark(number=req.bpm))
        
        # Split notes by hand: Right hand (MIDI >= 60), Left hand (MIDI < 60)
        for group in grouped_notes:
            right_notes = [n for n in group if n.midi >= 60]
            left_notes = [n for n in group if n.midi < 60]
            
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
        raise e

# Create mock request
req = TranscribeRequest(notes=[
    NoteEvent(midi=60, time=0.0, duration=0.8),
    NoteEvent(midi=64, time=1.0, duration=0.9),
    NoteEvent(midi=48, time=0.0, duration=2.0)
], bpm=120)

transcribe_midi_handler(req)
print("Endpoint handler run successfully!")
sys.exit(0)
