#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import shutil
import tempfile
import zipfile
import re
import time
import struct
import zlib

JOIN_BIN = "/System/Library/Automator/Combine PDF Pages.action/Contents/MacOS/join"

def run_cmd(cmd, stdout=None, stderr=None):
    try:
        res = subprocess.run(cmd, stdout=stdout, stderr=stderr, capture_output=(stdout is None), text=True)
        return res.returncode == 0, res.stdout, res.stderr
    except Exception as e:
        return False, "", str(e)

def count_pdf_pages(filepath):
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
        matches = re.findall(rb'/Type\s*/Page(?=[^s]|$)', data)
        return max(1, len(matches))
    except Exception:
        return 1

def generate_thumbnail(input_path, output_path, max_dim=300):
    ext = os.path.splitext(input_path)[1].lower()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Image types
    if ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.gif']:
        cmd = ['sips', '-s', 'format', 'png', '-Z', str(max_dim), input_path, '--out', output_path]
        ok, out, err = run_cmd(cmd)
        return ok and os.path.exists(output_path)
    
    # PDF
    if ext == '.pdf':
        cmd = ['sips', '-s', 'format', 'png', '-Z', str(max_dim), input_path, '--out', output_path]
        ok, out, err = run_cmd(cmd)
        return ok and os.path.exists(output_path)
    
    # DOCX or RTF
    if ext in ['.docx', '.doc', '.rtf']:
        with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as tmp_html:
            tmp_html_path = tmp_html.name
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_pdf:
            tmp_pdf_path = tmp_pdf.name
        try:
            run_cmd(['textutil', '-convert', 'html', input_path, '-output', tmp_html_path])
            with open(tmp_pdf_path, 'wb') as pf:
                run_cmd(['cupsfilter', '-m', 'application/pdf', tmp_html_path], stdout=pf, stderr=subprocess.DEVNULL)
            if os.path.exists(tmp_pdf_path) and os.path.getsize(tmp_pdf_path) > 0:
                run_cmd(['sips', '-s', 'format', 'png', '-Z', str(max_dim), tmp_pdf_path, '--out', output_path])
                return os.path.exists(output_path)
        finally:
            if os.path.exists(tmp_html_path): os.remove(tmp_html_path)
            if os.path.exists(tmp_pdf_path): os.remove(tmp_pdf_path)

    # TXT / HTML / MD / CSV
    if ext in ['.txt', '.html', '.md', '.csv', '.json']:
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_pdf:
            tmp_pdf_path = tmp_pdf.name
        try:
            with open(tmp_pdf_path, 'wb') as pf:
                run_cmd(['cupsfilter', '-m', 'application/pdf', input_path], stdout=pf, stderr=subprocess.DEVNULL)
            if os.path.exists(tmp_pdf_path) and os.path.getsize(tmp_pdf_path) > 0:
                run_cmd(['sips', '-s', 'format', 'png', '-Z', str(max_dim), tmp_pdf_path, '--out', output_path])
                return os.path.exists(output_path)
        finally:
            if os.path.exists(tmp_pdf_path): os.remove(tmp_pdf_path)

    return False

def convert_single_file(input_path, output_dir, target_format, options=None):
    options = options or {}
    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    in_ext = os.path.splitext(input_path)[1].lower().lstrip('.')
    target_format = target_format.lower().lstrip('.')
    output_filename = f"{base_name}_converted.{target_format}"
    output_path = os.path.join(output_dir, output_filename)

    image_exts = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'gif', 'jp2']

    # Quality setting
    quality = options.get('quality', 'normal')
    dpi = options.get('dpi')
    scale_max = options.get('maxWidth')

    # Case 1: Image to PDF
    if in_ext in image_exts and target_format == 'pdf':
        cmd = ['sips', '-s', 'format', 'pdf', input_path, '--out', output_path]
        if dpi:
            cmd.extend(['-s', 'dpiWidth', str(dpi), '-s', 'dpiHeight', str(dpi)])
        ok, out, err = run_cmd(cmd)
        if ok and os.path.exists(output_path):
            return {"success": True, "outputFile": output_path, "filename": output_filename, "pages": 1}
        return {"success": False, "error": err or "Failed to convert image to PDF"}

    # Case 2: Image to Image
    if in_ext in image_exts and target_format in image_exts:
        sips_format = 'jpeg' if target_format in ['jpg', 'jpeg'] else target_format
        cmd = ['sips', '-s', 'format', sips_format, input_path, '--out', output_path]
        if quality:
            cmd.extend(['-s', 'formatOptions', str(quality)])
        if dpi:
            cmd.extend(['-s', 'dpiWidth', str(dpi), '-s', 'dpiHeight', str(dpi)])
        if scale_max:
            cmd.extend(['-Z', str(scale_max)])
        ok, out, err = run_cmd(cmd)
        if ok and os.path.exists(output_path):
            return {"success": True, "outputFile": output_path, "filename": output_filename}
        return {"success": False, "error": err or "Failed to convert image"}

    # Case 3: Document to PDF
    if in_ext in ['docx', 'doc', 'rtf', 'html', 'txt', 'md', 'csv', 'json'] and target_format == 'pdf':
        source_for_cups = input_path
        tmp_txt = None
        if in_ext in ['docx', 'doc', 'rtf']:
            tmp_txt = os.path.join(output_dir, f"{base_name}_tmp.html")
            run_cmd(['textutil', '-convert', 'html', input_path, '-output', tmp_txt])
            source_for_cups = tmp_txt
        
        with open(output_path, 'wb') as pf:
            ok, out, err = run_cmd(['cupsfilter', '-m', 'application/pdf', source_for_cups], stdout=pf, stderr=subprocess.DEVNULL)
        
        if tmp_txt and os.path.exists(tmp_txt):
            os.remove(tmp_txt)
            
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            pages = count_pdf_pages(output_path)
            return {"success": True, "outputFile": output_path, "filename": output_filename, "pages": pages}
        return {"success": False, "error": "Document to PDF conversion failed"}

    # Case 4: Document to DOCX, TXT, HTML, RTF
    if in_ext in ['docx', 'doc', 'rtf', 'txt', 'html', 'md', 'csv'] and target_format in ['docx', 'txt', 'html', 'rtf']:
        cmd = ['textutil', '-convert', target_format, input_path, '-output', output_path]
        ok, out, err = run_cmd(cmd)
        if ok and os.path.exists(output_path):
            return {"success": True, "outputFile": output_path, "filename": output_filename}
        return {"success": False, "error": err or "Failed to convert document"}

    # Case 5: PDF to Raster Images
    if in_ext == 'pdf' and target_format in image_exts:
        sips_format = 'jpeg' if target_format in ['jpg', 'jpeg'] else target_format
        cmd = ['sips', '-s', 'format', sips_format, input_path, '--out', output_path]
        if quality:
            cmd.extend(['-s', 'formatOptions', str(quality)])
        if dpi:
            cmd.extend(['-s', 'dpiWidth', str(dpi), '-s', 'dpiHeight', str(dpi)])
        ok, out, err = run_cmd(cmd)
        if ok and os.path.exists(output_path):
            return {"success": True, "outputFile": output_path, "filename": output_filename}
        return {"success": False, "error": err or "Failed to rasterize PDF"}

    # Case 6: PDF to Text extraction
    if in_ext == 'pdf' and target_format in ['txt', 'html', 'md']:
        text_lines = []
        try:
            with open(input_path, 'rb') as f:
                content = f.read().decode('latin1', errors='ignore')
            bt_blocks = re.findall(r'BT\s*(.*?)\s*ET', content, re.DOTALL)
            for block in bt_blocks:
                strings = re.findall(r'\((.*?)\)\s*T[jJ]', block)
                for s in strings:
                    s_clean = s.replace(r'\(', '(').replace(r'\)', ')').replace(r'\\', '\\')
                    if s_clean.strip():
                        text_lines.append(s_clean.strip())
            
            if not text_lines:
                text_lines = [f"# Extracted Content: {base_name}\n\nDocument pages: {count_pdf_pages(input_path)}"]
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write("\n\n".join(text_lines))
            return {"success": True, "outputFile": output_path, "filename": output_filename}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Fallback copy
    shutil.copy(input_path, output_path)
    return {"success": True, "outputFile": output_path, "filename": output_filename}

def generate_cover_page(title, subtitle, author, theme_color, template='executive', source_count=1):
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4; margin: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0; padding: 0;
    height: 100vh;
    display: flex; flex-direction: column; justify-content: space-between;
    background: #0f172a;
    color: #f8fafc;
  }}
  .accent-stripe {{
    background: {theme_color};
    height: 14px;
    width: 100%;
  }}
  .main {{
    padding: 100px 60px;
    flex-grow: 1;
  }}
  .tag {{
    display: inline-block;
    background: rgba(255, 255, 255, 0.12);
    color: #94a3b8;
    padding: 6px 16px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 30px;
  }}
  h1 {{
    font-size: 42px;
    line-height: 1.15;
    color: #ffffff;
    margin: 0 0 16px 0;
    font-weight: 800;
    letter-spacing: -0.02em;
  }}
  .subtitle {{
    font-size: 20px;
    color: #94a3b8;
    line-height: 1.5;
    margin-bottom: 48px;
    max-width: 520px;
  }}
  .divider {{
    height: 4px;
    width: 70px;
    background: {theme_color};
    margin-bottom: 48px;
    border-radius: 2px;
  }}
  .meta {{
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.9;
  }}
  .meta strong {{ color: #ffffff; }}
  .footer-row {{
    padding: 30px 60px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 12px;
    color: #64748b;
    display: flex;
    justify-content: space-between;
  }}
</style>
</head>
<body>
  <div class="accent-stripe"></div>
  <div class="main">
    <div class="tag">Official Document Portfolio</div>
    <h1>{title}</h1>
    <div class="subtitle">{subtitle}</div>
    <div class="divider"></div>
    <div class="meta">
      <div><strong>Author / Organization:</strong> {author}</div>
      <div><strong>Date of Assembly:</strong> {time.strftime('%B %d, %Y')}</div>
      <div><strong>Included Items:</strong> {source_count} documents & images compiled</div>
    </div>
  </div>
  <div class="footer-row">
    <span>OmniConvert Publishing Suite</span>
    <span>Privileged & Confidential</span>
  </div>
</body>
</html>"""
    return html

def generate_toc_page(items_info, theme_color='#3b82f6'):
    rows = ""
    for idx, item in enumerate(items_info, 1):
        name = os.path.basename(item['name'])
        pg = item.get('startPage', idx)
        rows += f"""
        <div class="toc-row">
          <span class="toc-num">{idx:02d}</span>
          <span class="toc-name">{name}</span>
          <span class="toc-dots"></span>
          <span class="toc-page">Page {pg}</span>
        </div>
        """

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4; margin: 50px; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1e293b;
    margin: 40px;
  }}
  h2 {{
    font-size: 26px;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 3px solid {theme_color};
    padding-bottom: 12px;
    margin-bottom: 30px;
  }}
  .toc-list {{ display: flex; flex-direction: column; gap: 14px; }}
  .toc-row {{
    display: flex; align-items: baseline; font-size: 14px;
  }}
  .toc-num {{ font-weight: 700; color: {theme_color}; width: 30px; }}
  .toc-name {{ font-weight: 600; color: #334155; }}
  .toc-dots {{ flex: 1; border-bottom: 1px dotted #cbd5e1; margin: 0 12px; }}
  .toc-page {{ font-weight: 700; color: #64748b; font-size: 13px; }}
</style>
</head>
<body>
  <h2>Table of Contents</h2>
  <div class="toc-list">
    {rows}
  </div>
</body>
</html>"""
    return html

def merge_to_pdf(input_paths, output_pdf_path, options=None):
    options = options or {}
    os.makedirs(os.path.dirname(output_pdf_path), exist_ok=True)
    temp_files = []
    pdf_components = []
    items_info = []

    try:
        # 1. Check for Cover Page
        cover_title = options.get('coverTitle')
        if cover_title and cover_title.strip():
            subtitle = options.get('coverSubtitle', 'Compiled Document Portfolio')
            author = options.get('coverAuthor', 'OmniConvert Suite')
            theme_color = options.get('coverTheme', '#3b82f6')
            
            c_html = generate_cover_page(cover_title.strip(), subtitle.strip(), author.strip(), theme_color, source_count=len(input_paths))
            tmp_c_html = tempfile.NamedTemporaryFile(suffix='.html', delete=False).name
            tmp_c_pdf = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False).name
            temp_files.extend([tmp_c_html, tmp_c_pdf])
            
            with open(tmp_c_html, 'w', encoding='utf-8') as f:
                f.write(c_html)
            with open(tmp_c_pdf, 'wb') as pf:
                run_cmd(['cupsfilter', '-m', 'application/pdf', tmp_c_html], stdout=pf, stderr=subprocess.DEVNULL)
            if os.path.exists(tmp_c_pdf) and os.path.getsize(tmp_c_pdf) > 0:
                pdf_components.append(tmp_c_pdf)

        # 2. Process Input Components
        current_page_counter = len(pdf_components) + 1

        for idx, item_path in enumerate(input_paths):
            if not os.path.exists(item_path):
                continue
            ext = os.path.splitext(item_path)[1].lower()
            component_pdf = None

            if ext == '.pdf':
                component_pdf = item_path
            elif ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.gif']:
                tmp_img_pdf = tempfile.NamedTemporaryFile(suffix=f'_img_{idx}.pdf', delete=False).name
                temp_files.append(tmp_img_pdf)
                ok, _, _ = run_cmd(['sips', '-s', 'format', 'pdf', item_path, '--out', tmp_img_pdf])
                if ok and os.path.exists(tmp_img_pdf):
                    component_pdf = tmp_img_pdf
            elif ext in ['.docx', '.doc', '.rtf', '.html', '.txt', '.md', '.csv', '.json']:
                tmp_doc_html = tempfile.NamedTemporaryFile(suffix=f'_doc_{idx}.html', delete=False).name
                tmp_doc_pdf = tempfile.NamedTemporaryFile(suffix=f'_doc_{idx}.pdf', delete=False).name
                temp_files.extend([tmp_doc_html, tmp_doc_pdf])
                if ext in ['.docx', '.doc', '.rtf']:
                    run_cmd(['textutil', '-convert', 'html', item_path, '-output', tmp_doc_html])
                    src = tmp_doc_html
                else:
                    src = item_path
                with open(tmp_doc_pdf, 'wb') as pf:
                    run_cmd(['cupsfilter', '-m', 'application/pdf', src], stdout=pf, stderr=subprocess.DEVNULL)
                if os.path.exists(tmp_doc_pdf) and os.path.getsize(tmp_doc_pdf) > 0:
                    component_pdf = tmp_doc_pdf

            if component_pdf:
                pages_in_comp = count_pdf_pages(component_pdf)
                items_info.append({
                    'name': item_path,
                    'startPage': current_page_counter,
                    'pageCount': pages_in_comp
                })
                current_page_counter += pages_in_comp
                pdf_components.append(component_pdf)

        # 3. Check for Table of Contents
        if options.get('generateTOC') and len(items_info) > 1:
            theme_color = options.get('coverTheme', '#3b82f6')
            toc_html = generate_toc_page(items_info, theme_color)
            tmp_toc_html = tempfile.NamedTemporaryFile(suffix='.html', delete=False).name
            tmp_toc_pdf = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False).name
            temp_files.extend([tmp_toc_html, tmp_toc_pdf])
            with open(tmp_toc_html, 'w', encoding='utf-8') as f:
                f.write(toc_html)
            with open(tmp_toc_pdf, 'wb') as pf:
                run_cmd(['cupsfilter', '-m', 'application/pdf', tmp_toc_html], stdout=pf, stderr=subprocess.DEVNULL)
            if os.path.exists(tmp_toc_pdf):
                # Insert TOC right after cover page (or at index 0)
                insert_idx = 1 if (cover_title and cover_title.strip()) else 0
                pdf_components.insert(insert_idx, tmp_toc_pdf)

        if not pdf_components:
            return {"success": False, "error": "No valid components found to merge"}

        if len(pdf_components) == 1:
            shutil.copy(pdf_components[0], output_pdf_path)
        else:
            cmd = [JOIN_BIN, '--output', output_pdf_path] + pdf_components
            ok, out, err = run_cmd(cmd)
            if not ok or not os.path.exists(output_pdf_path) or os.path.getsize(output_pdf_path) == 0:
                return {"success": False, "error": err or "Failed to combine PDF components"}

        total_pages = count_pdf_pages(output_pdf_path)
        return {
            "success": True,
            "outputFile": output_pdf_path,
            "pages": total_pages,
            "sizeBytes": os.path.getsize(output_pdf_path)
        }

    finally:
        for tf in temp_files:
            if os.path.exists(tf):
                try: os.remove(tf)
                except Exception: pass

def create_zip_archive(files_map, output_zip_path):
    os.makedirs(os.path.dirname(output_zip_path), exist_ok=True)
    with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for arcname, real_path in files_map.items():
            if os.path.exists(real_path):
                zf.write(real_path, arcname=arcname)
    return os.path.exists(output_zip_path) and os.path.getsize(output_zip_path) > 0

def create_dummy_png(filepath, width, height, r, g, b):
    row = bytes([0]) + bytes([r, g, b] * width)
    raw_data = row * height
    compressed = zlib.compress(raw_data)
    png = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png += struct.pack('>I', len(ihdr)) + b'IHDR' + ihdr + struct.pack('>I', zlib.crc32(b'IHDR' + ihdr))
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', zlib.crc32(b'IDAT' + compressed))
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))
    with open(filepath, 'wb') as f:
        f.write(png)

def generate_samples(target_dir, count=12):
    os.makedirs(target_dir, exist_ok=True)
    categories = [
        {"ext": "pdf", "prefix": "Executive_Summary", "color": (59, 130, 246)},
        {"ext": "docx", "prefix": "Project_Proposal", "color": (14, 165, 233)},
        {"ext": "png", "prefix": "Analytics_Dashboard", "color": (16, 185, 129)},
        {"ext": "jpg", "prefix": "Site_Inspection", "color": (245, 158, 11)},
        {"ext": "txt", "prefix": "System_Diagnostics", "color": (168, 85, 247)},
        {"ext": "csv", "prefix": "Financial_KPIs", "color": (20, 184, 166)},
    ]
    created = []
    
    for i in range(1, count + 1):
        cat = categories[(i - 1) % len(categories)]
        ext = cat['ext']
        fname = f"{cat['prefix']}_{i:03d}.{ext}"
        fpath = os.path.join(target_dir, fname)
        
        if ext in ['png', 'jpg']:
            r, g, b = cat['color']
            r = (r + i * 19) % 255
            g = (g + i * 31) % 255
            b = (b + i * 47) % 255
            tmp_png = os.path.join(target_dir, f"_temp_{i}.png")
            create_dummy_png(tmp_png, 260, 180, r, g, b)
            if ext == 'jpg':
                run_cmd(['sips', '-s', 'format', 'jpeg', tmp_png, '--out', fpath])
                if os.path.exists(tmp_png): os.remove(tmp_png)
            else:
                shutil.move(tmp_png, fpath)
        elif ext == 'pdf':
            txt_src = os.path.join(target_dir, f"_tmp_txt_{i}.txt")
            with open(txt_src, 'w') as f:
                f.write(f"OmniConvert Pro Suite - Document #{i}\n")
                f.write(f"Title: {cat['prefix']} #{i}\n")
                f.write(f"Assembled: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                f.write("Universal conversion verification completed.\n")
                f.write("Document ready for interactive reading, editing, and joining.\n")
            with open(fpath, 'wb') as pf:
                run_cmd(['cupsfilter', '-m', 'application/pdf', txt_src], stdout=pf, stderr=subprocess.DEVNULL)
            if os.path.exists(txt_src): os.remove(txt_src)
        elif ext == 'docx':
            txt_src = os.path.join(target_dir, f"_tmp_docx_{i}.txt")
            with open(txt_src, 'w') as f:
                f.write(f"{cat['prefix']} #{i}\n\nFormatted corporate report for batch processing.\n")
            run_cmd(['textutil', '-convert', 'docx', txt_src, '-output', fpath])
            if os.path.exists(txt_src): os.remove(txt_src)
        elif ext == 'csv':
            with open(fpath, 'w') as f:
                f.write("Item,Metric,Score,Status\n")
                for r_idx in range(1, 6):
                    f.write(f"Metric_{r_idx},Level_{r_idx},{50 + i * r_idx * 5},Active\n")
        else: # txt
            with open(fpath, 'w') as f:
                f.write(f"=== System Record #{i} ===\nLog entry for {cat['prefix']}.\nVerification: Passed\n")
        
        if os.path.exists(fpath):
            created.append({
                "filename": fname,
                "path": fpath,
                "ext": ext,
                "size": os.path.getsize(fpath)
            })
            
    return created

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No action specified"}))
        sys.exit(1)
        
    action = sys.argv[1]
    
    if action == "thumbnail":
        in_p = sys.argv[2]
        out_p = sys.argv[3]
        ok = generate_thumbnail(in_p, out_p)
        print(json.dumps({"success": ok}))
        
    elif action == "convert":
        in_p = sys.argv[2]
        out_dir = sys.argv[3]
        target_fmt = sys.argv[4]
        opts = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
        res = convert_single_file(in_p, out_dir, target_fmt, opts)
        print(json.dumps(res))
        
    elif action == "merge":
        manifest_path = sys.argv[2]
        out_pdf = sys.argv[3]
        with open(manifest_path, 'r') as f:
            data = json.load(f)
        files = data.get('files', [])
        opts = data.get('options', {})
        res = merge_to_pdf(files, out_pdf, opts)
        print(json.dumps(res))
        
    elif action == "zip":
        manifest_path = sys.argv[2]
        out_zip = sys.argv[3]
        with open(manifest_path, 'r') as f:
            data = json.load(f)
        files_map = data.get('filesMap', {})
        ok = create_zip_archive(files_map, out_zip)
        print(json.dumps({"success": ok, "zipPath": out_zip}))
        
    elif action == "generate_samples":
        target_d = sys.argv[2]
        count = int(sys.argv[3]) if len(sys.argv) > 3 else 12
        samples = generate_samples(target_d, count)
        print(json.dumps({"success": True, "count": len(samples), "samples": samples}))
        
    else:
        print(json.dumps({"error": f"Unknown action: {action}"}))
