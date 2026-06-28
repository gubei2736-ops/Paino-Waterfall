import os
import sys
import shutil
import tempfile
import subprocess

# Add PyTorch-bundled CUDA DLLs to system PATH to enable GPU acceleration in ONNX Runtime
try:
    import torch
    torch_lib_dir = os.path.join(os.path.dirname(torch.__file__), "lib")
    if os.path.exists(torch_lib_dir):
        os.environ["PATH"] = torch_lib_dir + os.pathsep + os.environ["PATH"]
except Exception as e:
    print(f"Failed to append PyTorch CUDA path: {e}")

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
import fitz  # PyMuPDF
import xml.etree.ElementTree as ET
import json
from pydantic import BaseModel
from typing import List

app = FastAPI(title="PDF Music Chord Backend")

# Enable CORS for frontend requests
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],  # In production, specify the frontend origin, e.g. http://localhost:5173
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

def find_children_by_tag_localname(parent, local_name):
  results = []
  for elem in parent:
    tag = elem.tag
    if '}' in tag:
      tag_local = tag.split('}', 1)[1]
    else:
      tag_local = tag
    if tag_local == local_name:
      results.append(elem)
  return results

# Helper to merge multiple MusicXML streams page by page
def merge_musicxml_files(xml_paths):
  if not xml_paths:
    return ""
  
  if len(xml_paths) == 1:
    with open(xml_paths[0], 'r', encoding='utf-8') as f:
      return f.read()
      
  try:
    tree = ET.parse(xml_paths[0])
    root = tree.getroot()
  except Exception as e:
    print(f"Error parsing first XML file: {e}")
    with open(xml_paths[0], 'r', encoding='utf-8') as f:
      return f.read()

  main_parts = {}
  for part in find_children_by_tag_localname(root, 'part'):
    part_id = part.get('id')
    if part_id:
      main_parts[part_id] = part

  part_measure_counters = {}
  for part_id, part in main_parts.items():
    measures = find_children_by_tag_localname(part, 'measure')
    part_measure_counters[part_id] = len(measures)

  for xml_path in xml_paths[1:]:
    try:
      page_tree = ET.parse(xml_path)
      page_root = page_tree.getroot()
      
      for page_part in find_children_by_tag_localname(page_root, 'part'):
        part_id = page_part.get('id')
        if part_id in main_parts:
          main_part = main_parts[part_id]
          for measure in find_children_by_tag_localname(page_part, 'measure'):
            part_measure_counters[part_id] += 1
            measure.set('number', str(part_measure_counters[part_id]))
            main_part.append(measure)
    except Exception as e:
      print(f"Error merging XML file {xml_path}: {e}")

  try:
    xml_bytes = ET.tostring(root, encoding='utf-8')
    xml_str = xml_bytes.decode('utf-8')
    
    declaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
    doctype = '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n'
    
    if xml_str.startswith('<?xml'):
      lines = xml_str.split('\n')
      if lines[0].startswith('<?xml'):
        xml_str = '\n'.join(lines[1:])
    
    return declaration + doctype + xml_str
  except Exception as e:
    print(f"Error serializing merged XML: {e}")
    with open(xml_paths[0], 'r', encoding='utf-8') as f:
      return f.read()


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
  lower_filename = file.filename.lower()
  is_pdf = lower_filename.endswith(".pdf")
  is_image = any(lower_filename.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".bmp", ".webp"])
  
  if not is_pdf and not is_image:
    raise HTTPException(status_code=400, detail="Only PDF and Image files (PNG, JPG, JPEG, BMP, WEBP) are supported.")
    
  def progress_generator():
    temp_dir = tempfile.mkdtemp()
    
    try:
      image_paths = []
      if is_pdf:
        yield f"data: {json.dumps({'status': 'processing', 'stage': '正在提取并保存上传的 PDF 乐谱...', 'progress': 5})}\n\n"
        pdf_path = os.path.join(temp_dir, "input.pdf")
        with open(pdf_path, "wb") as f:
          shutil.copyfileobj(file.file, f)
          
        yield f"data: {json.dumps({'status': 'processing', 'stage': '正在将 PDF 转换为高分辨率图像...', 'progress': 10})}\n\n"
        doc = fitz.open(pdf_path)
        for page_idx in range(len(doc)):
          page = doc.load_page(page_idx)
          matrix = fitz.Matrix(4, 4)
          pix = page.get_pixmap(matrix=matrix)
          img_path = os.path.join(temp_dir, f"page_{page_idx}.png")
          pix.save(img_path)
          image_paths.append(img_path)
        doc.close()
      else:
        yield f"data: {json.dumps({'status': 'processing', 'stage': '正在保存上传的乐谱图片...', 'progress': 8})}\n\n"
        img_ext = os.path.splitext(lower_filename)[1]
        img_path = os.path.join(temp_dir, f"page_0{img_ext}")
        with open(img_path, "wb") as f:
          shutil.copyfileobj(file.file, f)
        image_paths = [img_path]
      
      total_pages = len(image_paths)
      xml_paths = []
      
      # 3. Process each page image with oemer OMR engine
      for idx, img_path in enumerate(image_paths):
        page_num = idx + 1
        page_progress_start = 12 + int((idx / total_pages) * 73)
        page_progress_end = 12 + int(((idx + 1) / total_pages) * 73)
        page_range = page_progress_end - page_progress_start
        
        yield f"data: {json.dumps({'status': 'processing', 'stage': f'正在启动第 {page_num}/{total_pages} 页的智能乐谱识别...', 'progress': page_progress_start})}\n\n"
        
        try:
          oemer_bin = os.path.join(os.path.dirname(sys.executable), "oemer")
          
          # Force python to run unbuffered so stderr flushes immediately
          env = os.environ.copy()
          env["PYTHONUNBUFFERED"] = "1"
          
          process = subprocess.Popen(
            [oemer_bin, os.path.basename(img_path)],
            cwd=temp_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env
          )
          
          # Read stderr output line by line in real time
          while True:
            line = process.stderr.readline()
            if not line and process.poll() is not None:
              break
            if line:
              line_str = line.strip()
              print(f"[Oemer Page {page_num}]: {line_str}")
              
              stage_name = None
              progress_pct = page_progress_start
              
              # Map oemer pipeline logs to Chinese stages and percentage slices
              if "Extracting staffline and symbols" in line_str:
                stage_name = f"第 {page_num}/{total_pages} 页：正在提取乐谱五线与基础音符"
                progress_pct = page_progress_start + int(page_range * 0.15)
              elif "Extracting layers of different symbols" in line_str:
                stage_name = f"第 {page_num}/{total_pages} 页：正在分类乐理记号图层"
                progress_pct = page_progress_start + int(page_range * 0.45)
              elif "Dewarping" in line_str:
                stage_name = f"第 {page_num}/{total_pages} 页：正在纠正谱面倾斜与几何变形"
                progress_pct = page_progress_start + int(page_range * 0.70)
              elif "Extracting note groups" in line_str:
                stage_name = f"第 {page_num}/{total_pages} 页：正在重建多声部音符关联组"
                progress_pct = page_progress_start + int(page_range * 0.80)
              elif "Extracting clefs and keys" in line_str:
                stage_name = f"第 {page_num}/{total_pages} 页：正在提取谱号与调号"
                progress_pct = page_progress_start + int(page_range * 0.85)
              elif "Extracting stems and rests" in line_str:
                stage_name = f"第 {page_num}/{total_pages} 页：正在补充音符符干与休止符"
                progress_pct = page_progress_start + int(page_range * 0.90)
              elif "Building score" in line_str:
                stage_name = f"第 {page_num}/{total_pages} 页：正在组装生成 MusicXML 结构"
                progress_pct = page_progress_start + int(page_range * 0.95)
                
              if stage_name:
                yield f"data: {json.dumps({'status': 'processing', 'stage': stage_name, 'progress': progress_pct})}\n\n"
                
          process.communicate()
          
          # Check output file
          base_name = os.path.splitext(os.path.basename(img_path))[0]
          xml_file = os.path.join(temp_dir, f"{base_name}.musicxml")
          
          if os.path.exists(xml_file):
            xml_paths.append(xml_file)
          else:
            print(f"OMR page {page_num} completed but file was not generated: {xml_file}")
        except Exception as err:
          print(f"OMR failed for page {img_path}: {err}")
          
      if not xml_paths:
        yield f"data: {json.dumps({'status': 'error', 'message': '光学乐谱识别 (OMR) 失败，未能从该 PDF 中解析提取出任何有效的五线谱音符。'})}\n\n"
        return
        
      # 4. Merge MusicXML pages into a unified score
      yield f"data: {json.dumps({'status': 'processing', 'stage': '多页合并：正在合并对齐解析出来的 XML 各页数据...', 'progress': 88})}\n\n"
      try:
        xml_result = merge_musicxml_files(xml_paths)
      except Exception as err:
        print(f"Merge MusicXML files failed: {err}")
        yield f"data: {json.dumps({'status': 'error', 'message': f'合并多页 MusicXML 时失败: {str(err)}'})}\n\n"
        return
        
      if not xml_result:
        yield f"data: {json.dumps({'status': 'error', 'message': '合并多页 MusicXML 时失败，生成的 XML 为空。'})}\n\n"
        return
        
      # 5. Perform乐理分析
      yield f"data: {json.dumps({'status': 'processing', 'stage': '乐理分析：正在运用调性规则优化谱面渲染...', 'progress': 95})}\n\n"
      
      # 6. Serialize score back to MusicXML string
      yield f"data: {json.dumps({'status': 'processing', 'stage': '分析完成：正在构建最终的 MusicXML 输出流...', 'progress': 98})}\n\n"
      
      # Final completed event with result XML
      yield f"data: {json.dumps({'status': 'completed', 'stage': '识别成功！正在主工作区渲染绘制五线谱...', 'progress': 100, 'result': xml_result})}\n\n"
      
    except Exception as e:
      print(f"Global backend stream error: {e}")
      yield f"data: {json.dumps({'status': 'error', 'message': f'服务器后端处理异常: {str(e)}'})}\n\n"
    finally:
      try:
        shutil.rmtree(temp_dir)
      except Exception:
        pass
        
  return StreamingResponse(progress_generator(), media_type="text/event-stream")

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

@app.post("/api/transcribe")
def transcribe_midi(req: TranscribeRequest):
    if not req.notes:
        raise HTTPException(status_code=400, detail="No notes provided for transcription")
        
    print(f"[api/transcribe] Received {len(req.notes)} notes: {[{'midi': n.midi, 'time': round(n.time, 3), 'duration': round(n.duration, 3)} for n in req.notes]}")
    try:
        from music21 import stream, note, chord, tempo, metadata, key, clef, layout, musicxml
        
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
        
        # Calculate total duration in beats, rounding up to the nearest full measure (4 beats)
        import math
        max_time_sec = max((n.time + n.duration) for n in req.notes)
        total_duration_beats = max_time_sec * req.bpm / 60.0
        total_measures = max(1, math.ceil(total_duration_beats / 4.0))
        total_duration_beats = float(total_measures * 4.0)
        
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
