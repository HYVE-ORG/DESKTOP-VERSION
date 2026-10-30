import { extname, basename } from 'node:path';
import { ensure } from './errors';
export const MAX_UPLOAD = 15 * 1024 * 1024;
export function detectFile(name: string, data: Buffer): string {
    ensure(name === basename(name) && !/[\\/\x00-\x1f]/.test(name) && name.length <= 180, 'Nome de arquivo inválido.', 400);
    ensure(data.length > 0 && data.length <= MAX_UPLOAD, 'Arquivo vazio ou acima de 15 MB.', 413);
    const ext = extname(name).toLowerCase(), prefix = data.subarray(0, 32);
    const at = (hex: string) => prefix.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
    if (ext === '.png' && data.length > 24 && at('89504e470d0a1a0a'))
        return 'image/png';
    if (['.jpg', '.jpeg'].includes(ext) && at('ffd8ff'))
        return 'image/jpeg';
    if (ext === '.gif' && /GIF8[79]a/.test(prefix.toString('ascii', 0, 6)))
        return 'image/gif';
    if (ext === '.webp' && prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP')
        return 'image/webp';
    if (ext === '.wav' && prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WAVE')
        return 'audio/wav';
    if (ext === '.ogg' && at('4f676753'))
        return 'audio/ogg';
    if (ext === '.mp3' && (prefix.toString('ascii', 0, 3) === 'ID3' || (prefix[0] === 255 && (prefix[1] & 224) === 224)))
        return 'audio/mpeg';
    if (ext === '.webm' && at('1a45dfa3'))
        return name.startsWith('audio-') ? 'audio/webm' : 'video/webm';
    if (ext === '.mp4' && prefix.toString('ascii', 4, 8) === 'ftyp')
        return 'video/mp4';
    if (['.txt', '.md', '.csv', '.json', '.log', '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.py', '.sql', '.yaml', '.yml'].includes(ext)) {
        try {
            new TextDecoder('utf-8', { fatal: true }).decode(data);
        }
        catch {
            ensure(false, 'Texto precisa estar em UTF-8.', 415);
        }
        ensure(!data.includes(0), 'Conteúdo de texto inválido.', 415);
        return 'text/plain; charset=utf-8';
    }
    ensure(false, 'Formato não permitido ou conteúdo divergente. Use imagem, texto, áudio ou vídeo compatível. PDF/Office aguardam inspeção especializada.', 415);
}
