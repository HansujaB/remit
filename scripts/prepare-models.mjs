import { embeddings } from '../dist-server/embeddings.js';
import { ocrImage } from '../dist-server/ocr.js';
import { createCanvas } from '@napi-rs/canvas';
console.log('Downloading/caching the local embedding model and configured OCR language packs.');
const [vector]=await embeddings(['Prepare the local model.']);
const canvas=createCanvas(400,100);const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,400,100);context.fillStyle='black';context.font='32px Arial';context.fillText('Remit OCR ready',10,55);
const text=await ocrImage(canvas.toBuffer('image/png'));
console.log({dimensions:vector.length,ocr:text.trim()});
