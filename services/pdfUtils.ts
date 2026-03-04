import jsPDF from 'jspdf';
import { Buffer } from 'buffer';

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    return Buffer.from(buffer).toString('base64');
};

const normalizeImageMime = (contentType: string | null): string => {
    if (!contentType) return 'image/jpeg';
    const lower = contentType.toLowerCase().split(';')[0].trim();
    if (lower === 'image/png') return 'image/png';
    return 'image/jpeg';
};

export const getBase64ImageFromUrl = async (url: string): Promise<string> => {
    if (!url) return "";
    try {
        const res = await fetch(url);
        if (!res.ok) return "";
        const arrayBuffer = await res.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        const mime = normalizeImageMime(res.headers.get('content-type'));
        return `data:${mime};base64,${base64}`;
    } catch (e) {
        console.error("Failed to fetch image for PDF:", e);
        return "";
    }
};

export const loadCyrillicFont = async (pdf: jsPDF) => {
    const fontUrls = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
        'https://raw.githubusercontent.com/bpampuch/pdfmake/master/examples/fonts/Roboto/Roboto-Regular.ttf'
    ];

    for (const url of fontUrls) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const buffer = await response.arrayBuffer();
            const base64 = arrayBufferToBase64(buffer);
            
            pdf.addFileToVFS('Roboto-Regular.ttf', base64);
            pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
            pdf.setFont('Roboto', 'normal');
            
            // Try to load bold font as well
            try {
                const boldUrl = url.replace('Regular', 'Medium');
                const boldRes = await fetch(boldUrl);
                if (boldRes.ok) {
                    const boldBuf = await boldRes.arrayBuffer();
                    const boldB64 = arrayBufferToBase64(boldBuf);
                    pdf.addFileToVFS('Roboto-Bold.ttf', boldB64);
                    pdf.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
                }
            } catch (e) {
                // Ignore bold failure
            }
            
            return true;
        } catch (e) {
            console.warn(`Failed to load font from ${url}, trying next...`, e);
        }
    }

    console.error("All font loading attempts failed.");
    pdf.setFont('helvetica', 'normal');
    return false;
};

export const drawPdfLogo = (doc: jsPDF, x: number, y: number, size: number, style: 'light' | 'dark' = 'light') => {
    const s = size / 100;
    const frameColor = style === 'light' ? [255, 255, 255] : [31, 41, 55]; 
    
    // Handle
    doc.setDrawColor(frameColor[0], frameColor[1], frameColor[2]);
    doc.setLineWidth(10 * s);
    doc.line(x + 68 * s, y + 68 * s, x + 88 * s, y + 88 * s);
    
    // Outer Ring
    doc.setLineWidth(6 * s);
    doc.setDrawColor(frameColor[0], frameColor[1], frameColor[2]);
    doc.circle(x + 45 * s, y + 45 * s, 32 * s, 'S');
    
    // Glass
    doc.setFillColor(style === 'dark' ? 245 : 255, style === 'dark' ? 250 : 255, style === 'dark' ? 248 : 255);
    doc.circle(x + 45 * s, y + 45 * s, 29 * s, 'F');
    
    // Leaf
    doc.setFillColor(16, 185, 129);
    doc.setLineWidth(0.1);
    doc.ellipse(x + 45 * s, y + 45 * s, 12 * s, 22 * s, 'F');
    
    // Vein
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(2 * s);
    doc.line(x + 45 * s, y + 25 * s, x + 45 * s, y + 65 * s);
};
