from music21 import stream, note, chord, tempo, metadata, key, clef, layout, musicxml
import xml.etree.ElementTree as ET

# Overlapping notes: Note 1 starts at 0, dur 4 beats. Note 2 starts at 2, dur 4 beats.
p1 = stream.Part()
p1.append(clef.TrebleClef())
p1.insert(0.0, note.Note(60, quarterLength=4.0))
p1.insert(2.0, note.Note(64, quarterLength=4.0))

print("Before makeMeasures:")
for el in p1.elements:
    print(el, el.offset)

try:
    p1.makeMeasures(inPlace=True)
    print("\nAfter makeMeasures:")
    for el in p1.elements:
        print(el, el.offset)
        if isinstance(el, stream.Measure):
            for sub in el.elements:
                print("  ", sub, sub.offset)
except Exception as e:
    print("Error in makeMeasures:", e)
