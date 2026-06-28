from music21 import stream, note, chord, tempo, metadata, key, clef, layout, musicxml
import xml.etree.ElementTree as ET

p1 = stream.Part()
p1.append(clef.TrebleClef())
p1.insert(0.0, note.Note(60, quarterLength=4.0))
p1.insert(2.0, note.Note(64, quarterLength=4.0))
p1.makeMeasures(inPlace=True)

score = stream.Score()
score.insert(0, p1)

exporter = musicxml.m21ToXml.ScoreExporter(score)
xml_element = exporter.parse()
xml_str = ET.tostring(xml_element, encoding='utf-8').decode('utf-8')
print(xml_str)
