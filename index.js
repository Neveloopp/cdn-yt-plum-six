const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const fileStore = new Map();

const TOKEN_LENGTH = 30;
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function generateToken() {
    let token = '';
    for (let i = 0; i < TOKEN_LENGTH; i++) {
        token += TOKEN_CHARS.charAt(Math.floor(Math.random() * TOKEN_CHARS.length));
    }
    return token;
}

setInterval(() => {
    const now = Date.now();
    for (const [token, fileInfo] of fileStore.entries()) {
        if (fileInfo.expiresAt <= now) {
            fileStore.delete(token);
        }
    }
}, 60 * 60 * 1000);

app.post('/upload', express.json(), async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL es requerida' });
        }
        
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return res.status(400).json({ error: 'URL inválida' });
        }
        
        const pathname = parsedUrl.pathname.toLowerCase();
        if (!pathname.endsWith('.mp3') && !pathname.endsWith('.mp4')) {
            return res.status(400).json({ error: 'Solo MP3 o MP4' });
        }
        
        let token;
        do {
            token = generateToken();
        } while (fileStore.has(token));
        
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            maxContentLength: MAX_FILE_SIZE,
        });
        
        const contentType = response.headers['content-type'];
        
        if (response.data.byteLength > MAX_FILE_SIZE) {
            return res.status(413).json({ error: 'Archivo demasiado grande' });
        }
        
        let fileType;
        if (contentType.includes('audio/mpeg') || pathname.endsWith('.mp3')) {
            fileType = 'audio/mpeg';
        } else if (contentType.includes('video/mp4') || pathname.endsWith('.mp4')) {
            fileType = 'video/mp4';
        } else if (contentType.includes('application/octet-stream')) {
            fileType = pathname.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4';
        } else {
            return res.status(400).json({ error: 'Tipo no soportado' });
        }
        
        fileStore.set(token, {
            buffer: Buffer.from(response.data),
            contentType: fileType,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        });
        
        res.json({
            success: true,
            token: token,
            url: `http://${req.headers.host}/${token}`
        });
        
    } catch (error) {
        if (error.response?.status === 404) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }
        res.status(500).json({ error: 'Error al procesar' });
    }
});

app.get('/:token', (req, res) => {
    const token = req.params.token;
    
    if (!token || token.length !== TOKEN_LENGTH) {
        return res.status(400).json({ error: 'Token inválido' });
    }
    
    const fileInfo = fileStore.get(token);
    
    if (!fileInfo) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    if (fileInfo.expiresAt <= Date.now()) {
        fileStore.delete(token);
        return res.status(410).json({ error: 'Archivo expirado' });
    }
    
    res.set('Content-Type', fileInfo.contentType);
    res.send(fileInfo.buffer);
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
});
