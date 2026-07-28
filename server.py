import http.server
import socketserver
import os
import re

PORT = 8000
DIRECTORY = "public"

class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        f = None
        if os.path.isdir(path):
            parts = http.server.urllib.parse.urlsplit(self.path)
            if not parts.path.endswith('/'):
                self.send_response(http.server.HTTPStatus.MOVED_PERMANENTLY)
                new_parts = (parts[0], parts[1], parts[2] + '/',
                             parts[3], parts[4])
                new_url = http.server.urllib.parse.urlunsplit(new_parts)
                self.send_header("Location", new_url)
                self.end_headers()
                return None
            for index in "index.html", "index.htm":
                index = os.path.join(path, index)
                if os.path.exists(index):
                    path = index
                    break
            else:
                return self.list_directory(path)
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(http.server.HTTPStatus.NOT_FOUND, "File not found")
            return None

        fs = os.fstat(f.fileno())
        file_len = fs[6]
        
        if "Range" in self.headers:
            range_header = self.headers["Range"]
            m = re.search(r'bytes=(\d*)-(\d*)', range_header)
            if m:
                start_str, end_str = m.groups()
                start = int(start_str) if start_str else 0
                end = int(end_str) if end_str else file_len - 1
                if not start_str: # bytes=-512
                    start = file_len - end
                    end = file_len - 1
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-type", self.guess_type(path))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_len}")
                self.send_header("Content-Length", str(length))
                self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length')
                self.end_headers()
                
                # We need to communicate the range to do_GET so it can copy only the range
                self.range_start = start
                self.range_length = length
                return f
                
        self.send_response(200)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Length", str(file_len))
        self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length')
        self.end_headers()
        self.range_start = 0
        self.range_length = file_len
        return f
        
    def copyfile(self, source, outputfile):
        if hasattr(self, 'range_start'):
            source.seek(self.range_start)
            length = self.range_length
            while length > 0:
                buf = source.read(min(length, 64*1024))
                if not buf:
                    break
                outputfile.write(buf)
                length -= len(buf)
        else:
            super().copyfile(source, outputfile)

with http.server.ThreadingHTTPServer(("", PORT), RangeRequestHandler) as httpd:
    print(f"Serving HTTP on 0.0.0.0 port {PORT} (http://localhost:{PORT}/) serving directory '{DIRECTORY}'...")
    httpd.serve_forever()
