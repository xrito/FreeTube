# Third-Party Notices

## @vot.js/ext, @vot.js/core and @vot.js/shared 3.0.2

These packages are used by the isolated main-process VOT client. No source code
from the Voice Over Translation browser extension is copied into FreeTube.

Source: https://github.com/FOSWLY/vot.js

MIT License

Copyright (c) 2024 FOSWLY

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## FFmpeg via ffmpeg-static 5.3.0

The Windows installer bundles `ffmpeg.exe` obtained by `ffmpeg-static` 5.3.0.
The package and bundled binary are GPL-3.0-or-later. The complete GPL text is
installed alongside the executable at `resources/ffmpeg/LICENSE`.

Source: https://github.com/eugeneware/ffmpeg-static
FFmpeg source: https://ffmpeg.org/

## yt-dlp 2026.08.18.122307

The Windows installer bundles the unmodified official `yt-dlp.exe` solely to
download the user-selected public YouTube source before FFmpeg muxes the VOT
track. It is fetched from the official release only after its SHA-256 hash is
verified. The executable itself is not stored in this repository.

Source: https://github.com/yt-dlp/yt-dlp
License: The Unlicense (public domain). See https://unlicense.org/

## Node.js 22.22.0

The Windows installer bundles the unmodified `node.exe` runtime only for
`yt-dlp`'s JavaScript challenge solver during video export. It is fetched from
the official Node.js distribution only after its SHA-256 hash is verified.

Source: https://nodejs.org/

MIT License

Copyright Node.js contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.