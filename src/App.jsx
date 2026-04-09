import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Trash2, Download, Upload, AlertCircle, 
  CheckCircle2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, 
  Edit3, MousePointer2, Zap, Lock, PenTool, Move, Maximize
} from 'lucide-react';

// Cargador de librerías externas para manipulación y renderizado de PDF
const loadScripts = () => {
  return Promise.all([
    new Promise((resolve) => {
      if (window.PDFLib) return resolve();
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    }),
    new Promise((resolve) => {
      if (window.pdfjsLib) return resolve();
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      document.head.appendChild(script);
    })
  ]);
};

const App = () => {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  
  const [detectedText, setDetectedText] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const [tempText, setTempText] = useState("");
  const [mode, setMode] = useState('view'); 

  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureImg, setSignatureImg] = useState(null);
  const [sigPos, setSigPos] = useState({ x: 50, y: 50 });
  const [sigSize, setSigSize] = useState({ width: 140, height: 70 });
  const [isDraggingSig, setIsDraggingSig] = useState(false);
  const [isResizingSig, setIsResizingSig] = useState(false);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartPos = useRef({ w: 0, h: 0, x: 0, y: 0 });

  useEffect(() => { loadScripts(); }, []);
  useEffect(() => { if (pdfBytes) renderAndAnalyze(currentPage); }, [pdfBytes, currentPage, zoom]);

  const renderAndAnalyze = async (pageNumber) => {
    if (!window.pdfjsLib || !pdfBytes) return;
    setLoading(true);
    try {
      const dataCopy = new Uint8Array(pdfBytes.slice(0));
      const loadingTask = window.pdfjsLib.getDocument({ data: dataCopy });
      const pdf = await loadingTask.promise;
      setNumPages(pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      
      // Ajuste de escala crítico para precisión en móviles
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom * 1.5 });
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      await page.render({ canvasContext: context, viewport, transform }).promise;

      // MOTOR DE DETECCIÓN MEJORADO
      const textContent = await page.getTextContent();
      const items = textContent.items.map(item => {
        // Obtenemos la matriz de transformación real
        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.sqrt(item.transform[0]**2 + item.transform[1]**2);
        
        return {
          str: item.str,
          x: tx[4],
          // Corrección de la base del texto (Baseline)
          y: tx[5] - (fontSize * zoom * 1.5),
          width: item.width * zoom * 1.5,
          height: fontSize * zoom * 1.5,
          original: item,
          fontSize: fontSize
        };
      }).filter(item => item.str.trim().length > 0 && item.fontSize > 1);
      
      setDetectedText(items);
    } catch (err) { 
      showStatus('error', 'Error al analizar el texto del PDF.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 3000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      setPdfBytes(arrayBuffer);
    } catch (err) { showStatus('error', 'Error de carga.'); }
    setLoading(false);
  };

  const saveTextEdit = async () => {
    if (editingIndex === null || !pdfBytes) return;
    setLoading(true);
    try {
      const item = detectedText[editingIndex];
      const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
      const doc = await PDFDocument.load(pdfBytes.slice(0));
      const page = doc.getPages()[currentPage - 1];
      const orig = item.original;
      
      // Borramos el texto original dibujando un rectángulo blanco encima
      page.drawRectangle({
        x: orig.transform[4],
        y: orig.transform[5] - 1,
        width: item.original.width + 2,
        height: item.fontSize + 2,
        color: rgb(1, 1, 1),
      });

      // Escribimos el nuevo texto
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText(tempText, {
        x: orig.transform[4],
        y: orig.transform[5],
        size: item.fontSize,
        font, color: rgb(0, 0, 0)
      });

      const bytes = await doc.save();
      setPdfBytes(bytes.buffer);
      setEditingIndex(null);
      showStatus('success', 'Texto actualizado correctamente.');
    } catch (err) { showStatus('error', 'No se pudo guardar la edición.'); }
    setLoading(false);
  };

  const getCoords = (e) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = signatureCanvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = signatureCanvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const prepareSignaturePlacement = () => {
    const sigCanvas = signatureCanvasRef.current;
    setSignatureImg(sigCanvas.toDataURL('image/png'));
    setMode('place_sign');
    setSigPos({ x: 50, y: 50 });
  };

  const finalizePlacement = async () => {
    if (!pdfBytes || !signatureImg) return;
    setLoading(true);
    try {
      const { PDFDocument } = window.PDFLib;
      const doc = await PDFDocument.load(pdfBytes.slice(0));
      const sigImage = await doc.embedPng(signatureImg);
      const page = doc.getPages()[currentPage - 1];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const canvas = canvasRef.current;
      
      const scaleX = pageWidth / (canvas.width / (window.devicePixelRatio || 1));
      const scaleY = pageHeight / (canvas.height / (window.devicePixelRatio || 1));

      page.drawImage(sigImage, {
        x: sigPos.x * scaleX,
        y: pageHeight - (sigPos.y * scaleY) - (sigSize.height * scaleY),
        width: sigSize.width * scaleX,
        height: sigSize.height * scaleY
      });

      const bytes = await doc.save();
      setPdfBytes(bytes.buffer);
      setMode('view');
      setSignatureImg(null);
      showStatus('success', 'Firma incrustada.');
    } catch (err) { showStatus('error', 'Error al aplicar la firma.'); }
    setLoading(false);
  };

  const handleGlobalMove = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (isDraggingSig) {
      setSigPos({ x: clientX - dragStartPos.current.x, y: clientY - dragStartPos.current.y });
    } else if (isResizingSig) {
      const deltaX = clientX - resizeStartPos.current.x;
      const deltaY = clientY - resizeStartPos.current.y;
      setSigSize({
        width: Math.max(50, resizeStartPos.current.w + deltaX),
        height: Math.max(25, resizeStartPos.current.h + deltaY)
      });
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col bg-slate-50" 
      onMouseMove={handleGlobalMove} 
      onMouseUp={() => { setIsDraggingSig(false); setIsResizingSig(false); }}
      onTouchMove={handleGlobalMove}
      onTouchEnd={() => { setIsDraggingSig(false); setIsResizingSig(false); }}
    >
      {/* Header Responsivo */}
      <nav className="bg-white border-b px-3 md:px-8 py-3 flex items-center justify-between sticky top-0 z-[60] shadow-sm mobile-header-container">
        <div className="flex items-center gap-1 md:gap-2">
          <div className="bg-indigo-600 p-1 md:p-1.5 rounded-lg text-white shadow-md"><Zap size={14} className="mobile-icon" /></div>
          <span className="font-black text-[10px] md:text-xs tracking-widest uppercase hidden xs:block text-slate-800 tracking-tighter">PDF MAYA PRO</span>
        </div>
        {pdfBytes && (
          <button 
            onClick={() => { const blob = new Blob([pdfBytes], { type: 'application/pdf' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `PRO_${fileName}`; link.click(); }} 
            className="bg-indigo-600 text-white px-3 md:px-5 py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest flex items-center gap-1 md:gap-2 active:scale-95 transition-all shadow-lg shadow-indigo-100"
          >
            <Download size={12} className="mobile-icon" /> <span className="hidden sm:inline">Descargar</span>
          </button>
        )}
      </nav>

      {!pdfBytes ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="bg-white p-8 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-2xl border border-slate-100 w-full max-w-sm">
             <h1 className="text-2xl md:text-3xl font-black mb-4 tracking-tighter text-slate-900">Sube tu PDF</h1>
             <p className="text-slate-400 text-[10px] mb-8 font-bold uppercase tracking-widest leading-loose text-center">Edición de precisión para móviles.</p>
             <button onClick={() => fileInputRef.current.click()} className="w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl py-10 md:py-12 flex flex-col items-center gap-4 hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                <Upload className="text-indigo-600" size={32} />
                <span className="font-black text-[9px] md:text-[10px] text-slate-500 tracking-widest uppercase">Elegir Archivo</span>
             </button>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
        </div>
      ) : (
        <>
          <div className="bg-white border-b p-1 md:p-2 flex flex-col gap-1.5 md:gap-2 sticky top-[54px] md:top-[57px] z-50 shadow-sm mobile-header-container">
            <div className="flex items-center justify-between w-full gap-1">
               <div className="flex flex-1 gap-1">
                 <button onClick={() => setMode('edit')} className={`flex-1 py-3 rounded-xl font-black border transition-all mobile-btn-text ${mode === 'edit' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>EDITAR TEXTO</button>
                 <button onClick={() => setMode('sign')} className={`flex-1 py-3 rounded-xl font-black border transition-all mobile-btn-text ${mode === 'sign' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>FIRMAR</button>
               </div>
               {mode === 'place_sign' && (
                 <button onClick={finalizePlacement} className="px-3 md:px-4 py-3 rounded-xl font-black bg-emerald-600 text-white shadow-lg animate-pulse mobile-btn-text uppercase tracking-widest text-center">Aplicar</button>
               )}
            </div>
            
            <div className="flex items-center justify-between w-full gap-1">
              <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage-1))} className="p-1.5 md:p-2 active:bg-white rounded-lg transition-colors"><ChevronLeft size={14} className="mobile-icon"/></button>
                <span className="text-[9px] md:text-[10px] font-black px-1 md:px-2 min-w-[40px] md:min-w-[50px] text-center text-slate-600">{currentPage}/{numPages}</span>
                <button onClick={() => setCurrentPage(Math.min(numPages, currentPage+1))} className="p-1.5 md:p-2 active:bg-white rounded-lg transition-colors"><ChevronRight size={14} className="mobile-icon"/></button>
              </div>
              <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                <button onClick={() => setZoom(Math.max(0.5, zoom-0.1))} className="p-1.5 md:p-2 active:bg-white rounded-lg transition-colors"><ZoomOut size={14} className="mobile-icon"/></button>
                <span className="text-[9px] md:text-[10px] font-black px-1 md:px-2 text-center text-slate-600">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(3, zoom+0.1))} className="p-1.5 md:p-2 active:bg-white rounded-lg transition-colors"><ZoomIn size={14} className="mobile-icon"/></button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-slate-200 flex justify-center p-1 sm:p-8 custom-scrollbar">
            <div className="relative shadow-2xl bg-white h-fit transition-transform duration-200 ease-out origin-top" style={{ width: canvasRef.current ? canvasRef.current.width / (window.devicePixelRatio || 1) : '100%' }}>
              <canvas ref={canvasRef} className="block w-full h-auto" />
              
              {/* Overlay de Edición Mejorado con Bounding Box más preciso */}
              {mode === 'edit' && detectedText.map((item, i) => (
                <div key={i} className={`absolute border-2 border-transparent hover:border-indigo-400/50 hover:bg-indigo-500/5 cursor-text transition-all ${editingIndex === i ? 'border-indigo-600 bg-white/20 ring-4 ring-indigo-500/20 z-40 scale-105' : ''}`}
                  style={{ 
                    left: item.x - 2, 
                    top: item.y - 2, 
                    width: item.width + 10, // Hitbox un poco más ancha para dedos
                    height: item.height + 4 
                  }}
                  onClick={(e) => { e.stopPropagation(); setEditingIndex(i); setTempText(item.str); }}>
                  {editingIndex === i && (
                    <div className="absolute -top-16 left-0 flex flex-col sm:flex-row gap-2 bg-white p-3 rounded-2xl shadow-2xl border border-slate-200 z-[100] min-w-[260px]" onClick={e => e.stopPropagation()}>
                      <input autoFocus className="flex-1 px-4 py-2 text-sm border-2 border-slate-100 rounded-xl outline-none focus:border-indigo-600" value={tempText} onChange={e => setTempText(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveTextEdit()} />
                      <div className="flex gap-2">
                        <button onClick={saveTextEdit} className="flex-1 sm:flex-none bg-emerald-500 text-white p-2.5 rounded-xl shadow-lg active:scale-90 transition-transform"><CheckCircle2 size={18}/></button>
                        <button onClick={() => setEditingIndex(null)} className="flex-1 sm:flex-none bg-slate-100 text-slate-400 p-2.5 rounded-xl active:scale-90 transition-transform"><Plus className="rotate-45" size={18}/></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Firma ajustable movible con tirador táctil XL */}
              {mode === 'place_sign' && signatureImg && (
                <div className="absolute cursor-move border-2 border-dashed border-indigo-600 z-40 bg-white/10 touch-none"
                  style={{ left: sigPos.x, top: sigPos.y, width: sigSize.width, height: sigSize.height }}
                  onMouseDown={(e) => { e.preventDefault(); setIsDraggingSig(true); dragStartPos.current = { x: e.clientX - sigPos.x, y: e.clientY - sigPos.y }; }}
                  onTouchStart={(e) => { setIsDraggingSig(true); dragStartPos.current = { x: e.touches[0].clientX - sigPos.x, y: e.touches[0].clientY - sigPos.y }; }}
                >
                  <img src={signatureImg} className="w-full h-full object-contain pointer-events-none" alt="Firma" />
                  <div className="absolute -bottom-5 -right-5 w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl cursor-nwse-resize active:scale-125 transition-transform border-4 border-white"
                    onMouseDown={(e) => { e.stopPropagation(); setIsResizingSig(true); resizeStartPos.current = { w: sigSize.width, h: sigSize.height, x: e.clientX, y: e.clientY }; }}
                    onTouchStart={(e) => { e.stopPropagation(); setIsResizingSig(true); resizeStartPos.current = { w: sigSize.width, h: sigSize.height, x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                  >
                    <Maximize size={18} />
                  </div>
                </div>
              )}

              {/* Panel de Firma con soporte táctil total */}
              {mode === 'sign' && (
                <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4">
                   <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl w-full max-sm border border-slate-100 animate-in fade-in zoom-in duration-300">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="font-black text-[9px] text-slate-400 uppercase tracking-[0.2em] text-center">Dibujar Firma</h4>
                        <button onClick={() => setMode('view')} className="text-slate-300 hover:text-red-500 transition-colors"><Plus size={20} className="rotate-45" /></button>
                      </div>
                      <div className="relative bg-slate-50 border-2 border-slate-100 rounded-3xl overflow-hidden shadow-inner">
                        <canvas 
                          ref={signatureCanvasRef} width={300} height={200} 
                          className="w-full h-auto block touch-none cursor-crosshair" 
                          onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)}
                          onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => setIsDrawing(false)}
                        />
                      </div>
                      <div className="flex gap-3 mt-8">
                        <button onClick={prepareSignaturePlacement} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-xl shadow-indigo-100 active:scale-95 transition-transform text-center">Continuar</button>
                        <button onClick={() => { const ctx = signatureCanvasRef.current.getContext('2d'); ctx.clearRect(0,0,300,200); }} className="px-5 bg-slate-100 rounded-2xl text-slate-400 active:bg-slate-200 transition-colors flex items-center justify-center"><Trash2 size={20}/></button>
                      </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Pantalla de carga profesional */}
      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center gap-6">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-xl"></div>
          <span className="font-black text-[9px] uppercase tracking-[0.3em] text-indigo-900 animate-pulse text-center px-4 leading-relaxed">Sincronizando Archivo</span>
        </div>
      )}

      {/* Alertas de estado */}
      {status.message && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 z-[210] animate-in slide-in-from-bottom-10 duration-500 ${status.type === 'error' ? 'bg-red-50 text-red-800 border-red-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
           <CheckCircle2 size={14}/>
           <span className="font-black text-[9px] uppercase tracking-widest text-center">{status.message}</span>
        </div>
      )}
    </div>
  );
};

export default App;