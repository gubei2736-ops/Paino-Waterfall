from music21 import stream, note, tempo, clef, musicxml
import xml.etree.ElementTree as ET

p2 = stream.Part()
p2.append(clef.BassClef())
p2.append(tempo.MetronomeMark(number=120))

# Try makeRests
p2.makeRests(inPlace=True)
p2.makeMeasures(inPlace=True)

score = stream.Score()
score.insert(0, p2)

exporter = musicxml.m21ToXml.ScoreExporter(score)
xml_element = exporter.parse()
xml_str = ET.tostring(xml_element, encoding='utf-8').decode('utf-8')

print("Part 2 XML output:")
print(xml_str)
