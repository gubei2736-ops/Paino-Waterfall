from music21 import stream, note, chord, tempo, metadata, key, clef, layout, musicxml
import xml.etree.ElementTree as ET

notes = [
    {'midi': 60, 'time': 0.0, 'duration': 0.8},
    {'midi': 64, 'time': 1.0, 'duration': 0.9},
    {'midi': 67, 'time': 2.0, 'duration': 1.0},
    {'midi': 48, 'time': 0.0, 'duration': 2.0}
]
bpm = 120

p1 = stream.Part()
p2 = stream.Part()
p1.append(clef.TrebleClef())
p2.append(clef.BassClef())

# Let's populate
for n in notes:
    el = note.Note(n['midi'])
    el.quarterLength = n['duration'] * (bpm / 60.0)
    offset = n['time'] * (bpm / 60.0)
    if n['midi'] >= 60:
        p1.insert(offset, el)
    else:
        p2.insert(offset, el)

print("Before quantize:")
print("p1 elements:")
for el in p1.elements:
    print(el, el.offset)

p1 = p1.quantize(quarterLengthDivisors=(4, 3), processOffsets=True, processDurations=True)
p2 = p2.quantize(quarterLengthDivisors=(4, 3), processOffsets=True, processDurations=True)

print("\nAfter quantize:")
print("p1 elements:")
for el in p1.elements:
    print(el, el.offset)

p1.makeMeasures(inPlace=True)
p2.makeMeasures(inPlace=True)

print("\nAfter makeMeasures:")
print("p1 elements:")
for el in p1.elements:
    print(el, el.offset)
    if isinstance(el, stream.Measure):
        for sub in el.elements:
            print("  ", sub, sub.offset)

score = stream.Score()
score.insert(0, p1)
score.insert(0, p2)

exporter = musicxml.m21ToXml.ScoreExporter(score)
xml_element = exporter.parse()
xml_str = ET.tostring(xml_element, encoding='utf-8').decode('utf-8')

# Find how many notes are in XML
note_count = xml_str.count('<note>')
print(f"\nXML note tags count: {note_count}")
